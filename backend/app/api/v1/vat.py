"""
VAT/BTW Report API Endpoints

Provides accountant-only endpoints for Dutch VAT return (BTW Aangifte):
- Get VAT report for a period
- Get ICP (Intra-Community) supplies report
- Validate VAT data
- List VAT codes
"""
from datetime import datetime, timezone
from typing import Annotated, Optional, List
from uuid import UUID
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.ledger import AccountingPeriod, PeriodStatus as ModelPeriodStatus
from app.models.accounting import VatCode
from app.schemas.vat import (
    BTWAangifteResponse,
    VatBoxResponse,
    VatCodeSummaryResponse,
    VatAnomalyResponse,
    ICPEntryResponse,
    ICPReportResponse,
    VatValidationResponse,
    VatCodeResponse,
    VatCodesListResponse,
    SubmissionPackageRequest,
    VatBoxTotalsResponse,
    VatBoxTotalResponse,
    VatBoxLinesResponse,
    VatBoxLineResponse,
    CreateVatSubmissionRequest,
    MarkSubmittedRequest,
    VatSubmissionResponse,
    VatSubmissionListResponse,
    VatSubmissionStatusResponse,
    PrepareSubmissionRequest,
    PrepareSubmissionResponse,
    QueueSubmissionRequest,
    QueueSubmissionResponse,
    VatSubmissionType,
)
from app.services.vat import VatReportService, VatLineageService, generate_vat_overview_pdf
from app.services.vat.report import VatReportError, PeriodNotEligibleError
from app.services.vat.submission import SubmissionPackageService, SubmissionPackageError
from app.api.v1.deps import CurrentUser

router = APIRouter()


async def verify_accountant_access(
    client_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession,
) -> Administration:
    """Verify user has accountant access to the client."""
    if current_user.role not in ["accountant", "admin", "super_admin"]:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available for accountants"
        )

    if current_user.role == "super_admin":
        administration_result = await db.execute(select(Administration).where(Administration.id == client_id))
        administration = administration_result.scalar_one_or_none()
        if not administration:
            raise HTTPException(status_code=404, detail="Client not found")
        return administration

    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(Administration.id == client_id)
        .where(AdministrationMember.user_id == current_user.id)
        .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Client not found or access denied")
    
    return administration


def generate_mapping_reason(
    vat_code: VatCode,
    box_code: str,
    net_amount: float,
    vat_amount: float,
) -> str:
    """
    Generate a human-readable explanation for why a transaction maps to a specific VAT box.
    
    Uses VAT code category and box_mapping metadata to provide accurate, maintainable
    explanations without relying on code name parsing.
    
    Args:
        vat_code: The VAT code used for the transaction
        box_code: The target box code (e.g., "1a", "3b", "5b")
        net_amount: Net transaction amount
        vat_amount: VAT amount
        
    Returns:
        A short explanation string (e.g., "Binnenlandse omzet 21% → rubriek 1a")
    """
    box_mapping = vat_code.box_mapping or {}
    rate = float(vat_code.rate)
    category = vat_code.category.value if hasattr(vat_code.category, 'value') else str(vat_code.category)
    
    # Domestic turnover boxes (1a-1e) - based on rate and category
    if box_code in ["1a", "1b", "1c"]:
        if category == "SALES":
            return f"Binnenlandse omzet {rate}% → rubriek {box_code}"
        return f"Omzet ander tarief ({rate}%) → rubriek {box_code}"
    
    if box_code == "1d":
        return f"Privégebruik → rubriek 1d"
    
    if box_code == "1e":
        return f"Omzet 0% of niet belast → rubriek 1e"
    
    # Domestic reverse charge (2a)
    if box_code == "2a":
        return f"Binnenlandse verlegging → rubriek 2a"
    
    # Export/EU turnover boxes (3a-3b)
    if box_code == "3a":
        return f"Levering buiten EU → rubriek 3a"
    
    if box_code == "3b":
        return f"ICP levering binnen EU → rubriek 3b"
    
    # Reverse charge boxes (4a-4b) - use category to distinguish
    if box_code == "4a":
        # Check if this is in the vat_box (output VAT) or turnover
        if category == "REVERSE_CHARGE":
            return f"Verlegde BTW diensten buiten EU → rubriek 4a"
        return f"Verlegde BTW - invoer/diensten buiten EU → rubriek 4a"
    
    if box_code == "4b":
        if category == "INTRA_EU":
            return f"EU-verwerving → rubriek 4b"
        return f"Verlegde BTW EU-verwerving → rubriek 4b"
    
    # Calculation boxes (5a, 5c, 5g)
    if box_code == "5a":
        return f"Verschuldigde BTW (berekend) → rubriek 5a"
    
    if box_code == "5c":
        return f"Subtotaal (5a - 5b) → rubriek 5c"
    
    if box_code == "5g":
        return f"Te betalen/ontvangen → rubriek 5g"
    
    # Input VAT / deductible box (5b) - use category to explain context
    if box_code == "5b":
        if category == "PURCHASES":
            return f"Voorbelasting {rate}% → rubriek 5b"
        elif category == "REVERSE_CHARGE":
            return f"Aftrekbare BTW verlegging → rubriek 5b"
        elif category == "INTRA_EU":
            return f"Aftrekbare BTW EU-verwerving → rubriek 5b"
        return f"Voorbelasting → rubriek 5b"
    
    # Fallback for any other boxes
    return f"BTW-code {vat_code.code} ({rate}%) → rubriek {box_code}"


