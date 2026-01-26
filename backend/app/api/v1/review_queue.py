"""
Document Review Queue API Endpoints

Provides endpoints for accountants to review and process documents:
- GET /clients/{client_id}/documents?status=NEEDS_REVIEW
- GET /clients/{client_id}/documents/{doc_id}
- POST /clients/{client_id}/documents/{doc_id}/post
- POST /clients/{client_id}/documents/{doc_id}/reject
- POST /clients/{client_id}/documents/{doc_id}/reprocess
- GET /clients/{client_id}/periods/{period_id}/closing-checklist
"""
from datetime import datetime, timezone
from typing import Annotated, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.document import Document, DocumentStatus, DocumentSuggestedAction
from app.models.subledger import Party
from app.models.ledger import AccountingPeriod
from app.schemas.document import (
    DocumentReviewResponse,
    DocumentReviewListResponse,
    DocumentSuggestedActionResponse,
    DocumentPostRequest,
    DocumentPostResponse,
    DocumentRejectRequest,
    DocumentRejectResponse,
    DocumentReprocessResponse,
    ClosingChecklistResponse,
    ClosingChecklistItem,
)
from app.services.documents import DocumentMatchingService, DocumentPostingService, ClosingChecklistService
from app.api.v1.deps import CurrentUser

router = APIRouter()


async def verify_accountant_access(
    client_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession,
) -> Administration:
    """Verify user has accountant access to the client."""
    if current_user.role not in ["accountant", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available for accountants"
        )
    
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(Administration.id == client_id)
        .where(AdministrationMember.user_id == current_user.id)
        .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Client not found or access denied")
    
    return administration


@router.get("/clients/{client_id}/documents", response_model=DocumentReviewListResponse)
async def list_client_documents(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[DocumentStatus] = Query(None, description="Filter by status"),
):
    """
    List documents for a client, optionally filtered by status.
    
    Common use: GET /clients/{id}/documents?status=NEEDS_REVIEW
    """
    administration = await verify_accountant_access(client_id, current_user, db)
    
    # Build query
    query = (
        select(Document)
        .where(Document.administration_id == client_id)
        .options(
            selectinload(Document.suggested_actions),
            selectinload(Document.matched_party),
            selectinload(Document.extracted_fields),
        )
    )
    
    if status:
        query = query.where(Document.status == status)
    
    query = query.order_by(Document.created_at.desc())
    
    result = await db.execute(query)
    documents = result.scalars().all()
    
    # Build response
    doc_responses = []
    for doc in documents:
        suggested_actions = [
            DocumentSuggestedActionResponse(
                id=action.id,
                action_type=action.action_type,
                title=action.title,
                explanation=action.explanation,
                confidence_score=action.confidence_score,
                parameters=action.parameters,
                priority=action.priority,
                created_at=action.created_at,
            )
            for action in (doc.suggested_actions or [])
        ]
        
        # Build extracted fields dict
        extracted = {}
        for field in (doc.extracted_fields or []):
            extracted[field.field_name] = {
                "value": field.field_value,
                "confidence": field.confidence,
            }
        
        doc_responses.append(DocumentReviewResponse(
            id=doc.id,
            administration_id=doc.administration_id,
            original_filename=doc.original_filename,
            mime_type=doc.mime_type,
            file_size=doc.file_size,
            status=doc.status,
            error_message=doc.error_message,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            supplier_name=doc.supplier_name,
            invoice_number=doc.invoice_number,
            invoice_date=doc.invoice_date,
            due_date=doc.due_date,
            total_amount=doc.total_amount,
            vat_amount=doc.vat_amount,
            net_amount=doc.net_amount,
            currency=doc.currency,
            extraction_confidence=doc.extraction_confidence,
            matched_party_id=doc.matched_party_id,
            matched_party_name=doc.matched_party.name if doc.matched_party else None,
            matched_open_item_id=doc.matched_open_item_id,
            match_confidence=doc.match_confidence,
            is_duplicate=doc.is_duplicate or False,
            duplicate_of_id=doc.duplicate_of_id,
            suggested_actions=suggested_actions,
            extracted_fields=extracted,
        ))
    
    return DocumentReviewListResponse(
        client_id=client_id,
        client_name=administration.name,
        total_documents=len(doc_responses),
        documents=doc_responses,
    )


