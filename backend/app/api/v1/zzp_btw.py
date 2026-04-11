"""
ZZP BTW Aangifte API Endpoint

Provides a self-service BTW (VAT) overview for ZZP users based on their
invoice and expense data. This is separate from the accountant-only VAT
report endpoints and calculates directly from ZZP data models.

Metrics provided per quarter:
- Omzet (revenue) from paid invoices
- Output VAT collected from invoices
- Input VAT (deductible) from expenses
- Net VAT to pay or reclaim
- Validation warnings for missing or suspicious data
"""
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import (
    ZZPInvoice,
    ZZPInvoiceLine,
    ZZPExpense,
    InvoiceStatus,
    BusinessProfile,
)
from app.models.administration import Administration, AdministrationMember
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


# ============================================================================
# Response Schemas
# ============================================================================

class BTWVatRateBreakdown(BaseModel):
    """Breakdown of amounts per VAT rate."""
    vat_rate: str = Field(..., description="VAT rate percentage (e.g. '21', '9', '0')")
    omzet_cents: int = Field(0, description="Revenue (ex. BTW) in cents")
    vat_cents: int = Field(0, description="VAT amount in cents")
    transaction_count: int = Field(0, description="Number of transactions")


class BTWInvoiceSummary(BaseModel):
    """Summary of invoices included in the BTW calculation."""
    total_count: int = Field(0, description="Total invoices in quarter")
    paid_count: int = Field(0, description="Paid invoices")
    sent_count: int = Field(0, description="Sent but unpaid invoices")
    draft_count: int = Field(0, description="Draft invoices (not included)")
    total_omzet_cents: int = Field(0, description="Total revenue from paid invoices (ex. BTW)")
    total_vat_cents: int = Field(0, description="Total output VAT from paid invoices")


class BTWExpenseSummary(BaseModel):
    """Summary of expenses included in the BTW calculation."""
    total_count: int = Field(0, description="Total expenses in quarter")
    total_amount_cents: int = Field(0, description="Total expense amount in cents")
    total_vat_deductible_cents: int = Field(0, description="Total deductible input VAT")


class BTWWarning(BaseModel):
    """Validation warning for the BTW overview."""
    id: str
    severity: str = Field(..., description="'error', 'warning', or 'info'")
    title: str
    description: str
    action_hint: Optional[str] = None
    related_route: Optional[str] = None


class BTWQuarterOverview(BaseModel):
    """Complete BTW quarter overview for a ZZP user."""
    quarter: str = Field(..., description="Quarter label (e.g. 'Q1 2026')")
    quarter_start: str = Field(..., description="Start date ISO")
    quarter_end: str = Field(..., description="End date ISO")
    deadline: str = Field(..., description="Filing deadline ISO")
    days_until_deadline: int = Field(0, description="Days remaining")

    # Key totals
    omzet_cents: int = Field(0, description="Total revenue (ex. BTW)")
    output_vat_cents: int = Field(0, description="Total output VAT (BTW afgedragen)")
    input_vat_cents: int = Field(0, description="Total deductible input VAT (voorbelasting)")
    net_vat_cents: int = Field(0, description="Net VAT: output - input. Positive = pay, Negative = reclaim")

    # Breakdowns
    vat_rate_breakdown: List[BTWVatRateBreakdown] = Field(default_factory=list)
    invoice_summary: BTWInvoiceSummary = BTWInvoiceSummary()
    expense_summary: BTWExpenseSummary = BTWExpenseSummary()

    # Warnings / validation
    warnings: List[BTWWarning] = Field(default_factory=list)

    # Readiness
    is_ready: bool = Field(False, description="Whether data looks complete enough to file")
    readiness_notes: List[str] = Field(default_factory=list)

    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BTWAangifteResponse(BaseModel):
    """Full response for the BTW Aangifte page."""
    current_quarter: BTWQuarterOverview
    previous_quarters: List[BTWQuarterOverview] = Field(default_factory=list)
    profile_complete: bool = Field(False)
    btw_number: Optional[str] = None


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