@router.get(
    "/clients/{client_id}/periods/{period_id}/reports/vat",
    response_model=BTWAangifteResponse,
    summary="Get VAT Report (BTW Aangifte)",
    description="""
    Generate Dutch VAT return (BTW Aangifte) report for a period.
    
    **Box Mapping (Belastingdienst compliant):**
    - 1a: NL domestic supplies at 21% rate (leveringen/diensten hoog tarief)
    - 1b: NL domestic supplies at 9% rate (leveringen/diensten laag tarief)
    - 1c: Supplies at other rates
    - 1d: Private use (privégebruik)
    - 1e: Zero-rate/exempt supplies
    - 2a: Domestic reverse charge (binnenlandse verlegging, e.g. construction)
    - 3a: Exports (outside EU)
    - 3b: ICP - Intra-Community supplies to other EU countries
    - 4a: Non-EU services reverse charge + import VAT (diensten/invoer buiten EU)
    - 4b: Intra-EU acquisitions (goods/services from other EU countries)
    - 5a: VAT payable (subtotal of 1a-1d, 2a, 4a, 4b)
    - 5b: Input VAT / voorbelasting (deductible VAT)
    - 5c: Subtotal (5a - 5b)
    - 5g: Total to pay/receive
    
    **Key compliance notes:**
    - EU acquisition purchases → 4b turnover + 4b VAT + 5b input VAT (net zero if deductible)
    - Non-EU services reverse charge → 4a turnover + 4a VAT + 5b input VAT (net zero if deductible)
    - ICP supplies → 3b turnover only (0% VAT)
    
    **Note:** Report can only be generated for REVIEW, FINALIZED, or LOCKED periods
    unless `allow_draft=true` is specified.
    """
)
async def get_vat_report(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    allow_draft: bool = Query(False, description="Allow report generation for OPEN periods"),
):
    """Get VAT report (BTW Aangifte) for a period."""
    await verify_accountant_access(client_id, current_user, db)
    
    service = VatReportService(db, client_id)
    
    try:
        report = await service.generate_vat_report(period_id, allow_draft=allow_draft)
    except PeriodNotEligibleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except VatReportError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    # Convert to response
    return BTWAangifteResponse(
        period_id=report.period_id,
        period_name=report.period_name,
        start_date=report.start_date,
        end_date=report.end_date,
        generated_at=report.generated_at,
        boxes={
            code: VatBoxResponse(
                box_code=box.box_code,
                box_name=box.box_name,
                turnover_amount=box.turnover_amount,
                vat_amount=box.vat_amount,
                transaction_count=box.transaction_count,
            )
            for code, box in report.boxes.items()
        },
        vat_code_summaries=[
            VatCodeSummaryResponse(
                vat_code_id=s.vat_code_id,
                vat_code=s.vat_code,
                vat_code_name=s.vat_code_name,
                vat_rate=s.vat_rate,
                category=s.category,
                base_amount=s.base_amount,
                vat_amount=s.vat_amount,
                transaction_count=s.transaction_count,
            )
            for s in report.vat_code_summaries
        ],
        total_turnover=report.total_turnover,
        total_vat_payable=report.total_vat_payable,
        total_vat_receivable=report.total_vat_receivable,
        net_vat=report.net_vat,
        anomalies=[
            VatAnomalyResponse(
                id=a.id,
                code=a.code,
                severity=a.severity,
                title=a.title,
                description=a.description,
                journal_entry_id=a.journal_entry_id,
                journal_line_id=a.journal_line_id,
                document_id=a.document_id,
                suggested_fix=a.suggested_fix,
                amount_discrepancy=a.amount_discrepancy,
            )
            for a in report.anomalies
        ],
        has_red_anomalies=report.has_red_anomalies,
        has_yellow_anomalies=report.has_yellow_anomalies,
        icp_entries=[
            ICPEntryResponse(
                customer_vat_number=e.customer_vat_number,
                country_code=e.country_code,
                customer_name=e.customer_name,
                customer_id=e.customer_id,
                taxable_base=e.taxable_base,
                transaction_count=e.transaction_count,
            )
            for e in report.icp_entries
        ],
        total_icp_supplies=report.total_icp_supplies,
    )


