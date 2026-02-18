"""
Subscription service for managing ZZP subscription lifecycle and entitlements.

This service implements the subscription state machine and entitlement logic
for Phase 1 (provider-agnostic, pre-Mollie integration).
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import UserRole
from app.models.subscription import Plan, Subscription, SubscriptionStatus
from app.models.administration import Administration

logger = logging.getLogger(__name__)


# Feature gating map - defines which features require paid subscription after trial
GATED_FEATURES = {
    "vat_actions": True,          # VAT submission actions (mark ready, queue, sign, submit)
    "bank_reconcile_actions": True,  # Bank reconciliation actions (matching, finalize, bulk ops)
    "exports": True,               # CSV/PDF exports for invoices/expenses/hours/vat
}

# Roles that bypass subscription checks (accountants and admins)
SUBSCRIPTION_BYPASS_ROLES = [UserRole.ACCOUNTANT.value, UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value]

# "Unlimited" value for max_invoices (representing no limit)
UNLIMITED_INVOICES = 999999


class EntitlementResult:
    """Result of entitlement check for a user/administration"""
    
    def __init__(
        self,
        is_paid: bool,
        in_trial: bool,
        can_use_pro_features: bool,
        days_left_trial: int,
        status: str,
        plan_code: Optional[str] = None,
    ):
        self.is_paid = is_paid
        self.in_trial = in_trial
        self.can_use_pro_features = can_use_pro_features
        self.days_left_trial = days_left_trial
        self.status = status
        self.plan_code = plan_code
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for API responses"""
        return {
            "is_paid": self.is_paid,
            "in_trial": self.in_trial,
            "can_use_pro_features": self.can_use_pro_features,
            "days_left_trial": self.days_left_trial,
            "status": self.status,
            "plan_code": self.plan_code,
        }


