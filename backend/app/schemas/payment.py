"""
Payment System Schemas

Pydantic schemas for payment API requests and responses.
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# Request Schemas

class PaymentCreate(BaseModel):
    """Create a new payment."""
    customer_id: Optional[UUID] = Field(None, description="Customer who made the payment")
    amount_cents: int = Field(..., gt=0, description="Payment amount in cents")
    payment_date: str = Field(..., description="Payment date (ISO 8601 format)")
    payment_method: str = Field("bank_transfer", description="Payment method")
    reference: Optional[str] = Field(None, max_length=255, description="Payment reference")
    notes: Optional[str] = Field(None, description="Additional notes")
    
    @field_validator('payment_method')
    @classmethod
    def validate_payment_method(cls, v):
        allowed = ['bank_transfer', 'cash', 'card', 'ideal', 'other']
        if v not in allowed:
            raise ValueError(f"Payment method must be one of: {', '.join(allowed)}")
        return v


class PaymentAllocationCreate(BaseModel):
    """Allocate a payment to an invoice."""
    invoice_id: UUID = Field(..., description="Invoice to allocate payment to")
    allocated_amount_cents: int = Field(..., gt=0, description="Amount to allocate in cents")
    notes: Optional[str] = Field(None, description="Allocation notes")


class PaymentUpdate(BaseModel):
    """Update payment details."""
    payment_date: Optional[str] = Field(None, description="Payment date (ISO 8601 format)")
    payment_method: Optional[str] = Field(None, description="Payment method")
    reference: Optional[str] = Field(None, max_length=255, description="Payment reference")
    notes: Optional[str] = Field(None, description="Additional notes")
    status: Optional[str] = Field(None, description="Payment status")
    
    @field_validator('payment_method')
    @classmethod
    def validate_payment_method(cls, v):
        if v is None:
            return v
        allowed = ['bank_transfer', 'cash', 'card', 'ideal', 'other']
        if v not in allowed:
            raise ValueError(f"Payment method must be one of: {', '.join(allowed)}")
        return v
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        allowed = ['pending', 'completed', 'failed', 'reversed', 'cancelled']
        if v not in allowed:
            raise ValueError(f"Payment status must be one of: {', '.join(allowed)}")
        return v


class MarkInvoicePaidRequest(BaseModel):
    """Mark an invoice as paid by creating a payment."""
    payment_date: Optional[str] = Field(None, description="Payment date (defaults to today)")
    payment_method: str = Field("bank_transfer", description="Payment method")
    reference: Optional[str] = Field(None, description="Payment reference")
    notes: Optional[str] = Field(None, description="Payment notes")


class PartialPaymentRequest(BaseModel):
    """Record a partial payment on an invoice."""
    amount_cents: int = Field(..., gt=0, description="Partial payment amount in cents")
    payment_date: Optional[str] = Field(None, description="Payment date (defaults to today)")
    payment_method: str = Field("bank_transfer", description="Payment method")
    reference: Optional[str] = Field(None, description="Payment reference")
    notes: Optional[str] = Field(None, description="Payment notes")


# Response Schemas

class PaymentAllocationResponse(BaseModel):
    """Payment allocation response."""
    id: UUID
    payment_id: UUID
    invoice_id: UUID
    allocated_amount_cents: int
    allocation_date: datetime
    notes: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class PaymentResponse(BaseModel):
    """Payment response with allocations."""
    id: UUID
    administration_id: UUID
    customer_id: Optional[UUID]
    amount_cents: int
    payment_date: datetime
    payment_method: str
    reference: Optional[str]
    bank_transaction_id: Optional[UUID]
    status: str
    notes: Optional[str]
    allocations: List[PaymentAllocationResponse]
    created_at: datetime
    updated_at: datetime
    
    # Computed fields
    allocated_amount_cents: int = Field(0, description="Total allocated amount")
    unallocated_amount_cents: int = Field(0, description="Remaining unallocated amount")
    
    class Config:
        from_attributes = True


class PaymentListResponse(BaseModel):
    """List of payments."""
    payments: List[PaymentResponse]
    total: int
    
    class Config:
        from_attributes = True


class InvoicePaymentSummary(BaseModel):
    """Summary of payments for an invoice."""
    invoice_id: UUID
    invoice_number: str
    invoice_total_cents: int
    total_paid_cents: int
    total_outstanding_cents: int
    is_fully_paid: bool
    payments: List[PaymentResponse]
    
    class Config:
        from_attributes = True
