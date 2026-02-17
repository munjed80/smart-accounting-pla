"""
VAT/BTW Report Schemas

Pydantic schemas for Dutch VAT return (BTW Aangifte) API.
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


class VatCategory(str, Enum):
    """VAT category classification."""
    SALES = "SALES"
    PURCHASES = "PURCHASES"
    REVERSE_CHARGE = "REVERSE_CHARGE"
    INTRA_EU = "INTRA_EU"
    EXEMPT = "EXEMPT"
    ZERO_RATE = "ZERO_RATE"


class VatBoxResponse(BaseModel):
    """Response for a single VAT return box."""
    box_code: str
    box_name: str
    turnover_amount: Decimal
    vat_amount: Decimal
    transaction_count: int


class VatCodeSummaryResponse(BaseModel):
    """Summary for a single VAT code."""
    vat_code_id: UUID
    vat_code: str
    vat_code_name: str
    vat_rate: Decimal
    category: str
    base_amount: Decimal
    vat_amount: Decimal
    transaction_count: int


class VatAnomalyResponse(BaseModel):
    """VAT anomaly/issue response."""
    id: str
    code: str
    severity: str  # RED or YELLOW
    title: str
    description: str
    journal_entry_id: Optional[UUID] = None
    journal_line_id: Optional[UUID] = None
    document_id: Optional[UUID] = None
    suggested_fix: Optional[str] = None
    amount_discrepancy: Optional[Decimal] = None


class ICPEntryResponse(BaseModel):
    """ICP (Intra-Community) supplies entry."""
    customer_vat_number: str
    country_code: str
    customer_name: Optional[str] = None
    customer_id: Optional[UUID] = None
    taxable_base: Decimal
    transaction_count: int


class BTWAangifteResponse(BaseModel):
    """
    Complete Dutch VAT return (BTW Aangifte) response.
    
    Contains all data needed for Dutch tax authority filing.
    """
    period_id: UUID
    period_name: str
    start_date: date
    end_date: date
    generated_at: datetime
    
    # VAT boxes
    boxes: Dict[str, VatBoxResponse]
    
    # Summaries by VAT code
    vat_code_summaries: List[VatCodeSummaryResponse]
    
    # Totals
    total_turnover: Decimal
    total_vat_payable: Decimal
    total_vat_receivable: Decimal
    net_vat: Decimal
    
    # Validation status
    anomalies: List[VatAnomalyResponse]
    has_red_anomalies: bool
    has_yellow_anomalies: bool
    
    # ICP data
    icp_entries: List[ICPEntryResponse]
    total_icp_supplies: Decimal

    class Config:
        from_attributes = True


class ICPReportResponse(BaseModel):
    """ICP (Intra-Community) supplies report response."""
    period_id: UUID
    period_name: str
    start_date: date
    end_date: date
    entries: List[ICPEntryResponse]
    total_supplies: Decimal
    total_customers: int

    class Config:
        from_attributes = True


class VatValidationResponse(BaseModel):
    """Response from VAT validation endpoint."""
    period_id: UUID
    period_name: str
    anomalies: List[VatAnomalyResponse]
    total_anomalies: int
    red_count: int
    yellow_count: int
    is_valid: bool
    message: str

    class Config:
        from_attributes = True


class VatCodeResponse(BaseModel):
    """Response for a VAT code."""
    id: UUID
    code: str
    name: str
    description: Optional[str] = None
    rate: Decimal
    category: VatCategory
    box_mapping: Optional[Dict[str, str]] = None
    eu_only: bool
    requires_vat_number: bool
    is_reverse_charge: bool
    is_icp: bool
    is_active: bool

    class Config:
        from_attributes = True


class VatCodesListResponse(BaseModel):
    """Response for list of VAT codes."""
    vat_codes: List[VatCodeResponse]
    total_count: int


class SubmissionPackageRequest(BaseModel):
    """Request for generating submission package."""
    period_id: UUID


# VAT Box Lineage / Drilldown Schemas

class VatBoxTotalResponse(BaseModel):
    """Response for a single VAT box total."""
    box_code: str
    box_name: str
    net_amount: Decimal
    vat_amount: Decimal
    line_count: int

    class Config:
        from_attributes = True


class VatBoxTotalsResponse(BaseModel):
    """Response for all VAT box totals in a period."""
    period_id: UUID
    period_name: str
    boxes: List[VatBoxTotalResponse]
    generated_at: datetime

    class Config:
        from_attributes = True


class VatBoxLineResponse(BaseModel):
    """Response for a single VAT box lineage line."""
    id: UUID
    vat_box_code: str
    net_amount: Decimal
    vat_amount: Decimal
    source_type: str
    source_id: UUID
    document_id: Optional[UUID] = None
    journal_entry_id: UUID
    journal_line_id: UUID
    vat_code_id: Optional[UUID] = None
    transaction_date: date
    reference: Optional[str] = None
    description: Optional[str] = None
    party_id: Optional[UUID] = None
    party_name: Optional[str] = None
    party_vat_number: Optional[str] = None
    created_at: datetime
    mapping_reason: Optional[str] = None

    class Config:
        from_attributes = True


class VatBoxLinesResponse(BaseModel):
    """Response for VAT box drilldown lines."""
    period_id: UUID
    period_name: str
    box_code: str
    box_name: str
    lines: List[VatBoxLineResponse]
    total_count: int
    page: int
    page_size: int

    class Config:
        from_attributes = True


# VAT Submission Tracking Schemas

class VatSubmissionStatus(str, Enum):
    """VAT submission status."""
    DRAFT = "DRAFT"
    QUEUED = "QUEUED"
    SUBMITTED = "SUBMITTED"
    RECEIVED = "RECEIVED"
    ACCEPTED = "ACCEPTED"
    CONFIRMED = "CONFIRMED"  # Backward compatibility (alias for ACCEPTED)
    REJECTED = "REJECTED"
    FAILED = "FAILED"


class VatSubmissionMethod(str, Enum):
    """VAT submission method."""
    PACKAGE = "PACKAGE"  # Manual package download
    DIGIPOORT = "DIGIPOORT"  # Automated via Digipoort (future)


class VatSubmissionType(str, Enum):
    """VAT submission type."""
    BTW = "BTW"  # BTW/VAT return
    ICP = "ICP"  # Intra-Community supplies


class VatSubmissionResponse(BaseModel):
    """Response for a VAT submission."""
    id: UUID
    administration_id: UUID
    period_id: UUID
    submission_type: str
    created_at: datetime
    created_by: UUID
    method: str
    status: str
    reference_text: Optional[str] = None
    attachment_url: Optional[str] = None
    payload_hash: Optional[str] = None
    digipoort_message_id: Optional[str] = None
    correlation_id: Optional[str] = None
    last_status_check_at: Optional[datetime] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    connector_response: Optional[Dict[str, Any]] = None
    submitted_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class VatSubmissionListResponse(BaseModel):
    """Response for list of VAT submissions."""
    submissions: List[VatSubmissionResponse]
    total_count: int


class CreateVatSubmissionRequest(BaseModel):
    """Request to create a VAT submission."""
    period_id: UUID
    submission_type: VatSubmissionType = VatSubmissionType.BTW
    method: VatSubmissionMethod = VatSubmissionMethod.PACKAGE


class MarkSubmittedRequest(BaseModel):
    """Request to mark a submission as submitted."""
    reference_text: str = Field(..., min_length=1, description="Reference text (e.g., 'Submitted via portal on DATE')")
    attachment_url: Optional[str] = Field(None, description="Optional URL to proof/receipt")


class PrepareSubmissionRequest(BaseModel):
    """Request to prepare a VAT/ICP submission."""
    kind: VatSubmissionType = VatSubmissionType.BTW


class PrepareSubmissionResponse(BaseModel):
    """Response for prepare submission endpoint."""
    submission_id: UUID
    status: str
    validation_errors: List[str]
    payload_hash: str


class QueueSubmissionRequest(BaseModel):
    """Request to queue a submission for Digipoort."""
    certificate_id: UUID = Field(..., description="ID of PKIoverheid certificate to use for signing")


class QueueSubmissionResponse(BaseModel):
    """Response for queue submission endpoint."""
    submission_id: UUID
    status: str
    correlation_id: Optional[str] = None


