"""
Bank Reconciliation Schemas

Pydantic schemas for:
- Bank file import
- Bank transaction queries
- Match suggestions
- Reconciliation actions
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


# ============ Enums (mirror SQLAlchemy enums) ============

class BankTransactionStatusEnum(str, Enum):
    """Status of a bank transaction."""
    NEW = "NEW"
    MATCHED = "MATCHED"
    IGNORED = "IGNORED"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class MatchedTypeEnum(str, Enum):
    """Type of matched entity."""
    INVOICE = "INVOICE"
    EXPENSE = "EXPENSE"
    TRANSFER = "TRANSFER"
    MANUAL = "MANUAL"


class ReconciliationActionEnum(str, Enum):
    """Reconciliation action types."""
    ACCEPT_MATCH = "ACCEPT_MATCH"
    IGNORE = "IGNORE"
    CREATE_EXPENSE = "CREATE_EXPENSE"
    LINK_INVOICE = "LINK_INVOICE"
    UNMATCH = "UNMATCH"


# ============ Import Schemas ============

class ColumnMapping(BaseModel):
    """Custom column mapping for CSV import."""
    date_column: str = Field(default="date", description="Column name for booking date")
    amount_column: str = Field(default="amount", description="Column name for amount")
    description_column: str = Field(default="description", description="Column name for description")
    name_column: Optional[str] = Field(default="name", description="Column name for counterparty name")
    iban_column: Optional[str] = Field(default="iban", description="Column name for counterparty IBAN")
    reference_column: Optional[str] = Field(default="reference", description="Column name for reference")


class BankImportRequest(BaseModel):
    """Request to import a bank statement file."""
    administration_id: UUID = Field(..., description="Administration ID to import into")
    format: str = Field(default="csv", description="File format (csv)")
    file_base64: str = Field(..., description="Base64 encoded file content")
    mapping: Optional[ColumnMapping] = Field(None, description="Custom column mapping")
    date_format: Optional[str] = Field(default="%Y-%m-%d", description="Date format string (e.g., %d-%m-%Y)")


class BankImportResponse(BaseModel):
    """Response after importing a bank statement."""
    imported_count: int = Field(..., description="Number of transactions imported")
    skipped_duplicates: int = Field(..., description="Number of duplicate transactions skipped")
    total_in_file: int = Field(..., description="Total transactions in the file")
    errors: List[str] = Field(default_factory=list, description="Error messages for failed rows")
    message: str = Field(..., description="Summary message (Dutch)")


# ============ Bank Account Schemas ============

class BankAccountResponse(BaseModel):
    """Bank account details."""
    id: UUID
    administration_id: UUID
    iban: str
    bank_name: Optional[str] = None
    currency: str
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Bank Transaction Schemas ============

class BankTransactionResponse(BaseModel):
    """Bank transaction details."""
    id: UUID
    administration_id: UUID
    bank_account_id: Optional[UUID] = None
    booking_date: date
    amount: Decimal
    counterparty_name: Optional[str] = None
    counterparty_iban: Optional[str] = None
    description: str
    reference: Optional[str] = None
    status: BankTransactionStatusEnum
    matched_type: Optional[MatchedTypeEnum] = None
    matched_entity_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BankTransactionListResponse(BaseModel):
    """Response for listing bank transactions."""
    transactions: List[BankTransactionResponse]
    total_count: int
    limit: int
    offset: int


# ============ Match Suggestion Schemas ============

class MatchSuggestion(BaseModel):
    """A suggested match for a bank transaction."""
    entity_type: MatchedTypeEnum = Field(..., description="Type of match (INVOICE, EXPENSE, etc.)")
    entity_id: UUID = Field(..., description="ID of the matched entity")
    entity_reference: str = Field(..., description="Reference number or name of the entity")
    confidence_score: int = Field(..., ge=0, le=100, description="Match confidence 0-100")
    amount: Decimal = Field(..., description="Amount of the matched entity")
    date: date = Field(..., description="Date of the matched entity")
    explanation: str = Field(..., description="Dutch explanation of why this match is suggested")


class SuggestMatchResponse(BaseModel):
    """Response with match suggestions for a bank transaction."""
    transaction_id: UUID
    suggestions: List[MatchSuggestion]
    message: str = Field(..., description="Dutch message about suggestions")


# ============ Reconciliation Action Schemas ============

class ApplyActionRequest(BaseModel):
    """Request to apply a reconciliation action."""
    action: ReconciliationActionEnum = Field(..., description="Action to take")
    entity_id: Optional[UUID] = Field(None, description="Entity ID for LINK_INVOICE or ACCEPT_MATCH")
    vat_code: Optional[str] = Field(None, description="VAT code for CREATE_EXPENSE")
    ledger_code: Optional[str] = Field(None, description="Ledger account code for CREATE_EXPENSE")
    notes: Optional[str] = Field(None, description="Optional notes")


class ApplyActionResponse(BaseModel):
    """Response after applying a reconciliation action."""
    transaction_id: UUID
    new_status: BankTransactionStatusEnum
    action_applied: ReconciliationActionEnum
    journal_entry_id: Optional[UUID] = Field(None, description="Created journal entry ID (for CREATE_EXPENSE)")
    message: str = Field(..., description="Dutch confirmation message")


class ReconciliationActionResponse(BaseModel):
    """Details of a reconciliation action for audit trail."""
    id: UUID
    bank_transaction_id: UUID
    user_id: UUID
    user_name: Optional[str] = None
    action: ReconciliationActionEnum
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReconciliationActionsListResponse(BaseModel):
    """Response for listing reconciliation actions (audit export)."""
    actions: List[ReconciliationActionResponse]
    total_count: int
