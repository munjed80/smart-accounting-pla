"""
Work Queue Summary Schemas

Schemas for the accountant work queue summary endpoint.
"""
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field


# Document review section
class DocumentReviewItem(BaseModel):
    """Individual document needing review."""
    id: UUID
    date: Optional[date] = None
    type: str  # Invoice, Receipt, etc.
    status: str
    vendor_customer: Optional[str] = None
    amount: Optional[Decimal] = None
    link: str  # Deep link to document


class DocumentReviewSection(BaseModel):
    """Document review section with count and top items."""
    count: int = Field(..., description="Total count of documents needing review")
    top_items: List[DocumentReviewItem] = Field(default_factory=list, max_length=10)


# Bank reconciliation section
class BankTransactionItem(BaseModel):
    """Individual unmatched bank transaction."""
    id: UUID
    date: date
    description: str
    amount: Decimal
    confidence_best_proposal: Optional[Decimal] = Field(None, ge=0, le=1)
    link: str  # Deep link to bank reconciliation page


class BankReconciliationSection(BaseModel):
    """Bank reconciliation section with count and top items."""
    count: int = Field(..., description="Count of unmatched bank transactions (last 30 days)")
    top_items: List[BankTransactionItem] = Field(default_factory=list, max_length=10)


# VAT actions section
class VATActionsSection(BaseModel):
    """VAT actions section with period status and links."""
    current_period_status: Optional[str] = Field(None, description="Current VAT period status: DRAFT, READY, QUEUED, SUBMITTED, etc.")
    periods_needing_action_count: int = Field(0, description="Count of periods needing action")
    btw_link: str = Field(..., description="Link to BTW-aangifte page")


# Reminders / overdue section
class OverdueInvoiceItem(BaseModel):
    """Individual overdue invoice."""
    id: UUID
    customer: str
    due_date: date
    amount: Decimal
    link: str  # Deep link to invoice


class RemindersSection(BaseModel):
    """Reminders/overdue section with count and top items."""
    count: int = Field(..., description="Count of overdue invoices")
    top_items: List[OverdueInvoiceItem] = Field(default_factory=list, max_length=10)


# Integrity warnings section
class IntegrityWarningItem(BaseModel):
    """Individual integrity warning/alert."""
    id: UUID
    severity: str  # CRITICAL, WARNING, INFO
    message: str
    link: str  # Deep link to alert or related page


class IntegrityWarningsSection(BaseModel):
    """Integrity warnings section with count and top items."""
    count: int = Field(..., description="Count of active alerts")
    top_items: List[IntegrityWarningItem] = Field(default_factory=list, max_length=10)


# Main response
class WorkQueueSummaryResponse(BaseModel):
    """Complete work queue summary for a client."""
    document_review: DocumentReviewSection
    bank_reconciliation: BankReconciliationSection
    vat_actions: VATActionsSection
    reminders: RemindersSection
    integrity_warnings: IntegrityWarningsSection
    generated_at: datetime = Field(default_factory=lambda: datetime.now())
