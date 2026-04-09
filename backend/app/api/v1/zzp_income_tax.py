"""
ZZP Inkomstenbelasting (Income Tax) Preparation API Endpoint

Provides a self-service annual income-tax preparation overview for ZZP users.
This is NOT a filing tool — it helps ZZP users prepare their data before
manually filing via Mijn Belastingdienst.

Metrics provided per year:
- Omzet (revenue) from paid invoices
- Kosten (expenses)
- Winst uit onderneming (profit)
- Hours worked (soft urencriterium indicator, if data is available)
- Preparation checklist state
- Validation warnings for incomplete bookkeeping
"""
from datetime import datetime, date, timezone
from decimal import Decimal
import logging
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
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
logger = logging.getLogger(__name__)


# ============================================================================
# Response Schemas
# ============================================================================

class IncomeTaxWarning(BaseModel):
    """Validation warning for the income tax overview."""
    id: str
    severity: str = Field(..., description="'error', 'warning', or 'info'")
    title: str
    description: str
    action_hint: Optional[str] = None
    related_route: Optional[str] = None


class IncomeTaxCostBreakdown(BaseModel):
    """Breakdown of costs by category."""
    category: str
    label: str
    amount_cents: int = Field(0)
    count: int = Field(0)


class IncomeTaxHoursIndicator(BaseModel):
    """Soft indicator for urencriterium (1225-hour rule)."""
    total_hours: float = Field(0, description="Total hours logged in the year")
    target_hours: int = Field(1225, description="Target for urencriterium")
    percentage: float = Field(0, description="Percentage of target reached")
    data_available: bool = Field(False, description="Whether hour tracking data exists")
    note: str = Field(
        "",
        description="Explanatory note about the indicator",
    )


class IncomeTaxChecklistItem(BaseModel):
    """Checklist item for preparation readiness."""
    id: str
    label: str
    done: bool = False
    severity: str = Field("info", description="'info', 'warning', or 'error'")
    hint: Optional[str] = None


class IncomeTaxYearOverview(BaseModel):
    """Annual income tax preparation overview for a ZZP user."""
    year: int
    year_start: str
    year_end: str
    filing_deadline: str = Field(..., description="Typical IB filing deadline")

    # Key financial totals
    omzet_cents: int = Field(0, description="Total revenue (ex. BTW) from paid invoices")
    kosten_cents: int = Field(0, description="Total business expenses (ex. BTW)")
    winst_cents: int = Field(0, description="Profit: omzet - kosten")

    # Invoice breakdown
    invoice_count: int = Field(0, description="Total invoices in the year")
    paid_invoice_count: int = Field(0, description="Paid invoices")
    draft_invoice_count: int = Field(0, description="Draft invoices (not counted)")
    unpaid_invoice_count: int = Field(0, description="Sent but unpaid invoices")

    # Expense breakdown
    expense_count: int = Field(0, description="Total expenses in the year")
    cost_breakdown: List[IncomeTaxCostBreakdown] = Field(default_factory=list)

    # Hours indicator
    hours_indicator: IncomeTaxHoursIndicator = IncomeTaxHoursIndicator()

    # Warnings & checklist
    warnings: List[IncomeTaxWarning] = Field(default_factory=list)
    checklist: List[IncomeTaxChecklistItem] = Field(default_factory=list)

    # Readiness
    is_complete: bool = Field(False, description="Whether data looks complete enough for filing prep")
    completeness_notes: List[str] = Field(default_factory=list)

    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class IncomeTaxResponse(BaseModel):
    """Full response for the Inkomstenbelasting preparation page."""
    overview: IncomeTaxYearOverview
    available_years: List[int] = Field(default_factory=list)
    profile_complete: bool = Field(False)
    kvk_number: Optional[str] = None
    btw_number: Optional[str] = None


# ============================================================================
# Category label mapping
# ============================================================================

CATEGORY_LABELS = {
    "algemeen": "Algemene kosten",
    "kantoor": "Kantoorkosten",
    "reiskosten": "Reiskosten",
    "telefoon": "Telefoon & internet",
    "verzekeringen": "Verzekeringen",
    "abonnementen": "Abonnementen",
    "marketing": "Marketing & reclame",
    "opleiding": "Opleiding & studie",
    "huisvesting": "Huisvestingskosten",
    "afschrijvingen": "Afschrijvingen",
    "auto": "Autokosten",
    "representatie": "Representatiekosten",
    "overig": "Overige kosten",
}


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
                "message": "Geen administratie gevonden. Voltooi eerst de onboarding.",
            },
        )
    return administration


