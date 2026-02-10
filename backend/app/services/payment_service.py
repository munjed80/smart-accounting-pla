"""
Payment Service

Business logic for payment tracking and reconciliation.
Handles payment creation, allocation, and invoice status updates.
"""
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.payment import ZZPPayment, ZZPPaymentAllocation, PaymentStatus
from app.models.zzp import ZZPInvoice, InvoiceStatus


class PaymentService:
    """Service for managing payments and payment allocations."""
    
    def __init__(self, db: AsyncSession, administration_id: UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def create_payment(
        self,
        amount_cents: int,
        payment_date: datetime,
        customer_id: Optional[UUID] = None,
        payment_method: str = "bank_transfer",
        reference: Optional[str] = None,
        notes: Optional[str] = None,
        bank_transaction_id: Optional[UUID] = None,
    ) -> ZZPPayment:
        """
        Create a new payment record.
        
        Args:
            amount_cents: Payment amount in cents
            payment_date: When the payment was received
            customer_id: Optional customer who made the payment
            payment_method: How the payment was made
            reference: Payment reference or transaction ID
            notes: Additional notes
            bank_transaction_id: Link to bank transaction if from reconciliation
            
        Returns:
            Created payment record
        """
        payment = ZZPPayment(
            administration_id=self.administration_id,
            customer_id=customer_id,
            amount_cents=amount_cents,
            payment_date=payment_date,
            payment_method=payment_method,
            reference=reference,
            notes=notes,
            bank_transaction_id=bank_transaction_id,
            status=PaymentStatus.COMPLETED.value,
        )
        
        self.db.add(payment)
        await self.db.flush()
        
        return payment
    
    async def allocate_payment_to_invoice(
        self,
        payment_id: UUID,
        invoice_id: UUID,
        allocated_amount_cents: int,
        notes: Optional[str] = None,
    ) -> ZZPPaymentAllocation:
        """
        Allocate a payment (or part of it) to a specific invoice.
        
        Args:
            payment_id: Payment to allocate
            invoice_id: Invoice to pay
            allocated_amount_cents: Amount to allocate in cents
            notes: Allocation notes
            
        Returns:
            Created allocation record
            
        Raises:
            ValueError: If allocation exceeds available payment amount or invoice balance
        """
        # Verify payment exists and belongs to this administration
        payment_result = await self.db.execute(
            select(ZZPPayment)
            .options(selectinload(ZZPPayment.allocations))
            .where(
                ZZPPayment.id == payment_id,
                ZZPPayment.administration_id == self.administration_id
            )
        )
        payment = payment_result.scalar_one_or_none()
        
        if not payment:
            raise ValueError("Payment not found")
        
        # Calculate allocated amount
        total_allocated = sum(a.allocated_amount_cents for a in payment.allocations)
        available_amount = payment.amount_cents - total_allocated
        
        if allocated_amount_cents > available_amount:
            raise ValueError(
                f"Allocation amount ({allocated_amount_cents}) exceeds available "
                f"payment amount ({available_amount})"
            )
        
        # Verify invoice exists and belongs to this administration
        invoice_result = await self.db.execute(
            select(ZZPInvoice)
            .where(
                ZZPInvoice.id == invoice_id,
                ZZPInvoice.administration_id == self.administration_id
            )
        )
        invoice = invoice_result.scalar_one_or_none()
        
        if not invoice:
            raise ValueError("Invoice not found")
        
        # Calculate invoice outstanding amount
        invoice_paid = await self.get_invoice_paid_amount(invoice_id)
        invoice_outstanding = invoice.total_cents - invoice_paid
        
        if allocated_amount_cents > invoice_outstanding:
            raise ValueError(
                f"Allocation amount ({allocated_amount_cents}) exceeds invoice "
                f"outstanding amount ({invoice_outstanding})"
            )
        
        # Create allocation
        allocation = ZZPPaymentAllocation(
            payment_id=payment_id,
            invoice_id=invoice_id,
            allocated_amount_cents=allocated_amount_cents,
            notes=notes,
        )
        
        self.db.add(allocation)
        await self.db.flush()
        
        # Update invoice payment tracking
        await self.update_invoice_payment_status(invoice_id)
        
        return allocation
    
    async def get_invoice_paid_amount(self, invoice_id: UUID) -> int:
        """
        Calculate total paid amount for an invoice from allocations.
        
        Args:
            invoice_id: Invoice to calculate for
            
        Returns:
            Total paid amount in cents
        """
        result = await self.db.execute(
            select(func.coalesce(func.sum(ZZPPaymentAllocation.allocated_amount_cents), 0))
            .join(ZZPPayment)
            .where(
                ZZPPaymentAllocation.invoice_id == invoice_id,
                ZZPPayment.status == PaymentStatus.COMPLETED.value
            )
        )
        
        return result.scalar() or 0
    
    async def update_invoice_payment_status(self, invoice_id: UUID) -> None:
        """
        Update invoice payment status and amount_paid_cents based on allocations.
        
        Also updates invoice status to 'paid' if fully paid.
        
        Args:
            invoice_id: Invoice to update
        """
        # Get invoice
        invoice_result = await self.db.execute(
            select(ZZPInvoice).where(ZZPInvoice.id == invoice_id)
        )
        invoice = invoice_result.scalar_one_or_none()
        
        if not invoice:
            return
        
        # Calculate total paid amount
        total_paid = await self.get_invoice_paid_amount(invoice_id)
        
        # Update invoice
        invoice.amount_paid_cents = total_paid
        
        # Update status based on payment
        if total_paid >= invoice.total_cents:
            # Fully paid
            invoice.status = InvoiceStatus.PAID.value
            if not invoice.paid_at:
                invoice.paid_at = datetime.now(timezone.utc)
        elif total_paid > 0:
            # Partially paid - keep current status (sent/overdue) but track payment
            # Don't change status to "paid" until fully paid
            pass
        else:
            # No payment - if status was paid, change back to sent
            if invoice.status == InvoiceStatus.PAID.value:
                invoice.status = InvoiceStatus.SENT.value
                invoice.paid_at = None
        
        await self.db.flush()
    
    async def mark_invoice_paid(
        self,
        invoice_id: UUID,
        payment_date: Optional[datetime] = None,
        payment_method: str = "bank_transfer",
        reference: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Tuple[ZZPPayment, ZZPPaymentAllocation]:
        """
        Mark an invoice as paid by creating a payment and allocation.
        
        Creates a payment for the full invoice amount and allocates it.
        
        Args:
            invoice_id: Invoice to mark as paid
            payment_date: When payment was received (defaults to now)
            payment_method: How payment was made
            reference: Payment reference
            notes: Payment notes
            
        Returns:
            Tuple of (payment, allocation)
        """
        # Get invoice
        invoice_result = await self.db.execute(
            select(ZZPInvoice)
            .where(
                ZZPInvoice.id == invoice_id,
                ZZPInvoice.administration_id == self.administration_id
            )
        )
        invoice = invoice_result.scalar_one_or_none()
        
        if not invoice:
            raise ValueError("Invoice not found")
        
        # Calculate outstanding amount
        total_paid = await self.get_invoice_paid_amount(invoice_id)
        outstanding_amount = invoice.total_cents - total_paid
        
        if outstanding_amount <= 0:
            raise ValueError("Invoice is already fully paid")
        
        # Create payment for outstanding amount
        payment = await self.create_payment(
            amount_cents=outstanding_amount,
            payment_date=payment_date or datetime.now(timezone.utc),
            customer_id=invoice.customer_id,
            payment_method=payment_method,
            reference=reference or f"Payment for {invoice.invoice_number}",
            notes=notes,
        )
        
        # Allocate full amount to invoice
        allocation = await self.allocate_payment_to_invoice(
            payment_id=payment.id,
            invoice_id=invoice_id,
            allocated_amount_cents=outstanding_amount,
            notes=f"Full payment for invoice {invoice.invoice_number}",
        )
        
        return payment, allocation
    
    async def mark_invoice_unpaid(self, invoice_id: UUID) -> None:
        """
        Mark an invoice as unpaid by removing all payment allocations.
        
        This reverses all payments allocated to the invoice.
        
        Args:
            invoice_id: Invoice to mark as unpaid
        """
        # Get all allocations for this invoice
        result = await self.db.execute(
            select(ZZPPaymentAllocation)
            .where(ZZPPaymentAllocation.invoice_id == invoice_id)
        )
        allocations = result.scalars().all()
        
        # Delete all allocations
        for allocation in allocations:
            await self.db.delete(allocation)
        
        await self.db.flush()
        
        # Update invoice status
        await self.update_invoice_payment_status(invoice_id)
    
    async def record_partial_payment(
        self,
        invoice_id: UUID,
        amount_cents: int,
        payment_date: Optional[datetime] = None,
        payment_method: str = "bank_transfer",
        reference: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Tuple[ZZPPayment, ZZPPaymentAllocation]:
        """
        Record a partial payment on an invoice.
        
        Args:
            invoice_id: Invoice to pay
            amount_cents: Partial payment amount
            payment_date: When payment was received
            payment_method: How payment was made
            reference: Payment reference
            notes: Payment notes
            
        Returns:
            Tuple of (payment, allocation)
        """
        # Get invoice
        invoice_result = await self.db.execute(
            select(ZZPInvoice)
            .where(
                ZZPInvoice.id == invoice_id,
                ZZPInvoice.administration_id == self.administration_id
            )
        )
        invoice = invoice_result.scalar_one_or_none()
        
        if not invoice:
            raise ValueError("Invoice not found")
        
        # Validate amount
        total_paid = await self.get_invoice_paid_amount(invoice_id)
        outstanding_amount = invoice.total_cents - total_paid
        
        if amount_cents > outstanding_amount:
            raise ValueError(
                f"Payment amount ({amount_cents}) exceeds outstanding amount ({outstanding_amount})"
            )
        
        # Create payment
        payment = await self.create_payment(
            amount_cents=amount_cents,
            payment_date=payment_date or datetime.now(timezone.utc),
            customer_id=invoice.customer_id,
            payment_method=payment_method,
            reference=reference or f"Partial payment for {invoice.invoice_number}",
            notes=notes,
        )
        
        # Allocate to invoice
        allocation = await self.allocate_payment_to_invoice(
            payment_id=payment.id,
            invoice_id=invoice_id,
            allocated_amount_cents=amount_cents,
            notes=f"Partial payment for invoice {invoice.invoice_number}",
        )
        
        return payment, allocation
    
    async def get_invoice_payment_summary(self, invoice_id: UUID) -> dict:
        """
        Get payment summary for an invoice.
        
        Args:
            invoice_id: Invoice to get summary for
            
        Returns:
            Dictionary with payment summary
        """
        # Get invoice
        invoice_result = await self.db.execute(
            select(ZZPInvoice)
            .where(
                ZZPInvoice.id == invoice_id,
                ZZPInvoice.administration_id == self.administration_id
            )
        )
        invoice = invoice_result.scalar_one_or_none()
        
        if not invoice:
            raise ValueError("Invoice not found")
        
        # Get all payments for this invoice
        payments_result = await self.db.execute(
            select(ZZPPayment)
            .join(ZZPPaymentAllocation)
            .options(selectinload(ZZPPayment.allocations))
            .where(
                ZZPPaymentAllocation.invoice_id == invoice_id,
                ZZPPayment.status == PaymentStatus.COMPLETED.value
            )
            .order_by(ZZPPayment.payment_date.desc())
        )
        payments = payments_result.scalars().unique().all()
        
        # Calculate totals
        total_paid = await self.get_invoice_paid_amount(invoice_id)
        outstanding = invoice.total_cents - total_paid
        
        return {
            "invoice_id": invoice_id,
            "invoice_number": invoice.invoice_number,
            "invoice_total_cents": invoice.total_cents,
            "total_paid_cents": total_paid,
            "total_outstanding_cents": outstanding,
            "is_fully_paid": total_paid >= invoice.total_cents,
            "payments": payments,
        }
