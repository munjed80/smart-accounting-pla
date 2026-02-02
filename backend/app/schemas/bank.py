"""
Bank Reconciliation Schemas

Pydantic schemas for:
- Bank file import
- Bank transaction queries
- Match suggestions
- Reconciliation actions
"""
from datetime import datetime, date as Date
from typing import Optional, List, Dict, Any
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


# ============ Enums ============

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
    APPLY_MATCH = "APPLY_MATCH"
    CREATE_EXPENSE = "CREATE_EXPENSE"
    IGNORE = "IGNORE"
    UNMATCH = "UNMATCH"


# ============ Import Schemas ============

class BankImportResponse(BaseModel):
    """Response after importing a bank statement."""
    imported_count: int = Field(..., description="Number of transactions imported")
    skipped_duplicates_count: int = Field(..., description="Number of duplicate transactions skipped")
    total_in_file: int = Field(..., description="Total transactions in the file")
    errors: List[str] = Field(default_factory=list, description="Error messages for failed rows")
    message: str = Field(..., description="Summary message (Dutch)")
    bank_account_id: Optional[UUID] = Field(None, description="Bank account ID for the import")


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
    bank_account_id: UUID
    booking_date: Date
    amount: Decimal
    currency: str
    counterparty_name: Optional[str] = None
    counterparty_iban: Optional[str] = None
    description: str
    reference: Optional[str] = None
    status: BankTransactionStatusEnum
    matched_entity_type: Optional[str] = None
    matched_entity_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BankTransactionListResponse(BaseModel):
    """Response for listing bank transactions."""
    transactions: List[BankTransactionResponse]
    total_count: int
    page: int
    page_size: int


# ============ Match Suggestion Schemas ============

class MatchSuggestion(BaseModel):
    """A suggested match for a bank transaction."""
    entity_type: MatchedTypeEnum = Field(..., description="Type of match (INVOICE, EXPENSE, etc.)")
    entity_id: UUID = Field(..., description="ID of the matched entity")
    entity_reference: str = Field(..., description="Reference number or name of the entity")
    confidence_score: int = Field(..., ge=0, le=100, description="Match confidence 0-100")
    amount: Decimal = Field(..., description="Amount of the matched entity")
    date: Date = Field(..., description="Date of the matched entity")
    explanation: str = Field(..., description="Dutch explanation of why this match is suggested")
    proposed_action: ReconciliationActionEnum = Field(..., description="Suggested action")


class SuggestMatchResponse(BaseModel):
    """Response with match suggestions for a bank transaction."""
    transaction_id: UUID
    suggestions: List[MatchSuggestion]
    message: str = Field(..., description="Dutch message about suggestions")


# ============ Reconciliation Action Schemas ============

class ApplyActionRequest(BaseModel):
    """Request to apply a reconciliation action."""
    action_type: ReconciliationActionEnum = Field(..., description="Action to take")
    match_entity_type: Optional[MatchedTypeEnum] = Field(None, description="Matched entity type")
    match_entity_id: Optional[UUID] = Field(None, description="Matched entity ID")
    expense_category: Optional[str] = Field(None, description="Expense category/ledger code")
    vat_rate: Optional[Decimal] = Field(None, description="VAT percentage for expense")
    notes: Optional[str] = Field(None, description="Optional notes")


class ApplyActionResponse(BaseModel):
    """Response after applying a reconciliation action."""
    transaction: BankTransactionResponse
    action_applied: ReconciliationActionEnum
    journal_entry_id: Optional[UUID] = Field(None, description="Created journal entry ID (for CREATE_EXPENSE)")
    message: str = Field(..., description="Dutch confirmation message")


class ReconciliationActionResponse(BaseModel):
    """Details of a reconciliation action for audit trail."""
    id: UUID
    administration_id: UUID
    accountant_user_id: UUID
    bank_transaction_id: UUID
    action_type: ReconciliationActionEnum
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReconciliationActionsListResponse(BaseModel):
    """Response for listing reconciliation actions (audit export)."""
    actions: List[ReconciliationActionResponse]
    total_count: int
