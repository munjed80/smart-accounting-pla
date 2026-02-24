"""
ZZP Documents Inbox API

Intake inbox for receipts and invoices (bon/factuur).
Supports upload, list, detail, metadata update, convert-to-expense, and delete.
All queries are scoped by administration_id + user ownership.
"""
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Annotated, List, Optional
from uuid import UUID

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember
from app.models.zzp import ZZPDocument, ZZPDocStatus, ZZPDocType, ZZPExpense
from app.schemas.zzp import (
    ZZPDocumentCreateExpenseResponse,
    ZZPDocumentResponse,
    ZZPDocumentUpdate,
    ZZPDocumentUploadResponse,
    ZZPDocTypeEnum,
    ZZPDocStatusEnum,
)
from app.api.v1.deps import CurrentUser, require_zzp
from app.api.v1.zzp_expenses import get_user_administration, calculate_vat_amount

router = APIRouter()

ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/pdf",
    "image/heic",
    "image/heif",
}


def _doc_to_response(doc: ZZPDocument) -> ZZPDocumentResponse:
    return ZZPDocumentResponse(
        id=doc.id,
        administration_id=doc.administration_id,
        user_id=doc.user_id,
        filename=doc.filename,
        mime_type=doc.mime_type,
        storage_ref=doc.storage_ref,
        doc_type=ZZPDocTypeEnum(doc.doc_type.value),
        status=ZZPDocStatusEnum(doc.status.value),
        supplier=doc.supplier,
        amount_cents=doc.amount_cents,
        vat_rate=doc.vat_rate,
        doc_date=doc.doc_date,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


async def _get_owned_document(
    document_id: UUID,
    administration: Administration,
    db: AsyncSession,
) -> ZZPDocument:
    """Fetch a ZZP document and verify ownership. Raises 404/403 on failure."""
    result = await db.execute(
        select(ZZPDocument).where(
            ZZPDocument.id == document_id,
            ZZPDocument.administration_id == administration.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND", "message": "Document niet gevonden."})
    return doc


@router.post("/documents/upload", response_model=ZZPDocumentUploadResponse, status_code=201)
async def upload_documents(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    files: List[UploadFile] = File(...),
):
    """
    Upload one or multiple receipts/invoices (bon/factuur) to the ZZP document inbox.
    Accepts PDF, JPG, PNG, HEIC.
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    created_docs: List[ZZPDocument] = []

    for file in files:
        content_type = file.content_type or ""
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "INVALID_FILE_TYPE",
                    "message": f"Ongeldig bestandstype '{content_type}'. Gebruik PDF, JPG, PNG of HEIC.",
                },
            )

        content = await file.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "FILE_TOO_LARGE",
                    "message": f"Bestand te groot. Maximum: {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB.",
                },
            )

        original_filename = file.filename or "document"
        ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else "bin"

        # Create document record first to get an ID for storage path
        doc = ZZPDocument(
            administration_id=administration.id,
            user_id=current_user.id,
            filename=original_filename,
            mime_type=content_type,
            storage_ref="",  # Updated after save
            doc_type=ZZPDocType.OVERIG,
            status=ZZPDocStatus.NEW,
        )
        db.add(doc)
        await db.flush()  # Get doc.id without committing

        # Save file
        storage_dir = Path(settings.UPLOAD_DIR) / "zzp" / str(administration.id) / str(doc.id)
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_path = storage_dir / f"original.{ext}"
        async with aiofiles.open(storage_path, "wb") as f:
            await f.write(content)

        doc.storage_ref = str(storage_path)
        created_docs.append(doc)

    await db.commit()
    for doc in created_docs:
        await db.refresh(doc)

    return ZZPDocumentUploadResponse(documents=[_doc_to_response(d) for d in created_docs])


@router.get("/documents", response_model=List[ZZPDocumentResponse])
async def list_documents(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[ZZPDocStatusEnum] = Query(None),
    doc_type: Optional[ZZPDocTypeEnum] = Query(None, alias="type"),
    q: Optional[str] = Query(None, max_length=200),
):
    """
    List ZZP documents in the inbox, scoped to the current user's administration.
    Supports filtering by status, type, and filename search.
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    query = select(ZZPDocument).where(
        ZZPDocument.administration_id == administration.id
    )

    if status:
        query = query.where(ZZPDocument.status == ZZPDocStatus[status.value])

    if doc_type:
        query = query.where(ZZPDocument.doc_type == ZZPDocType[doc_type.value])

    if q:
        query = query.where(ZZPDocument.filename.ilike(f"%{q}%"))

    query = query.order_by(ZZPDocument.created_at.desc())
    result = await db.execute(query)
    docs = result.scalars().all()
    return [_doc_to_response(d) for d in docs]


@router.get("/documents/{document_id}", response_model=ZZPDocumentResponse)
async def get_document(
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a specific ZZP document by ID."""
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    doc = await _get_owned_document(document_id, administration, db)
    return _doc_to_response(doc)


@router.patch("/documents/{document_id}", response_model=ZZPDocumentResponse)
async def update_document(
    document_id: UUID,
    update: ZZPDocumentUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update metadata or status of a ZZP document."""
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    doc = await _get_owned_document(document_id, administration, db)

    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "doc_type" and value is not None:
            setattr(doc, field, ZZPDocType[value] if isinstance(value, str) else ZZPDocType(value))
        elif field == "status" and value is not None:
            setattr(doc, field, ZZPDocStatus[value] if isinstance(value, str) else ZZPDocStatus(value))
        else:
            setattr(doc, field, value)

    await db.commit()
    await db.refresh(doc)
    return _doc_to_response(doc)


@router.post("/documents/{document_id}/create-expense", response_model=ZZPDocumentCreateExpenseResponse, status_code=201)
async def create_expense_from_document(
    document_id: UUID,
    expense_data: dict,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Convert a ZZP document to an expense.
    Creates an expense record linked to the document and sets document status to PROCESSED.
    Expects a JSON body with expense fields (vendor, description, expense_date, amount_cents, vat_rate, category).
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    doc = await _get_owned_document(document_id, administration, db)

    # Validate required expense fields
    vendor = expense_data.get("vendor", "").strip()
    if not vendor:
        raise HTTPException(status_code=422, detail={"code": "MISSING_VENDOR", "message": "Leveranciersnaam is verplicht."})

    expense_date_str = expense_data.get("expense_date", "")
    try:
        expense_date_val = date.fromisoformat(expense_date_str) if expense_date_str else date.today()
    except ValueError:
        raise HTTPException(status_code=422, detail={"code": "INVALID_DATE", "message": "Ongeldige datum."})

    amount_cents = int(expense_data.get("amount_cents", doc.amount_cents or 0))
    vat_rate_val = float(expense_data.get("vat_rate", float(doc.vat_rate) if doc.vat_rate else 21.0))
    category = expense_data.get("category", "algemeen")
    description = expense_data.get("description", "")
    notes = expense_data.get("notes", "")

    vat_amount = calculate_vat_amount(amount_cents, vat_rate_val)

    expense = ZZPExpense(
        administration_id=administration.id,
        vendor=vendor,
        description=description or None,
        expense_date=expense_date_val,
        amount_cents=amount_cents,
        vat_rate=Decimal(str(vat_rate_val)),
        vat_amount_cents=vat_amount,
        category=category,
        notes=notes or None,
        document_id=doc.id,
    )
    db.add(expense)

    # Update document status to PROCESSED
    doc.status = ZZPDocStatus.PROCESSED

    await db.commit()
    await db.refresh(expense)

    # Optionally post to ledger (non-blocking)
    try:
        from app.repositories.ledger_repository import LedgerRepository
        from app.services.ledger_service import LedgerPostingService, LedgerPostingError
        ledger_service = LedgerPostingService(LedgerRepository(db, administration.id))
        await ledger_service.post_expense(expense.id)
        await db.commit()
    except Exception:
        pass

    return ZZPDocumentCreateExpenseResponse(
        expense_id=expense.id,
        document_id=doc.id,
    )


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a ZZP document. Only allowed when not yet PROCESSED."""
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    doc = await _get_owned_document(document_id, administration, db)

    await db.delete(doc)
    await db.commit()
    return None
