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
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.zzp import (
    ZZPInvoice,
    ZZPCustomer,
    ZZPExpense,
    ZZPTimeEntry,
)
from app.models.financial_commitment import FinancialCommitment, CommitmentType, RecurringFrequency
from app.schemas.zzp import (
    InvoiceResponse,
    InvoiceListResponse,
    CustomerResponse,
    CustomerListResponse,
    ExpenseResponse,
    ExpenseListResponse,
    TimeEntryListResponse,
)
from app.schemas.commitments import AccountantCommitmentsResponse, AccountantCommitmentItemResponse, CommitmentAlert
from app.api.v1.deps import CurrentUser, require_approved_mandate_client
from app.api.v1.zzp_commitments import to_response, compute_next_due_date

router = APIRouter()


def _monthly_normalized_cents(item: FinancialCommitment) -> int:
    if item.type == CommitmentType.SUBSCRIPTION and item.recurring_frequency == RecurringFrequency.YEARLY:
        return item.amount_cents // 12
    return item.monthly_payment_cents or item.amount_cents


def _compute_alerts(items: list[FinancialCommitment], threshold_cents: int, today: date) -> list[CommitmentAlert]:
    alerts: list[CommitmentAlert] = []
    for item in items:
        due_date = compute_next_due_date(item, today=today)
        if item.type == CommitmentType.SUBSCRIPTION and due_date and (due_date - today).days <= 14:
            alerts.append(
                CommitmentAlert(
                    code="subscription_renewal",
                    severity="warning",
                    message=f"Abonnement '{item.name}' verlengt binnen 14 dagen.",
                )
            )
        if item.type in {CommitmentType.LEASE, CommitmentType.LOAN} and item.end_date and 0 <= (item.end_date - today).days <= 30:
            alerts.append(
                CommitmentAlert(
                    code="lease_loan_ending",
                    severity="warning",
                    message=f"{item.type.value.title()} '{item.name}' eindigt binnen 30 dagen.",
                )
            )

    monthly_total = sum(_monthly_normalized_cents(item) for item in items)
    if monthly_total > threshold_cents:
        alerts.append(
            CommitmentAlert(
                code="monthly_threshold",
                severity="warning",
                message="Maandelijkse vaste verplichtingen overschrijden de ingestelde drempel.",
            )
        )
    return alerts


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
    commitment_id: Optional[UUID] = Query(None),
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
    if commitment_id:
        query = query.where(ZZPExpense.commitment_id == commitment_id)
    
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


@router.get("/clients/{client_id}/commitments", response_model=AccountantCommitmentsResponse)
async def list_client_commitments(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    type: Optional[str] = Query(None, pattern=r'^(lease|loan|subscription)$'),
    status: Optional[str] = Query(None, pattern=r'^(active|paused|ended)$'),
    period_key: Optional[str] = Query(None, pattern=r'^\d{4}-(0[1-9]|1[0-2])$'),
):
    """
    List commitments and commitment summary for a client (accountant access, read-only).

    Requires an approved mandate for the client.
    """
    administration = await require_approved_mandate_client(client_id, current_user, db)

    query = (
        select(FinancialCommitment)
        .where(FinancialCommitment.administration_id == administration.id)
        .order_by(FinancialCommitment.created_at.desc())
    )
    if type:
        query = query.where(FinancialCommitment.type == type)

    result = await db.execute(query)
    commitments = result.scalars().all()
    today = date.today()
    next_30 = today + timedelta(days=30)

    linked_counts_subquery = (
        select(
            ZZPExpense.commitment_id.label("commitment_id"),
            func.count(ZZPExpense.id).label("linked_expenses_count"),
        )
        .where(ZZPExpense.administration_id == administration.id)
        .where(ZZPExpense.commitment_id.is_not(None))
        .group_by(ZZPExpense.commitment_id)
        .subquery()
    )

    target_period_key = period_key or today.strftime("%Y-%m")
    period_counts_subquery = (
        select(
            ZZPExpense.commitment_id.label("commitment_id"),
            func.count(ZZPExpense.id).label("period_expenses_count"),
        )
        .where(ZZPExpense.administration_id == administration.id)
        .where(ZZPExpense.commitment_id.is_not(None))
        .where(ZZPExpense.period_key == target_period_key)
        .group_by(ZZPExpense.commitment_id)
        .subquery()
    )

    counts_query = (
        select(
            FinancialCommitment.id,
            func.coalesce(linked_counts_subquery.c.linked_expenses_count, 0),
            func.coalesce(period_counts_subquery.c.period_expenses_count, 0),
        )
        .outerjoin(linked_counts_subquery, linked_counts_subquery.c.commitment_id == FinancialCommitment.id)
        .outerjoin(period_counts_subquery, period_counts_subquery.c.commitment_id == FinancialCommitment.id)
        .where(FinancialCommitment.administration_id == administration.id)
    )
    counts_result = await db.execute(counts_query)
    commitment_counts = {
        str(commitment_id): {
            "linked": int(linked_count),
            "period": int(period_count),
        }
        for commitment_id, linked_count, period_count in counts_result.all()
    }

    response_items: list[AccountantCommitmentItemResponse] = []
    active_items: list[FinancialCommitment] = []
    upcoming_30_days_total_cents = 0

    for item in commitments:
        base_response = to_response(item, today=today)
        if status and base_response.status != status:
            continue

        if base_response.status == "active":
            active_items.append(item)
            due_date = base_response.next_due_date
            if due_date and due_date <= next_30:
                upcoming_30_days_total_cents += _monthly_normalized_cents(item)

        count_data = commitment_counts.get(str(item.id), {"linked": 0, "period": 0})
        response_items.append(
            AccountantCommitmentItemResponse(
                **base_response.model_dump(),
                linked_expenses_count=count_data["linked"],
                has_expense_in_period=count_data["period"] > 0,
            )
        )

    sorted_items = sorted(response_items, key=lambda commitment: commitment.next_due_date or date.max)
    alerts = _compute_alerts(active_items, threshold_cents=150000, today=today)

    missing_this_period_count = sum(
        1
        for commitment in sorted_items
        if commitment.status == "active" and not commitment.has_expense_in_period
    )

    return AccountantCommitmentsResponse(
        monthly_total_cents=sum(_monthly_normalized_cents(item) for item in active_items),
        upcoming_30_days_total_cents=upcoming_30_days_total_cents,
        warning_count=len([alert for alert in alerts if alert.severity == "warning"]),
        cashflow_stress_label="Onvoldoende data",
        missing_this_period_count=missing_this_period_count,
        commitments=sorted_items[:10],
        total=len(sorted_items),
    )
