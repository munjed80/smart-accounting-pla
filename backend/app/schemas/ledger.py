"""
Ledger Schemas

Pydantic schemas for journal entries and ledger operations.
"""
from datetime import datetime, date
from typing import Optional, List
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


class JournalEntryStatus(str, Enum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    REVERSED = "REVERSED"


class JournalLineCreate(BaseModel):
    """Schema for creating a journal line."""
    account_id: UUID
    description: Optional[str] = None
    debit_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    credit_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    vat_code_id: Optional[UUID] = None
    vat_amount: Optional[Decimal] = None
    taxable_amount: Optional[Decimal] = None
    party_type: Optional[str] = None  # CUSTOMER, SUPPLIER
    party_id: Optional[UUID] = None


class JournalLineResponse(BaseModel):
    """Schema for journal line response."""
    id: UUID
    line_number: int
    account_id: UUID
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    description: Optional[str] = None
    debit_amount: Decimal
    credit_amount: Decimal
    vat_code_id: Optional[UUID] = None
    vat_code: Optional[str] = None
    vat_amount: Optional[Decimal] = None
    taxable_amount: Optional[Decimal] = None
    party_type: Optional[str] = None
    party_id: Optional[UUID] = None
    
    class Config:
        from_attributes = True


class JournalEntryCreate(BaseModel):
    """Schema for creating a journal entry."""
    entry_date: date
    description: str = Field(..., min_length=1)
    reference: Optional[str] = None
    document_id: Optional[UUID] = None
    source_type: Optional[str] = None
    source_id: Optional[UUID] = None
    lines: List[JournalLineCreate] = []
    auto_post: bool = False


class JournalEntryUpdate(BaseModel):
    """Schema for updating a draft journal entry."""
    entry_date: Optional[date] = None
    description: Optional[str] = None
    reference: Optional[str] = None
    lines: Optional[List[JournalLineCreate]] = None


class JournalEntryResponse(BaseModel):
    """Schema for journal entry response."""
    id: UUID
    administration_id: UUID
    entry_number: str
    entry_date: date
    description: str
    reference: Optional[str] = None
    status: JournalEntryStatus
    total_debit: Decimal
    total_credit: Decimal
    is_balanced: bool
    source_type: Optional[str] = None
    document_id: Optional[UUID] = None
    posted_at: Optional[datetime] = None
    posted_by_name: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    lines: List[JournalLineResponse] = []
    
    class Config:
        from_attributes = True


class JournalEntryListItem(BaseModel):
    """Schema for journal entry list item."""
    id: UUID
    entry_number: str
    entry_date: date
    description: str
    status: JournalEntryStatus
    total_debit: Decimal
    total_credit: Decimal
    is_balanced: bool
    source_type: Optional[str] = None
    posted_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class JournalEntryListResponse(BaseModel):
    """Schema for journal entry list response."""
    entries: List[JournalEntryListItem]
    total_count: int


class JournalEntryPostResponse(BaseModel):
    """Schema for posting a journal entry response."""
    id: UUID
    status: JournalEntryStatus
    entry_number: str
    posted_at: datetime
    message: str


class PeriodLockCheckResponse(BaseModel):
    """Schema for period lock check response."""
    is_locked: bool
    period_id: Optional[UUID] = None
    period_name: Optional[str] = None
    locked_at: Optional[datetime] = None
    locked_by_name: Optional[str] = None
    message: str


# ============ Audit Log Schemas ============

class AuditLogAction(str, Enum):
    """Actions tracked in the bookkeeping audit log."""
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    POST = "POST"
    DELETE = "DELETE"
    REVERSE = "REVERSE"
    LOCK_PERIOD = "LOCK_PERIOD"
    UNLOCK_PERIOD = "UNLOCK_PERIOD"
    START_REVIEW = "START_REVIEW"
    FINALIZE_PERIOD = "FINALIZE_PERIOD"


class AuditLogEntry(BaseModel):
    """Schema for a single audit log entry."""
    id: UUID
    administration_id: UUID
    actor_id: Optional[UUID] = None
    actor_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[UUID] = None
    entity_description: Optional[str] = None
    payload: Optional[dict] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Schema for audit log list response."""
    entries: List[AuditLogEntry]
    total_count: int
