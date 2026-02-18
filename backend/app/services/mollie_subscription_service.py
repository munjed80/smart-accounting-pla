"""
Mollie subscription service for managing customer subscriptions.

Handles:
- Mollie customer creation and management
- Subscription activation (scheduled after trial)
- Webhook event processing
- Subscription cancellation
"""
import logging
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Dict, Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from dateutil import parser as dateutil_parser

from app.core.config import settings
from app.models.subscription import Subscription, SubscriptionStatus, WebhookEvent
from app.models.administration import Administration
from app.models.user import User
from app.models.audit_log import AuditLog
from app.integrations.mollie.client import MollieClient, MollieError
from app.services.subscription_service import subscription_service

logger = logging.getLogger(__name__)


# Mollie subscription constants
ZZP_BASIC_PRICE = Decimal("6.95")
ZZP_BASIC_CURRENCY = "EUR"
ZZP_BASIC_INTERVAL = "1 month"
ZZP_BASIC_DESCRIPTION = "ZZP Basic abonnement"


class MollieSubscriptionService:
    """Service for Mollie subscription management"""
    
    def _is_subscription_scheduled(self, subscription: Subscription) -> bool:
        """
        Determine if a subscription is scheduled (created but trial still active).
        
        Args:
            subscription: Subscription object
            
        Returns:
            bool: True if subscription is scheduled to start after trial
        """
        now = datetime.now(timezone.utc)
        in_trial = subscription.status == SubscriptionStatus.TRIALING
        
        # Ensure trial_end_at is timezone-aware for comparison
        trial_end_aware = subscription.trial_end_at
        if trial_end_aware and trial_end_aware.tzinfo is None:
            trial_end_aware = trial_end_aware.replace(tzinfo=timezone.utc)
        
        return bool(
            in_trial and 
            trial_end_aware and 
            now < trial_end_aware
        )
    
    async def ensure_mollie_customer(
        self,
        db: AsyncSession,
        user: User,
        administration: Administration,
        subscription: Subscription,
    ) -> str:
        """
        Ensure Mollie customer exists for the subscription.
        Idempotent - returns existing customer ID if already created.
        
        Args:
            db: Database session
            user: User object
            administration: Administration object
            subscription: Subscription object
        
        Returns:
            str: Mollie customer ID
        
        Raises:
            MollieError: If customer creation fails
        """
        # Check if customer already exists
        if subscription.provider_customer_id:
            logger.info(
                f"Mollie customer already exists: {subscription.provider_customer_id} "
                f"for subscription {subscription.id}"
            )
            return subscription.provider_customer_id
        
        # Create Mollie customer
        async with MollieClient() as mollie:
            customer_data = await mollie.create_customer(
                email=user.email,
                name=user.full_name or user.email,
                metadata={
                    "administration_id": str(administration.id),
                    "subscription_id": str(subscription.id),
                }
            )
        
        # Store customer ID in subscription
        subscription.provider = "mollie"
        subscription.provider_customer_id = customer_data["id"]
        
        await db.commit()
        await db.refresh(subscription)
        
        logger.info(
            f"Created Mollie customer {customer_data['id']} "
            f"for subscription {subscription.id}"
        )
        
        # Audit log
        audit = AuditLog(
            client_id=administration.id,
            entity_type="subscription",
            entity_id=subscription.id,
            action="MOLLIE_CUSTOMER",
            user_id=user.id,
            user_role=user.role,
            new_value={
                "mollie_customer_id": customer_data["id"],
                "administration_id": str(administration.id),
            }
        )
        db.add(audit)
        await db.commit()
        
        return customer_data["id"]
    
    async def activate_subscription(
        self,
        db: AsyncSession,
        user: User,
        administration_id: UUID,
    ) -> Dict[str, Any]:
        """
        Activate Mollie subscription for a user.
        
        Creates a scheduled subscription that starts after the trial period.
        Idempotent - returns existing subscription status if already activated.
        
        Args:
            db: Database session
            user: User object
            administration_id: Administration UUID
        
        Returns:
            Dict with status information
        
        Raises:
            MollieError: If subscription creation fails
        """
        # Ensure trial started
        subscription = await subscription_service.ensure_trial_started(db, administration_id)
        
        # Get administration
        admin_result = await db.execute(
            select(Administration).where(Administration.id == administration_id)
        )
        administration = admin_result.scalar_one_or_none()
        
        if not administration:
            raise ValueError(f"Administration {administration_id} not found")
        
        # Check if already activated (idempotent)
        if subscription.provider_subscription_id:
            logger.info(
                f"Subscription {subscription.id} already activated with Mollie: "
                f"{subscription.provider_subscription_id}"
            )
            
            scheduled = self._is_subscription_scheduled(subscription)
            
            # Generate appropriate message
            if subscription.status == SubscriptionStatus.ACTIVE:
                message_nl = "Abonnement is actief."
            elif scheduled:
                message_nl = "Abonnement gepland. Start na proefperiode."
            else:
                message_nl = f"Abonnement status: {subscription.status.value}"
            
            return {
                "status": subscription.status.value,
                "in_trial": subscription.status == SubscriptionStatus.TRIALING,
                "trial_end_at": subscription.trial_end_at.isoformat() if subscription.trial_end_at else None,
                "scheduled": scheduled,
                "provider_subscription_id": subscription.provider_subscription_id,
                "message_nl": message_nl,
            }
        
        # Ensure Mollie customer exists
        customer_id = await self.ensure_mollie_customer(
            db, user, administration, subscription
        )
        
        # Determine start date (trial_end_at date)
        start_date = None
        if subscription.trial_end_at:
            # Convert to date (Mollie expects date, not datetime)
            start_date = subscription.trial_end_at.date()
        
        # Build webhook URL
        webhook_url = self._get_webhook_url()
        
        # Create Mollie subscription
        async with MollieClient() as mollie:
            subscription_data = await mollie.create_subscription(
                customer_id=customer_id,
                amount=ZZP_BASIC_PRICE,
                currency=ZZP_BASIC_CURRENCY,
                interval=ZZP_BASIC_INTERVAL,
                description=ZZP_BASIC_DESCRIPTION,
                webhook_url=webhook_url,
                start_date=start_date,
                metadata={
                    "administration_id": str(administration_id),
                    "subscription_id": str(subscription.id),
                }
            )
        
        # Store subscription ID
        subscription.provider_subscription_id = subscription_data["id"]
        
        await db.commit()
        await db.refresh(subscription)
        
        logger.info(
            f"Created Mollie subscription {subscription_data['id']} "
            f"for subscription {subscription.id}, starts at {start_date}"
        )
        
        # Audit log
        audit = AuditLog(
            client_id=administration_id,
            entity_type="subscription",
            entity_id=subscription.id,
            action="SUBSCRIPTION_SCHEDULED",
            user_id=user.id,
            user_role=user.role,
            new_value={
                "mollie_subscription_id": subscription_data["id"],
                "start_date": start_date.isoformat() if start_date else None,
                "amount": str(ZZP_BASIC_PRICE),
                "currency": ZZP_BASIC_CURRENCY,
            }
        )
        db.add(audit)
        await db.commit()
        
        # Determine response
        scheduled = self._is_subscription_scheduled(subscription)
        
        # Generate appropriate message
        if scheduled:
            message_nl = "Abonnement gepland. Start na proefperiode."
        elif subscription.status == SubscriptionStatus.ACTIVE:
            message_nl = "Abonnement is actief."
        else:
            message_nl = f"Abonnement status: {subscription.status.value}"
        
        return {
            "status": subscription.status.value,
            "in_trial": subscription.status == SubscriptionStatus.TRIALING,
            "trial_end_at": subscription.trial_end_at.isoformat() if subscription.trial_end_at else None,
            "scheduled": scheduled,
            "provider_subscription_id": subscription_data["id"],
            "message_nl": message_nl,
        }
    
    async def cancel_subscription(
        self,
        db: AsyncSession,
        user: User,
        administration_id: UUID,
    ) -> Dict[str, Any]:
        """
        Cancel Mollie subscription at period end.
        
        Rules:
        - If no provider_subscription_id: set status=CANCELED locally and return
        - Call Mollie API to cancel subscription (cancels at period end)
        - Persist cancel_at_period_end=True
        - Status remains ACTIVE until period end; webhook will set CANCELED
        - Creates audit log for SUBSCRIPTION_CANCEL_REQUESTED
        
        Args:
            db: Database session
            user: User object
            administration_id: Administration UUID
        
        Returns:
            Dict with subscription status and message_nl
        
        Raises:
            MollieError: If cancellation fails
        """
        # Get subscription
        subscription = await subscription_service.get_subscription(db, administration_id)
        
        if not subscription:
            raise ValueError("No subscription found")
        
        # Idempotent: If already canceled or marked for cancellation
        if subscription.status == SubscriptionStatus.CANCELED:
            return {
                "subscription": {
                    "status": subscription.status.value,
                    "cancel_at_period_end": subscription.cancel_at_period_end,
                    "current_period_end": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
                },
                "message_nl": "Abonnement is al geannuleerd.",
            }
        
        if subscription.cancel_at_period_end:
            return {
                "subscription": {
                    "status": subscription.status.value,
                    "cancel_at_period_end": True,
                    "current_period_end": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
                },
                "message_nl": "Abonnement staat al ingepland voor annulering.",
            }
        
        # If no provider subscription, cancel locally
        if not subscription.provider_subscription_id:
            subscription.status = SubscriptionStatus.CANCELED
            subscription.cancel_at_period_end = False  # False because subscription is immediately canceled (no period end wait)
            
            await db.commit()
            await db.refresh(subscription)
            
            logger.info(f"Canceled subscription {subscription.id} locally (no Mollie subscription)")
            
            # Audit log
            audit = AuditLog(
                client_id=administration_id,
                entity_type="subscription",
                entity_id=subscription.id,
                action="SUBSCRIPTION_CANCELED",
                user_id=user.id,
                user_role=user.role,
                new_value={
                    "status": "CANCELED",
                    "reason": "no_provider_subscription",
                }
            )
            db.add(audit)
            await db.commit()
            
            return {
                "subscription": {
                    "status": subscription.status.value,
                    "cancel_at_period_end": False,
                    "current_period_end": None,
                },
                "message_nl": "Abonnement geannuleerd.",
            }
        
        # Cancel in Mollie (cancels at period end by default)
        if not subscription.provider_customer_id:
            raise ValueError("Missing provider_customer_id")
        
        async with MollieClient() as mollie:
            mollie_sub_data = await mollie.cancel_subscription(
                customer_id=subscription.provider_customer_id,
                subscription_id=subscription.provider_subscription_id,
            )
        
        # Mark as cancel at period end
        subscription.cancel_at_period_end = True
        
        # Mollie cancels at period end, so status stays ACTIVE until webhook
        # Extract current_period_end if available from Mollie response
        # Note: Mollie doesn't provide nextPaymentDate after cancellation, but we may have it already
        
        await db.commit()
        await db.refresh(subscription)
        
        logger.info(f"Canceled Mollie subscription for subscription {subscription.id}")
        
        # Audit log - SUBSCRIPTION_CANCEL_REQUESTED
        audit = AuditLog(
            client_id=administration_id,
            entity_type="subscription",
            entity_id=subscription.id,
            action="SUBSCRIPTION_CANCEL_REQUESTED",
            user_id=user.id,
            user_role=user.role,
            new_value={
                "mollie_subscription_id": subscription.provider_subscription_id,
                "cancel_at_period_end": True,
                "mollie_status": mollie_sub_data.get("status"),
            }
        )
        db.add(audit)
        await db.commit()
        
        return {
            "subscription": {
                "status": subscription.status.value,
                "cancel_at_period_end": True,
                "current_period_end": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
            },
            "message_nl": "Abonnement opgezegd. Het blijft actief tot het einde van de huidige periode.",
        }
    
    async def reactivate_subscription(
        self,
        db: AsyncSession,
        user: User,
        administration_id: UUID,
    ) -> Dict[str, Any]:
        """
        Reactivate a canceled or expired subscription.
        
        Rules:
        - If status ACTIVE: idempotent return
        - Ensure Mollie customer exists
        - If within trial and had scheduled subscription, return scheduled status
        - If canceled/expired and no active Mollie subscription:
          - Create new Mollie subscription starting today (or tomorrow)
        - Persist provider_subscription_id if new
        - Set status based on payment state
        - Creates audit log for SUBSCRIPTION_REACTIVATED or SUBSCRIPTION_SCHEDULED
        
        Args:
            db: Database session
            user: User object
            administration_id: Administration UUID
        
        Returns:
            Dict with subscription status and message_nl
        
        Raises:
            MollieError: If reactivation fails
        """
        # Ensure trial started
        subscription = await subscription_service.ensure_trial_started(db, administration_id)
        
        # Get administration
        admin_result = await db.execute(
            select(Administration).where(Administration.id == administration_id)
        )
        administration = admin_result.scalar_one_or_none()
        
        if not administration:
            raise ValueError(f"Administration {administration_id} not found")
        
        # Idempotent: If already active and not marked for cancellation
        if subscription.status == SubscriptionStatus.ACTIVE and not subscription.cancel_at_period_end:
            logger.info(f"Subscription {subscription.id} already active")
            return {
                "subscription": {
                    "status": subscription.status.value,
                    "cancel_at_period_end": False,
                    "scheduled": False,
                    "provider_subscription_id": subscription.provider_subscription_id,
                },
                "message_nl": "Abonnement is al actief.",
            }
        
        # If in trial and already scheduled (has provider_subscription_id)
        now = datetime.now(timezone.utc)
        trial_end_aware = subscription.trial_end_at
        if trial_end_aware and trial_end_aware.tzinfo is None:
            trial_end_aware = trial_end_aware.replace(tzinfo=timezone.utc)
        
        in_trial = trial_end_aware and now < trial_end_aware
        
        if in_trial and subscription.provider_subscription_id:
            # Already scheduled, just clear cancel flag if set
            if subscription.cancel_at_period_end:
                subscription.cancel_at_period_end = False
                await db.commit()
                await db.refresh(subscription)
                
                # Audit log
                audit = AuditLog(
                    client_id=administration_id,
                    entity_type="subscription",
                    entity_id=subscription.id,
                    action="SUBSCRIPTION_REACTIVATED",
                    user_id=user.id,
                    user_role=user.role,
                    new_value={
                        "cancel_at_period_end": False,
                        "reason": "reactivated_during_trial",
                    }
                )
                db.add(audit)
                await db.commit()
            
            return {
                "subscription": {
                    "status": subscription.status.value,
                    "cancel_at_period_end": False,
                    "scheduled": True,
                    "provider_subscription_id": subscription.provider_subscription_id,
                    "trial_end_at": subscription.trial_end_at.isoformat() if subscription.trial_end_at else None,
                },
                "message_nl": "Abonnement gepland. Start na proefperiode.",
            }
        
        # If currently marked for cancellation but still active, just remove cancel flag
        if subscription.status == SubscriptionStatus.ACTIVE and subscription.cancel_at_period_end:
            # Try to resume subscription in Mollie if possible
            # Note: Mollie doesn't have a direct "resume" API - we'd need to check if it's still active
            # For simplicity, just clear the cancel flag
            subscription.cancel_at_period_end = False
            
            await db.commit()
            await db.refresh(subscription)
            
            logger.info(f"Cleared cancel flag for subscription {subscription.id}")
            
            # Audit log
            audit = AuditLog(
                client_id=administration_id,
                entity_type="subscription",
                entity_id=subscription.id,
                action="SUBSCRIPTION_REACTIVATED",
                user_id=user.id,
                user_role=user.role,
                new_value={
                    "cancel_at_period_end": False,
                    "reason": "cancel_reversed",
                }
            )
            db.add(audit)
            await db.commit()
            
            return {
                "subscription": {
                    "status": subscription.status.value,
                    "cancel_at_period_end": False,
                    "scheduled": False,
                    "provider_subscription_id": subscription.provider_subscription_id,
                },
                "message_nl": "Annulering ingetrokken. Abonnement blijft actief.",
            }
        
        # Need to create new subscription (for CANCELED, EXPIRED, or PAST_DUE states)
        # Ensure Mollie customer exists
        customer_id = await self.ensure_mollie_customer(
            db, user, administration, subscription
        )
        
        # Determine start date (start immediately or tomorrow)
        # Mollie requires future date for new subscriptions, so we start tomorrow
        from datetime import timedelta
        start_date = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        
        # Build webhook URL
        webhook_url = self._get_webhook_url()
        
        # Create new Mollie subscription
        async with MollieClient() as mollie:
            subscription_data = await mollie.create_subscription(
                customer_id=customer_id,
                amount=ZZP_BASIC_PRICE,
                currency=ZZP_BASIC_CURRENCY,
                interval=ZZP_BASIC_INTERVAL,
                description=ZZP_BASIC_DESCRIPTION,
                webhook_url=webhook_url,
                start_date=start_date,
                metadata={
                    "administration_id": str(administration_id),
                    "subscription_id": str(subscription.id),
                }
            )
        
        # Update subscription
        subscription.provider_subscription_id = subscription_data["id"]
        subscription.cancel_at_period_end = False
        
        # Set status to ACTIVE or keep as is (webhook will update)
        # For now, set to TRIALING if we're in trial, otherwise leave as is
        # The first payment webhook will set it to ACTIVE
        if not in_trial:
            # Not in trial anymore, so this is a reactivation
            # Status will be updated by webhook when first payment is processed
            pass
        
        await db.commit()
        await db.refresh(subscription)
        
        logger.info(
            f"Created new Mollie subscription {subscription_data['id']} "
            f"for subscription {subscription.id} (reactivation)"
        )
        
        # Audit log
        audit = AuditLog(
            client_id=administration_id,
            entity_type="subscription",
            entity_id=subscription.id,
            action="SUBSCRIPTION_SCHEDULED" if in_trial else "SUBSCRIPTION_REACTIVATED",
            user_id=user.id,
            user_role=user.role,
            new_value={
                "mollie_subscription_id": subscription_data["id"],
                "start_date": start_date.isoformat(),
                "amount": str(ZZP_BASIC_PRICE),
                "currency": ZZP_BASIC_CURRENCY,
                "reason": "reactivation",
            }
        )
        db.add(audit)
        await db.commit()
        
        return {
            "subscription": {
                "status": subscription.status.value,
                "cancel_at_period_end": False,
                "scheduled": True,
                "provider_subscription_id": subscription_data["id"],
            },
            "message_nl": "Abonnement heractiveerd. De eerste betaling wordt binnenkort verwerkt.",
        }
    
    async def process_webhook(
        self,
        db: AsyncSession,
        payment_id: Optional[str] = None,
        subscription_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Process Mollie webhook event.
        
        Handles payment and subscription status updates from Mollie.
        Idempotent - uses webhook_events table to prevent double-processing.
        
        Args:
            db: Database session
            payment_id: Mollie payment ID (if payment webhook)
            subscription_id: Mollie subscription ID (if subscription webhook)
        
        Returns:
            Dict with processing result
        """
        # Determine event type and resource
        resource_id = payment_id or subscription_id
        event_type = "payment" if payment_id else "subscription"
        
        if not resource_id:
            raise ValueError("Either payment_id or subscription_id must be provided")
        
        # Check if already processed (idempotency)
        result = await db.execute(
            select(WebhookEvent)
            .where(WebhookEvent.provider == "mollie")
            .where(WebhookEvent.resource_id == resource_id)
        )
        existing_event = result.scalar_one_or_none()
        
        if existing_event:
            logger.info(f"Webhook event already processed: {resource_id}")
            return {"status": "already_processed"}
        
        # Fetch resource from Mollie
        async with MollieClient() as mollie:
            if payment_id:
                resource_data = await mollie.get_payment(payment_id)
            else:
                # For subscription webhooks, we need customer ID
                # Find subscription by provider_subscription_id
                sub_result = await db.execute(
                    select(Subscription)
                    .where(Subscription.provider_subscription_id == subscription_id)
                )
                sub = sub_result.scalar_one_or_none()
                
                if not sub or not sub.provider_customer_id:
                    logger.error(f"Subscription not found for webhook: {subscription_id}")
                    return {"status": "subscription_not_found"}
                
                resource_data = await mollie.get_subscription(
                    customer_id=sub.provider_customer_id,
                    subscription_id=subscription_id
                )
        
        # Record webhook event (use resource_id + event_type for idempotency)
        webhook_event = WebhookEvent(
            provider="mollie",
            event_id=f"{event_type}_{resource_id}",
            event_type=event_type,
            resource_id=resource_id,
            payload=json.dumps(resource_data)[:5000],  # Truncate if needed
        )
        db.add(webhook_event)
        
        # Process based on resource type
        if payment_id:
            await self._process_payment_webhook(db, resource_data)
        else:
            await self._process_subscription_webhook(db, resource_data)
        
        await db.commit()
        
        return {"status": "processed"}
    
    async def _process_payment_webhook(
        self,
        db: AsyncSession,
        payment_data: Dict[str, Any],
    ) -> None:
        """Process payment webhook data"""
        payment_id = payment_data.get("id")
        status = payment_data.get("status")
        subscription_id = payment_data.get("subscriptionId")
        
        logger.info(f"Processing payment webhook: {payment_id}, status={status}")
        
        if not subscription_id:
            logger.warning(f"Payment {payment_id} has no subscription ID")
            return
        
        # Find subscription
        result = await db.execute(
            select(Subscription)
            .where(Subscription.provider_subscription_id == subscription_id)
        )
        subscription = result.scalar_one_or_none()
        
        if not subscription:
            logger.error(f"Subscription not found for payment webhook: {subscription_id}")
            return
        
        # Update subscription status based on payment status
        if status == "paid":
            subscription.status = SubscriptionStatus.ACTIVE
            
            # Set current period (if available in payment data)
            # Note: Mollie doesn't return period in payment data directly
            # We'll rely on subscription webhooks for period updates
            
            logger.info(f"Payment paid, activated subscription {subscription.id}")
            
            # Audit log
            audit = AuditLog(
                client_id=subscription.administration_id,
                entity_type="subscription",
                entity_id=subscription.id,
                action="SUBSCRIPTION_ACTIVATED",
                user_id=None,  # System action
                user_role="system",
                new_value={
                    "mollie_payment_id": payment_id,
                    "status": status,
                }
            )
            db.add(audit)
        
        elif status in ["failed", "expired", "canceled"]:
            # Payment failed - mark as PAST_DUE
            subscription.status = SubscriptionStatus.PAST_DUE
            
            logger.warning(f"Payment failed for subscription {subscription.id}: {status}")
            
            # Audit log
            audit = AuditLog(
                client_id=subscription.administration_id,
                entity_type="subscription",
                entity_id=subscription.id,
                action="SUBSCRIPTION_PAYMENT_FAILED",
                user_id=None,  # System action
                user_role="system",
                new_value={
                    "mollie_payment_id": payment_id,
                    "status": status,
                }
            )
            db.add(audit)
        
        elif status in ["pending", "open"]:
            # Payment pending - check trial status
            now = datetime.now(timezone.utc)
            
            # Ensure trial_end_at is timezone-aware
            trial_end_aware = subscription.trial_end_at
            if trial_end_aware and trial_end_aware.tzinfo is None:
                trial_end_aware = trial_end_aware.replace(tzinfo=timezone.utc)
            
            if trial_end_aware and now < trial_end_aware:
                # Still in trial, keep TRIALING status
                logger.info(f"Payment pending for subscription {subscription.id}, still in trial")
            else:
                # Trial expired, mark as PAST_DUE
                subscription.status = SubscriptionStatus.PAST_DUE
                logger.warning(f"Payment pending but trial expired for subscription {subscription.id}")
    
    async def _process_subscription_webhook(
        self,
        db: AsyncSession,
        subscription_data: Dict[str, Any],
    ) -> None:
        """Process subscription webhook data"""
        mollie_sub_id = subscription_data.get("id")
        status = subscription_data.get("status")
        
        logger.info(f"Processing subscription webhook: {mollie_sub_id}, status={status}")
        
        # Find subscription
        result = await db.execute(
            select(Subscription)
            .where(Subscription.provider_subscription_id == mollie_sub_id)
        )
        subscription = result.scalar_one_or_none()
        
        if not subscription:
            logger.error(f"Subscription not found for webhook: {mollie_sub_id}")
            return
        
        # Map Mollie status to our status
        if status == "active":
            subscription.status = SubscriptionStatus.ACTIVE
            logger.info(f"Subscription activated: {subscription.id}")
            
            # Audit log
            audit = AuditLog(
                client_id=subscription.administration_id,
                entity_type="subscription",
                entity_id=subscription.id,
                action="SUBSCRIPTION_ACTIVATED",
                user_id=None,  # System action
                user_role="system",
                new_value={
                    "mollie_subscription_id": mollie_sub_id,
                    "status": status,
                }
            )
            db.add(audit)
        
        elif status in ["canceled", "suspended", "completed"]:
            # Subscription ended - mark as CANCELED
            subscription.status = SubscriptionStatus.CANCELED
            
            # Record current_period_end if available from Mollie
            # Mollie may provide canceledAt or other timestamps
            canceled_at = subscription_data.get("canceledAt")
            if canceled_at:
                try:
                    subscription.current_period_end = dateutil_parser.parse(canceled_at)
                except Exception as e:
                    logger.warning(f"Failed to parse canceledAt: {e}")
            
            logger.info(f"Subscription ended: {subscription.id}, status={status}")
            
            # Audit log
            audit = AuditLog(
                client_id=subscription.administration_id,
                entity_type="subscription",
                entity_id=subscription.id,
                action="SUBSCRIPTION_CANCELED",
                user_id=None,  # System action
                user_role="system",
                new_value={
                    "mollie_subscription_id": mollie_sub_id,
                    "status": status,
                    "current_period_end": subscription.current_period_end.isoformat() if subscription.current_period_end else None,
                }
            )
            db.add(audit)
        
        elif status in ["pending"]:
            # Keep current status (likely TRIALING)
            logger.info(f"Subscription pending: {subscription.id}")
    
    def _get_webhook_url(self) -> str:
        """
        Get webhook URL for Mollie.
        
        Returns:
            str: Full webhook URL with secret parameter
        """
        public_url = settings.APP_PUBLIC_URL or settings.APP_URL
        
        # Remove trailing slash
        if public_url.endswith("/"):
            public_url = public_url[:-1]
        
        webhook_secret = settings.MOLLIE_WEBHOOK_SECRET
        if webhook_secret:
            return f"{public_url}/api/v1/webhooks/mollie?secret={webhook_secret}"
        
        # Fallback without secret (not recommended for production)
        logger.warning("MOLLIE_WEBHOOK_SECRET not configured - webhook URL without secret")
        return f"{public_url}/api/v1/webhooks/mollie"


# Singleton instance
mollie_subscription_service = MollieSubscriptionService()
