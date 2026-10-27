"""
ZZP BTW Aangifte API Endpoint

Provides a self-service BTW (VAT) overview for ZZP users based on their
invoice and expense data. This is separate from the accountant-only VAT
report endpoints and calculates directly from ZZP data models.

Metrics provided per quarter:
- Omzet (revenue) recognized under the confirmed basis
- Output VAT collected from invoices
- Input VAT (deductible) from expenses
- Net VAT to pay or reclaim
- Validation warnings for missing or suspicious data
"""

from app.services.zzp_administration import get_user_administration
from app.services.zzp_vat_calculation import calculate_vat
from app.models.zzp_vat_policy import ZZPVatPolicy
from app.models.ledger import AccountingPeriod, PeriodStatus
from app.models.vat_submission import VatSubmission
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Annotated, List, Optional, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import (
    ZZPInvoice,
    ZZPInvoiceLine,
    ZZPExpense,
    InvoiceStatus,
    BusinessProfile,
)
from app.models.administration import Administration
from app.api.v1.deps import CurrentUser, require_zzp

logger = logging.getLogger(__name__)

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
    total_omzet_cents: int = Field(
        0, description="Recognized sales revenue (ex. BTW)"
    )
    total_vat_cents: int = Field(0, description="Recognized output VAT")


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

    # Unconfirmed historical figures are estimates, never a confirmed tax policy.
    basis: str = Field(
        "unconfirmed",
        description="Confirmed factuurstelsel/kasstelsel, or unconfirmed historical estimate.",
    )

    credit_note_count: int = 0
    credit_vat_cents: int = 0
    policy_confirmed: bool = False
    recognized_invoice_count: int = 0
    submission_available: bool = False

    # Key totals
    omzet_cents: int = Field(0, description="Total revenue (ex. BTW)")
    output_vat_cents: int = Field(0, description="Total output VAT (BTW afgedragen)")
    input_vat_cents: int = Field(
        0, description="Total deductible input VAT (voorbelasting)"
    )
    net_vat_cents: int = Field(
        0, description="Net VAT: output - input. Positive = pay, Negative = reclaim"
    )

    # VAT held in invoices that have been sent but are not yet paid.
    # On kasstelsel this VAT is *not* included in output_vat_cents – exposing
    # it lets the UI explain why the headline number looks low compared to
    # what the user sees on the Facturen page.
    unpaid_vat_cents: int = Field(
        0, description="Output VAT on sent/overdue invoices not yet collected."
    )

    # Breakdowns
    vat_rate_breakdown: List[BTWVatRateBreakdown] = Field(default_factory=list)
    invoice_summary: BTWInvoiceSummary = BTWInvoiceSummary()
    expense_summary: BTWExpenseSummary = BTWExpenseSummary()

    # Warnings / validation
    warnings: List[BTWWarning] = Field(default_factory=list)

    # Readiness
    is_ready: bool = Field(
        False, description="Implemented preparation checks passed; not proof of fiscal completeness or submission"
    )
    readiness_notes: List[str] = Field(default_factory=list)

    # Coarse classification of the quarter so the frontend can pick the
    # right empty/partial/full state instead of conflating everything as
    # a generic zero result.
    #
    # Values:
    #   NO_DATA         – no invoices and no expenses exist for the quarter
    #   ONLY_DRAFTS     – invoices exist but only as drafts (not counted)
    #   ONLY_UNPAID     – invoices exist & are sent but none are paid yet
    #                     (kasstelsel ⇒ no output VAT counted)
    #   ONLY_INVOICES   – paid invoices exist but no expenses recorded
    #                     (no deductible input VAT)
    #   ONLY_EXPENSES   – expenses exist but no paid invoices
    #   COMPLETE        – both paid invoices and expenses are present
    #   ERROR           – overview could not be built (set by the route
    #                     fallback handler so the UI can show a real
    #                     error instead of an empty-state placeholder)
    data_status: str = Field(
        "NO_DATA",
        description=(
            "Quarter completeness: NO_DATA | ONLY_DRAFTS | ONLY_UNPAID | "
            "ONLY_INVOICES | ONLY_EXPENSES | COMPLETE | ERROR"
        ),
    )
    data_status_reason: str = Field(
        "",
        description="Short Dutch human-readable explanation of data_status.",
    )

    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BTWAangifteResponse(BaseModel):
    """Full response for the BTW Aangifte page."""

    current_quarter: BTWQuarterOverview
    previous_quarters: List[BTWQuarterOverview] = Field(default_factory=list)
    profile_complete: bool = Field(False)
    btw_number: Optional[str] = None
    vat_policy: Optional[dict] = None


