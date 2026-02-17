"""
Bank Matching Engine Service

Intelligent matching engine for bank reconciliation with:
- Confidence-based proposal generation
- Rules engine (learned + manual rules)
- Split transaction support
- Safe undo with audit trail
- Idempotent matching operations
"""
import logging
import re
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal
from difflib import SequenceMatcher
from typing import List, Optional, Tuple, Dict, Any

from sqlalchemy import select, func, or_, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank import (
    BankAccount,
    BankTransaction,
    BankTransactionStatus,
    BankMatchProposal,
    ProposalStatus,
    BankMatchRule,
    BankTransactionSplit,
    ReconciliationAction,
    ReconciliationActionType,
)
from app.models.subledger import OpenItem, OpenItemStatus
from app.models.financial_commitment import FinancialCommitment, RecurringFrequency, CommitmentStatus
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


class BankMatchingEngine:
    """
    Intelligent matching engine for bank reconciliation.
    
    Generates proposals with confidence scores, manages rules,
    and handles split transactions with audit trail.
    """
    
    # Tolerance for amount matching (1% or €0.01, whichever is larger)
    AMOUNT_TOLERANCE_PERCENT = 0.01
    AMOUNT_TOLERANCE_FIXED = Decimal("0.01")
    
    # Date window for invoice matching (days before/after invoice date)
    INVOICE_DATE_WINDOW_BEFORE = 14
    INVOICE_DATE_WINDOW_AFTER = 30
    
    def __init__(self, db: AsyncSession, client_id: uuid.UUID, user_id: Optional[uuid.UUID] = None):
        """
        Initialize the matching engine.
        
        Args:
            db: Database session
            client_id: Client/administration ID for tenant isolation
            user_id: User ID for audit trail (optional, None for system actions)
        """
        self.db = db
        self.client_id = client_id
        self.user_id = user_id
    
    async def generate_proposals(
        self,
        transaction_id: Optional[uuid.UUID] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        limit_per_transaction: int = 5,
    ) -> Dict[str, Any]:
        """
        Generate intelligent matching proposals for unmatched transactions.
        
        Args:
            transaction_id: Optional specific transaction ID
            date_from: Optional date range start
            date_to: Optional date range end
            limit_per_transaction: Max proposals per transaction
            
        Returns:
            Dictionary with counts of proposals generated
        """
        # Query unmatched transactions
        query = (
            select(BankTransaction)
            .where(
                BankTransaction.administration_id == self.client_id,
                BankTransaction.status == BankTransactionStatus.NEW,
            )
        )
        
        if transaction_id:
            query = query.where(BankTransaction.id == transaction_id)
        if date_from:
            query = query.where(BankTransaction.booking_date >= date_from)
        if date_to:
            query = query.where(BankTransaction.booking_date <= date_to)
        
        result = await self.db.execute(query)
        transactions = result.scalars().all()
        
        total_proposals = 0
        transactions_processed = 0
        
        for transaction in transactions:
            # Generate proposals for this transaction
            proposals = await self._generate_proposals_for_transaction(transaction, limit_per_transaction)
            
            # Expire old proposals not in the new top list
            await self._expire_old_proposals(transaction.id, [p.entity_id for p in proposals])
            
            # Store new proposals
            for proposal_data in proposals:
                # Check if proposal already exists
                existing = await self.db.execute(
                    select(BankMatchProposal).where(
                        BankMatchProposal.bank_transaction_id == transaction.id,
                        BankMatchProposal.entity_type == proposal_data["entity_type"],
                        BankMatchProposal.entity_id == proposal_data["entity_id"],
                    )
                )
                existing_proposal = existing.scalar_one_or_none()
                
                if existing_proposal:
                    # Update existing proposal
                    existing_proposal.confidence_score = proposal_data["confidence_score"]
                    existing_proposal.reason = proposal_data["reason"]
                    existing_proposal.status = ProposalStatus.SUGGESTED
                    existing_proposal.updated_at = datetime.utcnow()
                else:
                    # Create new proposal
                    new_proposal = BankMatchProposal(
                        administration_id=self.client_id,
                        bank_transaction_id=transaction.id,
                        entity_type=proposal_data["entity_type"],
                        entity_id=proposal_data["entity_id"],
                        confidence_score=proposal_data["confidence_score"],
                        reason=proposal_data["reason"],
                        matched_amount=proposal_data.get("matched_amount"),
                        matched_date=proposal_data.get("matched_date"),
                        matched_reference=proposal_data.get("matched_reference"),
                        rule_type=proposal_data.get("rule_type"),
                        status=ProposalStatus.SUGGESTED,
                    )
                    self.db.add(new_proposal)
                    total_proposals += 1
            
            transactions_processed += 1
        
        await self.db.commit()
        
        return {
            "transactions_processed": transactions_processed,
            "proposals_generated": total_proposals,
        }
    
    async def _generate_proposals_for_transaction(
        self,
        transaction: BankTransaction,
        limit: int
    ) -> List[Dict[str, Any]]:
        """
        Generate proposals for a single transaction.
        
        Returns list of proposal dictionaries sorted by confidence score.
        """
        proposals = []
        
        # Match against invoices (OpenItems with type RECEIVABLE)
        invoice_proposals = await self._match_invoices(transaction)
        proposals.extend(invoice_proposals)
        
        # Match against expenses (OpenItems with type PAYABLE)
        expense_proposals = await self._match_expenses(transaction)
        proposals.extend(expense_proposals)
        
        # Match against recurring commitments
        commitment_proposals = await self._match_commitments(transaction)
        proposals.extend(commitment_proposals)
        
        # Sort by confidence score (descending) and limit
        proposals.sort(key=lambda p: p["confidence_score"], reverse=True)
        return proposals[:limit]
    
    async def _match_invoices(self, transaction: BankTransaction) -> List[Dict[str, Any]]:
        """Match transaction against open invoices (receivables)."""
        # Only match positive amounts (incoming payments) to receivables
        if transaction.amount <= 0:
            return []
        
        proposals = []
        
        # Query open receivables
        query = (
            select(OpenItem)
            .where(
                OpenItem.administration_id == self.client_id,
                OpenItem.item_type == "RECEIVABLE",
                OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]),
            )
        )
        
        result = await self.db.execute(query)
        invoices = result.scalars().all()
        
        for invoice in invoices:
            confidence = 0
            reasons = []
            
            # Check amount match
            amount_diff = abs(transaction.amount - invoice.open_amount)
            amount_tolerance = max(
                abs(transaction.amount) * self.AMOUNT_TOLERANCE_PERCENT,
                self.AMOUNT_TOLERANCE_FIXED
            )
            
            if amount_diff <= amount_tolerance:
                confidence += 40
                reasons.append(f"Bedrag komt overeen (±€{amount_diff:.2f})")
            elif amount_diff <= abs(transaction.amount) * 0.05:  # Within 5%
                confidence += 20
                reasons.append(f"Bedrag bijna overeen (verschil €{amount_diff:.2f})")
            
            # Check reference/invoice number in description
            if invoice.document_number:
                # Remove special characters and make case-insensitive
                doc_num_clean = re.sub(r'[^a-zA-Z0-9]', '', invoice.document_number).upper()
                tx_desc_clean = re.sub(r'[^a-zA-Z0-9]', '', transaction.description).upper()
                tx_ref_clean = re.sub(r'[^a-zA-Z0-9]', '', transaction.reference or '').upper()
                
                if doc_num_clean and (doc_num_clean in tx_desc_clean or doc_num_clean in tx_ref_clean):
                    confidence += 35
                    reasons.append(f"Referentie bevat factuurnummer {invoice.document_number}")
            
            # Check date proximity
            if invoice.due_date:
                date_diff = abs((transaction.booking_date - invoice.due_date).days)
                if date_diff <= self.INVOICE_DATE_WINDOW_AFTER:
                    confidence += 15
                    reasons.append(f"Datum binnen {date_diff} dagen van vervaldatum")
            
            # Check counterparty name similarity
            if transaction.counterparty_name and invoice.party_id:
                party_result = await self.db.execute(
                    select(OpenItem).where(OpenItem.id == invoice.id).join(OpenItem.party)
                )
                # Get party name if available (simplified for now)
                # In real implementation, would load party relationship
                
            # Only add proposal if confidence is reasonable
            if confidence >= 30:
                reason_text = " + ".join(reasons) if reasons else "Mogelijk match"
                proposals.append({
                    "entity_type": "invoice",
                    "entity_id": invoice.id,
                    "confidence_score": min(confidence, 95),  # Cap at 95
                    "reason": reason_text[:255],  # Truncate to fit column
                    "matched_amount": invoice.open_amount,
                    "matched_date": invoice.due_date,
                    "matched_reference": invoice.document_number,
                    "rule_type": "COMBINED",
                })
        
        return proposals
    
    async def _match_expenses(self, transaction: BankTransaction) -> List[Dict[str, Any]]:
        """Match transaction against open expenses (payables)."""
        # Only match negative amounts (outgoing payments) to payables
        if transaction.amount >= 0:
            return []
        
        proposals = []
        
        # Query open payables
        query = (
            select(OpenItem)
            .where(
                OpenItem.administration_id == self.client_id,
                OpenItem.item_type == "PAYABLE",
                OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]),
            )
        )
        
        result = await self.db.execute(query)
        expenses = result.scalars().all()
        
        for expense in expenses:
            confidence = 0
            reasons = []
            
            # Check amount match (use absolute values)
            amount_diff = abs(abs(transaction.amount) - expense.open_amount)
            amount_tolerance = max(
                expense.open_amount * self.AMOUNT_TOLERANCE_PERCENT,
                self.AMOUNT_TOLERANCE_FIXED
            )
            
            if amount_diff <= amount_tolerance:
                confidence += 40
                reasons.append(f"Bedrag komt overeen (±€{amount_diff:.2f})")
            
            # Check reference/document number
            if expense.document_number:
                doc_num_clean = re.sub(r'[^a-zA-Z0-9]', '', expense.document_number).upper()
                tx_desc_clean = re.sub(r'[^a-zA-Z0-9]', '', transaction.description).upper()
                
                if doc_num_clean and doc_num_clean in tx_desc_clean:
                    confidence += 30
                    reasons.append(f"Referentie bevat documentnummer {expense.document_number}")
            
            # Check supplier name in counterparty
            if transaction.counterparty_name:
                # Simplified - in real implementation would compare with party name
                pass
            
            if confidence >= 30:
                reason_text = " + ".join(reasons) if reasons else "Mogelijk match"
                proposals.append({
                    "entity_type": "expense",
                    "entity_id": expense.id,
                    "confidence_score": min(confidence, 90),
                    "reason": reason_text[:255],
                    "matched_amount": expense.open_amount,
                    "matched_date": expense.due_date,
                    "matched_reference": expense.document_number,
                    "rule_type": "COMBINED",
                })
        
        return proposals
    
    async def _match_commitments(self, transaction: BankTransaction) -> List[Dict[str, Any]]:
        """Match transaction against recurring commitments."""
        proposals = []
        
        # Query active commitments
        query = (
            select(FinancialCommitment)
            .where(
                FinancialCommitment.administration_id == self.client_id,
                FinancialCommitment.status == CommitmentStatus.ACTIVE,
            )
        )
        
        result = await self.db.execute(query)
        commitments = result.scalars().all()
        
        for commitment in commitments:
            confidence = 0
            reasons = []
            
            # Check amount match (convert from cents to Decimal)
            if commitment.amount_cents:
                commitment_amount = Decimal(commitment.amount_cents) / 100
                amount_diff = abs(abs(transaction.amount) - commitment_amount)
                if amount_diff <= self.AMOUNT_TOLERANCE_FIXED:
                    confidence += 35
                    reasons.append(f"Bedrag komt overeen met abonnement")
            
            # Check vendor name similarity
            if commitment.provider and transaction.counterparty_name:
                similarity = self._string_similarity(
                    commitment.provider.upper(),
                    transaction.counterparty_name.upper()
                )
                if similarity > 0.7:
                    confidence += 30
                    reasons.append(f"Leverancier lijkt op '{commitment.provider}'")
                elif similarity > 0.5:
                    confidence += 15
            
            # Check recurring frequency (monthly/yearly recurring)
            if commitment.recurring_frequency in [RecurringFrequency.MONTHLY, RecurringFrequency.YEARLY]:
                confidence += 10
                cadence_text = "maandelijks" if commitment.recurring_frequency == RecurringFrequency.MONTHLY else "jaarlijks"
                reasons.append(f"Terugkerende betaling ({cadence_text})")
            
            if confidence >= 30:
                reason_text = " + ".join(reasons) if reasons else "Terugkerende betaling"
                # Convert amount back to Decimal for proposal
                matched_amount = Decimal(commitment.amount_cents) / 100 if commitment.amount_cents else None
                proposals.append({
                    "entity_type": "commitment",
                    "entity_id": commitment.id,
                    "confidence_score": min(confidence, 85),
                    "reason": reason_text[:255],
                    "matched_amount": matched_amount,
                    "rule_type": "IBAN_RECURRING",
                })
        
        return proposals
    
    def _string_similarity(self, s1: str, s2: str) -> float:
        """Calculate similarity ratio between two strings (0.0 to 1.0)."""
        return SequenceMatcher(None, s1, s2).ratio()
    
    async def _expire_old_proposals(self, transaction_id: uuid.UUID, keep_entity_ids: List[uuid.UUID]):
        """Mark old proposals as expired if they're not in the new top list."""
        query = (
            select(BankMatchProposal)
            .where(
                BankMatchProposal.bank_transaction_id == transaction_id,
                BankMatchProposal.status == ProposalStatus.SUGGESTED,
                BankMatchProposal.entity_id.not_in(keep_entity_ids) if keep_entity_ids else True,
            )
        )
        
        result = await self.db.execute(query)
        old_proposals = result.scalars().all()
        
        for proposal in old_proposals:
            proposal.status = ProposalStatus.EXPIRED
    
    async def accept_proposal(
        self,
        transaction_id: uuid.UUID,
        proposal_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """
        Accept a matching proposal and create links.
        
        Idempotent: if already matched to same target, returns success.
        Creates audit trail entry.
        """
        # Load transaction
        tx_result = await self.db.execute(
            select(BankTransaction).where(
                BankTransaction.id == transaction_id,
                BankTransaction.administration_id == self.client_id,
            )
        )
        transaction = tx_result.scalar_one_or_none()
        if not transaction:
            raise ValueError("Transaction not found")
        
        # Load proposal
        proposal_result = await self.db.execute(
            select(BankMatchProposal).where(
                BankMatchProposal.id == proposal_id,
                BankMatchProposal.bank_transaction_id == transaction_id,
                BankMatchProposal.administration_id == self.client_id,
            )
        )
        proposal = proposal_result.scalar_one_or_none()
        if not proposal:
            raise ValueError("Proposal not found")
        
        # Check if already matched to this target (idempotency)
        if (transaction.status == BankTransactionStatus.MATCHED and
            transaction.matched_entity_type == proposal.entity_type and
            transaction.matched_entity_id == proposal.entity_id):
            return {
                "status": "already_matched",
                "message": "Transaction already matched to this target",
            }
        
        # Update transaction status
        transaction.status = BankTransactionStatus.MATCHED
        transaction.matched_entity_type = proposal.entity_type
        transaction.matched_entity_id = proposal.entity_id
        
        # Update proposal status
        proposal.status = ProposalStatus.ACCEPTED
        proposal.is_applied = True
        
        # Create reconciliation action for audit trail
        action = ReconciliationAction(
            administration_id=self.client_id,
            accountant_user_id=self.user_id,
            bank_transaction_id=transaction.id,
            action_type=ReconciliationActionType.APPLY_MATCH,
            payload={
                "proposal_id": str(proposal.id),
                "entity_type": proposal.entity_type,
                "entity_id": str(proposal.entity_id),
                "confidence_score": proposal.confidence_score,
                "reason": proposal.reason,
            }
        )
        self.db.add(action)
        
        # Create audit log entry
        audit_entry = AuditLog(
            client_id=self.client_id,
            entity_type="bank_transaction",
            entity_id=transaction.id,
            action="match",
            user_id=self.user_id,
            user_role="accountant" if self.user_id else "system",
            new_value={
                "matched_entity_type": proposal.entity_type,
                "matched_entity_id": str(proposal.entity_id),
                "confidence_score": proposal.confidence_score,
            }
        )
        self.db.add(audit_entry)
        
        await self.db.commit()
        
        return {
            "status": "success",
            "message": "Match applied successfully",
            "transaction_id": str(transaction.id),
            "matched_entity_type": proposal.entity_type,
            "matched_entity_id": str(proposal.entity_id),
        }
    
    async def reject_proposal(
        self,
        transaction_id: uuid.UUID,
        proposal_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """
        Reject a matching proposal.
        
        Marks proposal as rejected and creates audit trail.
        """
        # Load proposal
        proposal_result = await self.db.execute(
            select(BankMatchProposal).where(
                BankMatchProposal.id == proposal_id,
                BankMatchProposal.bank_transaction_id == transaction_id,
                BankMatchProposal.administration_id == self.client_id,
            )
        )
        proposal = proposal_result.scalar_one_or_none()
        if not proposal:
            raise ValueError("Proposal not found")
        
        # Update proposal status
        proposal.status = ProposalStatus.REJECTED
        proposal.is_dismissed = True
        
        # Create audit log entry
        audit_entry = AuditLog(
            client_id=self.client_id,
            entity_type="bank_match_proposal",
            entity_id=proposal.id,
            action="reject_match",
            user_id=self.user_id,
            user_role="accountant" if self.user_id else "system",
            old_value={"status": "suggested"},
            new_value={"status": "rejected"},
        )
        self.db.add(audit_entry)
        
        await self.db.commit()
        
        return {
            "status": "success",
            "message": "Proposal rejected",
        }
    
    async def unmatch_transaction(self, transaction_id: uuid.UUID) -> Dict[str, Any]:
        """
        Unmatch a transaction and revert to unmatched state.
        
        Safe undo with audit trail. Keeps history.
        """
        # Load transaction
        tx_result = await self.db.execute(
            select(BankTransaction).where(
                BankTransaction.id == transaction_id,
                BankTransaction.administration_id == self.client_id,
            )
        )
        transaction = tx_result.scalar_one_or_none()
        if not transaction:
            raise ValueError("Transaction not found")
        
        if transaction.status != BankTransactionStatus.MATCHED:
            raise ValueError("Transaction is not currently matched")
        
        # Store old values for audit
        old_entity_type = transaction.matched_entity_type
        old_entity_id = transaction.matched_entity_id
        
        # Update transaction status
        transaction.status = BankTransactionStatus.NEW
        transaction.matched_entity_type = None
        transaction.matched_entity_id = None
        
        # Create reconciliation action for audit trail
        action = ReconciliationAction(
            administration_id=self.client_id,
            accountant_user_id=self.user_id,
            bank_transaction_id=transaction.id,
            action_type=ReconciliationActionType.UNMATCH,
            payload={
                "previous_entity_type": old_entity_type,
                "previous_entity_id": str(old_entity_id) if old_entity_id else None,
            }
        )
        self.db.add(action)
        
        # Create audit log entry
        audit_entry = AuditLog(
            client_id=self.client_id,
            entity_type="bank_transaction",
            entity_id=transaction.id,
            action="unmatch",
            user_id=self.user_id,
            user_role="accountant" if self.user_id else "system",
            old_value={
                "status": "MATCHED",
                "matched_entity_type": old_entity_type,
                "matched_entity_id": str(old_entity_id) if old_entity_id else None,
            },
            new_value={"status": "NEW"},
        )
        self.db.add(audit_entry)
        
        await self.db.commit()
        
        return {
            "status": "success",
            "message": "Transaction unmatched successfully",
        }
    
    async def split_transaction(
        self,
        transaction_id: uuid.UUID,
        splits: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Split a transaction into multiple parts.
        
        Args:
            transaction_id: Transaction to split
            splits: List of dicts with 'amount' and 'description'
        
        Validates that sum of splits equals transaction amount.
        """
        # Load transaction
        tx_result = await self.db.execute(
            select(BankTransaction).where(
                BankTransaction.id == transaction_id,
                BankTransaction.administration_id == self.client_id,
            )
        )
        transaction = tx_result.scalar_one_or_none()
        if not transaction:
            raise ValueError("Transaction not found")
        
        # Validate splits sum to transaction amount
        total_split = sum(Decimal(str(s["amount"])) for s in splits)
        if abs(total_split - transaction.amount) > self.AMOUNT_TOLERANCE_FIXED:
            raise ValueError(
                f"Sum of splits (€{total_split}) does not equal transaction amount (€{transaction.amount})"
            )
        
        # Delete existing splits
        await self.db.execute(
            delete(BankTransactionSplit).where(
                BankTransactionSplit.transaction_id == transaction_id
            )
        )
        
        # Create new splits
        for idx, split_data in enumerate(splits):
            split = BankTransactionSplit(
                client_id=self.client_id,
                transaction_id=transaction.id,
                split_index=idx,
                amount=Decimal(str(split_data["amount"])),
                description=split_data.get("description"),
            )
            self.db.add(split)
        
        # Create audit log entry
        audit_entry = AuditLog(
            client_id=self.client_id,
            entity_type="bank_transaction",
            entity_id=transaction.id,
            action="split",
            user_id=self.user_id,
            user_role="accountant" if self.user_id else "system",
            new_value={
                "splits": [
                    {"amount": str(s["amount"]), "description": s.get("description")}
                    for s in splits
                ]
            },
        )
        self.db.add(audit_entry)
        
        await self.db.commit()
        
        return {
            "status": "success",
            "message": f"Transaction split into {len(splits)} parts",
            "splits_count": len(splits),
        }
    
    async def apply_rules(self, transaction: BankTransaction) -> Optional[BankMatchProposal]:
        """
        Apply matching rules to a transaction.
        
        Returns auto-generated proposal if a rule matches, or None.
        """
        # Query active rules sorted by priority
        query = (
            select(BankMatchRule)
            .where(
                BankMatchRule.client_id == self.client_id,
                BankMatchRule.enabled,
            )
            .order_by(BankMatchRule.priority.desc())
        )
        
        result = await self.db.execute(query)
        rules = result.scalars().all()
        
        for rule in rules:
            if self._rule_matches(transaction, rule.conditions):
                # Rule matched - create or update proposal based on rule action
                action = rule.action
                
                # This is a simplified implementation
                # In a full implementation, you would:
                # 1. Parse action to determine target entity
                # 2. Create high-confidence proposal
                # 3. Optionally auto-accept if action specifies it
                
                logger.info(f"Rule {rule.id} matched transaction {transaction.id}")
                return None  # Placeholder
        
        return None
    
    def _rule_matches(self, transaction: BankTransaction, conditions: Dict[str, Any]) -> bool:
        """Check if a transaction matches rule conditions."""
        # Check IBAN condition
        if "iban" in conditions:
            if transaction.counterparty_iban != conditions["iban"]:
                return False
        
        # Check contains condition (in description)
        if "contains" in conditions:
            if conditions["contains"].upper() not in transaction.description.upper():
                return False
        
        # Check amount range
        if "min_amount" in conditions:
            if abs(transaction.amount) < Decimal(str(conditions["min_amount"])):
                return False
        
        if "max_amount" in conditions:
            if abs(transaction.amount) > Decimal(str(conditions["max_amount"])):
                return False
        
        # Check currency
        if "currency" in conditions:
            if transaction.currency != conditions["currency"]:
                return False
        
        return True
