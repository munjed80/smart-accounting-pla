"""
ZZP Dashboard API Endpoint

Provides aggregated dashboard metrics specifically for ZZP users.
All data is scoped to the user's administration_id.

Metrics provided:
- Open invoices (sent/overdue) total + count
- Paid invoices this month
- Expenses this month
- Hours this week + billable hours
- BTW (VAT) estimate for current quarter
- Actions needed (draft invoices, missing profile, overdue invoices)
- Monthly invoice summary (sent/paid/open totals grouped by month)
"""

from app.services.zzp_administration import get_user_administration
from app.services.money import round_cents
from app.services.zzp_vat_calculation import calculate_vat
from app.services.dashboard_metrics import outstanding_cents, receipt_rows, receipt_months
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_, case, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import (
    ZZPInvoice, 
    ZZPExpense, 
    ZZPTimeEntry, 
    BusinessProfile,
    InvoiceStatus,
)
from app.models.payment import ZZPPaymentAllocation, ZZPPayment
from app.models.zzp import ZZPDocument, ZZPDocStatus
from app.models.administration import Administration
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


# ============================================================================
# Dashboard Response Schema
# ============================================================================

class ActionItem(BaseModel):
    """An action item requiring ZZP user attention."""
    id: str
    type: str  # 'draft_invoice', 'overdue_invoice', 'missing_profile', 'incomplete_profile', 'btw_deadline', 'uncategorized_expense', 'missing_btw_on_expense'
    title: str
    description: str
    severity: str  # 'error', 'warning', 'info'
    route: Optional[str] = None
    related_id: Optional[str] = None
    count: Optional[int] = None
    amount_cents: Optional[int] = None


class InvoiceStats(BaseModel):
    """Invoice statistics."""
    open_count: int = Field(0, description="Number of open invoices (sent/overdue)")
    open_total_cents: int = Field(0, description="Total amount of open invoices in cents")
    draft_count: int = Field(0, description="Number of draft invoices")
    overdue_count: int = Field(0, description="Number of overdue invoices")
    overdue_total_cents: int = Field(0, description="Total amount of overdue invoices in cents")
    paid_this_month_count: int = Field(0, description="Registered receipts this month, including legacy invoice registrations")
    paid_this_month_cents: int = Field(0, description="Actual registered receipt amounts by payment date in cents")


class ExpenseStats(BaseModel):
    """Expense statistics."""
    this_month_count: int = Field(0, description="Number of expenses this month")
    this_month_total_cents: int = Field(0, description="Total expenses this month in cents")
    this_month_vat_cents: int = Field(0, description="Total VAT on expenses this month in cents")


class TimeStats(BaseModel):
    """Time tracking statistics."""
    this_week_hours: float = Field(0.0, description="Total hours logged this week")
    this_week_billable_hours: float = Field(0.0, description="Billable hours logged this week")
    this_week_value_cents: int = Field(0, description="Estimated value of billable hours in cents")


class BTWStats(BaseModel):
    """BTW (VAT) estimation statistics for current quarter."""
    quarter: str = Field(..., description="Current quarter (e.g., 'Q1 2026')")
    quarter_start: str = Field(..., description="Quarter start date")
    quarter_end: str = Field(..., description="Quarter end date")
    deadline: str = Field(..., description="BTW filing deadline")
    days_until_deadline: int = Field(0, description="Days until filing deadline")
    
    # Collected VAT (from invoices)
    vat_collected_cents: int = Field(0, description="VAT collected from paid invoices this quarter")
    
    # Deductible VAT (from expenses)
    vat_deductible_cents: int = Field(0, description="VAT paid on expenses this quarter (deductible)")
    
    basis: str = 'unconfirmed'
    policy_confirmed: bool = False
    net_vat_cents: int = 0
    review_required: bool = False

    # Net VAT payable
    vat_payable_cents: int = Field(0, description="Estimated VAT to pay (collected - deductible)")