class SubscriptionService:
    """Service for managing subscriptions and computing entitlements"""
    
    ZZP_BASIC_PLAN_CODE = "zzp_basic"
    DEFAULT_TRIAL_DAYS = 30
    
    async def ensure_trial_started(
        self,
        db: AsyncSession,
        administration_id: UUID,
    ) -> Subscription:
        """
        Ensure a trial subscription exists for the administration.
        Idempotent - returns existing subscription if already started.
        
        Args:
            db: Database session
            administration_id: Administration UUID
            
        Returns:
            Subscription: The trial subscription (new or existing)
        """
        # Check if subscription already exists
        result = await db.execute(
            select(Subscription)
            .where(Subscription.administration_id == administration_id)
            .order_by(Subscription.created_at.desc())
        )
        existing_subscription = result.scalar_one_or_none()
        
        if existing_subscription:
            logger.info(
                f"Subscription already exists for administration {administration_id}: "
                f"status={existing_subscription.status}"
            )
            return existing_subscription
        
        # Get ZZP Basic plan
        plan_result = await db.execute(
            select(Plan).where(Plan.code == self.ZZP_BASIC_PLAN_CODE)
        )
        plan = plan_result.scalar_one_or_none()
        
        if not plan:
            raise ValueError(f"Plan with code '{self.ZZP_BASIC_PLAN_CODE}' not found")
        
        # Create new trial subscription
        now = datetime.now(timezone.utc)
        trial_end = now + timedelta(days=plan.trial_days)
        
        subscription = Subscription(
            administration_id=administration_id,
            plan_id=plan.id,
            plan_code=plan.code,
            status=SubscriptionStatus.TRIALING,
            trial_start_at=now,
            trial_end_at=trial_end,
            starts_at=now,  # Legacy field - kept for backward compatibility with old admin tools
            ends_at=None,
            cancel_at_period_end=False,
        )
        
        db.add(subscription)
        await db.commit()
        await db.refresh(subscription)
        
        logger.info(
            f"Created trial subscription for administration {administration_id}: "
            f"trial ends at {trial_end}"
        )
        
        return subscription
    
    async def get_subscription(
        self,
        db: AsyncSession,
        administration_id: UUID,
    ) -> Optional[Subscription]:
        """
        Get the current subscription for an administration.
        
        Args:
            db: Database session
            administration_id: Administration UUID
            
        Returns:
            Optional[Subscription]: The current subscription or None
        """
        result = await db.execute(
            select(Subscription)
            .where(Subscription.administration_id == administration_id)
            .order_by(Subscription.created_at.desc())
        )
        return result.scalar_one_or_none()
    
    async def compute_entitlements(
        self,
        db: AsyncSession,
        administration_id: UUID,
        now: Optional[datetime] = None,
    ) -> EntitlementResult:
        """
        Compute entitlements for an administration based on subscription state.
        
        Logic:
        - If TRIALING and now <= trial_end_at => can_use_pro_features = True
        - If TRIALING and now > trial_end_at => status becomes EXPIRED, can_use_pro_features = False
        - If ACTIVE => can_use_pro_features = True
        - If PAST_DUE/CANCELED/EXPIRED => can_use_pro_features = False
        
        Args:
            db: Database session
            administration_id: Administration UUID
            now: Current datetime (defaults to datetime.now(timezone.utc))
            
        Returns:
            EntitlementResult: Computed entitlements
        """
        if now is None:
            now = datetime.now(timezone.utc)
        
        subscription = await self.get_subscription(db, administration_id)
        
        if not subscription:
            # No subscription - no entitlements
            return EntitlementResult(
                is_paid=False,
                in_trial=False,
                can_use_pro_features=False,
                days_left_trial=0,
                status="NONE",
                plan_code=None,
            )
        
        # Ensure timezone-aware datetimes (SQLite may return naive datetimes)
        # Replace naive datetimes with UTC timezone
        if subscription.trial_end_at and subscription.trial_end_at.tzinfo is None:
            subscription.trial_end_at = subscription.trial_end_at.replace(tzinfo=timezone.utc)
        if subscription.trial_start_at and subscription.trial_start_at.tzinfo is None:
            subscription.trial_start_at = subscription.trial_start_at.replace(tzinfo=timezone.utc)
        if subscription.current_period_end and subscription.current_period_end.tzinfo is None:
            subscription.current_period_end = subscription.current_period_end.replace(tzinfo=timezone.utc)
        
        # Compute days left in trial
        days_left_trial = 0
        if subscription.trial_end_at:
            delta = subscription.trial_end_at - now
            days_left_trial = max(0, delta.days)
        
        # State machine logic
        if subscription.status == SubscriptionStatus.TRIALING:
            if subscription.trial_end_at and now <= subscription.trial_end_at:
                # Still in trial period
                return EntitlementResult(
                    is_paid=False,
                    in_trial=True,
                    can_use_pro_features=True,
                    days_left_trial=days_left_trial,
                    status=subscription.status.value,
                    plan_code=subscription.plan_code,
                )
            else:
                # Trial expired - update status
                subscription.status = SubscriptionStatus.EXPIRED
                await db.commit()
                await db.refresh(subscription)
                
                logger.info(
                    f"Trial expired for administration {administration_id}, "
                    f"status updated to EXPIRED"
                )
                
                return EntitlementResult(
                    is_paid=False,
                    in_trial=False,
                    can_use_pro_features=False,
                    days_left_trial=0,
                    status=subscription.status.value,
                    plan_code=subscription.plan_code,
                )
        
        elif subscription.status == SubscriptionStatus.ACTIVE:
            # Cancellation at period end: keep ACTIVE until current_period_end passes
            if subscription.cancel_at_period_end and subscription.current_period_end and now >= subscription.current_period_end:
                subscription.status = SubscriptionStatus.CANCELED
                await db.commit()
                await db.refresh(subscription)

                logger.info(
                    f"Subscription reached period end for administration {administration_id}, "
                    f"status updated to CANCELED"
                )
                return EntitlementResult(
                    is_paid=False,
                    in_trial=False,
                    can_use_pro_features=False,
                    days_left_trial=0,
                    status=subscription.status.value,
                    plan_code=subscription.plan_code,
                )

            return EntitlementResult(
                is_paid=True,
                in_trial=False,
                can_use_pro_features=True,
                days_left_trial=0,
                status=subscription.status.value,
                plan_code=subscription.plan_code,
            )

        elif subscription.status == SubscriptionStatus.PAST_DUE:
            # Immediately gate paid features while retaining subscription record
            return EntitlementResult(
                is_paid=False,
                in_trial=False,
                can_use_pro_features=False,
                days_left_trial=0,
                status=subscription.status.value,
                plan_code=subscription.plan_code,
            )

        elif subscription.status == SubscriptionStatus.CANCELED:
            # Defensive guard: if still before current_period_end, keep ACTIVE behavior
            if subscription.cancel_at_period_end and subscription.current_period_end and now < subscription.current_period_end:
                subscription.status = SubscriptionStatus.ACTIVE
                await db.commit()
                await db.refresh(subscription)
                return EntitlementResult(
                    is_paid=True,
                    in_trial=False,
                    can_use_pro_features=True,
                    days_left_trial=0,
                    status=subscription.status.value,
                    plan_code=subscription.plan_code,
                )

            return EntitlementResult(
                is_paid=False,
                in_trial=False,
                can_use_pro_features=False,
                days_left_trial=0,
                status=subscription.status.value,
                plan_code=subscription.plan_code,
            )

        # EXPIRED and fallback statuses
        return EntitlementResult(
            is_paid=False,
            in_trial=False,
            can_use_pro_features=False,
            days_left_trial=0,
            status=subscription.status.value,
            plan_code=subscription.plan_code,
        )


# Singleton instance
subscription_service = SubscriptionService()
