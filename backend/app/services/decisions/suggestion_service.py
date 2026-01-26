"""
Suggestion Service

Generates actionable suggestions for detected issues.
Uses issue code mapping and historical patterns to determine best actions.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional, Dict, Any
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.issues import ClientIssue, IssueCode
from app.models.decisions import SuggestedAction, DecisionPattern, ActionType


# Mapping of issue codes to suggested action types and templates
ISSUE_ACTION_MAPPING: Dict[str, List[Dict[str, Any]]] = {
    # Asset-related issues
    IssueCode.ASSET_EXPENSE_OVERRIDE: [
        {
            "action_type": ActionType.RECLASSIFY_TO_ASSET,
            "title_template": "Reclassify expense to fixed asset",
            "explanation_template": (
                "This expense appears to be a capital expenditure that should be recorded as a fixed asset. "
                "Reclassifying it will allow proper depreciation over time and provide a more accurate "
                "picture of the company's assets."
            ),
            "base_confidence": Decimal("0.7500"),
            "priority": 1,
        },
    ],
    IssueCode.DEPRECIATION_NOT_POSTED: [
        {
            "action_type": ActionType.CREATE_DEPRECIATION,
            "title_template": "Post depreciation entry for {asset_name}",
            "explanation_template": (
                "Depreciation for this period has not been posted. Creating the depreciation entry "
                "will properly reduce the asset's book value and record the depreciation expense. "
                "This is typically a recurring monthly expense."
            ),
            "base_confidence": Decimal("0.8500"),
            "priority": 1,
        },
    ],
    IssueCode.DEPRECIATION_MISMATCH: [
        {
            "action_type": ActionType.CREATE_ADJUSTMENT_ENTRY,
            "title_template": "Create adjustment entry to reconcile depreciation",
            "explanation_template": (
                "The accumulated depreciation on the asset doesn't match posted depreciation entries. "
                "An adjustment entry will correct this discrepancy and ensure accurate reporting."
            ),
            "base_confidence": Decimal("0.6500"),
            "priority": 1,
        },
    ],
    
    # VAT-related issues
    IssueCode.VAT_RATE_MISMATCH: [
        {
            "action_type": ActionType.CORRECT_VAT_RATE,
            "title_template": "Correct VAT calculation",
            "explanation_template": (
                "The VAT amount recorded doesn't match the expected calculation based on the taxable amount "
                "and VAT rate. Correcting this will ensure accurate VAT reporting and avoid issues "
                "with the Dutch tax authority (Belastingdienst)."
            ),
            "base_confidence": Decimal("0.7000"),
            "priority": 1,
        },
    ],
    IssueCode.VAT_NEGATIVE: [
        {
            "action_type": ActionType.REVERSE_JOURNAL_ENTRY,
            "title_template": "Review and potentially reverse entry with negative VAT",
            "explanation_template": (
                "This entry has a negative VAT amount which is unusual unless it's a credit note. "
                "If this is not a credit note, the entry may need to be reversed and re-entered correctly."
            ),
            "base_confidence": Decimal("0.5000"),
            "priority": 2,
        },
    ],
    
    # AR/AP reconciliation issues
    IssueCode.AR_RECON_MISMATCH: [
        {
            "action_type": ActionType.CREATE_ADJUSTMENT_ENTRY,
            "title_template": "Create adjustment to reconcile Accounts Receivable",
            "explanation_template": (
                "The AR control account balance doesn't match the sum of open receivables. "
                "An adjustment entry may be needed to correct the discrepancy. "
                "Review recent transactions for missing or duplicate entries."
            ),
            "base_confidence": Decimal("0.6000"),
            "priority": 1,
        },
    ],
    IssueCode.AP_RECON_MISMATCH: [
        {
            "action_type": ActionType.CREATE_ADJUSTMENT_ENTRY,
            "title_template": "Create adjustment to reconcile Accounts Payable",
            "explanation_template": (
                "The AP control account balance doesn't match the sum of open payables. "
                "An adjustment entry may be needed to correct the discrepancy. "
                "Review recent transactions for missing or duplicate entries."
            ),
            "base_confidence": Decimal("0.6000"),
            "priority": 1,
        },
    ],
    IssueCode.OVERDUE_RECEIVABLE: [
        {
            "action_type": ActionType.ALLOCATE_OPEN_ITEM,
            "title_template": "Allocate payment or write off receivable",
            "explanation_template": (
                "This receivable is overdue. If payment has been received, it should be allocated. "
                "If the receivable is uncollectible, consider writing it off after proper review."
            ),
            "base_confidence": Decimal("0.5500"),
            "priority": 2,
        },
        {
            "action_type": ActionType.FLAG_DOCUMENT_INVALID,
            "title_template": "Flag for collection follow-up",
            "explanation_template": (
                "Mark this receivable for collection follow-up. "
                "The customer should be contacted regarding the overdue payment."
            ),
            "base_confidence": Decimal("0.4500"),
            "priority": 3,
        },
    ],
    IssueCode.OVERDUE_PAYABLE: [
        {
            "action_type": ActionType.ALLOCATE_OPEN_ITEM,
            "title_template": "Allocate payment to payable",
            "explanation_template": (
                "This payable is overdue. If payment has been made, it should be allocated to close the item. "
                "If not yet paid, schedule payment to avoid late fees and maintain supplier relationships."
            ),
            "base_confidence": Decimal("0.6000"),
            "priority": 1,
        },
    ],
    
    # Journal integrity issues
    IssueCode.JOURNAL_UNBALANCED: [
        {
            "action_type": ActionType.CREATE_ADJUSTMENT_ENTRY,
            "title_template": "Create balancing entry",
            "explanation_template": (
                "This journal entry doesn't balance (debits ≠ credits). "
                "A correcting entry is needed to maintain double-entry integrity."
            ),
            "base_confidence": Decimal("0.8000"),
            "priority": 1,
        },
        {
            "action_type": ActionType.REVERSE_JOURNAL_ENTRY,
            "title_template": "Reverse and re-enter journal entry",
            "explanation_template": (
                "If the original entry cannot be corrected, consider reversing it entirely "
                "and creating a new, balanced entry."
            ),
            "base_confidence": Decimal("0.5000"),
            "priority": 2,
        },
    ],
}


class SuggestionService:
    """
    Service for generating and managing suggested actions for issues.
    
    Uses a combination of:
    - Predefined issue-to-action mappings
    - Historical decision patterns to boost confidence
    - Issue-specific context to customize suggestions
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def generate_suggestions_for_issue(
        self,
        issue: ClientIssue,
    ) -> List[SuggestedAction]:
        """
        Generate suggested actions for a single issue.
        
        Returns a list of SuggestedAction objects (not yet persisted).
        """
        suggestions = []
        
        # Get action templates for this issue code
        action_templates = ISSUE_ACTION_MAPPING.get(issue.issue_code, [])
        
        if not action_templates:
            return suggestions
        
        # Get historical patterns for confidence boosting
        patterns = await self._get_patterns_for_issue(
            issue.administration_id, 
            issue.issue_code
        )
        
        for template in action_templates:
            action_type = template["action_type"]
            
            # Calculate confidence with pattern boost
            base_confidence = template["base_confidence"]
            pattern = patterns.get(action_type)
            confidence_boost = pattern.confidence_boost if pattern else Decimal("0.0000")
            final_confidence = min(base_confidence + confidence_boost, Decimal("0.9999"))
            
            # Build parameters from issue context
            parameters = self._build_parameters(issue, action_type)
            
            # Format title and explanation with context
            title = self._format_template(template["title_template"], issue, parameters)
            explanation = self._format_template(template["explanation_template"], issue, parameters)
            
            suggestion = SuggestedAction(
                issue_id=issue.id,
                action_type=action_type,
                title=title,
                explanation=explanation,
                parameters=parameters,
                confidence_score=final_confidence,
                is_auto_suggested=pattern is not None and pattern.approval_count >= 3,
                priority=template["priority"],
            )
            suggestions.append(suggestion)
        
        # Sort by confidence (highest first)
        suggestions.sort(key=lambda s: (s.priority, -float(s.confidence_score)))
        
        return suggestions
    
    async def get_or_create_suggestions(
        self,
        issue_id: uuid.UUID,
    ) -> List[SuggestedAction]:
        """
        Get existing suggestions for an issue, or create new ones if none exist.
        """
        # Check for existing suggestions
        result = await self.db.execute(
            select(SuggestedAction)
            .where(SuggestedAction.issue_id == issue_id)
            .order_by(SuggestedAction.priority, SuggestedAction.confidence_score.desc())
        )
        existing = list(result.scalars().all())
        
        if existing:
            return existing
        
        # Get the issue
        result = await self.db.execute(
            select(ClientIssue)
            .where(ClientIssue.id == issue_id)
        )
        issue = result.scalar_one_or_none()
        
        if not issue:
            return []
        
        # Generate new suggestions
        suggestions = await self.generate_suggestions_for_issue(issue)
        
        # Persist suggestions
        for suggestion in suggestions:
            self.db.add(suggestion)
        
        await self.db.flush()
        
        return suggestions
    
    async def refresh_suggestions_for_client(
        self,
        administration_id: uuid.UUID,
    ) -> int:
        """
        Refresh suggestions for all unresolved issues of a client.
        
        Returns count of new suggestions created.
        """
        # Get all unresolved issues without suggestions
        result = await self.db.execute(
            select(ClientIssue)
            .where(ClientIssue.administration_id == administration_id)
            .where(ClientIssue.is_resolved == False)
            .options(selectinload(ClientIssue.suggested_actions))
        )
        issues = result.scalars().all()
        
        count = 0
        for issue in issues:
            if not issue.suggested_actions:
                suggestions = await self.generate_suggestions_for_issue(issue)
                for suggestion in suggestions:
                    self.db.add(suggestion)
                count += len(suggestions)
        
        if count > 0:
            await self.db.flush()
        
        return count
    
    async def _get_patterns_for_issue(
        self,
        administration_id: uuid.UUID,
        issue_code: str,
    ) -> Dict[ActionType, DecisionPattern]:
        """Get decision patterns for an issue code."""
        result = await self.db.execute(
            select(DecisionPattern)
            .where(DecisionPattern.administration_id == administration_id)
            .where(DecisionPattern.issue_code == issue_code)
        )
        patterns = result.scalars().all()
        return {p.action_type: p for p in patterns}
    
    def _build_parameters(
        self,
        issue: ClientIssue,
        action_type: ActionType,
    ) -> Dict[str, Any]:
        """Build action parameters from issue context."""
        params = {
            "issue_id": str(issue.id),
            "issue_code": issue.issue_code,
        }
        
        # Add entity references
        if issue.document_id:
            params["document_id"] = str(issue.document_id)
        if issue.journal_entry_id:
            params["journal_entry_id"] = str(issue.journal_entry_id)
        if issue.account_id:
            params["account_id"] = str(issue.account_id)
        if issue.fixed_asset_id:
            params["fixed_asset_id"] = str(issue.fixed_asset_id)
        if issue.party_id:
            params["party_id"] = str(issue.party_id)
        if issue.open_item_id:
            params["open_item_id"] = str(issue.open_item_id)
        if issue.amount_discrepancy:
            params["amount"] = str(issue.amount_discrepancy)
        
        return params
    
    def _format_template(
        self,
        template: str,
        issue: ClientIssue,
        parameters: Dict[str, Any],
    ) -> str:
        """Format a template string with issue context."""
        # Build context for formatting
        context = {
            "asset_name": "the asset",  # Default
            "party_name": "the party",
            "amount": parameters.get("amount", "0.00"),
            **parameters,
        }
        
        try:
            return template.format(**context)
        except KeyError:
            # Return unformatted if missing keys
            return template