# ============================================================================
# Helper Functions
# ============================================================================


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


ISSUE_MESSAGES = {
    'CREDIT_CASH_RECONCILIATION_REQUIRED': ('Creditnota of terugbetaling aansluiten', 'Laat je boekhouder de creditnota, behouden ontvangsten en terugbetalingen aansluiten. De historische ontvangsten zijn geen automatische berekening van de btw-teruggaaf.'),
    'CREDIT_ORIGIN_REQUIRES_REVIEW': ('Oorspronkelijke aangifte controleren', 'De oorspronkelijke factuur valt vóór de bevestigde BTW-basis. Controleer eerder aangegeven btw voordat je een vermindering toepast.'),
    "LATE_INVOICE_REQUIRES_REVIEW": (
        "Late facturering vraagt beoordeling",
        "De factuurdatum ligt na de vijftiende dag na de leveringsmaand. Controleer het juiste aangiftetijdvak.",
    ),
    "ADVANCE_PAYMENT_REQUIRES_REVIEW": (
        "Vooruitbetaling vraagt beoordeling",
        "Controleer het fiscale tijdstip van vooruitbetalingen met je boekhouder.",
    ),
    "FOREIGN_TRANSACTION_REQUIRES_REVIEW": (
        "Buitenlandse transactie vraagt beoordeling",
        "Controleer de plaats van dienst, verlegging en eventuele ICP-aangifte apart.",
    ),
    "INVALID_PAYMENT_ALLOCATION": (
        "Betalingsverdeling vraagt beoordeling",
        "Een betaling bevat een ongeldige verdeling. Laat deze corrigeren.",
    ),
    "EXPENSE_VAT_REQUIRES_REVIEW": (
        "Voorbelasting vraagt beoordeling",
        "Controleer ongeldige of negatieve uitgavenbedragen en aftrekbare btw.",
    ),
    "BASIS_UNCONFIRMED": (
        "BTW-stelsel nog niet bevestigd",
        "Dit is de historische schatting op betaalde facturen. Bevestig met je boekhouder welk stelsel vanaf deze periode geldt.",
    ),
    "UNALLOCATED_RECEIPTS": (
        "Ontvangsten nog niet volledig gekoppeld",
        "Koppel ontvangsten aan facturen voordat je de btw over deze betalingen berekent.",
    ),
    "INVOICE_LINES_UNRECONCILED": (
        "Factuurregels sluiten niet aan",
        "Controleer facturen zonder volledige regels of met afwijkende totalen. De tariefverdeling is onvolledig.",
    ),
    "LEGACY_PAYMENT_DATE_UNKNOWN": (
        "Historische betaaldatum ontbreekt",
        "De factuurdatum is gebruikt als voorlopige betaaldatum. Laat deze periode controleren.",
    ),
    "ALLOCATION_EXCEEDS_INVOICE": (
        "Betalingen overschrijden de factuur",
        "Controleer de betalingsverdeling; er wordt niet meer dan het factuurbedrag meegerekend.",
    ),
    "PAYMENT_ON_INACTIVE_INVOICE": (
        "Betaling op concept of geannuleerde factuur",
        "Laat de factuur en betaling corrigeren voordat je deze periode gebruikt.",
    ),
    "UNSUPPORTED_INVOICE": (
        "Factuurbedrag vraagt beoordeling",
        "Deze berekening ondersteunt alleen positieve reguliere verkoopfacturen.",
    ),
    "UNSUPPORTED_VAT_RATE": (
        "BTW-tarief vraagt beoordeling",
        "Controleer dit tarief met je boekhouder; de referentie ondersteunt reguliere Nederlandse tarieven.",
    ),
    "ZERO_RATE_REQUIRES_REVIEW": (
        "Nultarief vraagt beoordeling",
        "Controleer of sprake is van 0%, vrijstelling, KOR of verlegging en welke aangifterubriek daarbij hoort.",
    ),
}