def get_quarter_info(target_date: date) -> tuple:
    """
    Get quarter information for a date.
    Returns: (quarter_label, quarter_start, quarter_end, btw_deadline, quarter_number, year)
    """
    quarter = (target_date.month - 1) // 3 + 1
    year = target_date.year

    quarter_start_month = (quarter - 1) * 3 + 1
    quarter_start = date(year, quarter_start_month, 1)

    if quarter == 4:
        quarter_end = date(year, 12, 31)
    else:
        next_quarter_month = quarter_start_month + 3
        quarter_end = date(year, next_quarter_month, 1) - timedelta(days=1)

    if quarter == 4:
        btw_deadline = date(year + 1, 1, 31)
    elif quarter == 1:
        btw_deadline = date(year, 4, 30)
    elif quarter == 2:
        btw_deadline = date(year, 7, 31)
    else:
        btw_deadline = date(year, 10, 31)

    quarter_label = f"Q{quarter} {year}"
    return quarter_label, quarter_start, quarter_end, btw_deadline, quarter, year


async def build_quarter_overview(
    admin_id: UUID,
    quarter_start: date,
    quarter_end: date,
    quarter_label: str,
    btw_deadline: date,
    today: date,
    db: AsyncSession,
) -> BTWQuarterOverview:
    """Build a BTW quarter overview from invoice and expense data."""
    warnings: List[BTWWarning] = []
    readiness_notes: List[str] = []

    # ------------------------------------------------------------------
    # 1. Invoices for this quarter
    # ------------------------------------------------------------------
    invoice_result = await db.execute(
        select(ZZPInvoice)
        .where(ZZPInvoice.administration_id == admin_id)
    )
    all_invoices = invoice_result.scalars().all()

    # Filter invoices by quarter - use invoice_date for revenue recognition
    quarter_invoices = []
    for inv in all_invoices:
        inv_date = inv.invoice_date or (inv.created_at.date() if inv.created_at else None)
        if inv_date and quarter_start <= inv_date <= quarter_end:
            quarter_invoices.append(inv)

    paid_invoices = [i for i in quarter_invoices if i.status == InvoiceStatus.PAID.value]
    sent_invoices = [i for i in quarter_invoices if i.status in (InvoiceStatus.SENT.value, InvoiceStatus.OVERDUE.value)]
    draft_invoices = [i for i in quarter_invoices if i.status == InvoiceStatus.DRAFT.value]

    total_omzet = sum(i.subtotal_cents or 0 for i in paid_invoices)
    total_output_vat = sum(i.vat_total_cents or 0 for i in paid_invoices)

    invoice_summary = BTWInvoiceSummary(
        total_count=len(quarter_invoices),
        paid_count=len(paid_invoices),
        sent_count=len(sent_invoices),
        draft_count=len(draft_invoices),
        total_omzet_cents=total_omzet,
        total_vat_cents=total_output_vat,
    )

    # ------------------------------------------------------------------
    # 2. Build VAT rate breakdown from paid invoice lines
    # ------------------------------------------------------------------
    rate_buckets: dict = {}
    if paid_invoices:
        paid_ids = [i.id for i in paid_invoices]
        lines_result = await db.execute(
            select(ZZPInvoiceLine)
            .where(ZZPInvoiceLine.invoice_id.in_(paid_ids))
        )
        lines = lines_result.scalars().all()

        for line in lines:
            rate_key = str(line.vat_rate or Decimal("0"))
            if rate_key not in rate_buckets:
                rate_buckets[rate_key] = {"omzet": 0, "vat": 0, "count": 0}
            rate_buckets[rate_key]["omzet"] += line.line_total_cents or 0
            rate_buckets[rate_key]["vat"] += line.vat_amount_cents or 0
            rate_buckets[rate_key]["count"] += 1

    # ------------------------------------------------------------------
    # 3. Expenses for this quarter
    # ------------------------------------------------------------------
    expense_result = await db.execute(
        select(ZZPExpense)
        .where(
            ZZPExpense.administration_id == admin_id,
            ZZPExpense.expense_date >= quarter_start,
            ZZPExpense.expense_date <= quarter_end,
        )
    )
    quarter_expenses = expense_result.scalars().all()

    total_expense_amount = sum(e.amount_cents or 0 for e in quarter_expenses)
    total_input_vat = sum(e.vat_amount_cents or 0 for e in quarter_expenses)

    # Add expense VAT to rate breakdown
    for expense in quarter_expenses:
        rate_key = str(expense.vat_rate or Decimal("0"))
        if rate_key not in rate_buckets:
            rate_buckets[rate_key] = {"omzet": 0, "vat": 0, "count": 0}
        # Don't add expense amounts to omzet, only count
        rate_buckets[rate_key]["count"] += 1

    expense_summary = BTWExpenseSummary(
        total_count=len(quarter_expenses),
        total_amount_cents=total_expense_amount,
        total_vat_deductible_cents=total_input_vat,
    )

    # ------------------------------------------------------------------
    # 4. Net VAT calculation
    # ------------------------------------------------------------------
    net_vat = total_output_vat - total_input_vat

    # ------------------------------------------------------------------
    # 5. Build rate breakdown list
    # ------------------------------------------------------------------
    vat_rate_breakdown = []
    for rate_key in sorted(rate_buckets.keys(), key=lambda x: float(x), reverse=True):
        bucket = rate_buckets[rate_key]
        vat_rate_breakdown.append(BTWVatRateBreakdown(
            vat_rate=rate_key,
            omzet_cents=bucket["omzet"],
            vat_cents=bucket["vat"],
            transaction_count=bucket["count"],
        ))

    # ------------------------------------------------------------------
    # 6. Validation warnings
    # ------------------------------------------------------------------
    warning_id = 0

    # Warning: draft invoices not included
    if len(draft_invoices) > 0:
        warning_id += 1
        warnings.append(BTWWarning(
            id=f"W{warning_id:03d}",
            severity="info",
            title=f"{len(draft_invoices)} conceptfactuur{'en' if len(draft_invoices) != 1 else ''} niet meegeteld",
            description="Conceptfacturen worden niet meegenomen in de BTW-berekening. Verstuur of verwijder ze voor een compleet overzicht.",
            action_hint="Ga naar Facturen om concepten te bekijken.",
            related_route="/zzp/invoices?status=draft",
        ))

    # Warning: sent but unpaid invoices
    if len(sent_invoices) > 0:
        sent_vat = sum(i.vat_total_cents or 0 for i in sent_invoices)
        warning_id += 1
        warnings.append(BTWWarning(
            id=f"W{warning_id:03d}",
            severity="warning",
            title=f"{len(sent_invoices)} factuur{'en' if len(sent_invoices) != 1 else ''} nog niet betaald",
            description=(
                f"Er staat nog €{sent_vat / 100:,.2f} aan BTW open op verstuurde facturen. "
                f"Afhankelijk van je factuurstelsel (kas- of factuurstelsel) moet je deze BTW mogelijk wel aangeven."
            ),
            action_hint="Controleer of je het kas- of factuurstelsel gebruikt.",
            related_route="/zzp/invoices?status=sent",
        ))

    # Warning: expenses without VAT
    expenses_no_vat = [e for e in quarter_expenses if not e.vat_amount_cents or e.vat_amount_cents == 0]
    if len(expenses_no_vat) > 0:
        warning_id += 1
        warnings.append(BTWWarning(
            id=f"W{warning_id:03d}",
            severity="info",
            title=f"{len(expenses_no_vat)} uitgave{'n' if len(expenses_no_vat) != 1 else ''} zonder BTW",
            description="Sommige uitgaven hebben geen BTW-bedrag. Controleer of dit correct is (bijv. buitenlandse leveranciers of BTW-vrijgestelde diensten).",
            action_hint="Bekijk je uitgaven en voeg eventueel BTW-bedragen toe.",
            related_route="/zzp/expenses",
        ))

    # Warning: no invoices at all in quarter
    if len(quarter_invoices) == 0:
        warning_id += 1
        warnings.append(BTWWarning(
            id=f"W{warning_id:03d}",
            severity="warning",
            title="Geen facturen in dit kwartaal",
            description="Er zijn geen facturen gevonden voor dit kwartaal. Als je wel omzet hebt gehad, voeg dan facturen toe.",
            action_hint="Maak een factuur aan.",
            related_route="/zzp/invoices",
        ))

    # Warning: no expenses in quarter
    if len(quarter_expenses) == 0:
        warning_id += 1
        warnings.append(BTWWarning(
            id=f"W{warning_id:03d}",
            severity="info",
            title="Geen uitgaven in dit kwartaal",
            description="Er zijn geen zakelijke uitgaven gevonden. Heb je bonnetjes of facturen van leveranciers? Voeg ze toe om BTW terug te vragen.",
            action_hint="Voeg uitgaven toe.",
            related_route="/zzp/expenses",
        ))

    # Warning: deadline approaching
    days_until = (btw_deadline - today).days
    if 0 < days_until <= 14:
        warning_id += 1
        warnings.append(BTWWarning(
            id=f"W{warning_id:03d}",
            severity="warning",
            title=f"Deadline over {days_until} dagen",
            description=f"De BTW-aangiftedeadline voor {quarter_label} is {btw_deadline.strftime('%d-%m-%Y')}. Zorg dat je aangifte op tijd is.",
        ))
    elif days_until <= 0 and quarter_end < today:
        warning_id += 1
        warnings.append(BTWWarning(
            id=f"W{warning_id:03d}",
            severity="error",
            title="Deadline verstreken",
            description=f"De deadline voor {quarter_label} ({btw_deadline.strftime('%d-%m-%Y')}) is verstreken. Dien zo snel mogelijk je aangifte in.",
        ))

    # ------------------------------------------------------------------
    # 7. Readiness assessment
    # ------------------------------------------------------------------
    is_ready = True

    if len(paid_invoices) == 0 and len(quarter_expenses) == 0:
        is_ready = False
        readiness_notes.append("Geen data: voeg facturen of uitgaven toe.")

    if any(w.severity == "error" for w in warnings):
        is_ready = False
        readiness_notes.append("Er zijn fouten die eerst opgelost moeten worden.")

    if len(draft_invoices) > 0:
        readiness_notes.append("Let op: conceptfacturen zijn niet meegeteld.")

    if is_ready and not readiness_notes:
        readiness_notes.append("Je gegevens zien er compleet uit voor deze periode.")

    days_until_deadline = max(0, (btw_deadline - today).days)

    return BTWQuarterOverview(
        quarter=quarter_label,
        quarter_start=quarter_start.isoformat(),
        quarter_end=quarter_end.isoformat(),
        deadline=btw_deadline.isoformat(),
        days_until_deadline=days_until_deadline,
        omzet_cents=total_omzet,
        output_vat_cents=total_output_vat,
        input_vat_cents=total_input_vat,
        net_vat_cents=net_vat,
        vat_rate_breakdown=vat_rate_breakdown,
        invoice_summary=invoice_summary,
        expense_summary=expense_summary,
        warnings=warnings,
        is_ready=is_ready,
        readiness_notes=readiness_notes,
    )


