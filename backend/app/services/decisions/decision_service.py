"""
Decision Service

Handles accountant decisions on issues:
- Recording approve/reject/override decisions
- Updating decision patterns for learning loop
- Triggering action execution for approved decisions
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.issues import ClientIssue
from app.models.decisions import (
    SuggestedAction, 
    AccountantDecision, 
    DecisionPattern,
    ActionType,
    DecisionType,
    ExecutionStatus,
)
from app.models.user import User


class DecisionService:
    """
    Service for handling accountant decisions on issues.
    
    Responsibilities:
    - Record decisions with full audit trail
    - Update learning patterns based on decisions
    - Coordinate with ActionExecutor for approved actions
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def make_decision(
        self,
        issue_id: uuid.UUID,
        action_type: ActionType,
        decision: DecisionType,
        decided_by_id: uuid.UUID,
        suggested_action_id: Optional[uuid.UUID] = None,
        override_parameters: Optional[dict] = None,
        notes: Optional[str] = None,
    ) -> AccountantDecision:
        """
        Record an accountant's decision on an issue.
        
        This does NOT execute the action - that happens separately.
        """
        # Validate issue exists and is not resolved
        result = await self.db.execute(
            select(ClientIssue)
            .where(ClientIssue.id == issue_id)
        )
        issue = result.scalar_one_or_none()
        
        if not issue:
            raise ValueError(f"Issue {issue_id} not found")
        
        if issue.is_resolved:
            raise ValueError(f"Issue {issue_id} is already resolved")
        
        # Validate suggested action if provided
        if suggested_action_id:
            result = await self.db.execute(
                select(SuggestedAction)
                .where(SuggestedAction.id == suggested_action_id)
                .where(SuggestedAction.issue_id == issue_id)
            )
            suggested_action = result.scalar_one_or_none()
            if not suggested_action:
                raise ValueError(f"Suggested action {suggested_action_id} not found for issue {issue_id}")
        
        # Create decision record
        decision_record = AccountantDecision(
            issue_id=issue_id,
            suggested_action_id=suggested_action_id,
            action_type=action_type,
            decision=decision,
            override_parameters=override_parameters if decision == DecisionType.OVERRIDDEN else None,
            notes=notes,
            decided_by_id=decided_by_id,
            execution_status=ExecutionStatus.PENDING if decision == DecisionType.APPROVED else ExecutionStatus.EXECUTED,
            is_reversible=decision == DecisionType.APPROVED,
        )
        
        self.db.add(decision_record)
        await self.db.flush()
        
        # Update decision patterns for learning
        await self._update_pattern(
            administration_id=issue.administration_id,
            issue_code=issue.issue_code,
            action_type=action_type,
            decision=decision,
        )
        
        return decision_record
    
    async def get_decision(
        self,
        decision_id: uuid.UUID,
    ) -> Optional[AccountantDecision]:
        """Get a decision by ID."""
        result = await self.db.execute(
            select(AccountantDecision)
            .where(AccountantDecision.id == decision_id)
            .options(
                selectinload(AccountantDecision.issue),
                selectinload(AccountantDecision.decided_by),
            )
        )
        return result.scalar_one_or_none()
    
    async def get_decisions_for_issue(
        self,
        issue_id: uuid.UUID,
    ) -> List[AccountantDecision]:
        """Get all decisions for an issue."""
        result = await self.db.execute(
            select(AccountantDecision)
            .where(AccountantDecision.issue_id == issue_id)
            .order_by(AccountantDecision.decided_at.desc())
            .options(selectinload(AccountantDecision.decided_by))
        )
        return list(result.scalars().all())
    
    async def get_decision_history(
        self,
        administration_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AccountantDecision]:
        """Get decision history for a client (administration)."""
        result = await self.db.execute(
            select(AccountantDecision)
            .join(ClientIssue, AccountantDecision.issue_id == ClientIssue.id)
            .where(ClientIssue.administration_id == administration_id)
            .order_by(AccountantDecision.decided_at.desc())
            .limit(limit)
            .offset(offset)
            .options(
                selectinload(AccountantDecision.issue),
                selectinload(AccountantDecision.decided_by),
            )
        )
        return list(result.scalars().all())
    
    async def get_decision_count(
        self,
        administration_id: uuid.UUID,
    ) -> int:
        """Get total decision count for a client."""
        result = await self.db.execute(
            select(func.count(AccountantDecision.id))
            .join(ClientIssue, AccountantDecision.issue_id == ClientIssue.id)
            .where(ClientIssue.administration_id == administration_id)
        )
        return result.scalar() or 0
    
    async def mark_executed(
        self,
        decision_id: uuid.UUID,
        result_journal_entry_id: Optional[uuid.UUID] = None,
        error: Optional[str] = None,
    ) -> AccountantDecision:
        """Mark a decision as executed (success or failure)."""
        result = await self.db.execute(
            select(AccountantDecision)
            .where(AccountantDecision.id == decision_id)
        )
        decision = result.scalar_one_or_none()
        
        if not decision:
            raise ValueError(f"Decision {decision_id} not found")
        
        if error:
            decision.execution_status = ExecutionStatus.FAILED
            decision.execution_error = error
        else:
            decision.execution_status = ExecutionStatus.EXECUTED
            decision.result_journal_entry_id = result_journal_entry_id
        
        decision.executed_at = datetime.now(timezone.utc)
        
        # If successful, mark the issue as resolved
        if not error:
            issue_result = await self.db.execute(
                select(ClientIssue)
                .where(ClientIssue.id == decision.issue_id)
            )
            issue = issue_result.scalar_one_or_none()
            if issue:
                issue.is_resolved = True
                issue.resolved_at = datetime.now(timezone.utc)
                issue.resolved_by_id = decision.decided_by_id
        
        await self.db.flush()
        return decision
    
    async def mark_reversed(
        self,
        decision_id: uuid.UUID,
        reversed_by_id: uuid.UUID,
    ) -> AccountantDecision:
        """Mark a decision as reversed."""
        result = await self.db.execute(
            select(AccountantDecision)
            .where(AccountantDecision.id == decision_id)
        )
        decision = result.scalar_one_or_none()
        
        if not decision:
            raise ValueError(f"Decision {decision_id} not found")
        
        if not decision.is_reversible:
            raise ValueError(f"Decision {decision_id} is not reversible")
        
        if decision.execution_status != ExecutionStatus.EXECUTED:
            raise ValueError(f"Decision {decision_id} has not been executed")
        
        decision.execution_status = ExecutionStatus.ROLLED_BACK
        decision.reversed_at = datetime.now(timezone.utc)
        decision.reversed_by_id = reversed_by_id
        
        # Re-open the issue
        issue_result = await self.db.execute(
            select(ClientIssue)
            .where(ClientIssue.id == decision.issue_id)
        )
        issue = issue_result.scalar_one_or_none()
        if issue:
            issue.is_resolved = False
            issue.resolved_at = None
            issue.resolved_by_id = None
        
        await self.db.flush()
        return decision
    
    async def _update_pattern(
        self,
        administration_id: uuid.UUID,
        issue_code: str,
        action_type: ActionType,
        decision: DecisionType,
    ) -> DecisionPattern:
        """Update the decision pattern for learning loop."""
        # Try to find existing pattern
        result = await self.db.execute(
            select(DecisionPattern)
            .where(DecisionPattern.administration_id == administration_id)
            .where(DecisionPattern.issue_code == issue_code)
            .where(DecisionPattern.action_type == action_type)
        )
        pattern = result.scalar_one_or_none()
        
        if not pattern:
            # Create new pattern
            pattern = DecisionPattern(
                administration_id=administration_id,
                issue_code=issue_code,
                action_type=action_type,
            )
            self.db.add(pattern)
        
        # Update counts based on decision
        now = datetime.now(timezone.utc)
        if decision == DecisionType.APPROVED:
            pattern.approval_count += 1
            pattern.last_approved_at = now
            # Increase confidence boost (max 0.3)
            pattern.confidence_boost = min(
                pattern.confidence_boost + Decimal("0.0500"),
                Decimal("0.3000")
            )
        elif decision == DecisionType.REJECTED:
            pattern.rejection_count += 1
            pattern.last_rejected_at = now
            # Decrease confidence boost (min -0.2)
            pattern.confidence_boost = max(
                pattern.confidence_boost - Decimal("0.0750"),
                Decimal("-0.2000")
            )
        # OVERRIDDEN doesn't change confidence
        
        await self.db.flush()
        return pattern
    
    async def get_patterns(
        self,
        administration_id: uuid.UUID,
    ) -> List[DecisionPattern]:
        """Get all decision patterns for a client."""
        result = await self.db.execute(
            select(DecisionPattern)
            .where(DecisionPattern.administration_id == administration_id)
            .order_by(DecisionPattern.approval_count.desc())
        )
        return list(result.scalars().all())