async def build_year_overview(
    admin_id: UUID,
    year: int,
    today: date,
    db: AsyncSession,
) -> IncomeTaxYearOverview:
    """Build an annual income-tax preparation overview."""
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    # Standard IB filing deadline is 1 May of the following year
    filing_deadline = date(year + 1, 5, 1)

    warnings: List[IncomeTaxWarning] = []
    checklist: List[IncomeTaxChecklistItem] = []
    completeness_notes: List[str] = []
    warning_id = 0

    # ------------------------------------------------------------------
    # 1. Invoices for this year
    # ------------------------------------------------------------------
    invoice_result = await db.execute(
        select(ZZPInvoice).where(ZZPInvoice.administration_id == admin_id)
    )
    all_invoices = invoice_result.scalars().all()

    year_invoices = []
    for inv in all_invoices:
        inv_date = inv.invoice_date if hasattr(inv, "invoice_date") and inv.invoice_date else (
            inv.issue_date if inv.issue_date else (
                inv.created_at.date() if inv.created_at else None
            )
        )
        if inv_date and year_start <= inv_date <= year_end:
            year_invoices.append(inv)

    paid_invoices = [i for i in year_invoices if i.status == InvoiceStatus.PAID.value]
    sent_invoices = [
        i for i in year_invoices
        if i.status in (InvoiceStatus.SENT.value, InvoiceStatus.OVERDUE.value)
    ]
    draft_invoices = [i for i in year_invoices if i.status == InvoiceStatus.DRAFT.value]

    total_omzet = sum(i.subtotal_cents or 0 for i in paid_invoices)

    # ------------------------------------------------------------------
    # 2. Expenses for this year
    # ------------------------------------------------------------------
    expense_result = await db.execute(
        select(ZZPExpense).where(
            ZZPExpense.administration_id == admin_id,
            ZZPExpense.expense_date >= year_start,
            ZZPExpense.expense_date <= year_end,
        )
    )
    year_expenses = expense_result.scalars().all()

    total_kosten = sum(e.amount_cents or 0 for e in year_expenses)
    winst = total_omzet - total_kosten

    # Build cost breakdown by category
    category_buckets: dict = {}
    for exp in year_expenses:
        cat = exp.category or "overig"
        if cat not in category_buckets:
            category_buckets[cat] = {"amount": 0, "count": 0}
        category_buckets[cat]["amount"] += exp.amount_cents or 0
        category_buckets[cat]["count"] += 1

    cost_breakdown = []
    for cat in sorted(category_buckets.keys()):
        bucket = category_buckets[cat]
        cost_breakdown.append(IncomeTaxCostBreakdown(
            category=cat,
            label=CATEGORY_LABELS.get(cat, cat.capitalize()),
            amount_cents=bucket["amount"],
            count=bucket["count"],
        ))

    # ------------------------------------------------------------------
    # 3. Hours indicator (urencriterium — soft, non-binding)
    # ------------------------------------------------------------------
    hours_result = await db.execute(
        select(func.coalesce(func.sum(ZZPTimeEntry.hours), 0)).where(
            ZZPTimeEntry.administration_id == admin_id,
            ZZPTimeEntry.entry_date >= year_start,
            ZZPTimeEntry.entry_date <= year_end,
        )
    )
    total_hours_dec = hours_result.scalar() or Decimal("0")
    total_hours = float(total_hours_dec)
    hours_data_available = total_hours > 0

    target_hours = 1225
    hours_pct = round((total_hours / target_hours) * 100, 1) if target_hours else 0

    if hours_data_available:
        if total_hours >= target_hours:
            hours_note = (
                "Op basis van je geregistreerde uren voldoe je waarschijnlijk aan het "
                "urencriterium. Dit is een indicatie — controleer dit bij je aangifte."
            )
        else:
            hours_note = (
                f"Je hebt {int(total_hours)} van de {target_hours} uur geregistreerd. "
                "Het urencriterium is mogelijk niet gehaald. Controleer of je alle uren "
                "hebt ingevoerd."
            )
    else:
        hours_note = (
            "Er zijn geen uren geregistreerd in deze periode. Als je uren bijhoudt "
            "in het systeem, kun je hier zien of je richting het urencriterium gaat."
        )

    hours_indicator = IncomeTaxHoursIndicator(
        total_hours=total_hours,
        target_hours=target_hours,
        percentage=hours_pct,
        data_available=hours_data_available,
        note=hours_note,
    )

    # ------------------------------------------------------------------
    # 4. Validation warnings
    # ------------------------------------------------------------------
    if len(year_invoices) == 0:
        warning_id += 1
        warnings.append(IncomeTaxWarning(
            id=f"IB{warning_id:03d}",
            severity="warning",
            title="Geen facturen gevonden",
            description="Er zijn geen facturen gevonden voor dit jaar. Voeg facturen toe als je omzet hebt gehad.",
            action_hint="Maak een factuur aan.",
            related_route="/zzp/invoices",
        ))

    if len(draft_invoices) > 0:
        warning_id += 1
        warnings.append(IncomeTaxWarning(
            id=f"IB{warning_id:03d}",
            severity="info",
            title=f"{len(draft_invoices)} conceptfactuur{'en' if len(draft_invoices) != 1 else ''} niet meegeteld",
            description="Conceptfacturen worden niet meegenomen in de omzetberekening. Verstuur of verwijder ze voor een compleet overzicht.",
            action_hint="Ga naar Facturen om concepten te bekijken.",
            related_route="/zzp/invoices?status=draft",
        ))

    if len(sent_invoices) > 0:
        unpaid_total = sum(i.subtotal_cents or 0 for i in sent_invoices)
        warning_id += 1
        warnings.append(IncomeTaxWarning(
            id=f"IB{warning_id:03d}",
            severity="warning",
            title=f"{len(sent_invoices)} factuur{'en' if len(sent_invoices) != 1 else ''} nog niet betaald",
            description=(
                f"Er staat nog €{unpaid_total / 100:,.2f} open op verstuurde facturen. "
                "Controleer of deze nog betaald worden voor het einde van het jaar."
            ),
            action_hint="Werk de betaalstatus van je facturen bij.",
            related_route="/zzp/invoices?status=sent",
        ))

    if len(year_expenses) == 0:
        warning_id += 1
        warnings.append(IncomeTaxWarning(
            id=f"IB{warning_id:03d}",
            severity="warning",
            title="Geen uitgaven gevonden",
            description="Er zijn geen zakelijke uitgaven gevonden. Heb je bonnetjes of facturen van leveranciers? Voeg ze toe zodat je kosten kunt aftrekken.",
            action_hint="Voeg uitgaven toe.",
            related_route="/zzp/expenses",
        ))

    expenses_no_receipt = [
        e for e in year_expenses
        if not e.attachment_url
    ]
    if len(expenses_no_receipt) > 0:
        warning_id += 1
        warnings.append(IncomeTaxWarning(
            id=f"IB{warning_id:03d}",
            severity="info",
            title=f"{len(expenses_no_receipt)} uitgave{'n' if len(expenses_no_receipt) != 1 else ''} zonder bon",
            description="Sommige uitgaven hebben geen bijlage (bon/factuur). Bewaar je bonnen voor de administratieplicht.",
            action_hint="Voeg bonnen toe aan je uitgaven.",
            related_route="/zzp/expenses",
        ))

    # ------------------------------------------------------------------
    # 5. Preparation checklist
    # ------------------------------------------------------------------
    all_invoices_entered = len(year_invoices) > 0
    checklist.append(IncomeTaxChecklistItem(
        id="invoices",
        label="Alle facturen ingevoerd",
        done=all_invoices_entered,
        severity="warning" if not all_invoices_entered else "info",
        hint="Controleer of alle facturen van het jaar zijn ingevoerd." if not all_invoices_entered else None,
    ))

    all_expenses_entered = len(year_expenses) > 0
    checklist.append(IncomeTaxChecklistItem(
        id="expenses",
        label="Alle uitgaven verwerkt",
        done=all_expenses_entered,
        severity="warning" if not all_expenses_entered else "info",
        hint="Voeg zakelijke uitgaven toe voor een compleet overzicht." if not all_expenses_entered else None,
    ))

    no_drafts = len(draft_invoices) == 0
    checklist.append(IncomeTaxChecklistItem(
        id="no_drafts",
        label="Geen conceptfacturen meer open",
        done=no_drafts,
        severity="info" if no_drafts else "warning",
        hint="Verstuur of verwijder conceptfacturen." if not no_drafts else None,
    ))

    all_paid = len(sent_invoices) == 0
    checklist.append(IncomeTaxChecklistItem(
        id="all_paid",
        label="Alle facturen betaald of afgeboekt",
        done=all_paid,
        severity="info" if all_paid else "warning",
        hint="Werk de betaalstatus bij van openstaande facturen." if not all_paid else None,
    ))

    has_receipts = len(expenses_no_receipt) == 0 or len(year_expenses) == 0
    checklist.append(IncomeTaxChecklistItem(
        id="receipts",
        label="Bonnen bij alle uitgaven bewaard",
        done=has_receipts,
        severity="info" if has_receipts else "info",
        hint="Voeg bonnen/bijlagen toe aan uitgaven." if not has_receipts else None,
    ))

    hours_logged = hours_data_available
    checklist.append(IncomeTaxChecklistItem(
        id="hours",
        label="Uren geregistreerd (voor urencriterium)",
        done=hours_logged,
        severity="info",
        hint="Registreer je gewerkte uren om het urencriterium te onderbouwen." if not hours_logged else None,
    ))

    # ------------------------------------------------------------------
    # 6. Completeness assessment
    # ------------------------------------------------------------------
    is_complete = True

    if not all_invoices_entered and not all_expenses_entered:
        is_complete = False
        completeness_notes.append("Geen facturen en geen uitgaven: voeg gegevens toe.")
    elif not all_invoices_entered:
        is_complete = False
        completeness_notes.append("Geen facturen gevonden — voeg je omzet toe.")

    if any(w.severity == "error" for w in warnings):
        is_complete = False
        completeness_notes.append("Er zijn fouten die eerst opgelost moeten worden.")

    if len(draft_invoices) > 0:
        completeness_notes.append("Let op: conceptfacturen zijn niet meegeteld in de omzet.")

    if is_complete and not completeness_notes:
        completeness_notes.append("Je gegevens zien er compleet uit voor dit jaar.")

    return IncomeTaxYearOverview(
        year=year,
        year_start=year_start.isoformat(),
        year_end=year_end.isoformat(),
        filing_deadline=filing_deadline.isoformat(),
        omzet_cents=total_omzet,
        kosten_cents=total_kosten,
        winst_cents=winst,
        invoice_count=len(year_invoices),
        paid_invoice_count=len(paid_invoices),
        draft_invoice_count=len(draft_invoices),
        unpaid_invoice_count=len(sent_invoices),
        expense_count=len(year_expenses),
        cost_breakdown=cost_breakdown,
        hours_indicator=hours_indicator,
        warnings=warnings,
        checklist=checklist,
        is_complete=is_complete,
        completeness_notes=completeness_notes,
    )


