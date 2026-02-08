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
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import (
    ZZPInvoice, 
    ZZPExpense, 
    ZZPTimeEntry, 
    BusinessProfile,
    InvoiceStatus,
)
from app.models.administration import Administration, AdministrationMember
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


# ============================================================================
# Dashboard Response Schema
# ============================================================================

class ActionItem(BaseModel):
    """An action item requiring ZZP user attention."""
    id: str
    type: str  # 'draft_invoice', 'overdue_invoice', 'missing_profile', 'unreviewed_receipt'
    title: str
    description: str
    severity: str  # 'error', 'warning', 'info'
    route: Optional[str] = None
    related_id: Optional[str] = None


class InvoiceStats(BaseModel):
    """Invoice statistics."""
    open_count: int = Field(0, description="Number of open invoices (sent/overdue)")
    open_total_cents: int = Field(0, description="Total amount of open invoices in cents")
    draft_count: int = Field(0, description="Number of draft invoices")
    overdue_count: int = Field(0, description="Number of overdue invoices")
    overdue_total_cents: int = Field(0, description="Total amount of overdue invoices in cents")
    paid_this_month_count: int = Field(0, description="Invoices paid this month")
    paid_this_month_cents: int = Field(0, description="Total paid this month in cents")


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
    
    # Net VAT payable
    vat_payable_cents: int = Field(0, description="Estimated VAT to pay (collected - deductible)")


class ZZPDashboardResponse(BaseModel):
    """Complete ZZP dashboard data."""
    invoices: InvoiceStats
    expenses: ExpenseStats
    time: TimeStats
    btw: BTWStats
    actions: List[ActionItem] = Field(default_factory=list, description="Actions requiring attention")
    profile_complete: bool = Field(False, description="Whether business profile is complete")
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Metric calculation notes for transparency
    notes: dict = Field(default_factory=dict, description="Notes on how metrics were calculated")


# ============================================================================
# Helper Functions
# ============================================================================