async def build_quarter_overview(
    admin_id, quarter_start, quarter_end, quarter_label, btw_deadline, today, db
):
    calculation = await calculate_vat(db, admin_id, quarter_start, quarter_end)
    invoices = calculation.quarter_invoices
    paid = [invoice for invoice in invoices if invoice.status == "paid"]
    sent = [invoice for invoice in invoices if invoice.status in ("sent", "overdue")]
    drafts = [invoice for invoice in invoices if invoice.status == "draft"]
    warnings = [
        BTWWarning(
            id=code,
            severity="error",
            title=ISSUE_MESSAGES[code][0],
            description=ISSUE_MESSAGES[code][1],
            related_route="/zzp/belastinghulp/btw",
        )
        for code in sorted(calculation.issues)
    ]
    if drafts:
        warnings.append(
            BTWWarning(
                id="DRAFT_INVOICES",
                severity="info",
                title=f"{len(drafts)} conceptfacturen niet meegeteld",
                description="Concepten tellen niet mee. Controleer of je administratie compleet is.",
                related_route="/zzp/invoices?status=draft",
            )
        )
    if sent:
        description = (
            "Deze facturen tellen op factuurdatum mee, ook als ze nog niet betaald zijn."
            if calculation.basis == "factuurstelsel"
            else "Alleen daadwerkelijk ontvangen en gekoppelde bedragen tellen mee bij een bevestigd kasstelsel."
        )
        warnings.append(
            BTWWarning(
                id="UNPAID_INVOICES",
                severity="info",
                title=f"{len(sent)} facturen nog niet betaald",
                description=description,
                related_route="/zzp/invoices?status=open",
            )
        )
    if not invoices:
        warnings.append(
            BTWWarning(
                id="NO_INVOICES",
                severity="info",
                title="Geen facturen in dit kwartaal",
                description="Controleer of alle verkoopfacturen en ontvangsten zijn vastgelegd.",
                related_route="/zzp/invoices",
            )
        )
    has_sales, has_expenses = bool(calculation.invoice_ids or calculation.credit_note_count), bool(calculation.expense_count)
    if has_sales and has_expenses:
        status, reason = (
            "COMPLETE",
            "Verkoopbedragen en uitgaven aanwezig; controleer de volledigheid en fiscale uitzonderingen.",
        )
    elif has_sales:
        status, reason = (
            "ONLY_INVOICES",
            "Wel verkoopbedragen, maar geen geregistreerde uitgaven in deze periode.",
        )
    elif has_expenses:
        status, reason = (
            "ONLY_EXPENSES",
            "Wel uitgaven, maar geen verkoopbedragen meegerekend volgens het geselecteerde stelsel.",
        )
    elif sent:
        status, reason = (
            "ONLY_UNPAID",
            "Openstaande facturen aanwezig; controleer het stelsel en gekoppelde betalingen.",
        )
    elif drafts:
        status, reason = (
            "ONLY_DRAFTS",
            "Alle facturen staan op concept en tellen niet mee.",
        )
    else:
        status, reason = "NO_DATA", "Nog geen facturen of uitgaven in dit kwartaal."
    notes = [
        "Dit overzicht is een voorbereiding, geen ingediende aangifte. Controleer bijzondere transacties en aftrekbaarheid met je boekhouder."
    ]
    if calculation.issues:
        notes.append(
            "Los de aandachtspunten op voordat je een referentiebestand exporteert."
        )
    return BTWQuarterOverview(
        quarter=quarter_label,
        quarter_start=quarter_start.isoformat(),
        quarter_end=quarter_end.isoformat(),
        deadline=btw_deadline.isoformat(),
        days_until_deadline=max(0, (btw_deadline - today).days),
        credit_note_count=calculation.credit_note_count, credit_vat_cents=calculation.credit_vat_cents,
        basis=calculation.basis,
        policy_confirmed=calculation.policy_confirmed,
        recognized_invoice_count=len(calculation.invoice_ids),
        submission_available=False,
        omzet_cents=calculation.omzet,
        output_vat_cents=calculation.output_vat,
        input_vat_cents=calculation.input_vat,
        net_vat_cents=calculation.output_vat - calculation.input_vat,
        unpaid_vat_cents=calculation.unpaid_vat,
        vat_rate_breakdown=[
            BTWVatRateBreakdown(
                vat_rate=rate,
                omzet_cents=bucket["omzet"],
                vat_cents=bucket["vat"],
                transaction_count=bucket["count"],
            )
            for rate, bucket in sorted(
                calculation.rate_buckets.items(),
                key=lambda item: Decimal(item[0]),
                reverse=True,
            )
        ],
        invoice_summary=BTWInvoiceSummary(
            total_count=len(invoices),
            paid_count=len(paid),
            sent_count=len(sent),
            draft_count=len(drafts),
            total_omzet_cents=calculation.omzet,
            total_vat_cents=calculation.output_vat,
        ),
        expense_summary=BTWExpenseSummary(
            total_count=calculation.expense_count,
            total_amount_cents=calculation.expense_amount,
            total_vat_deductible_cents=calculation.input_vat,
        ),
        warnings=warnings,
        is_ready=not calculation.issues and (has_sales or has_expenses),
        readiness_notes=notes,
        data_status=status,
        data_status_reason=reason,
    )


