from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.user import User
from app.schemas.administration import (
    AdministrationCreate,
    AdministrationUpdate,
    AdministrationResponse,
    AdministrationDetailResponse,
    AdministrationMemberResponse,
)
from app.api.v1.deps import CurrentUser

router = APIRouter()


@router.post("", response_model=AdministrationResponse)
async def create_administration(
    admin_in: AdministrationCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new administration and add current user as OWNER"""
    # Create administration
    administration = Administration(**admin_in.model_dump())
    db.add(administration)
    await db.flush()
    
    # Add current user as owner
    member = AdministrationMember(
        administration_id=administration.id,
        user_id=current_user.id,
        role=MemberRole.OWNER,
    )
    db.add(member)
    
    await db.commit()
    await db.refresh(administration)
    
    return administration


@router.get("", response_model=List[AdministrationResponse])
async def list_administrations(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all administrations the current user has access to"""
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == current_user.id)
        .where(Administration.is_active == True)
        .order_by(Administration.name)
    )
    return result.scalars().all()


@router.get("/{admin_id}", response_model=AdministrationDetailResponse)
async def get_administration(
    admin_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get administration details"""
    result = await db.execute(
        select(Administration)
        .options(selectinload(Administration.members).selectinload(AdministrationMember.user))
        .where(Administration.id == admin_id)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Administration not found")
    
    # Check access
    member = next(
        (m for m in administration.members if m.user_id == current_user.id),
        None
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this administration")
    
    # Build response with member details
    members = []
    for m in administration.members:
        members.append(AdministrationMemberResponse(
            id=m.id,
            user_id=m.user_id,
            user_email=m.user.email,
            user_full_name=m.user.full_name,
            role=m.role,
            created_at=m.created_at,
        ))
    
    return AdministrationDetailResponse(
        **administration.__dict__,
        members=members,
    )


@router.patch("/{admin_id}", response_model=AdministrationResponse)
async def update_administration(
    admin_id: UUID,
    admin_update: AdministrationUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update administration (OWNER or ADMIN only)"""
    result = await db.execute(
        select(Administration)
        .options(selectinload(Administration.members))
        .where(Administration.id == admin_id)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Administration not found")
    
    # Check permission
    member = next(
        (m for m in administration.members if m.user_id == current_user.id),
        None
    )
    if not member or member.role not in [MemberRole.OWNER, MemberRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Update fields
    update_data = admin_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(administration, field, value)
    
    await db.commit()
    await db.refresh(administration)
    
    return administration


@router.delete("/{admin_id}")
async def delete_administration(
    admin_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete administration (OWNER only - soft delete)"""
    result = await db.execute(
        select(Administration)
        .options(selectinload(Administration.members))
        .where(Administration.id == admin_id)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Administration not found")
    
    # Check permission - only OWNER can delete
    member = next(
        (m for m in administration.members if m.user_id == current_user.id),
        None
    )
    if not member or member.role != MemberRole.OWNER:
        raise HTTPException(status_code=403, detail="Only the owner can delete an administration")
    
    # Soft delete
    administration.is_active = False
    await db.commit()
    
    return {"message": "Administration deleted"}
