import logging
import uuid as uuid_mod
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.accounting import ChartOfAccount
from app.models.document import Document, DocumentStatus
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

logger = logging.getLogger(__name__)

# Dutch minimal chart of accounts template (mirrors seed.py)
CHART_OF_ACCOUNTS_TEMPLATE = [
    {"code": "0100", "name": "Gebouwen", "type": "ASSET"},
    {"code": "0200", "name": "Machines & Inventaris", "type": "ASSET"},
    {"code": "0300", "name": "Transportmiddelen", "type": "ASSET"},
    {"code": "1000", "name": "Kas", "type": "ASSET"},
    {"code": "1100", "name": "Bank", "type": "ASSET"},
    {"code": "1200", "name": "Spaarrekening", "type": "ASSET"},
    {"code": "1300", "name": "Debiteuren", "type": "ASSET"},
    {"code": "1400", "name": "Voorraad", "type": "ASSET"},
    {"code": "1500", "name": "Vooruitontvangen", "type": "LIABILITY"},
    {"code": "1600", "name": "Crediteuren", "type": "LIABILITY"},
    {"code": "1700", "name": "Te betalen BTW", "type": "LIABILITY"},
    {"code": "1800", "name": "Te vorderen BTW", "type": "LIABILITY"},
    {"code": "1900", "name": "Leningen", "type": "LIABILITY"},
    {"code": "2000", "name": "Kapitaal", "type": "EQUITY"},
    {"code": "2100", "name": "Privé stortingen", "type": "EQUITY"},
    {"code": "2200", "name": "Privé opnamen", "type": "EQUITY"},
    {"code": "2900", "name": "Resultaat lopend jaar", "type": "EQUITY"},
    {"code": "8000", "name": "Omzet verkopen", "type": "REVENUE"},
    {"code": "8100", "name": "Omzet diensten", "type": "REVENUE"},
    {"code": "8200", "name": "Overige opbrengsten", "type": "REVENUE"},
    {"code": "4000", "name": "Autokosten & Brandstof", "type": "EXPENSE"},
    {"code": "4050", "name": "Reiskosten Openbaar Vervoer", "type": "EXPENSE"},
    {"code": "4100", "name": "Huisvestingskosten", "type": "EXPENSE"},
    {"code": "4200", "name": "Verkoopkosten", "type": "EXPENSE"},
    {"code": "4300", "name": "Kantoorkosten & Apparatuur", "type": "EXPENSE"},
    {"code": "4310", "name": "Software & Licenties", "type": "EXPENSE"},
    {"code": "4400", "name": "Promotiekosten", "type": "EXPENSE"},
    {"code": "4500", "name": "Algemene kosten", "type": "EXPENSE"},
    {"code": "4550", "name": "Telefoon & Internet", "type": "EXPENSE"},
    {"code": "4600", "name": "Bankkosten", "type": "EXPENSE"},
    {"code": "4700", "name": "Verzekeringen", "type": "EXPENSE"},
    {"code": "4800", "name": "Administratiekosten", "type": "EXPENSE"},
    {"code": "4900", "name": "Afschrijvingen", "type": "EXPENSE"},
    {"code": "7000", "name": "Inkoopkosten", "type": "EXPENSE"},
    {"code": "9999", "name": "Te rubriceren", "type": "EXPENSE"},
]

router = APIRouter()


async def enqueue_document_job_to_redis(job_data: dict) -> bool:
    """Enqueue a document processing job to Redis. Returns True if successful."""
    if not settings.redis_enabled:
        print("Redis not configured - document processing job not queued")
        return False
    
    try:
        import redis.asyncio as redis_async
        redis_client = redis_async.from_url(settings.REDIS_URL)
        await redis_client.xadd(
            "document_processing_stream",
            job_data,
            maxlen=10000,
        )
        await redis_client.close()
        return True
    except Exception as e:
        print(f"Failed to enqueue job: {e}")
        return False


@router.post("", response_model=AdministrationResponse)
async def create_administration(
    admin_in: AdministrationCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new administration and add current user as OWNER.
    
    Also seeds the default Dutch chart of accounts for the new administration.
    """
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

    # Seed default chart of accounts for this administration
    for acc in CHART_OF_ACCOUNTS_TEMPLATE:
        account = ChartOfAccount(
            id=uuid_mod.uuid4(),
            administration_id=administration.id,
            account_code=acc["code"],
            account_name=acc["name"],
            account_type=acc["type"],
            is_active=True,
        )
        db.add(account)
    logger.info(
        "Seeded %d chart of accounts for administration %s",
        len(CHART_OF_ACCOUNTS_TEMPLATE),
        administration.id,
    )
    
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
    
    await enqueue_document_job_to_redis(job_data)
    
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