@router.get(
    "/clients/{client_id}/periods/{period_id}/reports/vat/icp",
    response_model=ICPReportResponse,
    summary="Get ICP Report",
    description="""
    Get ICP (Intra-Community) supplies report for EU B2B transactions.
    
    Returns list of EU customers with their VAT numbers and taxable base totals.
    This data is used for ICP declaration (Opgaaf ICL) to Dutch tax authorities.
    """
)
async def get_icp_report(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get ICP (Intra-Community) supplies report for a period."""
    await verify_accountant_access(client_id, current_user, db)
    
    service = VatReportService(db, client_id)
    
    try:
        # Get period for metadata
        period = await service._get_period(period_id)
        entries = await service.get_icp_report(period_id)
    except VatReportError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    return ICPReportResponse(
        period_id=period.id,
        period_name=period.name,
        start_date=period.start_date,
        end_date=period.end_date,
        entries=[
            ICPEntryResponse(
                customer_vat_number=e.customer_vat_number,
                country_code=e.country_code,
                customer_name=e.customer_name,
                customer_id=e.customer_id,
                taxable_base=e.taxable_base,
                transaction_count=e.transaction_count,
            )
            for e in entries
        ],
        total_supplies=sum(e.taxable_base for e in entries),
        total_customers=len(entries),
    )


@router.post(
    "/clients/{client_id}/periods/{period_id}/vat/validate",
    response_model=VatValidationResponse,
    summary="Validate VAT Data",
    description="""
    Validate VAT data for a period and return anomalies.
    
    **Anomaly Types:**
    - `VAT_BASE_NO_AMOUNT`: VAT base amount without VAT amount
    - `VAT_AMOUNT_NO_BASE`: VAT amount without base amount
    - `VAT_RATE_MISMATCH`: VAT amount doesn't match expected rate
    - `ICP_NO_VAT_NUMBER`: ICP supply without customer VAT number
    - `RC_NO_COUNTRY`: Reverse charge without supplier country
    - `VAT_NEGATIVE_UNEXPECTED`: Unexpected negative VAT amount
    
    **Severity:**
    - `RED`: Must be resolved before filing
    - `YELLOW`: Warning, can proceed with acknowledgment
    """
)
async def validate_vat(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Validate VAT data for a period."""
    await verify_accountant_access(client_id, current_user, db)
    
    service = VatReportService(db, client_id)
    
    try:
        period = await service._get_period(period_id)
        anomalies = await service.validate_vat_return(period_id)
    except VatReportError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    red_count = sum(1 for a in anomalies if a.severity == "RED")
    yellow_count = sum(1 for a in anomalies if a.severity == "YELLOW")
    is_valid = red_count == 0
    
    if is_valid and yellow_count == 0:
        message = "VAT data is valid. No issues found."
    elif is_valid:
        message = f"VAT data has {yellow_count} warning(s) that can be acknowledged."
    else:
        message = f"VAT data has {red_count} error(s) that must be resolved."
    
    return VatValidationResponse(
        period_id=period.id,
        period_name=period.name,
        anomalies=[
            VatAnomalyResponse(
                id=a.id,
                code=a.code,
                severity=a.severity,
                title=a.title,
                description=a.description,
                journal_entry_id=a.journal_entry_id,
                journal_line_id=a.journal_line_id,
                document_id=a.document_id,
                suggested_fix=a.suggested_fix,
                amount_discrepancy=a.amount_discrepancy,
            )
            for a in anomalies
        ],
        total_anomalies=len(anomalies),
        red_count=red_count,
        yellow_count=yellow_count,
        is_valid=is_valid,
        message=message,
    )


@router.get(
    "/vat-codes",
    response_model=VatCodesListResponse,
    summary="List VAT Codes",
    description="Get all available Dutch VAT codes with their box mappings.",
)
async def list_vat_codes(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    active_only: bool = Query(True, description="Only return active VAT codes"),
):
    """List all available VAT codes."""
    if current_user.role not in ["accountant", "admin", "super_admin"]:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available for accountants"
        )
    
    query = select(VatCode).order_by(VatCode.code)
    if active_only:
        query = query.where(VatCode.is_active == True)
    
    result = await db.execute(query)
    vat_codes = list(result.scalars().all())
    
    return VatCodesListResponse(
        vat_codes=[
            VatCodeResponse(
                id=vc.id,
                code=vc.code,
                name=vc.name,
                description=vc.description,
                rate=vc.rate,
                category=vc.category,
                box_mapping=vc.box_mapping,
                eu_only=vc.eu_only,
                requires_vat_number=vc.requires_vat_number,
                is_reverse_charge=vc.is_reverse_charge,
                is_icp=vc.is_icp,
                is_active=vc.is_active,
            )
            for vc in vat_codes
        ],
        total_count=len(vat_codes),
    )


