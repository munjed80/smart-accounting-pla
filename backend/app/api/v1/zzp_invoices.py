"""
ZZP Invoices API Endpoints

CRUD operations for ZZP invoices with lines, status transitions,
race-safe invoice number generation, and PDF generation.
"""
import base64
import logging
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.services.invoice_pdf import get_invoice_pdf_filename
from app.services.invoice_pdf_reportlab import generate_invoice_pdf_reportlab
from app.services.email import email_service
from app.models.zzp import (
    ZZPInvoice, 
    ZZPInvoiceLine, 
    ZZPInvoiceCounter, 
    ZZPCustomer, 
    BusinessProfile,
    InvoiceStatus,
)
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    InvoiceCreate,
    InvoiceUpdate,
    InvoiceStatusUpdate,
    InvoiceResponse,
    InvoiceListResponse,
    InvoiceLineResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp
from app.repositories.ledger_repository import LedgerRepository
from app.services.ledger_service import LedgerPostingService, LedgerPostingError

router = APIRouter()
logger = logging.getLogger(__name__)


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    """
    Get the primary administration for a ZZP user.
    """
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


async def generate_invoice_number(admin_id: UUID, db: AsyncSession) -> str:
    """
    Generate a sequential invoice number for an administration.
    
    Uses SELECT FOR UPDATE to prevent race conditions.
    Format: INV-YYYY-0001
    """
    current_year = datetime.now().year
    
    # Try to get or create counter with lock
    result = await db.execute(
        select(ZZPInvoiceCounter)
        .where(ZZPInvoiceCounter.administration_id == admin_id)
        .with_for_update()
    )
    counter = result.scalar_one_or_none()
    
    if counter:
        # Reset counter if year changed
        if counter.year != current_year:
            counter.year = current_year
            counter.counter = 1
        else:
            counter.counter += 1
    else:
        # Create new counter
        counter = ZZPInvoiceCounter(
            administration_id=admin_id,
            year=current_year,
            counter=1
        )
        db.add(counter)
    
    # Format: INV-2026-0001
    invoice_number = f"INV-{current_year}-{counter.counter:04d}"
    return invoice_number


def calculate_line_totals(quantity: float, unit_price_cents: int, vat_rate: float) -> tuple[int, int]:
    """Calculate line total and VAT amount in cents."""
    line_total = int(Decimal(str(quantity)) * Decimal(str(unit_price_cents)))
    vat_amount = int(Decimal(str(line_total)) * Decimal(str(vat_rate)) / Decimal('100'))
    return line_total, vat_amount


