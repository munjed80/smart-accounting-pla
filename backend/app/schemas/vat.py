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

