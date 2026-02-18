"""Pydantic schemas for subscription API"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class SubscriptionResponse(BaseModel):
    """Response schema for subscription information"""
    id: UUID
    administration_id: UUID
    plan_code: str
    status: str
    trial_start_at: Optional[datetime] = None
    trial_end_at: Optional[datetime] = None
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool
    created_at: datetime
    updated_at: datetime
    
    # Entitlement flags
    is_paid: bool = Field(description="Whether subscription is paid (ACTIVE status)")
    in_trial: bool = Field(description="Whether subscription is in trial period")
    can_use_pro_features: bool = Field(description="Whether user can access pro features")
    days_left_trial: int = Field(description="Days remaining in trial (0 if not in trial)")
    
    class Config:
        from_attributes = True


class EntitlementResponse(BaseModel):
    """Response schema for entitlement check"""
    is_paid: bool = Field(description="Whether subscription is paid (ACTIVE status)")
    in_trial: bool = Field(description="Whether subscription is in trial period")
    can_use_pro_features: bool = Field(description="Whether user can access pro features")
    days_left_trial: int = Field(description="Days remaining in trial (0 if not in trial)")
    status: str = Field(description="Subscription status (TRIALING, ACTIVE, EXPIRED, etc.)")
    plan_code: Optional[str] = Field(None, description="Plan code (e.g., 'zzp_basic')")


class StartTrialRequest(BaseModel):
    """Request schema for starting a trial"""
    pass  # Idempotent, no parameters needed


class StartTrialResponse(BaseModel):
    """Response schema for starting a trial"""
    subscription_id: UUID
    status: str
    trial_start_at: datetime
    trial_end_at: datetime
    message: str = Field(description="Success message in Dutch")