async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    """Get the primary administration for a ZZP user."""
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user_id)
        .where(Administration.is_active == True)
        .order_by(Administration.created_at)
        .limit(1)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "NO_ADMINISTRATION",
                "message": "Geen administratie gevonden. Voltooi eerst de onboarding."
            }
        )
    
    return administration


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
    
    # BTW deadline (end of month after quarter)
    deadline_year = year + 1 if quarter == 4 else year
    deadline_month = 1 if quarter == 4 else quarter_start_month + 4
    
    # Last day of deadline month
    if deadline_month == 12:
        btw_deadline = date(deadline_year, 12, 31)
    else:
        btw_deadline = date(deadline_year, deadline_month, 1) - timedelta(days=1)
        if deadline_month > 12:
            # Handle edge case for Q4 -> January next year
            btw_deadline = date(deadline_year, 1, 31)
    
    # Q4 special handling
    if quarter == 4:
        btw_deadline = date(year + 1, 1, 31)
    elif quarter == 1:
        btw_deadline = date(year, 4, 30)
    elif quarter == 2:
        btw_deadline = date(year, 7, 31)
    elif quarter == 3:
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
    - 'This week' = Monday to Sunday containing current date
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
    now = datetime.utcnow()
    
    # Date bounds
    month_start = date(today.year, today.month, 1)
    week_start, week_end = get_week_bounds(today)
    quarter_label, quarter_start, quarter_end, btw_deadline = get_quarter_info(today)
    
    # ========================================================================
    # Invoice Statistics
    # ========================================================================
    
    # Get all invoices for the administration
    invoice_result = await db.execute(
        select(ZZPInvoice)
        .where(ZZPInvoice.administration_id == admin_id)
    )
    invoices = invoice_result.scalars().all()
    
    # Calculate invoice stats
    open_invoices = [i for i in invoices if i.status in (InvoiceStatus.SENT.value, InvoiceStatus.OVERDUE.value)]
    draft_invoices = [i for i in invoices if i.status == InvoiceStatus.DRAFT.value]
    overdue_invoices = [
        i for i in invoices 
        if i.status == InvoiceStatus.SENT.value and i.due_date and i.due_date < today
    ]
    
    # Paid this month
    paid_this_month = [
        i for i in invoices 
        if i.status == InvoiceStatus.PAID.value 
        and i.updated_at 
        and i.updated_at.date() >= month_start
    ]
    
    # VAT collected this quarter (from paid invoices in quarter)
    paid_this_quarter = [
        i for i in invoices
        if i.status == InvoiceStatus.PAID.value
        and i.updated_at
        and quarter_start <= i.updated_at.date() <= quarter_end
    ]
    vat_collected = sum(i.vat_total_cents or 0 for i in paid_this_quarter)
    
    invoice_stats = InvoiceStats(
        open_count=len(open_invoices),
        open_total_cents=sum(i.total_cents or 0 for i in open_invoices),
        draft_count=len(draft_invoices),
        overdue_count=len(overdue_invoices),
        overdue_total_cents=sum(i.total_cents or 0 for i in overdue_invoices),
        paid_this_month_count=len(paid_this_month),
        paid_this_month_cents=sum(i.total_cents or 0 for i in paid_this_month),
    )
    
    # ========================================================================
    # Expense Statistics
    # ========================================================================
    
    # Expenses this month
    expense_result = await db.execute(
        select(ZZPExpense)
        .where(
            ZZPExpense.administration_id == admin_id,
            ZZPExpense.expense_date >= month_start,
            ZZPExpense.expense_date <= today,
        )
    )
    expenses_this_month = expense_result.scalars().all()
    
    expense_stats = ExpenseStats(
        this_month_count=len(expenses_this_month),
        this_month_total_cents=sum(e.amount_cents or 0 for e in expenses_this_month),
        this_month_vat_cents=sum(e.vat_amount_cents or 0 for e in expenses_this_month),
    )
    
    # VAT deductible this quarter (from expenses in quarter)
    expense_quarter_result = await db.execute(
        select(ZZPExpense)
        .where(
            ZZPExpense.administration_id == admin_id,
            ZZPExpense.expense_date >= quarter_start,
            ZZPExpense.expense_date <= quarter_end,
        )
    )
    expenses_this_quarter = expense_quarter_result.scalars().all()
    vat_deductible = sum(e.vat_amount_cents or 0 for e in expenses_this_quarter)
    
    # ========================================================================
    # Time Statistics
    # ========================================================================
    
    time_result = await db.execute(
        select(ZZPTimeEntry)
        .where(
            ZZPTimeEntry.administration_id == admin_id,
            ZZPTimeEntry.entry_date >= week_start,
            ZZPTimeEntry.entry_date <= week_end,
        )
    )
    time_entries = time_result.scalars().all()
    
    total_hours = sum(float(t.hours or 0) for t in time_entries)
    billable_hours = sum(float(t.hours or 0) for t in time_entries if t.billable)
    billable_value = sum(
        int(float(t.hours or 0) * (t.hourly_rate_cents or 0))
        for t in time_entries if t.billable and t.hourly_rate_cents
    )
    
    time_stats = TimeStats(
        this_week_hours=round(total_hours, 1),
        this_week_billable_hours=round(billable_hours, 1),
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
            route="/zzp/settings",
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
            route="/zzp/settings",
        ))
    
    # Draft invoices action
    if len(draft_invoices) > 0:
        actions.append(ActionItem(
            id="draft-invoices",
            type="draft_invoice",
            title=f"{len(draft_invoices)} conceptfactuur{'en' if len(draft_invoices) > 1 else ''} wachten",
            description="Je hebt conceptfacturen die nog verstuurd moeten worden.",
            severity="info",
            route="/zzp/invoices?status=draft",
        ))
    
    # Overdue invoices action
    if len(overdue_invoices) > 0:
        total_overdue = sum(i.total_cents or 0 for i in overdue_invoices) / 100
        actions.append(ActionItem(
            id="overdue-invoices",
            type="overdue_invoice",
            title=f"{len(overdue_invoices)} factuur{'en' if len(overdue_invoices) > 1 else ''} te laat",
            description=f"€{total_overdue:,.2f} aan openstaande facturen is over de vervaldatum.",
            severity="error",
            route="/zzp/invoices?status=overdue",
        ))
    
    # BTW deadline warning (14 days)
    if 0 < days_until_deadline <= 14:
        actions.append(ActionItem(
            id="btw-deadline",
            type="btw_deadline",
            title=f"BTW aangifte over {days_until_deadline} dagen",
            description=f"De deadline voor {quarter_label} is {btw_deadline.strftime('%d-%m-%Y')}.",
            severity="warning",
            route="/zzp/expenses",
        ))
    
    # ========================================================================
    # Build Response
    # ========================================================================
    
    notes = {
        "this_month_range": f"{month_start.isoformat()} tot {today.isoformat()}",
        "this_week_range": f"{week_start.isoformat()} tot {week_end.isoformat()}",
        "this_quarter_range": f"{quarter_start.isoformat()} tot {quarter_end.isoformat()}",
        "btw_calculation": "BTW te betalen = BTW ontvangen (betaalde facturen) - BTW voorbelasting (uitgaven)",
        "overdue_definition": "Facturen met status 'verstuurd' waarvan de vervaldatum is verstreken",
    }
    
    return ZZPDashboardResponse(
        invoices=invoice_stats,
        expenses=expense_stats,
        time=time_stats,
        btw=btw_stats,
        actions=actions,
        profile_complete=profile_complete,
        generated_at=now,
        notes=notes,
    )
