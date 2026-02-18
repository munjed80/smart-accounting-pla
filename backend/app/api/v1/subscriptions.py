"""
Subscription API endpoints for managing ZZP subscriptions.

Provider-agnostic endpoints for Phase 1 (pre-Mollie integration).
"""
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import CurrentUser, get_current_user
from app.models.administration import AdministrationMember
from app.services.subscription_service import subscription_service
from app.schemas.subscription import (
    SubscriptionResponse,
    EntitlementResponse,
    StartTrialRequest,
    StartTrialResponse,
)
from sqlalchemy import select

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/me/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the current user's subscription status and entitlements.
    
    Returns subscription information including:
    - Trial status and days remaining
    - Payment status
    - Pro feature access
    - Subscription status (TRIALING, ACTIVE, EXPIRED, etc.)
    """
    # Get user's primary administration (ZZP users have one)
    result = await db.execute(
        select(AdministrationMember)
        .where(AdministrationMember.user_id == current_user.id)
        .order_by(AdministrationMember.created_at.asc())
    )
    member = result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(
            status_code=404,
            detail={"code": "NO_ADMINISTRATION", "message": "User has no administration"}
        )
    
    administration_id = member.administration_id
    
    # Get or create subscription
    subscription = await subscription_service.get_subscription(db, administration_id)
    
    if not subscription:
        # Auto-start trial for new users
        subscription = await subscription_service.ensure_trial_started(db, administration_id)
    
    # Compute entitlements
    entitlements = await subscription_service.compute_entitlements(db, administration_id)
    
    # Build response
    return SubscriptionResponse(
        id=subscription.id,
        administration_id=subscription.administration_id,
        plan_code=subscription.plan_code,
        status=subscription.status.value,
        trial_start_at=subscription.trial_start_at,
        trial_end_at=subscription.trial_end_at,
        current_period_start=subscription.current_period_start,
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
        created_at=subscription.created_at,
        updated_at=subscription.updated_at,
        is_paid=entitlements.is_paid,
        in_trial=entitlements.in_trial,
        can_use_pro_features=entitlements.can_use_pro_features,
        days_left_trial=entitlements.days_left_trial,
    )


@router.post("/me/subscription/start-trial", response_model=StartTrialResponse)
async def start_trial(
    request: StartTrialRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Start a trial subscription for the current user.
    
    Idempotent: Returns existing subscription if already started.
    Auto-starts 30-day trial for ZZP Basic plan.
    """
    # Get user's primary administration (ZZP users have one)
    result = await db.execute(
        select(AdministrationMember)
        .where(AdministrationMember.user_id == current_user.id)
        .order_by(AdministrationMember.created_at.asc())
    )
    member = result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(
            status_code=404,
            detail={"code": "NO_ADMINISTRATION", "message": "User has no administration"}
        )
    
    administration_id = member.administration_id
    
    # Ensure trial started (idempotent)
    subscription = await subscription_service.ensure_trial_started(db, administration_id)
    
    return StartTrialResponse(
        subscription_id=subscription.id,
        status=subscription.status.value,
        trial_start_at=subscription.trial_start_at,
        trial_end_at=subscription.trial_end_at,
        message=f"Proefperiode gestart! Je hebt {(subscription.trial_end_at - subscription.trial_start_at).days} dagen gratis toegang.",
    )


@router.get("/me/subscription/entitlements", response_model=EntitlementResponse)
async def get_entitlements(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get entitlement status for the current user.
    
    Returns quick access flags for determining feature availability.
    Useful for frontend to cache entitlement state.
    """
    # Get user's primary administration (ZZP users have one)
    result = await db.execute(
        select(AdministrationMember)
        .where(AdministrationMember.user_id == current_user.id)
        .order_by(AdministrationMember.created_at.asc())
    )
    member = result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(
            status_code=404,
            detail={"code": "NO_ADMINISTRATION", "message": "User has no administration"}
        )
    
    administration_id = member.administration_id
    
    # Compute entitlements
    entitlements = await subscription_service.compute_entitlements(db, administration_id)
    
    return EntitlementResponse(
        is_paid=entitlements.is_paid,
        in_trial=entitlements.in_trial,
        can_use_pro_features=entitlements.can_use_pro_features,
        days_left_trial=entitlements.days_left_trial,
        status=entitlements.status,
        plan_code=entitlements.plan_code,
    )