# ============================================================================
# Main Endpoint
# ============================================================================

@router.get(
    "/btw-aangifte",
    response_model=BTWAangifteResponse,
    summary="Get ZZP BTW Aangifte overview",
    description="""
    Returns a self-service BTW (VAT) declaration overview for the ZZP user.
    
    Calculates output VAT from paid invoices and deductible input VAT from
    expenses for the current and previous quarters.
    
    **Data sources:**
    - Paid invoices (subtotal = omzet, vat_total = output BTW)
    - Expenses (vat_amount = deductible input BTW)
    
    **Calculation:**
    - Net BTW = Output VAT (from invoices) - Input VAT (from expenses)
    - Positive = amount to pay to Belastingdienst
    - Negative = amount to reclaim from Belastingdienst
    
    **Note:** This uses the kasstelsel (cash basis) by default,
    only counting paid invoices. Users on factuurstelsel should check
    the warning about unpaid invoices.
    """,
)
async def get_zzp_btw_aangifte(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: Optional[int] = Query(None, description="Year to show (defaults to current)"),
    quarter: Optional[int] = Query(None, ge=1, le=4, description="Quarter to show (1-4, defaults to current)"),
) -> BTWAangifteResponse:
    """Get BTW Aangifte overview for the ZZP user."""
    require_zzp(current_user)

    administration = await get_user_administration(current_user.id, db)
    admin_id = administration.id
    today = date.today()

    # Determine target quarter
    if year and quarter:
        target_date = date(year, (quarter - 1) * 3 + 1, 1)
    else:
        target_date = today

    quarter_label, quarter_start, quarter_end, btw_deadline, q_num, q_year = get_quarter_info(target_date)

    # Build current quarter overview
    try:
        current_overview = await build_quarter_overview(
            admin_id, quarter_start, quarter_end, quarter_label, btw_deadline, today, db
        )
    except Exception:
        # Graceful fallback on any data inconsistency
        current_overview = BTWQuarterOverview(
            quarter=quarter_label,
            quarter_start=quarter_start.isoformat(),
            quarter_end=quarter_end.isoformat(),
            deadline=btw_deadline.isoformat(),
            days_until_deadline=max(0, (btw_deadline - today).days),
            warnings=[BTWWarning(
                id="W_ERR",
                severity="error",
                title="Fout bij berekenen",
                description="Er is een probleem opgetreden bij het berekenen van je BTW-overzicht. Probeer het later opnieuw.",
            )],
        )

    # Build previous quarters (up to 3 previous)
    previous_quarters = []
    for i in range(1, 4):
        prev_date = date(q_year, 1, 1) if q_num - i >= 1 else date(q_year - 1, 1, 1)
        prev_q = q_num - i
        if prev_q <= 0:
            prev_q += 4
            prev_date = date(q_year - 1, 1, 1)

        prev_month = (prev_q - 1) * 3 + 1
        prev_target = date(prev_date.year if prev_q <= q_num - i + 4 else q_year - 1, prev_month, 1)
        p_label, p_start, p_end, p_deadline, _, _ = get_quarter_info(prev_target)

        try:
            prev_overview = await build_quarter_overview(
                admin_id, p_start, p_end, p_label, p_deadline, today, db
            )
            previous_quarters.append(prev_overview)
        except Exception:
            # Skip quarters that fail gracefully
            pass

    # Get business profile for BTW number
    profile_result = await db.execute(
        select(BusinessProfile)
        .where(BusinessProfile.administration_id == admin_id)
    )
    profile = profile_result.scalar_one_or_none()

    profile_complete = False
    btw_number = None
    if profile:
        btw_number = profile.btw_number
        profile_complete = all([
            profile.company_name,
            profile.kvk_number,
            profile.btw_number,
            profile.iban,
        ])

    return BTWAangifteResponse(
        current_quarter=current_overview,
        previous_quarters=previous_quarters,
        profile_complete=profile_complete,
        btw_number=btw_number,
    )


