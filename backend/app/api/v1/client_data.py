"""
Client Data API Endpoints (for Accountants)

Provides accountants with read-only access to client ZZP data:
- Invoices
- Customers
- Expenses
- Time Entries

Uses unified administration_id access pattern to ensure data consistency.
All endpoints respect AccountantClientAssignment scopes and permissions.
"""
from datetime import date
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.zzp import (
    ZZPInvoice,
    ZZPCustomer,
    ZZPExpense,
    ZZPTimeEntry,
)
from app.schemas.zzp import (
    InvoiceResponse,
    InvoiceListResponse,
    CustomerResponse,
    CustomerListResponse,
    ExpenseResponse,
    ExpenseListResponse,
    TimeEntryListResponse,
)
from app.api.v1.deps import CurrentUser, require_approved_mandate_client

router = APIRouter()


def invoice_to_response(invoice: ZZPInvoice) -> InvoiceResponse:
    """Convert invoice model to response schema."""
    from app.schemas.zzp import InvoiceLineResponse
    
    return InvoiceResponse(
        id=invoice.id,
        administration_id=invoice.administration_id,
        customer_id=invoice.customer_id,
        invoice_number=invoice.invoice_number,
        status=invoice.status,
        issue_date=invoice.issue_date.isoformat(),
        due_date=invoice.due_date.isoformat() if invoice.due_date else None,
        seller_company_name=invoice.seller_company_name,
        seller_trading_name=invoice.seller_trading_name,
        seller_address_street=invoice.seller_address_street,
        seller_address_postal_code=invoice.seller_address_postal_code,
        seller_address_city=invoice.seller_address_city,
        seller_address_country=invoice.seller_address_country,
        seller_kvk_number=invoice.seller_kvk_number,
        seller_btw_number=invoice.seller_btw_number,
        seller_iban=invoice.seller_iban,
        seller_email=invoice.seller_email,
        seller_phone=invoice.seller_phone,
        customer_name=invoice.customer_name,
        customer_address_street=invoice.customer_address_street,
        customer_address_postal_code=invoice.customer_address_postal_code,
        customer_address_city=invoice.customer_address_city,
        customer_address_country=invoice.customer_address_country,
        customer_kvk_number=invoice.customer_kvk_number,
        customer_btw_number=invoice.customer_btw_number,
        subtotal_cents=invoice.subtotal_cents,
        vat_total_cents=invoice.vat_total_cents,
        total_cents=invoice.total_cents,
        amount_paid_cents=invoice.amount_paid_cents,
        paid_at=invoice.paid_at,
        notes=invoice.notes,
        lines=[
            InvoiceLineResponse(
                id=line.id,
                invoice_id=line.invoice_id,
                line_number=line.line_number,
                description=line.description,
                quantity=float(line.quantity),
                unit_price_cents=line.unit_price_cents,
                vat_rate=float(line.vat_rate),
                line_total_cents=line.line_total_cents,
                vat_amount_cents=line.vat_amount_cents,
                created_at=line.created_at,
                updated_at=line.updated_at,
            )
            for line in invoice.lines
        ],
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


@router.get("/clients/{client_id}/invoices", response_model=InvoiceListResponse)
async def list_client_invoices(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(None, pattern=r'^(draft|sent|paid|overdue|cancelled)$'),
    customer_id: Optional[UUID] = Query(None),
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
):
    """
    List all invoices for a client (accountant access).
    
    Requires 'invoices' scope in AccountantClientAssignment.
    """
    # Verify access with 'invoices' scope
    administration = await require_approved_mandate_client(
        client_id, current_user, db, required_scope="invoices"
    )
    
    # Build query - ALWAYS filter by administration_id for data isolation
    query = (
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(ZZPInvoice.administration_id == administration.id)
    )
    
    # Apply filters
    if status:
        query = query.where(ZZPInvoice.status == status)
    if customer_id:
        query = query.where(ZZPInvoice.customer_id == customer_id)
    if from_date:
        query = query.where(ZZPInvoice.issue_date >= date.fromisoformat(from_date))
    if to_date:
        query = query.where(ZZPInvoice.issue_date <= date.fromisoformat(to_date))
    
    query = query.order_by(ZZPInvoice.issue_date.desc(), ZZPInvoice.invoice_number.desc())
    
    result = await db.execute(query)
    invoices = result.scalars().all()
    
    return InvoiceListResponse(
        invoices=[invoice_to_response(inv) for inv in invoices],
        total=len(invoices)
    )


@router.get("/clients/{client_id}/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_client_invoice(
    client_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get a specific invoice by ID (accountant access).
    
    Requires 'invoices' scope in AccountantClientAssignment.
    """
    from fastapi import HTTPException
    
    # Verify access with 'invoices' scope
    administration = await require_approved_mandate_client(
        client_id, current_user, db, required_scope="invoices"
    )
    
    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(
            ZZPInvoice.id == invoice_id,
            ZZPInvoice.administration_id == administration.id
        )
    )
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(
            status_code=404,
            detail={"code": "INVOICE_NOT_FOUND", "message": "Factuur niet gevonden."}
        )
    
    return invoice_to_response(invoice)


@router.get("/clients/{client_id}/customers", response_model=CustomerListResponse)
async def list_client_customers(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(None, pattern=r'^(active|inactive)$'),
):
    """
    List all customers for a client (accountant access).
    
    Requires 'customers' scope in AccountantClientAssignment.
    """
    # Verify access with 'customers' scope
    administration = await require_approved_mandate_client(
        client_id, current_user, db, required_scope="customers"
    )
    
    # Build query - ALWAYS filter by administration_id
    query = (
        select(ZZPCustomer)
        .where(ZZPCustomer.administration_id == administration.id)
    )
    
    # Apply filters
    if status:
        query = query.where(ZZPCustomer.status == status)
    
    query = query.order_by(ZZPCustomer.name)
    
    result = await db.execute(query)
    customers = result.scalars().all()
    
    return CustomerListResponse(
        customers=[CustomerResponse.model_validate(c) for c in customers],
        total=len(customers)
    )


@router.get("/clients/{client_id}/expenses", response_model=ExpenseListResponse)
async def list_client_expenses(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
    category: Optional[str] = Query(None),
):
    """
    List all expenses for a client (accountant access).
    
    Requires 'expenses' scope in AccountantClientAssignment.
    """
    # Verify access with 'expenses' scope
    administration = await require_approved_mandate_client(
        client_id, current_user, db, required_scope="expenses"
    )
    
    # Build query - ALWAYS filter by administration_id
    query = (
        select(ZZPExpense)
        .where(ZZPExpense.administration_id == administration.id)
    )
    
    # Apply filters
    if from_date:
        query = query.where(ZZPExpense.expense_date >= date.fromisoformat(from_date))
    if to_date:
        query = query.where(ZZPExpense.expense_date <= date.fromisoformat(to_date))
    if category:
        query = query.where(ZZPExpense.category == category)
    
    query = query.order_by(ZZPExpense.expense_date.desc())
    
    result = await db.execute(query)
    expenses = result.scalars().all()
    
    return ExpenseListResponse(
        expenses=[ExpenseResponse.model_validate(e) for e in expenses],
        total=len(expenses),
        total_amount_cents=sum(e.amount_cents for e in expenses),
        total_vat_cents=sum(e.vat_amount_cents for e in expenses),
    )


@router.get("/clients/{client_id}/hours", response_model=TimeEntryListResponse)
@router.get("/clients/{client_id}/time-entries", response_model=TimeEntryListResponse)
async def list_client_time_entries(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
    billable: Optional[bool] = Query(None),
):
    """
    List all time entries for a client (accountant access).
    
    Requires 'hours' scope in AccountantClientAssignment.
    """
    # Verify access with 'hours' scope
    administration = await require_approved_mandate_client(
        client_id, current_user, db, required_scope="hours"
    )
    
    # Build query - ALWAYS filter by administration_id
    query = (
        select(ZZPTimeEntry)
        .where(ZZPTimeEntry.administration_id == administration.id)
    )
    
    # Apply filters
    if from_date:
        query = query.where(ZZPTimeEntry.entry_date >= date.fromisoformat(from_date))
    if to_date:
        query = query.where(ZZPTimeEntry.entry_date <= date.fromisoformat(to_date))
    if billable is not None:
        query = query.where(ZZPTimeEntry.billable == billable)
    
    query = query.order_by(ZZPTimeEntry.entry_date.desc())
    
    result = await db.execute(query)
    time_entries = result.scalars().all()
    
    return TimeEntryListResponse(
        entries=time_entries,
        total=len(time_entries),
        total_hours=sum((t.hours for t in time_entries), Decimal("0")),
        total_billable_hours=sum((t.hours for t in time_entries if t.billable), Decimal("0")),
        open_entries=sum(1 for t in time_entries if not t.is_invoiced),
        invoiced_entries=sum(1 for t in time_entries if t.is_invoiced),
    )