# ============================================================================
# Main Endpoint
# ============================================================================

@router.get(
    "/income-tax",
    response_model=IncomeTaxResponse,
    summary="Get ZZP Inkomstenbelasting preparation overview",
    description="""
    Returns a self-service annual income-tax preparation overview for a ZZP user.
    
    This is NOT a filing tool. It gathers the user's bookkeeping data into a
    readable yearly summary so they can prepare for filing via Mijn Belastingdienst.
    
    **Data sources:**
    - Paid invoices → omzet (revenue, ex. BTW)
    - Expenses → kosten (costs, incl. BTW)
    - Time entries → soft urencriterium indicator
    
    **Calculation:**
    - Winst = Omzet – Kosten
    - This is a simplified view; deductions like zelfstandigenaftrek and
      startersaftrek are not applied because they depend on personal
      circumstances that only the user (or their accountant) can confirm.
    
    **Note:** If data is incomplete, warnings are returned. The overview
    never claims to be a final tax calculation.
    """,
)
async def get_zzp_income_tax(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: Optional[int] = Query(None, description="Year to show (defaults to current)"),
) -> IncomeTaxResponse:
    """Get Inkomstenbelasting preparation overview for the ZZP user."""
    require_zzp(current_user)

    administration = await get_user_administration(current_user.id, db)
    admin_id = administration.id
    today = date.today()

    target_year = year if year else today.year

    # Build main overview
    try:
        overview = await build_year_overview(admin_id, target_year, today, db)
    except Exception as exc:
        logger.exception("Failed to build income tax overview for year %d: %s", target_year, exc)
        overview = IncomeTaxYearOverview(
            year=target_year,
            year_start=date(target_year, 1, 1).isoformat(),
            year_end=date(target_year, 12, 31).isoformat(),
            filing_deadline=date(target_year + 1, 5, 1).isoformat(),
            warnings=[IncomeTaxWarning(
                id="IB_ERR",
                severity="error",
                title="Fout bij berekenen",
                description="Er is een probleem opgetreden bij het berekenen van je jaaroverzicht. Probeer het later opnieuw.",
            )],
        )

    # Determine available years (current year and up to 4 previous)
    available_years = list(range(today.year, max(today.year - 5, 2020), -1))

    # Get business profile
    profile_result = await db.execute(
        select(BusinessProfile).where(BusinessProfile.administration_id == admin_id)
    )
    profile = profile_result.scalar_one_or_none()

    profile_complete = False
    kvk_number = None
    btw_number = None
    if profile:
        kvk_number = profile.kvk_number
        btw_number = profile.btw_number
        profile_complete = all([
            profile.company_name,
            profile.kvk_number,
            profile.btw_number,
            profile.iban,
        ])

    return IncomeTaxResponse(
        overview=overview,
        available_years=available_years,
        profile_complete=profile_complete,
        kvk_number=kvk_number,
        btw_number=btw_number,
    )
