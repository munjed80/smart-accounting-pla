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
from app.schemas.document import DocumentResponse
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


@router.post("/{admin_id}/documents/{doc_id}/reprocess")
async def reprocess_document_in_admin(
    admin_id: UUID,
    doc_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Reprocess a failed document within a specific administration
    
    This endpoint verifies that the document belongs to the specified administration
    before delegating to the main reprocess logic.
    """
    import redis.asyncio as redis_async
    from app.core.config import settings
    from app.models.document import Document, DocumentStatus
    from app.schemas.document import DocumentResponse
    
    # Verify administration exists and user has access
    result = await db.execute(
        select(Administration)
        .options(selectinload(Administration.members))
        .where(Administration.id == admin_id)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Administration not found")
    
    # Check membership
    member = next(
        (m for m in administration.members if m.user_id == current_user.id),
        None
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this administration")
    
    # Get document
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.transaction))
        .where(Document.id == doc_id)
    )
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Verify document belongs to this administration
    if document.administration_id != admin_id:
        raise HTTPException(status_code=400, detail="Document does not belong to this administration")
    
    # Only allow reprocessing of FAILED documents
    if document.status != DocumentStatus.FAILED:
        raise HTTPException(
            status_code=400,
            detail=f"Can only reprocess documents with FAILED status. Current status: {document.status.value}"
        )
    
    # Reset status and clear error
    document.status = DocumentStatus.UPLOADED
    document.error_message = None
    
    await db.commit()
    await db.refresh(document)
    
    # Enqueue job to Redis Streams
    job_data = {
        "document_id": str(document.id),
        "administration_id": str(document.administration_id),
        "storage_path": document.storage_path,
        "mime_type": document.mime_type,
        "original_filename": document.original_filename,
    }
    
    try:
        redis_client = redis_async.from_url(settings.REDIS_URL)
        await redis_client.xadd(
            "document_processing_stream",
            job_data,
            maxlen=10000,
        )
        await redis_client.close()
    except Exception as e:
        # Log error but don't fail - document status is already reset
        print(f"Failed to enqueue job: {e}")
    
    return DocumentResponse(
        id=document.id,
        administration_id=document.administration_id,
        original_filename=document.original_filename,
        mime_type=document.mime_type,
        file_size=document.file_size,
        status=document.status,
        error_message=document.error_message,
        created_at=document.created_at,
        updated_at=document.updated_at,
        transaction_id=document.transaction.id if document.transaction else None,
    )
