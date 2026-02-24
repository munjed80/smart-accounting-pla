"""
ZZP Schemas

Pydantic schemas for ZZP-specific API requests and responses.
Includes schemas for customers, invoices, expenses, time tracking, quotes, and payments.
"""
from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, EmailStr


# ============================================================================
# Constants
# ============================================================================

EXPENSE_CATEGORIES = [
    "algemeen",
    "kantoor",
    "transport",
    "marketing",
    "hardware",
    "software",
    "opleiding",
    "huisvesting",
    "telefoon",
    "internet",
    "overig",
    "Abonnement",
    "Lease",
    "Lening",
]


# ============================================================================
# Customer Schemas
# ============================================================================

class CustomerCreate(BaseModel):
    """Create a new ZZP customer."""
    name: str = Field(..., min_length=1, max_length=255, description="Customer or company name")
    email: Optional[str] = Field(None, max_length=255, description="Email address")
    phone: Optional[str] = Field(None, max_length=50, description="Phone number")
    contact_person: Optional[str] = Field(None, max_length=255, description="Contact person name")
    
    # Address fields
    address_street: Optional[str] = Field(None, max_length=500, description="Street address")
    address_line2: Optional[str] = Field(None, max_length=500, description="Address line 2")
    address_postal_code: Optional[str] = Field(None, max_length=20, description="Postal code")
    address_city: Optional[str] = Field(None, max_length=100, description="City")
    address_country: Optional[str] = Field("Nederland", max_length=100, description="Country")
    
    # Business identifiers
    kvk_number: Optional[str] = Field(None, max_length=20, description="KVK number")
    btw_number: Optional[str] = Field(None, max_length=30, description="BTW/VAT number")
    
    # Bank details
    iban: Optional[str] = Field(None, max_length=34, description="IBAN")
    bank_bic: Optional[str] = Field(None, max_length=11, description="Bank BIC/SWIFT")
    
    # Notes
    notes: Optional[str] = Field(None, description="Additional notes")


