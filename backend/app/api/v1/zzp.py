"""
ZZP Client API Endpoints

Provides endpoints for ZZP clients to:
- View pending accountant link requests
- Approve or reject accountant access
- View active accountant relationships
- Revoke accountant access
"""
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.accountant_dashboard import (
    AccountantClientAssignment,
    AssignmentStatus,
)
from app.schemas.accountant_dashboard import (
    ZZPLinksResponse,
    PendingLinkRequest,
    ApproveLinkResponse,
    RejectLinkResponse,
    ZZPActiveLinksResponse,
    ActiveAccountantLink,
)
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


@router.get("/links", response_model=ZZPLinksResponse)
async def list_pending_links(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get list of pending accountant link requests for this ZZP client.
    
    Returns all PENDING assignments where this user is the client.
    """
    require_zzp(current_user)
    
    # Query for PENDING assignments where current_user is the client
    result = await db.execute(
        select(AccountantClientAssignment)
        .options(
            selectinload(AccountantClientAssignment.accountant),
            selectinload(AccountantClientAssignment.administration),
        )
        .where(AccountantClientAssignment.client_user_id == current_user.id)
        .where(AccountantClientAssignment.status == AssignmentStatus.PENDING)
        .order_by(AccountantClientAssignment.assigned_at.desc())
    )
    assignments = result.scalars().all()
    
    pending_requests = []
    for assignment in assignments:
        pending_requests.append(
            PendingLinkRequest(
                assignment_id=assignment.id,
                accountant_id=assignment.accountant_id,
                accountant_email=assignment.accountant.email if assignment.accountant else "",
                accountant_name=assignment.accountant.full_name if assignment.accountant else "Unknown",
                administration_id=assignment.administration_id,
                administration_name=assignment.administration.name if assignment.administration else "Unknown",
                invited_at=assignment.assigned_at,
            )
        )
    
    return ZZPLinksResponse(
        pending_requests=pending_requests,
        total_count=len(pending_requests),
    )


@router.post("/links/{assignment_id}/approve", response_model=ApproveLinkResponse)
async def approve_link(
    assignment_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Approve an accountant link request.
    
    This changes the assignment status from PENDING to ACTIVE,
    granting the accountant access to the client's data.
    """
    require_zzp(current_user)
    
    # Find the assignment
    result = await db.execute(
        select(AccountantClientAssignment)
        .where(AccountantClientAssignment.id == assignment_id)
        .where(AccountantClientAssignment.client_user_id == current_user.id)
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ASSIGNMENT_NOT_FOUND",
                "message": "Koppelings verzoek niet gevonden."
            }
        )
    
    # Check if already approved
    if assignment.status == AssignmentStatus.ACTIVE:
        return ApproveLinkResponse(
            assignment_id=assignment.id,
            status="ACTIVE",
            approved_at=assignment.approved_at or assignment.assigned_at,
            message="Koppeling is al goedgekeurd.",
        )
    
    # Check if revoked
    if assignment.status == AssignmentStatus.REVOKED:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ASSIGNMENT_REVOKED",
                "message": "Deze koppeling is ingetrokken en kan niet worden goedgekeurd."
            }
        )
    
    # Approve the assignment
    assignment.status = AssignmentStatus.ACTIVE
    assignment.approved_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(assignment)
    
    return ApproveLinkResponse(
        assignment_id=assignment.id,
        status="ACTIVE",
        approved_at=assignment.approved_at,
        message="Koppeling succesvol goedgekeurd.",
    )


@router.post("/links/{assignment_id}/reject", response_model=RejectLinkResponse)
async def reject_link(
    assignment_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Reject an accountant link request.
    
    This changes the assignment status to REVOKED,
    denying the accountant access to the client's data.
    """
    require_zzp(current_user)
    
    # Find the assignment
    result = await db.execute(
        select(AccountantClientAssignment)
        .where(AccountantClientAssignment.id == assignment_id)
        .where(AccountantClientAssignment.client_user_id == current_user.id)
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ASSIGNMENT_NOT_FOUND",
                "message": "Koppelings verzoek niet gevonden."
            }
        )
    
    # Check if already revoked
    if assignment.status == AssignmentStatus.REVOKED:
        return RejectLinkResponse(
            assignment_id=assignment.id,
            status="REVOKED",
            revoked_at=assignment.revoked_at or datetime.now(timezone.utc),
            message="Koppeling is al afgewezen.",
        )
    
    # Revoke the assignment
    assignment.status = AssignmentStatus.REVOKED
    assignment.revoked_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(assignment)
    
    return RejectLinkResponse(
        assignment_id=assignment.id,
        status="REVOKED",
        revoked_at=assignment.revoked_at,
        message="Koppeling succesvol afgewezen.",
    )


@router.get("/links/active", response_model=ZZPActiveLinksResponse)
async def list_active_links(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get list of active accountant links for this ZZP client.
    
    Returns all ACTIVE assignments where this user is the client.
    These are accountants who have been approved to access the client's data.
    """
    require_zzp(current_user)
    
    # Query for ACTIVE assignments where current_user is the client
    result = await db.execute(
        select(AccountantClientAssignment)
        .options(
            selectinload(AccountantClientAssignment.accountant),
            selectinload(AccountantClientAssignment.administration),
        )
        .where(AccountantClientAssignment.client_user_id == current_user.id)
        .where(AccountantClientAssignment.status == AssignmentStatus.ACTIVE)
        .order_by(AccountantClientAssignment.approved_at.desc())
    )
    assignments = result.scalars().all()
    
    active_links = []
    for assignment in assignments:
        active_links.append(
            ActiveAccountantLink(
                assignment_id=assignment.id,
                accountant_id=assignment.accountant_id,
                accountant_email=assignment.accountant.email if assignment.accountant else "",
                accountant_name=assignment.accountant.full_name if assignment.accountant else "Unknown",
                administration_id=assignment.administration_id,
                administration_name=assignment.administration.name if assignment.administration else "Unknown",
                approved_at=assignment.approved_at,
            )
        )
    
    return ZZPActiveLinksResponse(
        active_links=active_links,
        total_count=len(active_links),
    )


@router.post("/links/{assignment_id}/revoke", response_model=RejectLinkResponse)
async def revoke_link(
    assignment_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Revoke an active accountant link.
    
    This allows ZZP clients to remove an accountant's access to their data
    even after it was previously approved.
    """
    require_zzp(current_user)
    
    # Find the assignment
    result = await db.execute(
        select(AccountantClientAssignment)
        .where(AccountantClientAssignment.id == assignment_id)
        .where(AccountantClientAssignment.client_user_id == current_user.id)
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ASSIGNMENT_NOT_FOUND",
                "message": "Koppeling niet gevonden."
            }
        )
    
    # Check if already revoked
    if assignment.status == AssignmentStatus.REVOKED:
        return RejectLinkResponse(
            assignment_id=assignment.id,
            status="REVOKED",
            revoked_at=assignment.revoked_at or datetime.now(timezone.utc),
            message="Koppeling is al ingetrokken.",
        )
    
    # Check if pending (should use reject instead)
    if assignment.status == AssignmentStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ASSIGNMENT_PENDING",
                "message": "Gebruik 'afwijzen' voor verzoeken die nog niet zijn goedgekeurd."
            }
        )
    
    # Revoke the assignment
    assignment.status = AssignmentStatus.REVOKED
    assignment.revoked_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(assignment)
    
    return RejectLinkResponse(
        assignment_id=assignment.id,
        status="REVOKED",
        revoked_at=assignment.revoked_at,
        message="Koppeling succesvol ingetrokken.",
    )
