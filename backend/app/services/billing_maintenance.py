"""
Billing maintenance service for force-paywall test mode.

This module provides the enforce_trial_override() function that:
- Reads BILLING_TRIAL_OVERRIDE_DAYS from config
- Shortens all TRIALING subscriptions to now + override_days (idempotent)
- Transitions TRIALING subscriptions with trial_end_at <= now to EXPIRED

Designed to run on backend startup and every 5 minutes via the background task loop.
Controlled by two env flags:
  BILLING_FORCE_PAYWALL=true|false
  BILLING_TRIAL_OVERRIDE_DAYS=0   (or 1, or any non-negative integer)
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.subscription import Subscription, SubscriptionStatus

logger = logging.getLogger(__name__)


async def enforce_trial_override(db: AsyncSession) -> None:
    """
    Enforce BILLING_TRIAL_OVERRIDE_DAYS on all TRIALING subscriptions.

    Logic:
    1. If BILLING_TRIAL_OVERRIDE_DAYS is not set → do nothing.
    2. Compute new_trial_end = now + timedelta(days=override_days).
    3. For all TRIALING subscriptions where trial_end_at > new_trial_end:
       - Set trial_end_at = new_trial_end  (only ever shortens, never extends).
    4. For all TRIALING subscriptions where trial_end_at <= now:
       - Transition status → EXPIRED.

    Idempotent: safe to run multiple times; already-EXPIRED subscriptions are left alone.
    """
    override_days = settings.billing_trial_override_days
    if override_days is None:
        logger.debug("enforce_trial_override: BILLING_TRIAL_OVERRIDE_DAYS not set – skipping")
        return

    now = datetime.now(timezone.utc)
    new_trial_end = now + timedelta(days=override_days)

    # --- Step 1: Shorten trials that are longer than the override ---
    result = await db.execute(
        select(Subscription).where(
            Subscription.status == SubscriptionStatus.TRIALING,
            Subscription.trial_end_at > new_trial_end,
        )
    )
    to_shorten = result.scalars().all()

    if to_shorten:
        for sub in to_shorten:
            logger.info(
                "enforce_trial_override: shortening subscription %s "
                "(admin=%s) trial_end_at from %s → %s",
                sub.id,
                sub.administration_id,
                sub.trial_end_at,
                new_trial_end,
            )
            sub.trial_end_at = new_trial_end

        await db.commit()

    # --- Step 2: Expire trials that have now run out ---
    result = await db.execute(
        select(Subscription).where(
            Subscription.status == SubscriptionStatus.TRIALING,
            Subscription.trial_end_at <= now,
        )
    )
    to_expire = result.scalars().all()

    if to_expire:
        for sub in to_expire:
            logger.info(
                "enforce_trial_override: expiring subscription %s (admin=%s) – trial_end_at=%s",
                sub.id,
                sub.administration_id,
                sub.trial_end_at,
            )
            sub.status = SubscriptionStatus.EXPIRED

        await db.commit()

    logger.debug(
        "enforce_trial_override: override_days=%d, shortened=%d, expired=%d",
        override_days,
        len(to_shorten),
        len(to_expire),
    )
