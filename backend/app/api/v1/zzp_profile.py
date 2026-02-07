"""
ZZP Business Profile API Endpoints

GET/PUT operations for business profile (1:1 with administration).
Used for invoice seller details.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import BusinessProfile
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    BusinessProfileCreate,
    BusinessProfileUpdate,
    BusinessProfileResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    """
    Get the primary administration for a ZZP user.
    
    ZZP users typically have one administration (their own business).
    Returns the first active administration where the user is a member.
    """
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user_id)
        .where(Administration.is_active == True)
        .order_by(Administration.created_at)
        .limit(1)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "NO_ADMINISTRATION",
                "message": "Geen administratie gevonden. Voltooi eerst de onboarding."
            }
        )
    
    return administration


@router.get("/profile", response_model=BusinessProfileResponse)
async def get_business_profile(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the business profile for the current user's administration.
    
    Returns 404 if no profile exists yet.
    """
    require_zzp(current_user)
    
    # Get user's administration
    administration = await get_user_administration(current_user.id, db)
    
    # Find profile
    result = await db.execute(
        select(BusinessProfile).where(
            BusinessProfile.administration_id == administration.id
        )
    )
    profile = result.scalar_one_or_none()
    
    if not profile:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "PROFILE_NOT_FOUND",
                "message": "Bedrijfsprofiel nog niet aangemaakt."
            }
        )
    
    return BusinessProfileResponse.model_validate(profile)


@router.put("/profile", response_model=BusinessProfileResponse)
async def upsert_business_profile(
    profile_in: BusinessProfileCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create or update the business profile for the current user's administration.
    
    This is an upsert operation - creates if not exists, updates if exists.
    """
    require_zzp(current_user)
    
    # Get user's administration
    administration = await get_user_administration(current_user.id, db)
    
    # Check if profile exists
    result = await db.execute(
        select(BusinessProfile).where(
            BusinessProfile.administration_id == administration.id
        )
    )
    profile = result.scalar_one_or_none()
    
    if profile:
        # Update existing profile
        update_data = profile_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(profile, field, value)
    else:
        # Create new profile
        profile = BusinessProfile(
            administration_id=administration.id,
            **profile_in.model_dump()
        )
        db.add(profile)
    
    await db.commit()
    await db.refresh(profile)
    
    return BusinessProfileResponse.model_validate(profile)


@router.patch("/profile", response_model=BusinessProfileResponse)
async def partial_update_business_profile(
    profile_in: BusinessProfileUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Partially update the business profile.
    
    Only provided fields will be updated.
    """
    require_zzp(current_user)
    
    # Get user's administration
    administration = await get_user_administration(current_user.id, db)
    
    # Find profile
    result = await db.execute(
        select(BusinessProfile).where(
            BusinessProfile.administration_id == administration.id
        )
    )
    profile = result.scalar_one_or_none()
    
    if not profile:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "PROFILE_NOT_FOUND",
                "message": "Bedrijfsprofiel nog niet aangemaakt. Gebruik PUT om aan te maken."
            }
        )
    
    # Update only provided fields
    update_data = profile_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)
    
    await db.commit()
    await db.refresh(profile)
    
    return BusinessProfileResponse.model_validate(profile)