# ============================================================================
# XML Export Endpoint
# ============================================================================

def _format_cents_xml(cents: int) -> str:
    """Format cents as whole euros for XML (e.g. 12345 cents = €123.45 → '123')."""
    return str(abs(cents) // 100)


@router.get(
    "/btw-aangifte/xml",
    summary="Download BTW overview as XML for Belastingdienst",
    description="Generates a simplified BTW aangifte XML based on the quarter overview data.",
)
async def download_btw_xml(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: Optional[int] = Query(None, description="Year (defaults to current)"),
    quarter: Optional[int] = Query(None, ge=1, le=4, description="Quarter (1-4, defaults to current)"),
) -> Response:
    """Download BTW overview as XML for Belastingdienst reference."""
    require_zzp(current_user)

    administration = await get_user_administration(current_user.id, db)
    admin_id = administration.id
    today = date.today()

    if year and quarter:
        target_date = date(year, (quarter - 1) * 3 + 1, 1)
    else:
        target_date = today

    quarter_label, quarter_start, quarter_end, btw_deadline, q_num, q_year = get_quarter_info(target_date)

    overview = await build_quarter_overview(
        admin_id, quarter_start, quarter_end, quarter_label, btw_deadline, today, db
    )

    # Get business profile
    profile_result = await db.execute(
        select(BusinessProfile).where(BusinessProfile.administration_id == admin_id)
    )
    profile = profile_result.scalar_one_or_none()

    # Build XML
    root = ET.Element("OB")
    root.set("xmlns", "http://www.belastingdienst.nl/btw/aangifte/v1")

    # Header
    header = ET.SubElement(root, "Aangiftegegevens")
    ET.SubElement(header, "Tijdvak").text = f"{q_year}-Q{q_num}"
    ET.SubElement(header, "DatumBegin").text = quarter_start.isoformat()
    ET.SubElement(header, "DatumEinde").text = quarter_end.isoformat()
    ET.SubElement(header, "AangifteDatum").text = today.isoformat()
    if profile and profile.btw_number:
        ET.SubElement(header, "OmzetbelastingNummer").text = profile.btw_number

    # Revenue breakdown by VAT rate
    omzet = ET.SubElement(root, "Omzet")
    # Separate 21% and 9% from rate breakdown
    omzet_21 = 0
    btw_21 = 0
    omzet_9 = 0
    btw_9 = 0
    omzet_0 = 0
    for rb in overview.vat_rate_breakdown:
        rate = float(rb.vat_rate)
        if rate > 20:  # 21%
            omzet_21 += rb.omzet_cents
            btw_21 += rb.vat_cents
        elif rate > 8:  # 9%
            omzet_9 += rb.omzet_cents
            btw_9 += rb.vat_cents
        else:
            omzet_0 += rb.omzet_cents

    # Rubriek 1a: Omzet belast met hoog tarief
    r1a = ET.SubElement(omzet, "Rubriek1a")
    ET.SubElement(r1a, "OmzetHoogTarief").text = _format_cents_xml(omzet_21)
    ET.SubElement(r1a, "BelastingHoogTarief").text = _format_cents_xml(btw_21)

    # Rubriek 1b: Omzet belast met laag tarief
    r1b = ET.SubElement(omzet, "Rubriek1b")
    ET.SubElement(r1b, "OmzetLaagTarief").text = _format_cents_xml(omzet_9)
    ET.SubElement(r1b, "BelastingLaagTarief").text = _format_cents_xml(btw_9)

    # Rubriek 1e: Omzet belast met 0% / overige
    if omzet_0 > 0:
        r1e = ET.SubElement(omzet, "Rubriek1e")
        ET.SubElement(r1e, "OmzetOverig").text = _format_cents_xml(omzet_0)

    # Rubriek 5a: Totaal output BTW
    totalen = ET.SubElement(root, "Totalen")
    r5a = ET.SubElement(totalen, "Rubriek5a")
    ET.SubElement(r5a, "TotaalOmzetbelasting").text = _format_cents_xml(overview.output_vat_cents)

    # Rubriek 5b: Voorbelasting
    r5b = ET.SubElement(totalen, "Rubriek5b")
    ET.SubElement(r5b, "Voorbelasting").text = _format_cents_xml(overview.input_vat_cents)

    # Rubriek 5c/5d: Te betalen / te vorderen
    if overview.net_vat_cents >= 0:
        r5c = ET.SubElement(totalen, "Rubriek5c")
        ET.SubElement(r5c, "TeBetalen").text = _format_cents_xml(overview.net_vat_cents)
    else:
        r5d = ET.SubElement(totalen, "Rubriek5d")
        ET.SubElement(r5d, "TeVorderen").text = _format_cents_xml(overview.net_vat_cents)

    # Generate XML string
    xml_str = ET.tostring(root, encoding="unicode", xml_declaration=True)
    xml_bytes = xml_str.encode("utf-8")
    filename = f"btw-overzicht-Q{q_num}-{q_year}.xml"

    return Response(
        content=xml_bytes,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(xml_bytes)),
        },
    )
