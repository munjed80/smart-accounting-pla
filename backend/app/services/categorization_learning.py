"""
Categorization Learning Service

Learns from user reconciliation decisions to auto-suggest ledger accounts
for future bank transactions.  Layered on top of the existing keyword-based
matching — never replaces it.

Flow:
  1. User categorises a bank transaction (CREATE_EXPENSE with a ledger code).
  2. learn_from_categorization() upserts a CategorizationRule for the
     counterparty name / IBAN.
  3. Next time a NEW transaction arrives from the same counterparty,
     get_learned_suggestions() returns the learned category with a label
     "Eerdere keuze: {category}" if confidence >= 2.
"""
import logging
import uuid
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank import (
    BankTransaction,
    CategorizationRule,
    CategorizationRuleMatchType,
)
from app.models.accounting import ChartOfAccount

logger = logging.getLogger(__name__)


class CategorizationLearningService:
    """Per-administration learning layer for bank transaction categorisation."""

    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id

    # ------------------------------------------------------------------
    # Learning: create or update rules after a user categorises
    # ------------------------------------------------------------------

    async def learn_from_categorization(
        self,
        transaction: BankTransaction,
        ledger_account_id: uuid.UUID,
        category_nl: str,
    ) -> None:
        """
        Record a categorisation decision so it can be reused later.

        Creates rules for counterparty name and/or IBAN when available.
        If a rule already exists for the same match, its confidence is
        incremented and the ledger account / label are updated to the
        latest choice.
        """
        # Rule by counterparty name
        if transaction.counterparty_name:
            await self._upsert_rule(
                match_type=CategorizationRuleMatchType.COUNTERPARTY_NAME,
                match_value=transaction.counterparty_name.strip(),
                ledger_account_id=ledger_account_id,
                category_nl=category_nl,
            )

        # Rule by counterparty IBAN
        if transaction.counterparty_iban:
            await self._upsert_rule(
                match_type=CategorizationRuleMatchType.COUNTERPARTY_IBAN,
                match_value=transaction.counterparty_iban.strip().upper(),
                ledger_account_id=ledger_account_id,
                category_nl=category_nl,
            )

    async def _upsert_rule(
        self,
        match_type: CategorizationRuleMatchType,
        match_value: str,
        ledger_account_id: uuid.UUID,
        category_nl: str,
    ) -> CategorizationRule:
        """Insert a new rule or increment confidence of the existing one."""
        result = await self.db.execute(
            select(CategorizationRule).where(
                CategorizationRule.administration_id == self.administration_id,
                CategorizationRule.match_type == match_type,
                CategorizationRule.match_value == match_value,
            )
        )
        rule = result.scalar_one_or_none()

        if rule:
            if rule.ledger_account_id == ledger_account_id:
                # Same category → increment confidence
                rule.confidence += 1
            else:
                # User overrode to a different category → reset to new choice
                rule.ledger_account_id = ledger_account_id
                rule.category_nl = category_nl
                rule.confidence = 1
        else:
            rule = CategorizationRule(
                administration_id=self.administration_id,
                match_type=match_type,
                match_value=match_value,
                ledger_account_id=ledger_account_id,
                category_nl=category_nl,
                confidence=1,
            )
            self.db.add(rule)

        return rule

    # ------------------------------------------------------------------
    # Suggestion: query learned rules for a new transaction
    # ------------------------------------------------------------------

    async def get_learned_suggestions(
        self,
        transaction: BankTransaction,
    ) -> List[dict]:
        """
        Return learned suggestions for a transaction.

        Priority order: counterparty_name → counterparty_iban → description.
        Only returns rules with confidence >= 2 (i.e. confirmed at least twice).

        Returns a list of dicts:
          {
            "ledger_account_id": UUID,
            "category_nl": str,
            "confidence": int,
            "match_type": str,
            "match_value": str,
          }
        """
        suggestions: List[dict] = []
        seen_accounts: set = set()

        # 1. Match by counterparty name (case-insensitive)
        if transaction.counterparty_name:
            rule = await self._find_rule(
                CategorizationRuleMatchType.COUNTERPARTY_NAME,
                transaction.counterparty_name.strip(),
            )
            if rule and rule.confidence >= 2:
                suggestions.append(self._rule_to_dict(rule))
                seen_accounts.add(rule.ledger_account_id)

        # 2. Match by counterparty IBAN
        if transaction.counterparty_iban:
            rule = await self._find_rule(
                CategorizationRuleMatchType.COUNTERPARTY_IBAN,
                transaction.counterparty_iban.strip().upper(),
            )
            if rule and rule.confidence >= 2 and rule.ledger_account_id not in seen_accounts:
                suggestions.append(self._rule_to_dict(rule))
                seen_accounts.add(rule.ledger_account_id)

        # 3. Match by description keywords
        if transaction.description:
            keyword_rules = await self._find_keyword_rules(transaction.description)
            for rule in keyword_rules:
                if rule.ledger_account_id not in seen_accounts:
                    suggestions.append(self._rule_to_dict(rule))
                    seen_accounts.add(rule.ledger_account_id)

        return suggestions

    async def _find_rule(
        self,
        match_type: CategorizationRuleMatchType,
        match_value: str,
    ) -> Optional[CategorizationRule]:
        """Find a single rule by exact match (case-insensitive)."""
        from sqlalchemy.orm import selectinload

        result = await self.db.execute(
            select(CategorizationRule)
            .options(selectinload(CategorizationRule.ledger_account))
            .where(
                CategorizationRule.administration_id == self.administration_id,
                CategorizationRule.match_type == match_type,
                func.lower(CategorizationRule.match_value) == match_value.lower(),
            )
        )
        return result.scalar_one_or_none()

    async def _find_keyword_rules(
        self,
        description: str,
    ) -> List[CategorizationRule]:
        """Find description-keyword rules whose match_value appears in the description."""
        from sqlalchemy.orm import selectinload

        result = await self.db.execute(
            select(CategorizationRule)
            .options(selectinload(CategorizationRule.ledger_account))
            .where(
                CategorizationRule.administration_id == self.administration_id,
                CategorizationRule.match_type == CategorizationRuleMatchType.DESCRIPTION_KEYWORD,
                CategorizationRule.confidence >= 2,
            )
        )
        all_keyword_rules = result.scalars().all()

        description_lower = description.lower()
        return [r for r in all_keyword_rules if r.match_value.lower() in description_lower]

    @staticmethod
    def _rule_to_dict(rule: CategorizationRule) -> dict:
        return {
            "ledger_account_id": rule.ledger_account_id,
            "account_code": rule.ledger_account.account_code if rule.ledger_account else None,
            "category_nl": rule.category_nl,
            "confidence": rule.confidence,
            "match_type": rule.match_type.value,
            "match_value": rule.match_value,
        }