def invoice_to_response(invoice: ZZPInvoice) -> InvoiceResponse:
    """Convert invoice model to response schema."""
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


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(None, pattern=r'^(draft|sent|paid|overdue|cancelled)$'),
    customer_id: Optional[UUID] = Query(None),
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
):
    """
    List all invoices for the current user's administration.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Build query
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


@router.post("/invoices", response_model=InvoiceResponse, status_code=201)
async def create_invoice(
    invoice_in: InvoiceCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new invoice.
    
    - Generates sequential invoice number
    - Snapshots seller info from BusinessProfile
    - Snapshots customer info from customer record
    - Calculates line totals and VAT
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Verify customer exists and belongs to this administration
    customer_result = await db.execute(
        select(ZZPCustomer).where(
            ZZPCustomer.id == invoice_in.customer_id,
            ZZPCustomer.administration_id == administration.id
        )
    )
    customer = customer_result.scalar_one_or_none()
    
    if not customer:
        raise HTTPException(
            status_code=404,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."}
        )
    
    # Get business profile for seller snapshot
    profile_result = await db.execute(
        select(BusinessProfile).where(
            BusinessProfile.administration_id == administration.id
        )
    )
    profile = profile_result.scalar_one_or_none()
    
    # Generate invoice number (race-safe)
    invoice_number = await generate_invoice_number(administration.id, db)
    
    # Create invoice
    invoice = ZZPInvoice(
        administration_id=administration.id,
        customer_id=customer.id,
        invoice_number=invoice_number,
        status=InvoiceStatus.DRAFT.value,
        issue_date=date.fromisoformat(invoice_in.issue_date),
        due_date=date.fromisoformat(invoice_in.due_date) if invoice_in.due_date else None,
        notes=invoice_in.notes,
        # Seller snapshot
        seller_company_name=profile.company_name if profile else None,
        seller_trading_name=profile.trading_name if profile else None,
        seller_address_street=profile.address_street if profile else None,
        seller_address_postal_code=profile.address_postal_code if profile else None,
        seller_address_city=profile.address_city if profile else None,
        seller_address_country=profile.address_country if profile else None,
        seller_kvk_number=profile.kvk_number if profile else None,
        seller_btw_number=profile.btw_number if profile else None,
        seller_iban=profile.iban if profile else None,
        seller_email=profile.email if profile else None,
        seller_phone=profile.phone if profile else None,
        # Customer snapshot
        customer_name=customer.name,
        customer_address_street=customer.address_street,
        customer_address_postal_code=customer.address_postal_code,
        customer_address_city=customer.address_city,
        customer_address_country=customer.address_country,
        customer_kvk_number=customer.kvk_number,
        customer_btw_number=customer.btw_number,
    )
    
    db.add(invoice)
    await db.flush()  # Get invoice ID
    
    # Create invoice lines and calculate totals
    subtotal = 0
    vat_total = 0
    
    for i, line_data in enumerate(invoice_in.lines, start=1):
        line_total, vat_amount = calculate_line_totals(
            line_data.quantity, 
            line_data.unit_price_cents, 
            line_data.vat_rate
        )
        
        line = ZZPInvoiceLine(
            invoice_id=invoice.id,
            line_number=i,
            description=line_data.description,
            quantity=Decimal(str(line_data.quantity)),
            unit_price_cents=line_data.unit_price_cents,
            vat_rate=Decimal(str(line_data.vat_rate)),
            line_total_cents=line_total,
            vat_amount_cents=vat_amount,
        )
        db.add(line)
        
        subtotal += line_total
        vat_total += vat_amount
    
    # Update invoice totals
    invoice.subtotal_cents = subtotal
    invoice.vat_total_cents = vat_total
    invoice.total_cents = subtotal + vat_total
    
    await db.commit()

    try:
        ledger_service = LedgerPostingService(LedgerRepository(db, administration.id))
        await ledger_service.post_invoice(invoice.id)
        await db.commit()
    except LedgerPostingError as e:
        logger.warning(f"Invoice ledger posting skipped for {invoice.id}: {e}")
    
    # Reload with lines
    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(ZZPInvoice.id == invoice.id)
    )
    invoice = result.scalar_one()
    
    return invoice_to_response(invoice)


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get a specific invoice by ID.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
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


@router.put("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: UUID,
    invoice_in: InvoiceUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update an invoice.
    
    Only draft invoices can be fully edited.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
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
    
    if invoice.status != InvoiceStatus.DRAFT.value:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVOICE_NOT_EDITABLE", "message": "Alleen concept-facturen kunnen worden bewerkt."}
        )
    
    # Update basic fields
    if invoice_in.issue_date:
        invoice.issue_date = date.fromisoformat(invoice_in.issue_date)
    if invoice_in.due_date is not None:
        invoice.due_date = date.fromisoformat(invoice_in.due_date) if invoice_in.due_date else None
    if invoice_in.notes is not None:
        invoice.notes = invoice_in.notes
    
    # Update customer if changed
    if invoice_in.customer_id and invoice_in.customer_id != invoice.customer_id:
        customer_result = await db.execute(
            select(ZZPCustomer).where(
                ZZPCustomer.id == invoice_in.customer_id,
                ZZPCustomer.administration_id == administration.id
            )
        )
        customer = customer_result.scalar_one_or_none()
        
        if not customer:
            raise HTTPException(
                status_code=404,
                detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."}
            )
        
        invoice.customer_id = customer.id
        # Update customer snapshot
        invoice.customer_name = customer.name
        invoice.customer_address_street = customer.address_street
        invoice.customer_address_postal_code = customer.address_postal_code
        invoice.customer_address_city = customer.address_city
        invoice.customer_address_country = customer.address_country
        invoice.customer_kvk_number = customer.kvk_number
        invoice.customer_btw_number = customer.btw_number
    
    # Update lines if provided
    if invoice_in.lines is not None:
        # Delete existing lines
        for line in invoice.lines:
            await db.delete(line)
        
        # Create new lines
        subtotal = 0
        vat_total = 0
        
        for i, line_data in enumerate(invoice_in.lines, start=1):
            line_total, vat_amount = calculate_line_totals(
                line_data.quantity,
                line_data.unit_price_cents,
                line_data.vat_rate
            )
            
            line = ZZPInvoiceLine(
                invoice_id=invoice.id,
                line_number=i,
                description=line_data.description,
                quantity=Decimal(str(line_data.quantity)),
                unit_price_cents=line_data.unit_price_cents,
                vat_rate=Decimal(str(line_data.vat_rate)),
                line_total_cents=line_total,
                vat_amount_cents=vat_amount,
            )
            db.add(line)
            
            subtotal += line_total
            vat_total += vat_amount
        
        invoice.subtotal_cents = subtotal
        invoice.vat_total_cents = vat_total
        invoice.total_cents = subtotal + vat_total
    
    await db.commit()
    
    # Reload with lines
    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(ZZPInvoice.id == invoice.id)
    )
    invoice = result.scalar_one()
    
    return invoice_to_response(invoice)


@router.patch("/invoices/{invoice_id}/status", response_model=InvoiceResponse)
async def update_invoice_status(
    invoice_id: UUID,
    status_in: InvoiceStatusUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update invoice status.
    
    Valid transitions:
    - draft -> sent
    - sent -> paid
    - draft/sent -> cancelled
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
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
    
    current_status = invoice.status
    new_status = status_in.status
    
    # Validate status transition
    # Allow more flexible transitions for "Mark as Paid/Unpaid" functionality:
    # - paid -> sent (mark as unpaid)
    # - sent -> paid (mark as paid)
    valid_transitions = {
        InvoiceStatus.DRAFT.value: [InvoiceStatus.SENT.value, InvoiceStatus.CANCELLED.value],
        InvoiceStatus.SENT.value: [InvoiceStatus.PAID.value, InvoiceStatus.CANCELLED.value],
        InvoiceStatus.PAID.value: [InvoiceStatus.SENT.value],  # Allow "mark as unpaid"
        InvoiceStatus.CANCELLED.value: [],
        InvoiceStatus.OVERDUE.value: [InvoiceStatus.PAID.value, InvoiceStatus.SENT.value, InvoiceStatus.CANCELLED.value],
    }
    
    if new_status not in valid_transitions.get(current_status, []):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_STATUS_TRANSITION",
                "message": f"Kan status niet wijzigen van '{current_status}' naar '{new_status}'."
            }
        )
    
    invoice.status = new_status
    
    # Update paid_at timestamp based on status change
    if new_status == InvoiceStatus.PAID.value:
        # Mark as paid: set paid_at to current time (timezone-aware)
        invoice.paid_at = datetime.now(timezone.utc)
    elif current_status == InvoiceStatus.PAID.value and new_status != InvoiceStatus.PAID.value:
        # Mark as unpaid (transitioning from paid to another status): clear paid_at
        invoice.paid_at = None
    
    await db.commit()

    if new_status == InvoiceStatus.PAID.value:
        try:
            ledger_service = LedgerPostingService(LedgerRepository(db, administration.id))
            await ledger_service.post_invoice_payment(invoice.id)
            await db.commit()
        except LedgerPostingError as e:
            logger.warning(f"Invoice payment posting skipped for {invoice.id}: {e}")

    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(ZZPInvoice.id == invoice.id)
    )
    invoice = result.scalar_one()

    return invoice_to_response(invoice)


@router.delete("/invoices/{invoice_id}", status_code=204)
async def delete_invoice(
    invoice_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete an invoice.
    
    Only draft invoices can be deleted.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(ZZPInvoice).where(
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
    
    if invoice.status != InvoiceStatus.DRAFT.value:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVOICE_NOT_DELETABLE", "message": "Alleen concept-facturen kunnen worden verwijderd."}
        )
    
    await db.delete(invoice)
    await db.commit()
    
    return None


@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Generate and download a PDF for an invoice.
    
    Returns the invoice as a downloadable PDF file with proper headers:
    - Content-Type: application/pdf
    - Content-Disposition: attachment; filename="INV-YYYY-XXXX.pdf"
    - Content-Length: <size> (for mobile browser compatibility)
    - Cache-Control: no-cache (prevent stale PDFs)
    
    Uses ReportLab as the primary PDF generator (pure Python, Docker-safe).
    Falls back to WeasyPrint if ReportLab fails.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
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
    
    try:
        from app.services import invoice_pdf as invoice_pdf_service
        pdf_bytes = invoice_pdf_service.generate_invoice_pdf(invoice)
        filename = get_invoice_pdf_filename(invoice)
    except RuntimeError as e:
        error_msg = str(e)
        if "not available" in error_msg or "not installed" in error_msg:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "PDF_NOT_AVAILABLE",
                    "message": "PDF-generatie is tijdelijk niet beschikbaar. Probeer het later opnieuw."
                }
            )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "PDF_GENERATION_FAILED",
                "message": "Kon de PDF niet genereren. Probeer het later opnieuw."
            }
        )
    # Return PDF with mobile-safe headers
    # Content-Length is critical for iOS Safari to show download progress
    # Cache-Control prevents browsers from showing stale versions
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )


@router.post("/invoices/{invoice_id}/send", response_model=InvoiceResponse)
async def send_invoice(
    invoice_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InvoiceResponse:
    """
    Send invoice via email to the customer and update status to 'sent'.
    
    This endpoint:
    1. Validates the invoice exists and belongs to the user
    2. Fetches the customer email address
    3. Generates the invoice PDF
    4. Sends the invoice via email using the email service
    5. Updates the invoice status to 'sent'
    
    Returns the updated invoice.
    """
    require_zzp(current_user)
    
    administration = await get_user_administration(current_user.id, db)
    
    # Fetch invoice with lines and customer (need customer for email)
    result = await db.execute(
        select(ZZPInvoice)
        .options(
            selectinload(ZZPInvoice.lines),
            selectinload(ZZPInvoice.customer)
        )
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
    
    # Get customer email
    if not invoice.customer or not invoice.customer.email:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NO_CUSTOMER_EMAIL",
                "message": "Klant heeft geen e-mailadres. Voeg een e-mailadres toe aan de klant om de factuur te verzenden."
            }
        )
    
    customer_email = invoice.customer.email
    customer_name = invoice.customer.name
    
    # Generate PDF
    try:
        pdf_bytes = generate_invoice_pdf_reportlab(invoice)
        filename = get_invoice_pdf_filename(invoice)
    except Exception as pdf_error:
        logger.error(f"Failed to generate PDF for invoice {invoice_id}: {pdf_error}")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "PDF_GENERATION_FAILED",
                "message": "Kon de PDF niet genereren. Probeer het later opnieuw."
            }
        )
    
    # Send email
    try:
        # Prepare email content
        invoice_number = invoice.invoice_number
        total_amount = f"€{invoice.total_cents / 100:.2f}"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Factuur {invoice_number}</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="margin-top: 0;">Beste {customer_name},</p>
                <p>Hierbij ontvangt u factuur {invoice_number} voor een bedrag van {total_amount}.</p>
                <p>De factuur is bijgevoegd als PDF.</p>
                <p style="margin-top: 20px;">Met vriendelijke groet,<br>{invoice.seller_company_name or invoice.seller_trading_name or 'Uw leverancier'}</p>
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                <p style="color: #888; font-size: 12px; margin-bottom: 0;">
                    Dit is een geautomatiseerd bericht van Smart Accounting Platform.
                </p>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
Beste {customer_name},

Hierbij ontvangt u factuur {invoice_number} voor een bedrag van {total_amount}.

De factuur is bijgevoegd als PDF.

Met vriendelijke groet,
{invoice.seller_company_name or invoice.seller_trading_name or 'Uw leverancier'}

---
Dit is een geautomatiseerd bericht van Smart Accounting Platform.
        """
        
        # Send via Resend
        if not email_service.client:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "EMAIL_SERVICE_UNAVAILABLE",
                    "message": "E-mailservice is momenteel niet beschikbaar. Controleer de configuratie."
                }
            )
        
        # Encode PDF as base64 for attachment
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        
        email_service.client.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [customer_email],
            "subject": f"Factuur {invoice_number}",
            "html": html_content,
            "text": text_content,
            "attachments": [
                {
                    "filename": filename,
                    "content": pdf_base64,
                }
            ]
        })
        
    except Exception as email_error:
        logger.error(f"Failed to send email for invoice {invoice_id}: {email_error}")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "EMAIL_SEND_FAILED",
                "message": f"Kon de e-mail niet verzenden: {str(email_error)}"
            }
        )
    
    # Update invoice status to 'sent'
    invoice.status = InvoiceStatus.SENT.value
    await db.commit()

    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(ZZPInvoice.id == invoice.id)
    )
    invoice = result.scalar_one()

    return invoice_to_response(invoice)