class CustomerUpdate(BaseModel):
    """Update a ZZP customer (partial update)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    contact_person: Optional[str] = Field(None, max_length=255)
    address_street: Optional[str] = Field(None, max_length=500)
    address_line2: Optional[str] = Field(None, max_length=500)
    address_postal_code: Optional[str] = Field(None, max_length=20)
    address_city: Optional[str] = Field(None, max_length=100)
    address_country: Optional[str] = Field(None, max_length=100)
    kvk_number: Optional[str] = Field(None, max_length=20)
    btw_number: Optional[str] = Field(None, max_length=30)
    iban: Optional[str] = Field(None, max_length=34)
    bank_bic: Optional[str] = Field(None, max_length=11)
    notes: Optional[str] = Field(None)
    status: Optional[str] = Field(None, description="active or inactive")


class CustomerResponse(BaseModel):
    """ZZP customer response."""
    id: UUID
    administration_id: UUID
    name: str
    email: Optional[str]
    phone: Optional[str]
    contact_person: Optional[str]
    address_street: Optional[str]
    address_line2: Optional[str]
    address_postal_code: Optional[str]
    address_city: Optional[str]
    address_country: Optional[str]
    kvk_number: Optional[str]
    btw_number: Optional[str]
    iban: Optional[str]
    bank_bic: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CustomerListResponse(BaseModel):
    """List of ZZP customers with pagination."""
    customers: List[CustomerResponse]
    total: int


# ============================================================================
# Business Profile Schemas
# ============================================================================

class BusinessProfileCreate(BaseModel):
    """Create or update business profile."""
    company_name: str = Field(..., min_length=1, max_length=255, description="Company name")
    trading_name: Optional[str] = Field(None, max_length=255, description="Trading name")
    address_street: Optional[str] = Field(None, max_length=500)
    address_postal_code: Optional[str] = Field(None, max_length=20)
    address_city: Optional[str] = Field(None, max_length=100)
    address_country: Optional[str] = Field("Nederland", max_length=100)
    kvk_number: Optional[str] = Field(None, max_length=20)
    btw_number: Optional[str] = Field(None, max_length=30)
    iban: Optional[str] = Field(None, max_length=34)
    default_hourly_rate: Optional[float] = Field(None, ge=0, description="Default hourly rate in euros")
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    website: Optional[str] = Field(None, max_length=255)
    logo_url: Optional[str] = Field(None, max_length=500)


class BusinessProfileUpdate(BaseModel):
    """Update business profile (partial)."""
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    trading_name: Optional[str] = Field(None, max_length=255)
    address_street: Optional[str] = Field(None, max_length=500)
    address_postal_code: Optional[str] = Field(None, max_length=20)
    address_city: Optional[str] = Field(None, max_length=100)
    address_country: Optional[str] = Field(None, max_length=100)
    kvk_number: Optional[str] = Field(None, max_length=20)
    btw_number: Optional[str] = Field(None, max_length=30)
    iban: Optional[str] = Field(None, max_length=34)
    default_hourly_rate: Optional[float] = Field(None, ge=0)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    website: Optional[str] = Field(None, max_length=255)
    logo_url: Optional[str] = Field(None, max_length=500)


class BusinessProfileResponse(BaseModel):
    """Business profile response."""
    id: UUID
    administration_id: UUID
    company_name: str
    trading_name: Optional[str]
    address_street: Optional[str]
    address_postal_code: Optional[str]
    address_city: Optional[str]
    address_country: Optional[str]
    kvk_number: Optional[str]
    btw_number: Optional[str]
    iban: Optional[str]
    default_hourly_rate: Optional[Decimal]
    email: Optional[str]
    phone: Optional[str]
    website: Optional[str]
    logo_url: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Invoice Line Schemas
# ============================================================================

class InvoiceLineCreate(BaseModel):
    """Create an invoice line."""
    description: str = Field(..., min_length=1, max_length=500, description="Line item description")
    quantity: float = Field(1.0, gt=0, description="Quantity")
    unit_price_cents: int = Field(..., ge=0, description="Unit price in cents")
    vat_rate: float = Field(21.0, ge=0, le=100, description="VAT rate percentage")


class InvoiceLineResponse(BaseModel):
    """Invoice line response."""
    id: UUID
    invoice_id: UUID
    line_number: int
    description: str
    quantity: Decimal
    unit_price_cents: int
    vat_rate: Decimal
    line_total_cents: int
    vat_amount_cents: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Invoice Schemas
# ============================================================================

class InvoiceCreate(BaseModel):
    """Create a new invoice."""
    customer_id: UUID = Field(..., description="Customer ID")
    issue_date: str = Field(..., description="Issue date (ISO 8601)")
    due_date: Optional[str] = Field(None, description="Due date (ISO 8601)")
    notes: Optional[str] = Field(None, description="Invoice notes")
    lines: List[InvoiceLineCreate] = Field(..., min_length=1, description="Invoice lines")
    
    @field_validator('issue_date', 'due_date')
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class InvoiceUpdate(BaseModel):
    """Update an invoice."""
    customer_id: Optional[UUID] = Field(None, description="Customer ID")
    issue_date: Optional[str] = Field(None, description="Issue date (ISO 8601)")
    due_date: Optional[str] = Field(None, description="Due date (ISO 8601)")
    notes: Optional[str] = Field(None, description="Invoice notes")
    lines: Optional[List[InvoiceLineCreate]] = Field(None, description="Invoice lines")
    
    @field_validator('issue_date', 'due_date')
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class InvoiceStatusUpdate(BaseModel):
    """Update invoice status."""
    status: str = Field(..., description="New status: draft, sent, paid, overdue, cancelled")
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        allowed = ['draft', 'sent', 'paid', 'overdue', 'cancelled']
        if v not in allowed:
            raise ValueError(f"Status must be one of: {', '.join(allowed)}")
        return v


class InvoiceResponse(BaseModel):
    """Invoice response."""
    id: UUID
    administration_id: UUID
    customer_id: UUID
    invoice_number: str
    status: str
    issue_date: str  # ISO 8601 string
    due_date: Optional[str]  # ISO 8601 string
    
    # Seller snapshot
    seller_company_name: Optional[str]
    seller_trading_name: Optional[str]
    seller_address_street: Optional[str]
    seller_address_postal_code: Optional[str]
    seller_address_city: Optional[str]
    seller_address_country: Optional[str]
    seller_kvk_number: Optional[str]
    seller_btw_number: Optional[str]
    seller_iban: Optional[str]
    seller_email: Optional[str]
    seller_phone: Optional[str]
    
    # Customer snapshot
    customer_name: Optional[str]
    customer_address_street: Optional[str]
    customer_address_postal_code: Optional[str]
    customer_address_city: Optional[str]
    customer_address_country: Optional[str]
    customer_kvk_number: Optional[str]
    customer_btw_number: Optional[str]
    
    # Totals
    subtotal_cents: int
    vat_total_cents: int
    total_cents: int
    amount_paid_cents: int
    paid_at: Optional[datetime]
    
    # Notes and lines
    notes: Optional[str]
    lines: List[InvoiceLineResponse]
    
    created_at: datetime
    updated_at: datetime


class InvoiceListResponse(BaseModel):
    """List of invoices with pagination."""
    invoices: List[InvoiceResponse]
    total: int


# ============================================================================
# Expense Schemas
# ============================================================================

class ExpenseCreate(BaseModel):
    """Create a new expense."""
    vendor: str = Field(..., min_length=1, max_length=255, description="Vendor name")
    description: Optional[str] = Field(None, max_length=500, description="Expense description")
    expense_date: str = Field(..., description="Expense date (ISO 8601)")
    amount_cents: int = Field(..., gt=0, description="Amount in cents")
    vat_rate: float = Field(21.0, ge=0, le=100, description="VAT rate percentage")
    category: str = Field("algemeen", description="Expense category")
    notes: Optional[str] = Field(None, description="Additional notes")
    attachment_url: Optional[str] = Field(None, max_length=500, description="Receipt/document URL")
    commitment_id: Optional[UUID] = Field(None, description="Linked financial commitment")
    
    @field_validator('expense_date')
    @classmethod
    def validate_date(cls, v):
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v
    
    @field_validator('category')
    @classmethod
    def validate_category(cls, v):
        if v not in EXPENSE_CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(EXPENSE_CATEGORIES)}")
        return v

    @field_validator('vat_rate')
    @classmethod
    def validate_vat_rate(cls, v):
        if v not in {0, 9, 21, 0.0, 9.0, 21.0}:
            raise ValueError("VAT rate must be 0, 9, or 21")
        return v


class ExpenseUpdate(BaseModel):
    """Update an expense (partial)."""
    vendor: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    expense_date: Optional[str] = Field(None)
    amount_cents: Optional[int] = Field(None, gt=0)
    vat_rate: Optional[float] = Field(None, ge=0, le=100)
    category: Optional[str] = Field(None)
    notes: Optional[str] = Field(None)
    attachment_url: Optional[str] = Field(None, max_length=500)
    commitment_id: Optional[UUID] = Field(None)
    
    @field_validator('expense_date')
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v
    
    @field_validator('category')
    @classmethod
    def validate_category(cls, v):
        if v is None:
            return v
        if v not in EXPENSE_CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(EXPENSE_CATEGORIES)}")
        return v

    @field_validator('vat_rate')
    @classmethod
    def validate_vat_rate(cls, v):
        if v is None:
            return v
        if v not in {0, 9, 21, 0.0, 9.0, 21.0}:
            raise ValueError("VAT rate must be 0, 9, or 21")
        return v


class ExpenseResponse(BaseModel):
    """Expense response."""
    id: UUID
    administration_id: UUID
    vendor: str
    description: Optional[str]
    expense_date: date
    amount_cents: int
    vat_rate: Decimal
    vat_amount_cents: int
    category: str
    notes: Optional[str]
    attachment_url: Optional[str]
    commitment_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ExpenseListResponse(BaseModel):
    """List of expenses with pagination and totals."""
    expenses: List[ExpenseResponse]
    total: int
    total_amount_cents: int
    total_vat_cents: int


# ============================================================================
# Time Entry Schemas
# ============================================================================

class TimeEntryCreate(BaseModel):
    """Create a new time entry."""
    entry_date: str = Field(..., description="Entry date (ISO 8601)")
    description: str = Field(..., min_length=1, max_length=500, description="What was worked on")
    hours: float = Field(..., gt=0, le=24, description="Number of hours")
    project_name: Optional[str] = Field(None, max_length=255, description="Project name")
    customer_id: Optional[UUID] = Field(None, description="Customer ID")
    project_id: Optional[UUID] = Field(None, description="Project ID")
    hourly_rate: Optional[float] = Field(None, ge=0, description="Hourly rate in euros")
    billable: bool = Field(True, description="Is this time billable?")
    
    @field_validator('entry_date')
    @classmethod
    def validate_date(cls, v):
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class TimeEntryUpdate(BaseModel):
    """Update a time entry (partial)."""
    entry_date: Optional[str] = Field(None)
    description: Optional[str] = Field(None, min_length=1, max_length=500)
    hours: Optional[float] = Field(None, gt=0, le=24)
    project_name: Optional[str] = Field(None, max_length=255)
    customer_id: Optional[UUID] = Field(None)
    project_id: Optional[UUID] = Field(None)
    hourly_rate: Optional[float] = Field(None, ge=0)
    billable: Optional[bool] = Field(None)
    
    @field_validator('entry_date')
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class TimeEntryOut(BaseModel):
    """Time entry response (full model representation)."""
    id: UUID
    user_id: Optional[UUID]
    administration_id: UUID
    entry_date: date
    description: str
    hours: Decimal
    project_name: Optional[str]
    customer_id: Optional[UUID]
    project_id: Optional[UUID]
    hourly_rate: Optional[Decimal]
    hourly_rate_cents: Optional[int]
    invoice_id: Optional[UUID]
    is_invoiced: bool
    billable: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class TimeEntryResponse(BaseModel):
    """Time entry response (API format with ISO dates)."""
    id: UUID
    administration_id: UUID
    entry_date: str  # ISO 8601
    description: str
    hours: Decimal
    project_name: Optional[str]
    customer_id: Optional[UUID]
    hourly_rate_cents: Optional[int]
    billable: bool
    created_at: datetime
    updated_at: datetime


class TimeEntryListResponse(BaseModel):
    """List of time entries with aggregates."""
    entries: List[TimeEntryOut]
    total: int
    total_hours: Decimal
    total_billable_hours: Decimal
    open_entries: int
    invoiced_entries: int


# ============================================================================
# Work Session Schemas
# ============================================================================

class WorkSessionStart(BaseModel):
    """Start a work session."""
    note: Optional[str] = Field(None, description="Optional note about the work")


class WorkSessionStop(BaseModel):
    """Stop a work session."""
    break_minutes: int = Field(0, ge=0, description="Break time in minutes")
    note: Optional[str] = Field(None, description="Optional note about the work")


class WorkSessionResponse(BaseModel):
    """Work session response."""
    id: UUID
    user_id: UUID
    administration_id: UUID
    started_at: datetime
    ended_at: Optional[datetime]
    break_minutes: int
    note: Optional[str]
    time_entry_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    duration_seconds: Optional[int] = None  # Calculated field
    
    class Config:
        from_attributes = True


class WorkSessionStopResponse(BaseModel):
    """Response when stopping a work session."""
    session: WorkSessionResponse
    time_entry: TimeEntryResponse
    hours_added: float
    message: str


# ============================================================================
# Calendar Event Schemas
# ============================================================================

class CalendarEventCreate(BaseModel):
    """Create a calendar event."""
    title: str = Field(..., min_length=1, max_length=255, description="Event title")
    start_datetime: str = Field(..., description="Start datetime (ISO 8601)")
    end_datetime: str = Field(..., description="End datetime (ISO 8601)")
    location: Optional[str] = Field(None, max_length=500, description="Event location")
    notes: Optional[str] = Field(None, description="Event notes")
    
    @field_validator('start_datetime', 'end_datetime')
    @classmethod
    def validate_datetime(cls, v):
        try:
            datetime.fromisoformat(v.replace('Z', '+00:00'))
        except ValueError:
            raise ValueError("Datetime must be in ISO 8601 format")
        return v


class CalendarEventUpdate(BaseModel):
    """Update a calendar event (partial)."""
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    start_datetime: Optional[str] = Field(None)
    end_datetime: Optional[str] = Field(None)
    location: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None)
    
    @field_validator('start_datetime', 'end_datetime')
    @classmethod
    def validate_datetime(cls, v):
        if v is None:
            return v
        try:
            datetime.fromisoformat(v.replace('Z', '+00:00'))
        except ValueError:
            raise ValueError("Datetime must be in ISO 8601 format")
        return v


class CalendarEventResponse(BaseModel):
    """Calendar event response."""
    id: UUID
    administration_id: UUID
    title: str
    start_datetime: str  # ISO 8601
    end_datetime: str  # ISO 8601
    location: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class CalendarEventListResponse(BaseModel):
    """List of calendar events."""
    events: List[CalendarEventResponse]
    total: int


# ============================================================================
# Quote Line Schemas
# ============================================================================

class QuoteLineCreate(BaseModel):
    """Create a quote line."""
    description: str = Field(..., min_length=1, description="Line item description")
    quantity: float = Field(1.0, gt=0, description="Quantity")
    unit_price_cents: int = Field(..., ge=0, description="Unit price in cents")
    vat_rate: float = Field(21.0, ge=0, le=100, description="VAT rate percentage")


class QuoteLineResponse(BaseModel):
    """Quote line response."""
    id: UUID
    quote_id: UUID
    line_number: int
    description: str
    quantity: Decimal
    unit_price_cents: int
    vat_rate: Decimal
    vat_amount_cents: int
    line_total_cents: int
    
    class Config:
        from_attributes = True


# ============================================================================
# Quote Schemas
# ============================================================================

class QuoteCreate(BaseModel):
    """Create a new quote."""
    customer_id: UUID = Field(..., description="Customer ID")
    issue_date: str = Field(..., description="Issue date (ISO 8601)")
    valid_until: Optional[str] = Field(None, description="Valid until date (ISO 8601)")
    title: Optional[str] = Field(None, max_length=255, description="Quote title")
    notes: Optional[str] = Field(None, description="Quote notes")
    terms: Optional[str] = Field(None, description="Terms and conditions")
    lines: List[QuoteLineCreate] = Field(..., min_length=1, description="Quote lines")
    
    @field_validator('issue_date', 'valid_until')
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class QuoteUpdate(BaseModel):
    """Update a quote."""
    customer_id: Optional[UUID] = Field(None, description="Customer ID")
    issue_date: Optional[str] = Field(None, description="Issue date (ISO 8601)")
    valid_until: Optional[str] = Field(None, description="Valid until date (ISO 8601)")
    title: Optional[str] = Field(None, max_length=255, description="Quote title")
    notes: Optional[str] = Field(None, description="Quote notes")
    terms: Optional[str] = Field(None, description="Terms and conditions")
    lines: Optional[List[QuoteLineCreate]] = Field(None, description="Quote lines")
    
    @field_validator('issue_date', 'valid_until')
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class QuoteStatusUpdate(BaseModel):
    """Update quote status."""
    status: str = Field(..., description="New status: draft, sent, accepted, rejected, expired, converted")
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        allowed = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']
        if v not in allowed:
            raise ValueError(f"Status must be one of: {', '.join(allowed)}")
        return v


class QuoteResponse(BaseModel):
    """Quote response."""
    id: UUID
    administration_id: UUID
    customer_id: UUID
    quote_number: str
    status: str
    issue_date: date
    valid_until: Optional[date]
    invoice_id: Optional[UUID]
    
    # Seller snapshot
    seller_company_name: Optional[str]
    seller_trading_name: Optional[str]
    seller_address_street: Optional[str]
    seller_address_postal_code: Optional[str]
    seller_address_city: Optional[str]
    seller_address_country: Optional[str]
    seller_kvk_number: Optional[str]
    seller_btw_number: Optional[str]
    seller_iban: Optional[str]
    seller_email: Optional[str]
    seller_phone: Optional[str]
    
    # Customer snapshot
    customer_name: Optional[str]
    customer_address_street: Optional[str]
    customer_address_postal_code: Optional[str]
    customer_address_city: Optional[str]
    customer_address_country: Optional[str]
    customer_kvk_number: Optional[str]
    customer_btw_number: Optional[str]
    
    # Totals
    subtotal_cents: int
    vat_total_cents: int
    total_cents: int
    
    # Content
    title: Optional[str]
    notes: Optional[str]
    terms: Optional[str]
    lines: List[QuoteLineResponse]
    
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class QuoteListResponse(BaseModel):
    """List of quotes with statistics."""
    quotes: List[QuoteResponse]
    total: int
    total_amount_cents: int
    stats: dict  # Status counts


class QuoteConvertToInvoiceResponse(BaseModel):
    """Response when converting a quote to an invoice."""
    quote: QuoteResponse
    invoice_id: UUID
    invoice_number: str


# ============================================================================
# Weekly Invoice Schemas
# ============================================================================

class WeeklyInvoiceCreateRequest(BaseModel):
    """Request to create a weekly invoice from time entries."""
    customer_id: UUID
    period_start: date
    period_end: date
    hourly_rate: Optional[float] = None


class WeeklyInvoiceCreateResponse(BaseModel):
    """Response after creating a weekly invoice."""
    invoice_id: UUID
    invoice_number: str
    total_hours: Decimal
    rate: Decimal
    total_amount: int


# ============================================================================
# Bank/Payment Schemas (for ZZP bank reconciliation)
# ============================================================================

class ZZPBankAccountResponse(BaseModel):
    """Bank account response."""
    id: UUID
    administration_id: UUID
    account_name: str
    iban: str
    balance_cents: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ZZPBankAccountListResponse(BaseModel):
    """List of bank accounts."""
    accounts: List[ZZPBankAccountResponse]
    total: int


class ZZPBankTransactionResponse(BaseModel):
    """Bank transaction response."""
    id: UUID
    bank_account_id: UUID
    administration_id: UUID
    transaction_date: date
    amount_cents: int
    description: str
    counterparty_name: Optional[str]
    counterparty_account: Optional[str]
    reference: Optional[str]
    is_matched: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class ZZPBankTransactionListResponse(BaseModel):
    """List of bank transactions."""
    transactions: List[ZZPBankTransactionResponse]
    total: int


class ZZPBankImportResponse(BaseModel):
    """Response after importing bank transactions."""
    imported_count: int
    skipped_count: int
    total_count: int


class ZZPInvoiceMatchSuggestion(BaseModel):
    """Invoice match suggestion."""
    invoice_id: UUID
    invoice_number: str
    customer_name: Optional[str]
    total_cents: int
    amount_due_cents: int
    confidence_score: int
    match_reason: str


class ZZPMatchSuggestionsResponse(BaseModel):
    """List of invoice match suggestions."""
    suggestions: List[ZZPInvoiceMatchSuggestion]


class ZZPMatchInvoiceRequest(BaseModel):
    """Request to match a transaction to an invoice."""
    invoice_id: UUID
    amount_cents: Optional[int] = None  # For partial payments
    notes: Optional[str] = None


class ZZPMatchInvoiceResponse(BaseModel):
    """Response after matching."""
    match_id: UUID
    transaction_id: UUID
    invoice_id: UUID
    amount_cents: int
    message: str


class ZZPUnmatchResponse(BaseModel):
    """Response after unmatching."""
    transaction_id: UUID
    invoice_id: UUID
    message: str


class ZZPBankTransactionMatchResponse(BaseModel):
    """Bank transaction match response."""
    id: UUID
    administration_id: UUID
    bank_transaction_id: UUID
    invoice_id: UUID
    user_id: Optional[UUID]
    amount_cents: int
    match_type: str
    confidence_score: Optional[int]
    notes: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class ZZPBankTransactionMatchListResponse(BaseModel):
    """List of bank transaction matches."""
    matches: List[ZZPBankTransactionMatchResponse]
    total: int



# ============================================================================
# AI Insights Schemas (for ZZP insights service)
# ============================================================================

class InsightType(str):
    """Insight type enum values."""
    INVOICE_OVERDUE = "invoice_overdue"
    UNBILLED_HOURS = "unbilled_hours"
    MISSING_PROFILE = "missing_profile"
    BTW_DEADLINE = "btw_deadline"
    NO_ACTIVITY = "no_activity"
    INVOICE_FOLLOWUP = "invoice_followup"


class InsightSeverity(str):
    """Insight severity enum values."""
    ACTION_NEEDED = "action_needed"  # Red/urgent - requires immediate action
    SUGGESTION = "suggestion"          # Yellow/warning - helpful suggestion
    INFO = "info"                      # Blue/info - informational


class InsightAction(BaseModel):
    """Action that can be taken on an insight."""
    type: str  # Type of action
    label: str  # Button label
    route: str  # Frontend route to navigate to
    params: Optional[dict] = None  # Optional route parameters


class ZZPInsight(BaseModel):
    """Individual AI insight."""
    id: str  # Unique insight ID
    type: str  # InsightType value
    severity: str  # InsightSeverity value
    title: str  # Short title
    description: str  # Detailed description
    reason: str  # Why this insight was generated (explainability)
    action: InsightAction  # Suggested action
    related_id: Optional[str] = None  # Related entity ID
    related_type: Optional[str] = None  # Related entity type
    amount_cents: Optional[int] = None  # Related amount if applicable


# ============================================================================
# Insights Schema
# ============================================================================

class ZZPInsightsResponse(BaseModel):
    """ZZP insights and analytics response with AI insights."""
    # AI Insights
    insights: List[ZZPInsight] = []
    total_action_needed: int = 0
    total_suggestions: int = 0
    generated_at: datetime
    ai_model_version: str = "rules-v1"
    
    # Financial metrics
    revenue_this_month: int = 0
    revenue_last_month: int = 0
    expenses_this_month: int = 0
    expenses_last_month: int = 0
    profit_this_month: int = 0
    profit_last_month: int = 0
    open_invoices_count: int = 0
    open_invoices_total_cents: int = 0
    overdue_invoices_count: int = 0
    overdue_invoices_total_cents: int = 0
    unbilled_hours: Decimal = Decimal("0")
    unbilled_hours_value_cents: int = 0
    top_customers: List[dict] = []  # Customer revenue breakdown
    expense_breakdown: List[dict] = []  # Expenses by category
    revenue_trend: List[dict] = []  # Monthly revenue trend
    monthly_comparison: dict = {}


# ============================================================================
# ZZP Document Inbox Schemas
# ============================================================================

from enum import Enum as PyEnum


class ZZPDocTypeEnum(str, PyEnum):
    BON = "BON"
    FACTUUR = "FACTUUR"
    OVERIG = "OVERIG"


class ZZPDocStatusEnum(str, PyEnum):
    NEW = "NEW"
    REVIEW = "REVIEW"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


class ZZPDocumentResponse(BaseModel):
    """ZZP document response schema."""
    id: UUID
    administration_id: UUID
    user_id: Optional[UUID] = None
    filename: str
    mime_type: str
    storage_ref: str
    doc_type: ZZPDocTypeEnum
    status: ZZPDocStatusEnum
    supplier: Optional[str] = None
    amount_cents: Optional[int] = None
    vat_rate: Optional[Decimal] = None
    doc_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ZZPDocumentUpdate(BaseModel):
    """Partial update for ZZP document metadata/status."""
    doc_type: Optional[ZZPDocTypeEnum] = None
    status: Optional[ZZPDocStatusEnum] = None
    supplier: Optional[str] = Field(None, max_length=255)
    amount_cents: Optional[int] = None
    vat_rate: Optional[Decimal] = None
    doc_date: Optional[date] = None


class ZZPDocumentUploadResponse(BaseModel):
    """Response after uploading one or more documents."""
    documents: List[ZZPDocumentResponse]


class ZZPDocumentCreateExpenseResponse(BaseModel):
    """Response after converting document to expense."""
    expense_id: UUID
    document_id: UUID
    message: str = "Uitgave opgeslagen en document gekoppeld."