class VatPolicyConfirmation(BaseModel):
    basis: Literal["factuurstelsel", "kasstelsel"]
    effective_from: date
    acknowledge: Literal[True]


def policy_response(policy):
    return {
        "basis": policy.basis,
        "effective_from": policy.effective_from.isoformat(),
        "confirmed_at": policy.confirmed_at.isoformat(),
    }


@router.put("/btw-policy")
async def confirm_vat_policy(
    payload: VatPolicyConfirmation,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Confirm an initial basis. Later basis changes require an accountant-led migration."""
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    await db.scalar(
        select(Administration)
        .where(Administration.id == administration.id)
        .with_for_update()
    )
    existing = await db.scalar(
        select(ZZPVatPolicy).where(ZZPVatPolicy.administration_id == administration.id)
    )
    if existing:
        if (
            existing.basis == payload.basis
            and existing.effective_from == payload.effective_from
        ):
            return policy_response(existing)
        raise HTTPException(
            409,
            detail={
                "code": "VAT_POLICY_IMMUTABLE",
                "message": "Het bevestigde stelsel kan niet automatisch worden gewijzigd. Laat een overgang door je boekhouder begeleiden.",
            },
        )
    day = payload.effective_from
    if (
        day.year < 2000
        or day.day != 1
        or day.month not in (1, 4, 7, 10)
        or day > date.today()
    ):
        raise HTTPException(
            422,
            detail={
                "code": "VAT_POLICY_DATE",
                "message": "Kies de eerste dag van een gestart kwartaal.",
            },
        )
    closed = await db.scalar(
        select(AccountingPeriod.id)
        .where(
            AccountingPeriod.administration_id == administration.id,
            AccountingPeriod.end_date >= day,
            AccountingPeriod.start_date <= date.today(),
            AccountingPeriod.status.in_([PeriodStatus.FINALIZED, PeriodStatus.LOCKED]),
        )
        .limit(1)
    )
    submitted = await db.scalar(
        select(VatSubmission.id)
        .join(AccountingPeriod, AccountingPeriod.id == VatSubmission.period_id)
        .where(
            VatSubmission.administration_id == administration.id,
            AccountingPeriod.end_date >= day,
            VatSubmission.status.in_(["QUEUED", "SUBMITTED", "RECEIVED", "ACCEPTED"]),
        )
        .limit(1)
    )
    if closed or submitted:
        raise HTTPException(
            409,
            detail={
                "code": "VAT_POLICY_CLOSED_HISTORY",
                "message": "De ingangsdatum raakt afgesloten of ingediende perioden. Laat deze overgang beoordelen door je boekhouder.",
            },
        )
    policy = ZZPVatPolicy(
        administration_id=administration.id,
        basis=payload.basis,
        effective_from=day,
        confirmed_by=current_user.id,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy_response(policy)


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
    
    **Basis:** Confirmed per administration and effective date. Unconfirmed
    periods retain historical estimates and cannot export a reference file.
    """,
)
async def get_zzp_btw_aangifte(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: Optional[int] = Query(
        None, ge=2000, le=2100, description="Year to show (defaults to current)"
    ),
    quarter: Optional[int] = Query(
        None, ge=1, le=4, description="Quarter to show (1-4, defaults to current)"
    ),
) -> BTWAangifteResponse:
    """Get BTW Aangifte overview for the ZZP user."""
    require_zzp(current_user)

    administration = await get_user_administration(current_user.id, db)
    admin_id = administration.id
    today = date.today()

    if (year is None) != (quarter is None):
        raise HTTPException(422, detail="Geef jaar en kwartaal samen op.")

    # Determine target quarter
    if year and quarter:
        target_date = date(year, (quarter - 1) * 3 + 1, 1)
    else:
        target_date = today

    quarter_label, quarter_start, quarter_end, btw_deadline, q_num, q_year = (
        get_quarter_info(target_date)
    )

    # Build current quarter overview
    try:
        current_overview = await build_quarter_overview(
            admin_id, quarter_start, quarter_end, quarter_label, btw_deadline, today, db
        )
    except Exception:
        # Graceful fallback on any data inconsistency.  We log the full
        # traceback so production failures are diagnosable instead of
        # silently rendering as "empty quarter".  We also mark the
        # quarter with an explicit ERROR data_status so the frontend can
        # show a real error instead of the empty-state placeholder.
        logger.exception(
            "Failed to build BTW quarter overview for admin %s (%s)",
            admin_id,
            quarter_label,
        )
        current_overview = BTWQuarterOverview(
            quarter=quarter_label,
            quarter_start=quarter_start.isoformat(),
            quarter_end=quarter_end.isoformat(),
            deadline=btw_deadline.isoformat(),
            days_until_deadline=max(0, (btw_deadline - today).days),
            data_status="ERROR",
            data_status_reason=(
                "Er ging iets mis bij het berekenen van dit kwartaal. "
                "De gegevens hieronder zijn mogelijk onvolledig."
            ),
            warnings=[
                BTWWarning(
                    id="W_ERR",
                    severity="error",
                    title="Fout bij berekenen",
                    description=(
                        "Er is een probleem opgetreden bij het berekenen van je "
                        "BTW-overzicht. Probeer het later opnieuw of neem contact "
                        "op met support als het probleem aanhoudt."
                    ),
                )
            ],
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
        prev_target = date(
            prev_date.year if prev_q <= q_num - i + 4 else q_year - 1, prev_month, 1
        )
        p_label, p_start, p_end, p_deadline, _, _ = get_quarter_info(prev_target)

        try:
            prev_overview = await build_quarter_overview(
                admin_id, p_start, p_end, p_label, p_deadline, today, db
            )
            previous_quarters.append(prev_overview)
        except Exception:
            # Skip quarters that fail gracefully, but log so issues
            # are diagnosable rather than silently hidden.
            logger.exception(
                "Failed to build previous BTW quarter overview " "for admin %s (%s)",
                admin_id,
                p_label,
            )

    # Get business profile for BTW number
    profile_result = await db.execute(
        select(BusinessProfile).where(BusinessProfile.administration_id == admin_id)
    )
    profile = profile_result.scalar_one_or_none()

    profile_complete = False
    btw_number = None
    if profile:
        btw_number = profile.btw_number
        profile_complete = all(
            [
                profile.company_name,
                profile.kvk_number,
                profile.btw_number,
                profile.iban,
            ]
        )

    return BTWAangifteResponse(
        current_quarter=current_overview,
        previous_quarters=previous_quarters,
        profile_complete=profile_complete,
        btw_number=btw_number,
        vat_policy=(
            policy_response(policy)
            if (
                policy := await db.scalar(
                    select(ZZPVatPolicy).where(
                        ZZPVatPolicy.administration_id == admin_id
                    )
                )
            )
            else None
        ),
    )


# ============================================================================
# XML Export Endpoint
# ============================================================================


def _format_cents_xml(cents: int) -> str:
    """Preserve signed cents in this reference file; it is not a tax-return payload."""
    return format(Decimal(cents) / 100, ".2f")


@router.get(
    "/btw-aangifte/xml",
    summary="Download a non-submittable BTW reference XML",
    description="Generates a reference-only XML with exact cents; this is not a tax-authority payload and submits nothing.",
)
async def download_btw_xml(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: Optional[int] = Query(
        None, ge=2000, le=2100, description="Year (defaults to current)"
    ),
    quarter: Optional[int] = Query(
        None, ge=1, le=4, description="Quarter (1-4, defaults to current)"
    ),
) -> Response:
    """Download BTW overview as XML for Belastingdienst reference."""
    require_zzp(current_user)

    administration = await get_user_administration(current_user.id, db)
    admin_id = administration.id
    today = date.today()

    if (year is None) != (quarter is None):
        raise HTTPException(422, detail="Geef jaar en kwartaal samen op.")
    if year and quarter:
        target_date = date(year, (quarter - 1) * 3 + 1, 1)
    else:
        target_date = today

    quarter_label, quarter_start, quarter_end, btw_deadline, q_num, q_year = (
        get_quarter_info(target_date)
    )

    overview = await build_quarter_overview(
        admin_id, quarter_start, quarter_end, quarter_label, btw_deadline, today, db
    )

    if not overview.is_ready:
        raise HTTPException(
            409,
            detail={
                "code": "VAT_REVIEW_REQUIRED",
                "message": "Bevestig het stelsel en los de aandachtspunten op voordat je exporteert.",
            },
        )

    # Get business profile
    profile_result = await db.execute(
        select(BusinessProfile).where(BusinessProfile.administration_id == admin_id)
    )
    profile = profile_result.scalar_one_or_none()

    # Build XML
    root = ET.Element("ZZPBTWReference")
    root.set("purpose", "reference-only-not-a-tax-return")
    root.set("basis", overview.basis)
    root.set("submitted", "false")

    # Header
    header = ET.SubElement(root, "Referentiegegevens")
    ET.SubElement(header, "Tijdvak").text = f"{q_year}-Q{q_num}"
    ET.SubElement(header, "DatumBegin").text = quarter_start.isoformat()
    ET.SubElement(header, "DatumEinde").text = quarter_end.isoformat()
    ET.SubElement(header, "GegenereerdOp").text = today.isoformat()
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
    ET.SubElement(r5a, "TotaalOmzetbelasting").text = _format_cents_xml(
        overview.output_vat_cents
    )

    # Rubriek 5b: Voorbelasting
    r5b = ET.SubElement(totalen, "Rubriek5b")
    ET.SubElement(r5b, "Voorbelasting").text = _format_cents_xml(
        overview.input_vat_cents
    )

    # Rubriek 5c/5d: Te betalen / te vorderen
    if overview.net_vat_cents >= 0:
        r5c = ET.SubElement(totalen, "Rubriek5c")
        ET.SubElement(r5c, "TeBetalen").text = _format_cents_xml(overview.net_vat_cents)
    else:
        r5d = ET.SubElement(totalen, "Rubriek5d")
        ET.SubElement(r5d, "TeVorderen").text = _format_cents_xml(
            abs(overview.net_vat_cents)
        )

    # Generate XML string
    xml_str = ET.tostring(root, encoding="unicode", xml_declaration=True)
    xml_bytes = xml_str.encode("utf-8")
    filename = f"btw-referentie-Q{q_num}-{q_year}.xml"

    return Response(
        content=xml_bytes,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(xml_bytes)),
        },
    )
