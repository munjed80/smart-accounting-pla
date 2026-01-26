from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field

from app.models.document import DocumentStatus, DocumentSuggestedActionType


class DocumentUploadResponse(BaseModel):
    message: str
    document_id: UUID


class DocumentResponse(BaseModel):
    id: UUID
    administration_id: UUID
    original_filename: str
    mime_type: str
    file_size: int
    status: DocumentStatus
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    transaction_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class DocumentDetailResponse(DocumentResponse):
    extracted_fields: Dict[str, Any] = {}


# === NEW: Document intake pipeline schemas ===

class DocumentSuggestedActionResponse(BaseModel):
    """Response model for suggested actions on a document."""
    id: UUID
    action_type: DocumentSuggestedActionType
    title: str
    explanation: str
    confidence_score: Decimal
    parameters: Optional[Dict[str, Any]] = None
    priority: int
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentReviewResponse(BaseModel):
    """Extended document response for review queue."""
    id: UUID
    administration_id: UUID
    original_filename: str
    mime_type: str
    file_size: int
    status: DocumentStatus
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    # Extracted metadata
    supplier_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    total_amount: Optional[Decimal] = None
    vat_amount: Optional[Decimal] = None
    net_amount: Optional[Decimal] = None
    currency: Optional[str] = None
    extraction_confidence: Optional[Decimal] = None
    
    # Matching results
    matched_party_id: Optional[UUID] = None
    matched_party_name: Optional[str] = None
    matched_open_item_id: Optional[UUID] = None
    match_confidence: Optional[Decimal] = None
    is_duplicate: bool = False
    duplicate_of_id: Optional[UUID] = None
    
    # Suggested actions
    suggested_actions: List[DocumentSuggestedActionResponse] = []
    
    # Extracted fields (legacy)
    extracted_fields: Dict[str, Any] = {}

    class Config:
        from_attributes = True


class DocumentReviewListResponse(BaseModel):
    """Response for listing documents in review queue."""
    client_id: UUID
    client_name: str
    total_documents: int
    documents: List[DocumentReviewResponse]


class DocumentPostRequest(BaseModel):
    """Request to post a document to the journal."""
    description: Optional[str] = None
    entry_date: Optional[datetime] = None
    account_id: Optional[UUID] = Field(None, description="Override expense/revenue account")
    vat_code_id: Optional[UUID] = Field(None, description="Override VAT code")
    allocate_to_open_item_id: Optional[UUID] = Field(None, description="Allocate to specific open item")
    notes: Optional[str] = None


class DocumentPostResponse(BaseModel):
    """Response after posting a document."""
    document_id: UUID
    status: DocumentStatus
    journal_entry_id: UUID
    message: str
    posted_at: datetime
    posted_by_name: Optional[str] = None


class DocumentRejectRequest(BaseModel):
    """Request to reject a document."""
    reason: str = Field(..., min_length=1, description="Reason for rejection")
    notes: Optional[str] = None


class DocumentRejectResponse(BaseModel):
    """Response after rejecting a document."""
    document_id: UUID
    status: DocumentStatus
    rejection_reason: str
    rejected_at: datetime
    rejected_by_name: Optional[str] = None
    message: str


class DocumentReprocessResponse(BaseModel):
    """Response after reprocessing a document."""
    document_id: UUID
    status: DocumentStatus
    process_count: int
    message: str


# === Closing Checklist Schemas ===

class ClosingChecklistItem(BaseModel):
    """Individual item in the closing checklist."""
    name: str
    description: str
    status: str = Field(..., description="PASSED, FAILED, WARNING, PENDING")
    details: Optional[str] = None
    value: Optional[str] = None
    required: bool = True


class ClosingChecklistResponse(BaseModel):
    """Response for period closing checklist."""
    client_id: UUID
    client_name: str
    period_id: UUID
    period_name: str
    period_status: str
    
    # Overall readiness
    can_finalize: bool
    blocking_items: int
    warning_items: int
    
    # Checklist items
    items: List[ClosingChecklistItem]
    
    # Summary metrics
    documents_posted_percent: Decimal
    documents_pending_review: int
    red_issues_count: int
    yellow_issues_count: int
    unacknowledged_yellow_count: int
    vat_report_ready: bool
    ar_reconciled: bool
    ap_reconciled: bool
    assets_consistent: bool