@router.get("/clients/{client_id}/documents/{document_id}", response_model=DocumentReviewResponse)
async def get_document_detail(
    client_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get detailed information about a specific document."""
    administration = await verify_accountant_access(client_id, current_user, db)
    
    result = await db.execute(
        select(Document)
        .where(Document.id == document_id)
        .where(Document.administration_id == client_id)
        .options(
            selectinload(Document.suggested_actions),
            selectinload(Document.matched_party),
            selectinload(Document.extracted_fields),
        )
    )
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    suggested_actions = [
        DocumentSuggestedActionResponse(
            id=action.id,
            action_type=action.action_type,
            title=action.title,
            explanation=action.explanation,
            confidence_score=action.confidence_score,
            parameters=action.parameters,
            priority=action.priority,
            created_at=action.created_at,
        )
        for action in (doc.suggested_actions or [])
    ]
    
    # Build extracted fields dict
    extracted = {}
    for field in (doc.extracted_fields or []):
        extracted[field.field_name] = {
            "value": field.field_value,
            "confidence": field.confidence,
        }
    
    return DocumentReviewResponse(
        id=doc.id,
        administration_id=doc.administration_id,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        file_size=doc.file_size,
        status=doc.status,
        error_message=doc.error_message,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        supplier_name=doc.supplier_name,
        invoice_number=doc.invoice_number,
        invoice_date=doc.invoice_date,
        due_date=doc.due_date,
        total_amount=doc.total_amount,
        vat_amount=doc.vat_amount,
        net_amount=doc.net_amount,
        currency=doc.currency,
        extraction_confidence=doc.extraction_confidence,
        matched_party_id=doc.matched_party_id,
        matched_party_name=doc.matched_party.name if doc.matched_party else None,
        matched_open_item_id=doc.matched_open_item_id,
        match_confidence=doc.match_confidence,
        is_duplicate=doc.is_duplicate or False,
        duplicate_of_id=doc.duplicate_of_id,
        suggested_actions=suggested_actions,
        extracted_fields=extracted,
    )


@router.post("/clients/{client_id}/documents/{document_id}/post", response_model=DocumentPostResponse)
async def post_document(
    client_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    post_request: DocumentPostRequest = DocumentPostRequest(),
):
    """
    Post a document to the journal.
    
    Creates a journal entry from the document with proper VAT handling.
    This is idempotent - if already posted, returns the existing entry.
    """
    administration = await verify_accountant_access(client_id, current_user, db)
    
    # Get client IP for audit
    client_ip = request.client.host if request.client else None
    
    try:
        posting_service = DocumentPostingService(db, client_id)
        journal_entry = await posting_service.post_document(
            document_id=document_id,
            user_id=current_user.id,
            description=post_request.description,
            entry_date=post_request.entry_date,
            account_id=post_request.account_id,
            vat_code_id=post_request.vat_code_id,
            allocate_to_open_item_id=post_request.allocate_to_open_item_id,
            notes=post_request.notes,
            ip_address=client_ip,
        )
        
        await db.commit()
        
        return DocumentPostResponse(
            document_id=document_id,
            status=DocumentStatus.POSTED,
            journal_entry_id=journal_entry.id,
            message="Document successfully posted to journal",
            posted_at=journal_entry.posted_at or datetime.now(timezone.utc),
            posted_by_name=current_user.full_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/clients/{client_id}/documents/{document_id}/reject", response_model=DocumentRejectResponse)
async def reject_document(
    client_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    reject_request: DocumentRejectRequest,
):
    """
    Reject a document.
    
    The document will be marked as rejected with the provided reason.
    """
    administration = await verify_accountant_access(client_id, current_user, db)
    
    # Get client IP for audit
    client_ip = request.client.host if request.client else None
    
    try:
        posting_service = DocumentPostingService(db, client_id)
        document = await posting_service.reject_document(
            document_id=document_id,
            user_id=current_user.id,
            reason=reject_request.reason,
            notes=reject_request.notes,
            ip_address=client_ip,
        )
        
        await db.commit()
        
        return DocumentRejectResponse(
            document_id=document_id,
            status=DocumentStatus.REJECTED,
            rejection_reason=reject_request.reason,
            rejected_at=document.rejected_at or datetime.now(timezone.utc),
            rejected_by_name=current_user.full_name,
            message="Document rejected",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/clients/{client_id}/documents/{document_id}/reprocess", response_model=DocumentReprocessResponse)
async def reprocess_document(
    client_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    """
    Reprocess a document.
    
    Resets the document for re-extraction. This is idempotent.
    """
    administration = await verify_accountant_access(client_id, current_user, db)
    
    # Get client IP for audit
    client_ip = request.client.host if request.client else None
    
    try:
        posting_service = DocumentPostingService(db, client_id)
        document = await posting_service.reprocess_document(
            document_id=document_id,
            user_id=current_user.id,
            ip_address=client_ip,
        )
        
        await db.commit()
        
        return DocumentReprocessResponse(
            document_id=document_id,
            status=document.status,
            process_count=document.process_count,
            message=f"Document queued for reprocessing (attempt #{document.process_count + 1})",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/clients/{client_id}/documents/{document_id}/match")
async def run_document_matching(
    client_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Run matching logic on a document.
    
    This is typically called after extraction to find duplicates,
    match to parties, and generate suggestions.
    """
    administration = await verify_accountant_access(client_id, current_user, db)
    
    try:
        matching_service = DocumentMatchingService(db, client_id)
        document = await matching_service.run_matching(document_id)
        
        await db.commit()
        
        return {
            "document_id": document_id,
            "status": document.status.value,
            "is_duplicate": document.is_duplicate,
            "match_confidence": str(document.match_confidence) if document.match_confidence else None,
            "matched_party_id": str(document.matched_party_id) if document.matched_party_id else None,
            "matched_open_item_id": str(document.matched_open_item_id) if document.matched_open_item_id else None,
            "message": "Matching completed successfully",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/clients/{client_id}/periods/{period_id}/closing-checklist", response_model=ClosingChecklistResponse)
async def get_closing_checklist(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get the closing checklist for a period.
    
    Returns a checklist showing readiness to finalize the period.
    """
    administration = await verify_accountant_access(client_id, current_user, db)
    
    try:
        checklist_service = ClosingChecklistService(db, client_id)
        checklist = await checklist_service.get_checklist(
            period_id=period_id,
            administration_name=administration.name,
        )
        
        # Convert to response model
        items = [
            ClosingChecklistItem(
                name=item.name,
                description=item.description,
                status=item.status,
                details=item.details,
                value=item.value,
                required=item.required,
            )
            for item in checklist.items
        ]
        
        return ClosingChecklistResponse(
            client_id=checklist.client_id,
            client_name=checklist.client_name,
            period_id=checklist.period_id,
            period_name=checklist.period_name,
            period_status=checklist.period_status,
            can_finalize=checklist.can_finalize,
            blocking_items=checklist.blocking_items,
            warning_items=checklist.warning_items,
            items=items,
            documents_posted_percent=checklist.documents_posted_percent,
            documents_pending_review=checklist.documents_pending_review,
            red_issues_count=checklist.red_issues_count,
            yellow_issues_count=checklist.yellow_issues_count,
            unacknowledged_yellow_count=checklist.unacknowledged_yellow_count,
            vat_report_ready=checklist.vat_report_ready,
            ar_reconciled=checklist.ar_reconciled,
            ap_reconciled=checklist.ap_reconciled,
            assets_consistent=checklist.assets_consistent,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
