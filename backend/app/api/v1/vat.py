"""
VAT/BTW Report API Endpoints

Provides accountant-only endpoints for Dutch VAT return (BTW Aangifte):
- Get VAT report for a period
- Get ICP (Intra-Community) supplies report
- Validate VAT data
- List VAT codes
"""
from datetime import datetime
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
)
from app.services.vat import VatReportService, generate_vat_overview_pdf
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
    period_id: UUID,
    current_user: Annotated[CurrentUser, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Generate BTW submission package (XML/XBRL)."""
    # Verify accountant access
    administration = await verify_accountant_access(client_id, current_user, db)
    
    try:
        # Generate submission package
        service = SubmissionPackageService(db, administration.id)
        xml_content, filename = await service.generate_btw_package(period_id)
        
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
    period_id: UUID,
    current_user: Annotated[CurrentUser, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Generate ICP submission package (XML)."""
    # Verify accountant access
    administration = await verify_accountant_access(client_id, current_user, db)
    
    try:
        # Generate submission package
        service = SubmissionPackageService(db, administration.id)
        xml_content, filename = await service.generate_icp_package(period_id)
        
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
