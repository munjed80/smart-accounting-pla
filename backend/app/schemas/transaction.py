from datetime import datetime, date
from typing import Optional, List
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator

from app.models.transaction import TransactionStatus


class TransactionLineBase(BaseModel):
    account_id: UUID
    vat_code_id: Optional[UUID] = None
    description: Optional[str] = None
    debit_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    credit_amount: Decimal = Field(default=Decimal("0.00"), ge=0)


class TransactionLineCreate(TransactionLineBase):
    pass


class TransactionLineUpdate(BaseModel):
    account_id: Optional[UUID] = None
    vat_code_id: Optional[UUID] = None
    description: Optional[str] = None
    debit_amount: Optional[Decimal] = Field(None, ge=0)
    credit_amount: Optional[Decimal] = Field(None, ge=0)


class TransactionLineResponse(TransactionLineBase):
    id: UUID
    ledger_account_code: Optional[str] = None
    ledger_account_name: Optional[str] = None
    vat_code: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionBase(BaseModel):
    transaction_date: date
    description: str = Field(..., min_length=1)


class TransactionCreate(TransactionBase):
    lines: List[TransactionLineCreate] = []


class TransactionUpdate(BaseModel):
    transaction_date: Optional[date] = None
    description: Optional[str] = Field(None, min_length=1)
    lines: Optional[List[TransactionLineCreate]] = None


class TransactionListItem(BaseModel):
    id: UUID
    booking_number: str
    transaction_date: date
    description: str
    status: TransactionStatus
    total_amount: Decimal
    created_by_name: Optional[str] = None
    ai_confidence_score: Optional[int] = None

    class Config:
        from_attributes = True


class TransactionResponse(TransactionBase):
    id: UUID
    administration_id: UUID
    document_id: Optional[UUID] = None
    booking_number: str
    status: TransactionStatus
    ai_confidence_score: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    posted_at: Optional[datetime] = None
    total_amount: Decimal = Decimal("0.00")
    lines: List[TransactionLineResponse] = []

    class Config:
        from_attributes = True


class TransactionStats(BaseModel):
    total_transactions: int
    draft_count: int
    posted_count: int
    total_debit: Decimal
    total_credit: Decimal
    recent_transactions: List[TransactionListItem] = []