class ZZPDashboardResponse(BaseModel):
    """Complete ZZP dashboard data."""
    administration_id: UUID
    invoices: InvoiceStats
    expenses: ExpenseStats
    time: TimeStats
    btw: BTWStats
    actions: List[ActionItem] = Field(default_factory=list, description="Actions requiring attention")
    profile_complete: bool = Field(False, description="Whether business profile is complete")
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Metric calculation notes for transparency
    notes: dict = Field(default_factory=dict, description="Notes on how metrics were calculated")


# ============================================================================
# Helper Functions
# ============================================================================


def get_week_bounds(target_date: date) -> tuple[date, date]:
    """Get Monday and Sunday of the week containing the target date."""
    monday = target_date - timedelta(days=target_date.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def get_quarter_info(target_date: date) -> tuple[str, date, date, date]:
    """
    Get quarter information for a date.
    Returns: (quarter_label, quarter_start, quarter_end, btw_deadline)
    """
    quarter = (target_date.month - 1) // 3 + 1
    year = target_date.year
    
    # Quarter date range
    quarter_start_month = (quarter - 1) * 3 + 1
    quarter_start = date(year, quarter_start_month, 1)
    
    if quarter == 4:
        quarter_end = date(year, 12, 31)
    else:
        next_quarter_month = quarter_start_month + 3
        quarter_end = date(year, next_quarter_month, 1) - timedelta(days=1)
    
    # BTW deadline: end of month after quarter end
    # Q1 (Jan-Mar) -> April 30
    # Q2 (Apr-Jun) -> July 31
    # Q3 (Jul-Sep) -> October 31
    # Q4 (Oct-Dec) -> January 31 (next year)
    if quarter == 4:
        btw_deadline = date(year + 1, 1, 31)
    elif quarter == 1:
        btw_deadline = date(year, 4, 30)
    elif quarter == 2:
        btw_deadline = date(year, 7, 31)
    else:  # quarter == 3
        btw_deadline = date(year, 10, 31)
    
    quarter_label = f"Q{quarter} {year}"
    return quarter_label, quarter_start, quarter_end, btw_deadline


# ============================================================================
# Dashboard Endpoint
# ============================================================================

@router.get(
    "/dashboard",
    response_model=ZZPDashboardResponse,
    summary="Get ZZP dashboard metrics",
    description="""
    Returns aggregated dashboard metrics for the ZZP user's administration.
    
    All metrics are scoped to the user's current administration_id.
    
    **Metrics provided:**
    - Open invoices (sent + overdue) total and count
    - Paid invoices this month
    - Expenses this month
    - Hours this week (total and billable)
    - BTW estimate for current quarter
    - Actions requiring attention
    
    **Data calculation notes:**
    - 'This month' = calendar month of current date
    - 'This week' = Monday through today
    - 'BTW estimate' = VAT collected (from paid invoices) - VAT deductible (from expenses)
    """
)
async def get_zzp_dashboard(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ZZPDashboardResponse:
    """Get aggregated dashboard data for the ZZP user."""
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    admin_id = administration.id
    today = date.today()
    now = datetime.now(timezone.utc)
    
    # Date bounds
    month_start = date(today.year, today.month, 1)
    week_start, week_end = get_week_bounds(today)
    quarter_label, quarter_start, quarter_end, btw_deadline = get_quarter_info(today)
    
    # ========================================================================
    # Invoice Statistics
    # ========================================================================
    
    # Aggregate in SQL instead of materializing every historical record.
    def total_when(condition, value=1):
        return func.coalesce(func.sum(case((condition, value), else_=0)), 0)

    remaining = outstanding_cents()
    is_open = and_(ZZPInvoice.status.in_(['sent', 'overdue']), remaining > 0)
    is_overdue = and_(is_open, or_(ZZPInvoice.status == 'overdue', ZZPInvoice.due_date < today))
    invoice_totals = (await db.execute(select(
        total_when(is_open).label('open_count'), total_when(is_open, remaining).label('open_total_cents'),
        total_when(ZZPInvoice.status == 'draft').label('draft_count'),
        total_when(ZZPInvoice.status == 'draft', ZZPInvoice.total_cents).label('draft_total_cents'),
        total_when(is_overdue).label('overdue_count'), total_when(is_overdue, remaining).label('overdue_total_cents'),
    ).where(ZZPInvoice.administration_id == admin_id))).mappings().one()
    invoice_stats = InvoiceStats(**{key: invoice_totals[key] for key in InvoiceStats.model_fields if key in invoice_totals})
    receipts = await receipt_months(db, admin_id, month_start, today)
    received = receipts.get(month_start.strftime('%Y-%m'), {'amount': 0, 'count': 0})
    invoice_stats.paid_this_month_cents = received['amount']
    invoice_stats.paid_this_month_count = received['count']
    vat = await calculate_vat(db, admin_id, quarter_start, quarter_end)
    vat_collected, vat_deductible = vat.output_vat, vat.input_vat
    month_expense = and_(ZZPExpense.expense_date >= month_start, ZZPExpense.expense_date <= today)
    expense_totals = (await db.execute(select(
        total_when(month_expense).label('this_month_count'),
        total_when(month_expense, ZZPExpense.amount_cents).label('this_month_total_cents'),
        total_when(month_expense, ZZPExpense.vat_amount_cents).label('this_month_vat_cents'),
        total_when(or_(ZZPExpense.category.is_(None), func.trim(ZZPExpense.category) == '')).label('uncategorized'),
    ).where(ZZPExpense.administration_id == admin_id))).mappings().one()
    expense_stats = ExpenseStats(**{key: expense_totals[key] for key in ExpenseStats.model_fields})


    # ========================================================================
    # Time Statistics
    # ========================================================================
    
    effective_rate = case((ZZPTimeEntry.hourly_rate_cents > 0, ZZPTimeEntry.hourly_rate_cents),
        else_=func.coalesce(ZZPTimeEntry.hourly_rate * 100, 0))
    total_hours, billable_hours, value = (await db.execute(select(
        func.coalesce(func.sum(ZZPTimeEntry.hours), 0),
        func.coalesce(func.sum(case((ZZPTimeEntry.billable.is_(True), ZZPTimeEntry.hours), else_=0)), 0),
        func.coalesce(func.sum(case((ZZPTimeEntry.billable.is_(True), ZZPTimeEntry.hours * effective_rate), else_=0)), 0),
    ).where(ZZPTimeEntry.administration_id == admin_id,
        ZZPTimeEntry.entry_date >= week_start, ZZPTimeEntry.entry_date <= min(week_end, today)))).one()
    billable_value = round_cents(Decimal(str(value)))
    time_stats = TimeStats(
        this_week_hours=round(float(total_hours), 1),
        this_week_billable_hours=round(float(billable_hours), 1),
        this_week_value_cents=billable_value,
    )
    
    # ========================================================================
    # BTW Statistics
    # ========================================================================
    
    days_until_deadline = (btw_deadline - today).days
    
    btw_stats = BTWStats(
        quarter=quarter_label,
        quarter_start=quarter_start.isoformat(),
        quarter_end=quarter_end.isoformat(),
        deadline=btw_deadline.isoformat(),
        days_until_deadline=max(0, days_until_deadline),
        vat_collected_cents=vat_collected,
        vat_deductible_cents=vat_deductible,
        vat_payable_cents=max(0, vat_collected - vat_deductible),
        net_vat_cents=vat_collected - vat_deductible,
        basis=vat.basis, policy_confirmed=vat.policy_confirmed,
        review_required=bool(vat.issues),
    )
    
    # ========================================================================
    # Business Profile Check
    # ========================================================================
    
    profile_result = await db.execute(
        select(BusinessProfile)
        .where(BusinessProfile.administration_id == admin_id)
    )
    profile = profile_result.scalar_one_or_none()
    
    profile_complete = False
    if profile:
        # Check required fields for complete profile
        profile_complete = all([
            profile.company_name,
            profile.kvk_number,
            profile.btw_number,
            profile.iban,
        ])
    
    # ========================================================================
    # Actions Needed
    # ========================================================================
    
    actions: List[ActionItem] = []
    
    # Missing profile action
    if not profile:
        actions.append(ActionItem(
            id="missing-profile",
            type="missing_profile",
            title="Bedrijfsprofiel ontbreekt",
            description="Vul je bedrijfsgegevens in om facturen te kunnen versturen.",
            severity="error",
            route="/settings",
        ))
    elif not profile_complete:
        missing_fields = []
        if not profile.company_name:
            missing_fields.append("bedrijfsnaam")
        if not profile.kvk_number:
            missing_fields.append("KVK-nummer")
        if not profile.btw_number:
            missing_fields.append("BTW-nummer")
        if not profile.iban:
            missing_fields.append("IBAN")
        
        actions.append(ActionItem(
            id="incomplete-profile",
            type="incomplete_profile",
            title="Bedrijfsprofiel incompleet",
            description=f"Ontbrekende gegevens: {', '.join(missing_fields)}",
            severity="warning",
            route="/settings",
        ))
    
    # Draft invoices action
    if invoice_stats.draft_count > 0:
        draft_total_cents = invoice_totals['draft_total_cents']
        actions.append(ActionItem(
            id="draft-invoices",
            type="draft_invoice",
            title=f"{invoice_stats.draft_count} conceptfactuur{'en' if invoice_stats.draft_count > 1 else ''} wachten",
            description="Je hebt conceptfacturen die nog verstuurd moeten worden.",
            severity="info",
            route="/zzp/invoices?status=draft",
            count=invoice_stats.draft_count,
            amount_cents=draft_total_cents,
        ))
    
    # Overdue invoices action
    if invoice_stats.overdue_count > 0:
        overdue_total_cents = invoice_stats.overdue_total_cents
        total_overdue = overdue_total_cents / 100
        actions.append(ActionItem(
            id="overdue-invoices",
            type="overdue_invoice",
            title=f"{invoice_stats.overdue_count} factuur{'en' if invoice_stats.overdue_count > 1 else ''} te laat",
            description=f"€{total_overdue:,.2f} aan openstaande facturen is over de vervaldatum.",
            severity="error",
            route="/zzp/invoices?status=overdue",
            count=invoice_stats.overdue_count,
            amount_cents=overdue_total_cents,
        ))
    
    # BTW deadline warning (30 days)
    if 0 < days_until_deadline <= 30:
        severity = "warning" if days_until_deadline <= 14 else "info"
        actions.append(ActionItem(
            id="btw-deadline",
            type="btw_deadline",
            title=f"BTW-aangifte {quarter_label} deadline: {btw_deadline.strftime('%d-%m-%Y')}",
            description=f"Nog {days_until_deadline} dag{'en' if days_until_deadline != 1 else ''} tot de deadline.",
            severity=severity,
            route="/zzp/belastinghulp/btw",
        ))
    
    # Uncategorized expenses action
    uncategorized_count = expense_totals['uncategorized']
    if uncategorized_count > 0:
        actions.append(ActionItem(
            id="uncategorized-expenses",
            type="uncategorized_expense",
            title=f"{uncategorized_count} bonn{'en' if uncategorized_count > 1 else ''} zonder categorie",
            description="Categoriseer je uitgaven voor een beter overzicht.",
            severity="warning",
            route="/zzp/expenses",
            count=uncategorized_count,
        ))
    
    unbilled_hours, unbilled_value = (await db.execute(select(
        func.coalesce(func.sum(ZZPTimeEntry.hours), 0),
        func.coalesce(func.sum(ZZPTimeEntry.hours * effective_rate), 0),
    ).where(ZZPTimeEntry.administration_id == admin_id, ZZPTimeEntry.billable.is_(True),
        ZZPTimeEntry.is_invoiced.is_(False), ZZPTimeEntry.invoice_id.is_(None),
        ZZPTimeEntry.entry_date <= today))).one()
    if unbilled_hours > 0:
        actions.append(ActionItem(id='unbilled-hours', type='unbilled_hours', severity='info',
            title='Gewerkte uren nog niet gefactureerd', description=f'{unbilled_hours:g} uur staat klaar om te factureren.',
            amount_cents=round_cents(Decimal(str(unbilled_value))), route='/zzp/time'))
    pending_documents = await db.scalar(select(func.count(ZZPDocument.id)).where(
        ZZPDocument.administration_id == admin_id, ZZPDocument.status.in_([ZZPDocStatus.NEW, ZZPDocStatus.REVIEW, ZZPDocStatus.FAILED])))
    if pending_documents:
        actions.append(ActionItem(id='review-documents', type='review_documents', severity='warning',
            title='Documenten om na te kijken', description='Controleer je uploads en verwerk ze in je administratie.',
            count=pending_documents, route='/zzp/documents'))
    actions.sort(key=lambda item: ({'error': 0, 'warning': 1, 'info': 2}[item.severity], item.id))

    # ========================================================================
    # Build Response
    # ========================================================================
    
    notes = {
        "this_month_range": f"{month_start.isoformat()} tot {today.isoformat()}",
        "this_week_range": f"{week_start.isoformat()} tot {min(week_end, today).isoformat()}",
        "this_quarter_range": f"{quarter_start.isoformat()} tot {quarter_end.isoformat()}",
        "btw_calculation": f"Schatting volgens BTW-overzicht: {vat.basis}; controleer de fiscale aandachtspunten.",
        "receipts_basis": "Geregistreerde betalingen op betaaldatum, met historische betaalregistraties; geen live banksaldo.",
        "overdue_definition": "Facturen met status 'verstuurd' waarvan de vervaldatum is verstreken",
    }
    
    return ZZPDashboardResponse(
        administration_id=admin_id,
        invoices=invoice_stats,
        expenses=expense_stats,
        time=time_stats,
        btw=btw_stats,
        actions=actions,
        profile_complete=profile_complete,
        generated_at=now,
        notes=notes,
    )


# ============================================================================
# Dashboard Actions Endpoint (standalone)
# ============================================================================

class DashboardActionsResponse(BaseModel):
    """Standalone response for dashboard action items."""
    actions: List[ActionItem]
    count: int = Field(0, description="Total number of action items")
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@router.get(
    "/dashboard/actions",
    response_model=DashboardActionsResponse,
    summary="Get ZZP dashboard action items",
    description="""
    Returns a list of action items that require the ZZP user's attention.

    **Action types:**
    - `overdue_invoice`: Invoices past their due date
    - `uncategorized_expense`: Expenses without a category
    - `draft_invoice`: Draft invoices not yet sent
    - `btw_deadline`: BTW filing deadline approaching (within 30 days)
    - `unbilled_hours`: Worked billable hours not yet invoiced
    - `review_documents`: Uploads requiring review
    - `missing_profile` / `incomplete_profile`: Business profile issues

    Each action includes a `route` field for navigation and optional `count` / `amount_cents`.
    """,
)
async def get_zzp_dashboard_actions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DashboardActionsResponse:
    """Return the same attention queue as the dashboard."""
    overview = await get_zzp_dashboard(current_user, db)
    return DashboardActionsResponse(actions=overview.actions, count=len(overview.actions), generated_at=overview.generated_at)


# ============================================================================
# Monthly Invoice Summary
# ============================================================================

DUTCH_MONTHS = [
    "Januari", "Februari", "Maart", "April", "Mei", "Juni",
    "Juli", "Augustus", "September", "Oktober", "November", "December",
]


def dutch_month_label(year: int, month: int) -> str:
    """Return a Dutch month label, e.g. 'Maart 2026'."""
    return f"{DUTCH_MONTHS[month - 1]} {year}"


class MonthlyInvoiceSummary(BaseModel):
    """Monthly invoice aggregation for a single month."""
    month_key: str = Field(..., description="Month identifier, e.g. '2026-03'")
    month_label: str = Field(..., description="Human-readable Dutch month label, e.g. 'Maart 2026'")
    sent_total: int = Field(0, description="Total cents of all non-draft/non-cancelled invoices issued this month")
    paid_total: int = Field(0, description="Total cents of paid invoices issued this month")
    open_total: int = Field(0, description="Total cents of open (sent/overdue) invoices issued this month")
    received_total: int = 0
    received_count: int = 0
    sent_count: int = Field(0, description="Number of non-draft/non-cancelled invoices issued this month")
    paid_count: int = Field(0, description="Number of paid invoices issued this month")
    open_count: int = Field(0, description="Number of open (sent/overdue) invoices issued this month")


class MonthlyInvoicesResponse(BaseModel):
    """Response wrapper for monthly invoice summaries."""
    administration_id: UUID
    months: List[MonthlyInvoiceSummary]
    period: str = Field(..., description="Requested period: this_month | last_6_months | this_year")


@router.get(
    "/dashboard/monthly-invoices",
    response_model=MonthlyInvoicesResponse,
    summary="Get monthly invoice summary",
    description="""
    Returns monthly aggregated invoice totals for the ZZP user.

    Invoices are grouped by **issue_date** month.

    **Metrics per month:**
    - `sent_total` / `sent_count`: All invoices with a non-draft, non-cancelled status
    - `paid_total` / `paid_count`: Invoices with status *paid*
    - `open_total` / `open_count`: Invoices with status *sent* or *overdue*

    **Period options:**
    - `this_month`: Only the current calendar month
    - `last_6_months`: The 6 most recent calendar months (including current)
    - `this_year`: All months of the current calendar year
    """,
)
async def get_monthly_invoices(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = Query(
        "last_6_months",
        description="Period to aggregate: this_month | last_6_months | this_year",
        pattern="^(this_month|last_6_months|this_year)$",
    ),
) -> MonthlyInvoicesResponse:
    """Return monthly invoice summary grouped by issue_date month."""
    require_zzp(current_user)

    administration = await get_user_administration(current_user.id, db)
    admin_id = administration.id
    today = date.today()

    # Determine date range based on period
    if period == "this_month":
        range_start = date(today.year, today.month, 1)
        range_end = today
    elif period == "this_year":
        range_start = date(today.year, 1, 1)
        range_end = today
    else:  # last_6_months (default)
        # Go back 5 full months + current partial month = 6 months total
        # Subtract 5 months
        m = today.month - 5
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        range_start = date(y, m, 1)
        range_end = today

    net_open = outstanding_cents()
    issued = await db.execute(select(extract('year', ZZPInvoice.issue_date).label('year'),
        extract('month', ZZPInvoice.issue_date).label('month'), func.sum(ZZPInvoice.total_cents).label('sent_total'),
        func.count().label('sent_count'),
        func.sum(case((ZZPInvoice.status == 'paid', ZZPInvoice.total_cents), else_=0)).label('paid_total'),
        func.sum(case((ZZPInvoice.status == 'paid', 1), else_=0)).label('paid_count'),
        func.sum(case((ZZPInvoice.status.in_(['sent','overdue']), net_open), else_=0)).label('open_total'),
        func.sum(case((and_(ZZPInvoice.status.in_(['sent','overdue']), net_open > 0), 1), else_=0)).label('open_count'),
    ).where(ZZPInvoice.administration_id == admin_id, ZZPInvoice.issue_date >= range_start,
        ZZPInvoice.issue_date <= range_end, ZZPInvoice.status.notin_(['draft','cancelled']))
        .group_by(extract('year', ZZPInvoice.issue_date), extract('month', ZZPInvoice.issue_date)))
    received = await receipt_months(db, admin_id, range_start, range_end)

    # Build a dict of month_key -> MonthlyInvoiceSummary
    summaries: dict[str, MonthlyInvoiceSummary] = {}

    # Generate all months in the range so we always have entries (even if zero)
    cursor_year = range_start.year
    cursor_month = range_start.month
    end_year = today.year
    end_month = today.month
    while (cursor_year, cursor_month) <= (end_year, end_month):
        key = f"{cursor_year:04d}-{cursor_month:02d}"
        summaries[key] = MonthlyInvoiceSummary(
            month_key=key,
            month_label=dutch_month_label(cursor_year, cursor_month),
        )
        cursor_month += 1
        if cursor_month > 12:
            cursor_month = 1
            cursor_year += 1

    for item in issued.mappings():
        key = f"{int(item['year']):04d}-{int(item['month']):02d}"
        if key in summaries:
            for field in ('sent_total','sent_count','paid_total','paid_count','open_total','open_count'):
                setattr(summaries[key], field, item[field] or 0)
    for key, item in received.items():
        if key in summaries:
            summaries[key].received_total = item['amount']
            summaries[key].received_count = item['count']

    # Return sorted by month_key ascending
    sorted_months = sorted(summaries.values(), key=lambda x: x.month_key)

    return MonthlyInvoicesResponse(administration_id=admin_id, months=sorted_months, period=period)


class ReceiptInvoiceLink(BaseModel):
    id: UUID
    invoice_number: str


class ReceiptItem(BaseModel):
    id: UUID
    source: str
    payment_date: date
    amount_cents: int
    reference: Optional[str] = None
    invoices: List[ReceiptInvoiceLink] = Field(default_factory=list)


class ReceiptPage(BaseModel):
    administration_id: UUID
    receipts: List[ReceiptItem]
    total: int
    total_amount_cents: int


@router.get('/dashboard/receipts', response_model=ReceiptPage)
async def get_dashboard_receipts(current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: int = Query(..., ge=2000, le=2100), month: int = Query(..., ge=1, le=12),
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    """Drill into the same receipts used by the cash card and monthly chart."""
    import calendar
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    rows = receipt_rows(administration.id)
    start = date(year, month, 1)
    end = min(date(year, month, calendar.monthrange(year, month)[1]), date.today())
    scope = and_(rows.c.day >= start, rows.c.day <= end)
    total, amount = (await db.execute(select(func.count(), func.coalesce(func.sum(rows.c.amount_cents), 0))
        .select_from(rows).where(scope))).one()
    page = (await db.execute(select(rows).where(scope)
        .order_by(rows.c.day.desc(), rows.c.id.desc(), rows.c.source).limit(limit).offset(offset))).mappings().all()
    payment_ids = [r['id'] for r in page if r['source'] == 'payment']
    links = {}
    if payment_ids:
        linked = await db.execute(select(ZZPPaymentAllocation.payment_id, ZZPInvoice.id, ZZPInvoice.invoice_number)
            .join(ZZPInvoice, ZZPInvoice.id == ZZPPaymentAllocation.invoice_id)
            .where(ZZPPaymentAllocation.payment_id.in_(payment_ids), ZZPInvoice.administration_id == administration.id)
            .distinct().order_by(ZZPInvoice.invoice_number))
        for payment_id, invoice_id, number in linked:
            links.setdefault(payment_id, []).append(ReceiptInvoiceLink(id=invoice_id, invoice_number=number))
    return ReceiptPage(administration_id=administration.id, total=total, total_amount_cents=amount,
        receipts=[ReceiptItem(id=r['id'], source=r['source'], payment_date=r['day'],
            amount_cents=r['amount_cents'], reference=r['reference'],
            invoices=(links.get(r['id'], []) if r['source'] == 'payment' else
                      [ReceiptInvoiceLink(id=r['id'], invoice_number=r['reference'])])) for r in page])