@router.get(
    "/clients/{client_id}/periods/{period_id}/reports/vat.pdf",
    summary="Download VAT Overview PDF",
)
async def download_vat_report_pdf(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Download a printable VAT overview PDF for manual filing."""
    administration = await verify_accountant_access(client_id, current_user, db)

    service = VatReportService(db, client_id)
    try:
        report = await service.generate_vat_report(period_id, allow_draft=True)
    except (PeriodNotEligibleError, VatReportError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    pdf_bytes = generate_vat_overview_pdf(administration, report)
    filename = f"btw-overzicht-{report.period_name.lower().replace(' ', '-')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


@router.post(
    "/clients/{client_id}/tax/btw/submission-package",
    summary="Generate BTW Submission Package",
    description="""
    Generate a submission-ready package for BTW (VAT) return.
    
    **Phase A: Submission-ready package**
    
    Returns an XML/XBRL file in canonical format suitable for submission
    to the Dutch Belastingdienst.
    
    The package includes:
    - VAT boxes (rubrieken) with amounts
    - Totals and calculations
    - Audit trail reference
    
    **Requirements:**
    - Period must be REVIEW, FINALIZED, or LOCKED (not OPEN)
    - No blocking (RED) anomalies present
    
    **Phase B (Future):** This endpoint will be enhanced to support
    direct submission via Digipoort connector.
    """,
)
async def generate_btw_submission_package(
    client_id: UUID,
    request: SubmissionPackageRequest,
    current_user: Annotated[CurrentUser, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Generate BTW submission package (XML/XBRL)."""
    from app.models.vat_submission import VatSubmission
    import uuid as uuid_module
    
    # Verify accountant access
    administration = await verify_accountant_access(client_id, current_user, db)
    
    try:
        # Generate submission package
        service = SubmissionPackageService(db, administration.id)
        xml_content, filename = await service.generate_btw_package(request.period_id)
        
        # Create submission record
        submission = VatSubmission(
            id=uuid_module.uuid4(),
            administration_id=client_id,
            period_id=request.period_id,
            submission_type="BTW",
            created_by=current_user.id,
            method="PACKAGE",
            status="DRAFT",
        )
        db.add(submission)
        await db.commit()
        
        # Return XML file
        xml_bytes = xml_content.encode('utf-8')
        return Response(
            content=xml_bytes,
            media_type="application/xml",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(xml_bytes)),
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except SubmissionPackageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (PeriodNotEligibleError, VatReportError) as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/clients/{client_id}/tax/icp/submission-package",
    summary="Generate ICP Submission Package",
    description="""
    Generate a submission-ready package for ICP (Intra-Community Supplies) return.
    
    **Phase A: Submission-ready package**
    
    Returns an XML file in canonical format suitable for submission
    to the Dutch Belastingdienst.
    
    The package includes:
    - ICP entries (customer VAT numbers, country codes, amounts)
    - Totals
    - Audit trail reference
    
    **Requirements:**
    - Period must be REVIEW, FINALIZED, or LOCKED (not OPEN)
    - At least one ICP entry must exist in the period
    
    **Note:** ICP submission is only required when there are
    intra-community supplies (leveringen naar/diensten in EU landen).
    
    **Phase B (Future):** This endpoint will be enhanced to support
    direct submission via Digipoort connector.
    """,
)
async def generate_icp_submission_package(
    client_id: UUID,
    request: SubmissionPackageRequest,
    current_user: Annotated[CurrentUser, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Generate ICP submission package (XML)."""
    from app.models.vat_submission import VatSubmission
    import uuid as uuid_module
    
    # Verify accountant access
    administration = await verify_accountant_access(client_id, current_user, db)
    
    try:
        # Generate submission package
        service = SubmissionPackageService(db, administration.id)
        xml_content, filename = await service.generate_icp_package(request.period_id)
        
        # Create submission record
        submission = VatSubmission(
            id=uuid_module.uuid4(),
            administration_id=client_id,
            period_id=request.period_id,
            submission_type="ICP",
            created_by=current_user.id,
            method="PACKAGE",
            status="DRAFT",
        )
        db.add(submission)
        await db.commit()
        
        # Return XML file
        xml_bytes = xml_content.encode('utf-8')
        return Response(
            content=xml_bytes,
            media_type="application/xml",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(xml_bytes)),
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except SubmissionPackageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (PeriodNotEligibleError, VatReportError) as e:
        raise HTTPException(status_code=404, detail=str(e))


# VAT Box Lineage / Drilldown Endpoints

@router.get(
    "/clients/{client_id}/btw/periods/{period_id}/boxes",
    response_model=VatBoxTotalsResponse,
    summary="Get VAT Box Totals",
    description="""
    Get aggregated totals for all VAT boxes in a period.
    
    This endpoint provides the totals for each VAT box (rubriek) with:
    - Net amount (turnover/base)
    - VAT amount
    - Number of source lines
    
    **Security:** Enforces consent/active-client isolation.
    Only accessible by accountants with ACTIVE assignment to the client.
    """,
)
async def get_vat_box_totals(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get VAT box totals for a period."""
    # Enforce consent/active-client isolation
    await verify_accountant_access(client_id, current_user, db)
    
    # Get period
    result = await db.execute(
        select(AccountingPeriod)
        .where(AccountingPeriod.id == period_id)
        .where(AccountingPeriod.administration_id == client_id)
    )
    period = result.scalar_one_or_none()
    
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    # Get box totals from lineage service
    lineage_service = VatLineageService(db, client_id)
    totals_dict = await lineage_service.get_box_totals(period_id)
    
    # Dutch VAT box names (for reference)
    box_names = {
        "1a": "Leveringen/diensten belast met hoog tarief (21%)",
        "1b": "Leveringen/diensten belast met laag tarief (9%)",
        "1c": "Leveringen/diensten belast met ander tarief",
        "1d": "Privégebruik",
        "1e": "Leveringen/diensten belast met 0% of niet bij u belast",
        "2a": "Verwerving uit landen binnen de EU (binnenlandse verlegging)",
        "3a": "Leveringen naar landen buiten de EU",
        "3b": "Leveringen naar/diensten in landen binnen de EU (ICP)",
        "4a": "Verlegde btw - diensten/invoer van buiten de EU",
        "4b": "Verlegde btw - verwervingen uit EU-landen",
        "5a": "Verschuldigde btw (subtotaal)",
        "5b": "Voorbelasting (aftrekbare btw)",
        "5c": "Subtotaal (5a - 5b)",
        "5d": "Vermindering KOR",
        "5e": "Schatting vorige tijdvak(ken)",
        "5f": "Schatting dit tijdvak",
        "5g": "Totaal te betalen / te ontvangen",
    }
    
    # Build response with all boxes (including empty ones)
    boxes = []
    for box_code in box_names.keys():
        totals = totals_dict.get(box_code, {
            'net_amount': Decimal("0.00"),
            'vat_amount': Decimal("0.00"),
            'line_count': 0,
        })
        boxes.append(VatBoxTotalResponse(
            box_code=box_code,
            box_name=box_names[box_code],
            net_amount=totals['net_amount'],
            vat_amount=totals['vat_amount'],
            line_count=totals['line_count'],
        ))
    
    return VatBoxTotalsResponse(
        period_id=period.id,
        period_name=period.name,
        boxes=boxes,
        generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/clients/{client_id}/btw/periods/{period_id}/boxes/{box_code}/lines",
    response_model=VatBoxLinesResponse,
    summary="Get VAT Box Drilldown Lines",
    description="""
    Get detailed drilldown lines for a specific VAT box in a period.
    
    This endpoint returns all source lines that contribute to a VAT box with:
    - Source references (invoice line, expense line, journal line)
    - Document references
    - Journal entry and line IDs
    - Transaction details (date, amount, description, party)
    - Immutable timestamps for audit trail
    
    Supports filtering by:
    - Source type (INVOICE_LINE, EXPENSE_LINE, JOURNAL_LINE)
    - Date range (from_date, to_date)
    
    **Security:** Enforces consent/active-client isolation.
    Only accessible by accountants with ACTIVE assignment to the client.
    """,
)
async def get_vat_box_lines(
    client_id: UUID,
    period_id: UUID,
    box_code: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Items per page"),
    source_type: Optional[str] = Query(None, description="Filter by source type"),
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
):
    """Get drilldown lines for a specific VAT box."""
    # Enforce consent/active-client isolation
    await verify_accountant_access(client_id, current_user, db)
    
    # Get period
    result = await db.execute(
        select(AccountingPeriod)
        .where(AccountingPeriod.id == period_id)
        .where(AccountingPeriod.administration_id == client_id)
    )
    period = result.scalar_one_or_none()
    
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    # Get drilldown lines from lineage service
    lineage_service = VatLineageService(db, client_id)
    offset = (page - 1) * page_size
    
    lines, total_count = await lineage_service.get_box_lines(
        period_id=period_id,
        box_code=box_code,
        limit=page_size,
        offset=offset,
        source_type=source_type,
        from_date=from_date,
        to_date=to_date,
    )
    
    # Fetch VAT codes for mapping reasons
    vat_code_ids = [line.vat_code_id for line in lines if line.vat_code_id]
    vat_codes = {}
    if vat_code_ids:
        vat_code_result = await db.execute(
            select(VatCode).where(VatCode.id.in_(vat_code_ids))
        )
        vat_codes = {vc.id: vc for vc in vat_code_result.scalars().all()}
    
    # Dutch VAT box names
    box_names = {
        "1a": "Leveringen/diensten belast met hoog tarief (21%)",
        "1b": "Leveringen/diensten belast met laag tarief (9%)",
        "1c": "Leveringen/diensten belast met ander tarief",
        "1d": "Privégebruik",
        "1e": "Leveringen/diensten belast met 0% of niet bij u belast",
        "2a": "Verwerving uit landen binnen de EU (binnenlandse verlegging)",
        "3a": "Leveringen naar landen buiten de EU",
        "3b": "Leveringen naar/diensten in landen binnen de EU (ICP)",
        "4a": "Verlegde btw - diensten/invoer van buiten de EU",
        "4b": "Verlegde btw - verwervingen uit EU-landen",
        "5a": "Verschuldigde btw (subtotaal)",
        "5b": "Voorbelasting (aftrekbare btw)",
        "5c": "Subtotaal (5a - 5b)",
        "5d": "Vermindering KOR",
        "5e": "Schatting vorige tijdvak(ken)",
        "5f": "Schatting dit tijdvak",
        "5g": "Totaal te betalen / te ontvangen",
    }
    
    return VatBoxLinesResponse(
        period_id=period.id,
        period_name=period.name,
        box_code=box_code,
        box_name=box_names.get(box_code, f"Box {box_code}"),
        lines=[
            VatBoxLineResponse(
                id=line.id,
                vat_box_code=line.vat_box_code,
                net_amount=line.net_amount,
                vat_amount=line.vat_amount,
                source_type=line.source_type,
                source_id=line.source_id,
                document_id=line.document_id,
                journal_entry_id=line.journal_entry_id,
                journal_line_id=line.journal_line_id,
                vat_code_id=line.vat_code_id,
                transaction_date=line.transaction_date,
                reference=line.reference,
                description=line.description,
                party_id=line.party_id,
                party_name=line.party_name,
                party_vat_number=line.party_vat_number,
                created_at=line.created_at,
                mapping_reason=generate_mapping_reason(
                    vat_codes[line.vat_code_id],
                    line.vat_box_code,
                    float(line.net_amount),
                    float(line.vat_amount),
                ) if line.vat_code_id and line.vat_code_id in vat_codes else None,
            )
            for line in lines
        ],
        total_count=total_count,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/clients/{client_id}/btw/periods/{period_id}/evidence-pack",
    summary="Download BTW Evidence Pack (Bewijsmap)",
    description="""
    Download a comprehensive evidence pack (bewijsmap) for BTW submission.
    
    The evidence pack includes:
    - Box totals with transaction counts
    - All linked documents list
    - Complete audit trail with immutable IDs and timestamps
    
    **Format:** PDF document
    
    **Security:** Enforces consent/active-client isolation.
    Only accessible by accountants with ACTIVE assignment to the client.
    """,
)
async def download_evidence_pack(
    client_id: UUID,
    period_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Download evidence pack PDF for BTW submission."""
    from app.services.vat.evidence_pack import VatEvidencePackService
    
    # Enforce consent/active-client isolation
    await verify_accountant_access(client_id, current_user, db)
    
    try:
        # Generate evidence pack
        service = VatEvidencePackService(db, client_id)
        pdf_bytes, filename = await service.generate_evidence_pack_pdf(period_id)
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes)),
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate evidence pack: {str(e)}")


# VAT Submission Tracking Endpoints

@router.get(
    "/clients/{client_id}/vat/submissions",
    response_model=VatSubmissionListResponse,
    summary="List VAT Submissions",
    description="""
    List all VAT submission records for a client.
    
    Returns submission history including:
    - Submission type (BTW or ICP)
    - Status (DRAFT, SUBMITTED, CONFIRMED, REJECTED)
    - Creation and submission timestamps
    - Reference text and attachments
    
    **Security:** Enforces consent/active-client isolation.
    Only accessible by accountants with ACTIVE assignment to the client.
    """,
)
async def list_vat_submissions(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    period_id: Optional[UUID] = Query(None, description="Filter by period"),
    submission_type: Optional[str] = Query(None, description="Filter by type (BTW or ICP)"),
    status: Optional[str] = Query(None, description="Filter by status"),
):
    """List VAT submissions for a client."""
    from app.models.vat_submission import VatSubmission
    
    # Enforce consent/active-client isolation
    await verify_accountant_access(client_id, current_user, db)
    
    # Build query
    query = select(VatSubmission).where(VatSubmission.administration_id == client_id)
    
    if period_id:
        query = query.where(VatSubmission.period_id == period_id)
    if submission_type:
        query = query.where(VatSubmission.submission_type == submission_type)
    if status:
        query = query.where(VatSubmission.status == status)
    
    query = query.order_by(VatSubmission.created_at.desc())
    
    result = await db.execute(query)
    submissions = list(result.scalars().all())
    
    return VatSubmissionListResponse(
        submissions=[
            VatSubmissionResponse(
                id=s.id,
                administration_id=s.administration_id,
                period_id=s.period_id,
                submission_type=s.submission_type,
                created_at=s.created_at,
                created_by=s.created_by,
                method=s.method,
                status=s.status,
                reference_text=s.reference_text,
                attachment_url=s.attachment_url,
                submitted_at=s.submitted_at,
                updated_at=s.updated_at,
            )
            for s in submissions
        ],
        total_count=len(submissions),
    )


@router.post(
    "/clients/{client_id}/vat/submissions",
    response_model=VatSubmissionResponse,
    summary="Create VAT Submission Record",
    description="""
    Create a new VAT submission record when generating a submission package.
    
    This endpoint creates a DRAFT submission record that tracks:
    - When the package was generated
    - Who generated it
    - What period it covers
    
    **Security:** Enforces consent/active-client isolation.
    Only accessible by accountants with ACTIVE assignment to the client.
    """,
)
async def create_vat_submission(
    client_id: UUID,
    request: CreateVatSubmissionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new VAT submission record."""
    from app.models.vat_submission import VatSubmission
    import uuid
    
    # Enforce consent/active-client isolation
    await verify_accountant_access(client_id, current_user, db)
    
    # Verify period exists
    result = await db.execute(
        select(AccountingPeriod)
        .where(AccountingPeriod.id == request.period_id)
        .where(AccountingPeriod.administration_id == client_id)
    )
    period = result.scalar_one_or_none()
    
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    # Create submission record
    submission = VatSubmission(
        id=uuid.uuid4(),
        administration_id=client_id,
        period_id=request.period_id,
        submission_type=request.submission_type.value,
        created_by=current_user.id,
        method=request.method.value,
        status="DRAFT",
    )
    
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    
    return VatSubmissionResponse(
        id=submission.id,
        administration_id=submission.administration_id,
        period_id=submission.period_id,
        submission_type=submission.submission_type,
        created_at=submission.created_at,
        created_by=submission.created_by,
        method=submission.method,
        status=submission.status,
        reference_text=submission.reference_text,
        attachment_url=submission.attachment_url,
        submitted_at=submission.submitted_at,
        updated_at=submission.updated_at,
    )


@router.post(
    "/clients/{client_id}/vat/submissions/{submission_id}/mark-submitted",
    response_model=VatSubmissionResponse,
    summary="Mark Submission as Submitted",
    description="""
    Mark a VAT submission as submitted to the tax authority.
    
    This endpoint updates the submission status to SUBMITTED and records:
    - Reference text (e.g., "Submitted via portal on DATE")
    - Optional attachment URL for proof/receipt
    - Submission timestamp
    
    **Security:** Enforces consent/active-client isolation.
    Only accessible by accountants with ACTIVE assignment to the client.
    """,
)
async def mark_submission_submitted(
    client_id: UUID,
    submission_id: UUID,
    request: MarkSubmittedRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark a submission as submitted."""
    from app.models.vat_submission import VatSubmission
    
    # Enforce consent/active-client isolation
    await verify_accountant_access(client_id, current_user, db)
    
    # Get submission
    result = await db.execute(
        select(VatSubmission)
        .where(VatSubmission.id == submission_id)
        .where(VatSubmission.administration_id == client_id)
    )
    submission = result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # Update submission
    submission.status = "SUBMITTED"
    submission.reference_text = request.reference_text
    submission.attachment_url = request.attachment_url
    submission.submitted_at = datetime.now(timezone.utc)
    submission.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(submission)
    
    return VatSubmissionResponse(
        id=submission.id,
        administration_id=submission.administration_id,
        period_id=submission.period_id,
        submission_type=submission.submission_type,
        created_at=submission.created_at,
        created_by=submission.created_by,
        method=submission.method,
        status=submission.status,
        reference_text=submission.reference_text,
        attachment_url=submission.attachment_url,
        submitted_at=submission.submitted_at,
        updated_at=submission.updated_at,
    )



@router.post(
    "/clients/{client_id}/tax/btw/submit",
    response_model=VatSubmissionResponse,
    summary="Submit BTW via Connector",
    description="""
    Submit BTW (VAT) declaration using the configured submission connector.
    
    This endpoint:
    1. Validates that the period is in READY_FOR_FILING status
    2. Generates the BTW submission package (XML)
    3. Submits via the configured connector (Package-only or Digipoort)
    4. Creates a submission record with reference and status
    
    **Connector Modes:**
    - PACKAGE_ONLY (default): Stores XML locally, returns status=DRAFT
    - DIGIPOORT (if enabled): Submits to Digipoort API, returns actual status
    
    **Permissions:** Requires accountant access to the client and period must be READY_FOR_FILING.
    
    **Returns:** submission_id, reference, status
    """,
)
async def submit_btw_via_connector(
    client_id: UUID,
    request: SubmissionPackageRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Submit BTW via configured connector."""
    from app.models.vat_submission import VatSubmission
    from app.services.tax_submission_connector import get_tax_connector
    import uuid as uuid_module
    
    # Verify accountant access
    administration = await verify_accountant_access(client_id, current_user, db)
    
    # Verify period is READY_FOR_FILING
    result = await db.execute(
        select(AccountingPeriod)
        .where(AccountingPeriod.id == request.period_id)
        .where(AccountingPeriod.administration_id == client_id)
    )
    period = result.scalar_one_or_none()
    
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    if period.status != ModelPeriodStatus.READY_FOR_FILING:
        raise HTTPException(
            status_code=400,
            detail=f"Period must be in READY_FOR_FILING status to submit. Current status: {period.status.value}"
        )
    
    try:
        # Generate submission package
        service = SubmissionPackageService(db, administration.id)
        xml_content, filename = await service.generate_btw_package(request.period_id)
        
        # Create submission record
        submission_id = uuid_module.uuid4()
        
        # Get connector and submit
        connector = get_tax_connector()
        result = await connector.submit_btw(
            xml_content=xml_content,
            administration_id=client_id,
            period_id=request.period_id,
            submission_id=submission_id,
        )
        
        # Create submission record with connector result
        submission = VatSubmission(
            id=submission_id,
            administration_id=client_id,
            period_id=request.period_id,
            submission_type="BTW",
            created_by=current_user.id,
            method="DIGIPOORT" if connector.mode == "DIGIPOORT" else "PACKAGE",
            status=result.status.value,
            reference_text=result.reference,
            connector_response=result.response_data,
            submitted_at=result.timestamp if result.status.value != "DRAFT" else None,
        )
        
        db.add(submission)
        await db.commit()
        await db.refresh(submission)
        
        return VatSubmissionResponse(
            id=submission.id,
            administration_id=submission.administration_id,
            period_id=submission.period_id,
            submission_type=submission.submission_type,
            created_at=submission.created_at,
            created_by=submission.created_by,
            method=submission.method,
            status=submission.status,
            reference_text=submission.reference_text,
            attachment_url=submission.attachment_url,
            connector_response=submission.connector_response,
            submitted_at=submission.submitted_at,
            updated_at=submission.updated_at,
        )
        
    except SubmissionPackageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Submission failed: {str(e)}")


@router.post(
    "/clients/{client_id}/tax/icp/submit",
    response_model=VatSubmissionResponse,
    summary="Submit ICP via Connector",
    description="""
    Submit ICP (Intra-Community supplies) declaration using the configured submission connector.
    
    This endpoint:
    1. Validates that the period is in READY_FOR_FILING status
    2. Generates the ICP submission package (XML)
    3. Submits via the configured connector (Package-only or Digipoort)
    4. Creates a submission record with reference and status
    
    **Connector Modes:**
    - PACKAGE_ONLY (default): Stores XML locally, returns status=DRAFT
    - DIGIPOORT (if enabled): Submits to Digipoort API, returns actual status
    
    **Permissions:** Requires accountant access to the client and period must be READY_FOR_FILING.
    
    **Returns:** submission_id, reference, status
    """,
)
async def submit_icp_via_connector(
    client_id: UUID,
    request: SubmissionPackageRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Submit ICP via configured connector."""
    from app.models.vat_submission import VatSubmission
    from app.services.tax_submission_connector import get_tax_connector
    import uuid as uuid_module
    
    # Verify accountant access
    administration = await verify_accountant_access(client_id, current_user, db)
    
    # Verify period is READY_FOR_FILING
    result = await db.execute(
        select(AccountingPeriod)
        .where(AccountingPeriod.id == request.period_id)
        .where(AccountingPeriod.administration_id == client_id)
    )
    period = result.scalar_one_or_none()
    
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    if period.status != ModelPeriodStatus.READY_FOR_FILING:
        raise HTTPException(
            status_code=400,
            detail=f"Period must be in READY_FOR_FILING status to submit. Current status: {period.status.value}"
        )
    
    try:
        # Generate submission package
        service = SubmissionPackageService(db, administration.id)
        xml_content, filename = await service.generate_icp_package(request.period_id)
        
        # Create submission record
        submission_id = uuid_module.uuid4()
        
        # Get connector and submit
        connector = get_tax_connector()
        result = await connector.submit_icp(
            xml_content=xml_content,
            administration_id=client_id,
            period_id=request.period_id,
            submission_id=submission_id,
        )
        
        # Create submission record with connector result
        submission = VatSubmission(
            id=submission_id,
            administration_id=client_id,
            period_id=request.period_id,
            submission_type="ICP",
            created_by=current_user.id,
            method="DIGIPOORT" if connector.mode == "DIGIPOORT" else "PACKAGE",
            status=result.status.value,
            reference_text=result.reference,
            connector_response=result.response_data,
            submitted_at=result.timestamp if result.status.value != "DRAFT" else None,
        )
        
        db.add(submission)
        await db.commit()
        await db.refresh(submission)
        
        return VatSubmissionResponse(
            id=submission.id,
            administration_id=submission.administration_id,
            period_id=submission.period_id,
            submission_type=submission.submission_type,
            created_at=submission.created_at,
            created_by=submission.created_by,
            method=submission.method,
            status=submission.status,
            reference_text=submission.reference_text,
            attachment_url=submission.attachment_url,
            connector_response=submission.connector_response,
            submitted_at=submission.submitted_at,
            updated_at=submission.updated_at,
        )
        
    except SubmissionPackageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Submission failed: {str(e)}")


# Digipoort-Ready Submission Endpoints

@router.post(
    "/clients/{client_id}/vat/{period_id}/submit/prepare",
    response_model=PrepareSubmissionResponse,
    summary="Prepare VAT/ICP Submission",
    description="""
    Prepare a VAT or ICP submission for Digipoort.
    
    This endpoint:
    - Generates the XML payload
    - Validates the payload
    - Creates/updates a DRAFT submission record
    - Returns validation errors if any
    
    **Phase B Integration**: This is the foundation for automated Digipoort submission.
    Currently prepares the submission without making external API calls.
    """,
)
async def prepare_vat_submission(
    client_id: UUID,
    period_id: UUID,
    request: PrepareSubmissionRequest,
    current_user: Annotated[CurrentUser, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Prepare VAT/ICP submission - generate and validate payload."""
    from app.services.vat_submission_service import VatSubmissionService, VatSubmissionError
    from app.api.v1.deps import require_assigned_client
    
    # Verify accountant access with consent
    await require_assigned_client(client_id, current_user, db, required_scope="reports")
    
    try:
        service = VatSubmissionService(db, client_id)
        submission, validation_errors = await service.create_draft_submission(
            period_id=period_id,
            kind=request.kind.value,
            user_id=current_user.id,
            validate=True,
        )
        
        return PrepareSubmissionResponse(
            submission_id=submission.id,
            status=submission.status,
            validation_errors=validation_errors,
            payload_hash=submission.payload_hash or "",
        )
        
    except VatSubmissionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/clients/{client_id}/vat/submissions/{submission_id}/queue",
    response_model=QueueSubmissionResponse,
    summary="Queue Submission for Digipoort",
    description="""
    Queue a DRAFT submission for Digipoort submission.
    
    This endpoint:
    - Validates the submission is in DRAFT status
    - Validates the payload
    - Signs the payload (placeholder for Phase B)
    - Moves status to QUEUED
    
    **Phase B Integration**: In Phase B, this will trigger actual Digipoort submission.
    """,
)
async def queue_vat_submission(
    client_id: UUID,
    submission_id: UUID,
    request: QueueSubmissionRequest,
    current_user: Annotated[CurrentUser, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Queue a submission for Digipoort."""
    from app.services.vat_submission_service import VatSubmissionService, VatSubmissionError
    from app.api.v1.deps import require_assigned_client
    
    # Verify accountant access with consent
    await require_assigned_client(client_id, current_user, db, required_scope="reports")
    
    try:
        service = VatSubmissionService(db, client_id)
        submission = await service.queue_submission(
            submission_id=submission_id,
            certificate_id=request.certificate_id,
        )
        
        return QueueSubmissionResponse(
            submission_id=submission.id,
            status=submission.status,
            correlation_id=submission.correlation_id,
        )
        
    except VatSubmissionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/clients/{client_id}/vat/submissions",
    response_model=VatSubmissionListResponse,
    summary="List VAT/ICP Submissions",
    description="""
    List all VAT/ICP submissions for a client.
    
    Filter by period and/or submission type (kind).
    Results are ordered by created_at DESC (newest first).
    """,
)
async def list_vat_submissions(
    client_id: UUID,
    current_user: Annotated[CurrentUser, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
    period_id: Optional[UUID] = Query(None, description="Filter by period"),
    kind: Optional[str] = Query(None, description="Filter by submission type (VAT or ICP)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
):
    """List VAT/ICP submissions for a client."""
    from app.models.vat_submission import VatSubmission
    from app.api.v1.deps import require_assigned_client
    from sqlalchemy import desc, func
    
    # Verify accountant access with consent
    await require_assigned_client(client_id, current_user, db, required_scope="reports")
    
    # Build query
    query = select(VatSubmission).where(
        VatSubmission.administration_id == client_id
    )
    
    if period_id:
        query = query.where(VatSubmission.period_id == period_id)
    
    if kind:
        if kind not in ["VAT", "ICP"]:
            raise HTTPException(status_code=400, detail="Invalid kind. Must be VAT or ICP")
        query = query.where(VatSubmission.submission_type == kind)
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_query)
    total_count = count_result.scalar()
    
    # Apply ordering and pagination
    query = query.order_by(desc(VatSubmission.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    # Execute query
    result = await db.execute(query)
    submissions = list(result.scalars().all())
    
    return VatSubmissionListResponse(
        submissions=[
            VatSubmissionResponse(
                id=s.id,
                administration_id=s.administration_id,
                period_id=s.period_id,
                submission_type=s.submission_type,
                created_at=s.created_at,
                created_by=s.created_by,
                method=s.method,
                status=s.status,
                reference_text=s.reference_text,
                attachment_url=s.attachment_url,
                payload_hash=s.payload_hash,
                digipoort_message_id=s.digipoort_message_id,
                correlation_id=s.correlation_id,
                last_status_check_at=s.last_status_check_at,
                error_code=s.error_code,
                error_message=s.error_message,
                connector_response=s.connector_response,
                submitted_at=s.submitted_at,
                updated_at=s.updated_at,
            )
            for s in submissions
        ],
        total_count=total_count or 0,
    )


@router.get(
    "/clients/{client_id}/vat/submissions/{submission_id}/status",
    response_model=VatSubmissionStatusResponse,
    summary="Get VAT Submission Status",
    description="""
    Get the current status of a VAT/ICP submission.
    
    Returns:
    - Current Digipoort status
    - Message ID (if submitted to Digipoort)
    - Correlation ID for tracking
    - Last status check timestamp
    - Status message (human-readable)
    - Error details (if applicable)
    
    In sandbox mode, status is immediately updated to ACCEPTED.
    In production mode (future), this would poll Digipoort for actual status.
    """,
)
async def get_vat_submission_status(
    client_id: UUID,
    submission_id: UUID,
    current_user: Annotated[CurrentUser, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get status of a VAT submission."""
    from app.models.vat_submission import VatSubmission
    from app.api.v1.deps import require_assigned_client
    
    # Verify accountant access with consent
    await require_assigned_client(client_id, current_user, db, required_scope="reports")
    
    # Get submission
    result = await db.execute(
        select(VatSubmission)
        .where(VatSubmission.id == submission_id)
        .where(VatSubmission.administration_id == client_id)
    )
    submission = result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # Build status message
    status_messages = {
        "DRAFT": "Concept - nog niet ingediend",
        "QUEUED": "In wachtrij voor verzending",
        "SENT": "Verzonden naar Digipoort",
        "RECEIVED": "Ontvangen door Belastingdienst",
        "ACCEPTED": "Geaccepteerd door Belastingdienst",
        "CONFIRMED": "Bevestigd door Belastingdienst",
        "REJECTED": "Afgewezen door Belastingdienst",
        "FAILED": "Fout bij verzending",
        "ERROR": "Technische fout opgetreden",
    }
    status_message = status_messages.get(submission.status, f"Status: {submission.status}")
    
    # Extract metadata from connector_response
    metadata = submission.connector_response.get('digipoort_response', {}).get('metadata') if submission.connector_response else None
    
    return VatSubmissionStatusResponse(
        submission_id=submission.id,
        status=submission.status,
        digipoort_message_id=submission.digipoort_message_id,
        correlation_id=submission.correlation_id,
        last_checked_at=submission.last_status_check_at,
        status_message=status_message,
        error_code=submission.error_code,
        error_message=submission.error_message,
        metadata=metadata,
    )
