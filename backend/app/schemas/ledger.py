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
    created_at: datetime
    
    class Config:
        from_attributes = True
