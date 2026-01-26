import os
import json
from pathlib import Path
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import aiofiles

from app.core.database import get_db
from app.core.config import settings
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.document import Document, DocumentStatus
from app.schemas.document import DocumentUploadResponse, DocumentResponse, DocumentDetailResponse
from app.api.v1.deps import CurrentUser

router = APIRouter()

ALLOWED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/pdf",
]


async def get_redis_client():
    """Get Redis client if Redis is enabled, otherwise return None."""
    if not settings.redis_enabled:
        yield None
        return
    
    import redis.asyncio as redis
    client = redis.from_url(settings.REDIS_URL)
    try:
        yield client
    finally:
        await client.close()


async def enqueue_document_job(redis_client, job_data: dict) -> bool:
    """Enqueue a document processing job to Redis. Returns True if successful."""
    if redis_client is None:
        print("Redis not configured - document processing job not queued")
        return False
    
    try:
        await redis_client.xadd(
            "document_processing_stream",
            job_data,
            maxlen=10000,  # Keep last 10000 messages
        )
        return True
    except Exception as e:
        # Log error but don't fail the upload
        print(f"Failed to enqueue job: {e}")
        return False


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: Annotated[UploadFile, File(...)],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis_client: Annotated[Optional[object], Depends(get_redis_client)],
    administration_id: Annotated[UUID | None, Form()] = None,
):
    """Upload a document and enqueue for processing"""
    # Validate file type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_MIME_TYPES)}"
        )
    
    # Read file content
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE // (1024*1024)}MB"
        )
    
    # Get or validate administration
    if administration_id:
        result = await db.execute(
            select(Administration)
            .options(selectinload(Administration.members))
            .where(Administration.id == administration_id)
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
    else:
        # Get first administration user is member of
        result = await db.execute(
            select(Administration)
            .join(AdministrationMember)
            .where(AdministrationMember.user_id == current_user.id)
            .where(Administration.is_active == True)
            .limit(1)
        )
        administration = result.scalar_one_or_none()
        if not administration:
            raise HTTPException(
                status_code=400,
                detail="No administration found. Please create one first."
            )
    
    # Determine file extension
    original_filename = file.filename or "document"
    ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else "bin"
    
    # Create document record
    document = Document(
        administration_id=administration.id,
        original_filename=original_filename,
        storage_path="",  # Will update after saving
        mime_type=file.content_type,
        file_size=len(content),
        status=DocumentStatus.UPLOADED,
    )
    db.add(document)
    await db.flush()
    
    # Create storage path
    storage_dir = Path(settings.UPLOAD_DIR) / str(administration.id) / str(document.id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_path = storage_dir / f"original.{ext}"
    
    # Save file
    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(content)
    
    # Update storage path
    document.storage_path = str(storage_path)
    await db.commit()
    await db.refresh(document)
    
    # Enqueue job to Redis Streams
    job_data = {
        "document_id": str(document.id),
        "administration_id": str(administration.id),
        "storage_path": str(storage_path),
        "mime_type": file.content_type,
        "original_filename": original_filename,
    }
    
    await enqueue_document_job(redis_client, job_data)
    
    return DocumentUploadResponse(
        message="Document uploaded successfully",
        document_id=document.id,
    )


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    administration_id: UUID = None,
    status: DocumentStatus = None,
):
    """List documents for user's administrations"""
    query = (
        select(Document)
        .join(Administration)
        .join(AdministrationMember)
        .options(selectinload(Document.transaction))
        .where(AdministrationMember.user_id == current_user.id)
    )
    
    if administration_id:
        query = query.where(Document.administration_id == administration_id)
    
    if status:
        query = query.where(Document.status == status)
    
    query = query.order_by(Document.created_at.desc())
    
    result = await db.execute(query)
    documents = result.scalars().all()
    
    # Build response with transaction_id
    response = []
    for doc in documents:
        doc_dict = {
            "id": doc.id,
            "administration_id": doc.administration_id,
            "original_filename": doc.original_filename,
            "mime_type": doc.mime_type,
            "file_size": doc.file_size,
            "status": doc.status,
            "error_message": doc.error_message,
            "created_at": doc.created_at,
            "updated_at": doc.updated_at,
            "transaction_id": doc.transaction.id if doc.transaction else None,
        }
        response.append(DocumentResponse(**doc_dict))
    
    return response


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get document details"""
    result = await db.execute(
        select(Document)
        .options(
            selectinload(Document.extracted_fields),
            selectinload(Document.administration).selectinload(Administration.members),
            selectinload(Document.transaction),
        )
        .where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check access
    member = next(
        (m for m in document.administration.members if m.user_id == current_user.id),
        None
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized to view this document")
    
    # Build extracted fields dict
    extracted = {}
    for field in document.extracted_fields:
        extracted[field.field_name] = {
            "value": field.field_value,
            "confidence": field.confidence,
            "raw": field.raw_json,
        }
    
    return DocumentDetailResponse(
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
        extracted_fields=extracted,
    )


@router.post("/{document_id}/reprocess", response_model=DocumentResponse)
async def reprocess_document(
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis_client: Annotated[Optional[object], Depends(get_redis_client)],
):
    """Reprocess a failed document - reset status and re-enqueue for processing"""
    result = await db.execute(
        select(Document)
        .options(
            selectinload(Document.administration).selectinload(Administration.members),
            selectinload(Document.transaction),
        )
        .where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check access
    member = next(
        (m for m in document.administration.members if m.user_id == current_user.id),
        None
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized to reprocess this document")
    
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
    
    await enqueue_document_job(redis_client, job_data)
    
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
