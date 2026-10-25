"""
ZZP Invoices API Endpoints

CRUD operations for ZZP invoices with lines, status transitions,
race-safe invoice number generation, and PDF generation.
"""
import base64
import hashlib
import logging
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import Response
from sqlalchemy import and_, select, func, or_, case
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.services.invoice_rendering import render_invoice_pdf, pdf_disposition
from app.services.invoice_pdf import get_invoice_pdf_filename
from app.services.email import email_service
from app.models.zzp import (
    ZZPInvoice, 
    ZZPInvoiceLine, 
    ZZPCustomer, 
    BusinessProfile,
    InvoiceStatus,
)
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    InvoiceCreate, InvoicePreview,
    InvoiceUpdate,
    InvoiceStatusUpdate,
    InvoiceResponse,
    InvoiceListResponse,
    InvoiceLineResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp
from app.api.v1._zzp_invoices_helpers import (
    calculate_line_totals,
    generate_invoice_number, refresh_seller_snapshot,
    get_user_administration,
    invoice_to_response,
)
from app.services.zzp_integrity import require_open_dates, sync_invoice

router = APIRouter()
logger = logging.getLogger(__name__)



@router.post('/invoices/preview')
async def preview_invoice(payload: InvoicePreview, current_user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]):
    """Render an unsaved concept without reserving an invoice number or writing rows."""
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    customer = await db.scalar(select(ZZPCustomer).where(ZZPCustomer.id == payload.customer_id, ZZPCustomer.administration_id == administration.id))
    if not customer:
        raise HTTPException(404, detail={'code': 'CUSTOMER_NOT_FOUND', 'message': 'Klant niet gevonden.'})
    invoice = ZZPInvoice(invoice_number=payload.invoice_number or 'CONCEPT', status='draft', issue_date=date.fromisoformat(payload.issue_date),
        due_date=date.fromisoformat(payload.due_date) if payload.due_date else None,
        delivery_date=date.fromisoformat(payload.delivery_date) if payload.delivery_date else None,
        notes=payload.notes, subtotal_cents=0, vat_total_cents=0, total_cents=0)
    for name in ('name', 'address_street', 'address_postal_code', 'address_city', 'address_country', 'kvk_number', 'btw_number'):
        setattr(invoice, f'customer_{name}', getattr(customer, name))
    await refresh_seller_snapshot(invoice, administration.id, db)
    invoice.lines = []
    for index, line in enumerate(payload.lines, 1):
        net, vat = calculate_line_totals(line.quantity, line.unit_price_cents, line.vat_rate)
        invoice.lines.append(ZZPInvoiceLine(line_number=index, **line.model_dump(), line_total_cents=net, vat_amount_cents=vat))
        invoice.subtotal_cents += net
        invoice.vat_total_cents += vat
    invoice.total_cents = invoice.subtotal_cents + invoice.vat_total_cents
    try:
        data = await run_in_threadpool(render_invoice_pdf, invoice)
    except Exception as error:
        raise HTTPException(503, detail={'code': 'PDF_NOT_AVAILABLE', 'message': 'Voorbeeld genereren mislukt. Probeer opnieuw.'}) from error
    return Response(data, media_type='application/pdf', headers={'Content-Disposition': 'inline; filename="concept.pdf"', 'Cache-Control':'no-store'})


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Optional[int] = Query(None, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, max_length=200),
    min_cents: Optional[int] = Query(None, ge=0),
    max_cents: Optional[int] = Query(None, ge=0),
    status: Optional[str] = Query(None, pattern=r'^(draft|sent|paid|overdue|cancelled)$'),
    customer_id: Optional[UUID] = Query(None),
    from_date: Optional[date] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="Filter to date (YYYY-MM-DD)"),
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
    
    if q:
        term = f'%{q}%'
        query = query.where(or_(ZZPInvoice.invoice_number.ilike(term), ZZPInvoice.customer_name.ilike(term), ZZPInvoice.notes.ilike(term), ZZPInvoice.lines.any(ZZPInvoiceLine.description.ilike(term))))
    if min_cents is not None: query = query.where(ZZPInvoice.total_cents >= min_cents)
    if max_cents is not None: query = query.where(ZZPInvoice.total_cents <= max_cents)
    # Apply filters
    if status:
        query = query.where(or_(ZZPInvoice.status == 'overdue', and_(ZZPInvoice.status == 'sent', ZZPInvoice.due_date < date.today())) if status == 'overdue' else ZZPInvoice.status == status)
    if customer_id:
        query = query.where(ZZPInvoice.customer_id == customer_id)
    if from_date:
        query = query.where(ZZPInvoice.issue_date >= from_date)
    if to_date:
        query = query.where(ZZPInvoice.issue_date <= to_date)

    query = query.order_by(ZZPInvoice.issue_date.desc(), ZZPInvoice.invoice_number.desc(), ZZPInvoice.id)

    rows = query.order_by(None).subquery()
    stats = dict((await db.execute(select(
        func.count().label('total'),
        func.coalesce(func.sum(case((rows.c.status == 'draft', 1), else_=0)), 0).label('draft'),
        func.coalesce(func.sum(case((rows.c.status == 'sent', 1), else_=0)), 0).label('sent'),
        func.coalesce(func.sum(case((rows.c.status == 'paid', 1), else_=0)), 0).label('paid'),
        func.coalesce(func.sum(case((rows.c.status == 'overdue', 1), else_=0)), 0).label('overdue'),
        func.coalesce(func.sum(case((rows.c.status == 'cancelled', 1), else_=0)), 0).label('cancelled'),
        func.coalesce(func.sum(rows.c.total_cents), 0).label('totalAmount'),
        func.coalesce(func.sum(case((rows.c.status == 'paid', rows.c.total_cents), else_=0)), 0).label('paidAmount'),
        func.coalesce(func.sum(case((rows.c.status.in_(['sent','overdue']), rows.c.total_cents), else_=0)), 0).label('openAmount')
    ))).mappings().one())
    total = stats['total']
    if limit is not None: query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    invoices = result.scalars().all()
    
    return InvoiceListResponse(
        invoices=[invoice_to_response(inv) for inv in invoices],
        stats=stats,
        total=total
    )


@router.post("/invoices", response_model=InvoiceResponse, status_code=201)
async def create_invoice(
    invoice_in: InvoiceCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    creation_key: Annotated[Optional[UUID], Header(alias="Idempotency-Key")] = None,
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
    
    await db.execute(select(Administration.id).where(Administration.id == administration.id).with_for_update())
    payload_hash = hashlib.sha256(invoice_in.model_dump_json().encode()).hexdigest()
    if creation_key:
        previous = await db.scalar(select(ZZPInvoice).options(selectinload(ZZPInvoice.lines)).where(
            ZZPInvoice.administration_id == administration.id, ZZPInvoice.creation_key == creation_key,
        ))
        if previous:
            if previous.creation_payload_hash != payload_hash:
                raise HTTPException(409, detail={'code': 'CREATION_KEY_REUSED', 'message': 'Deze bewaaractie hoort bij andere factuurgegevens. Open een nieuwe factuur.'})
            return invoice_to_response(previous)

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
        creation_key=creation_key, creation_payload_hash=payload_hash if creation_key else None,
        delivery_date=date.fromisoformat(invoice_in.delivery_date) if invoice_in.delivery_date else None,
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
    
    await db.flush()
    await sync_invoice(db, administration.id, invoice)
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(409, detail={'code': 'INVOICE_NUMBER_CONFLICT', 'message': 'Factuurnummer bestaat al. Probeer opnieuw.'}) from error

    # Reload with lines
    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(ZZPInvoice.id == invoice.id)
    )
    invoice = result.scalar_one()
    
    return invoice_to_response(invoice)


@router.get('/invoice-numbers')
async def get_invoice_numbers(current_user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)], ids: List[UUID] = Query(..., max_length=100)):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    rows = (await db.execute(select(ZZPInvoice.id, ZZPInvoice.invoice_number).where(
        ZZPInvoice.administration_id == administration.id, ZZPInvoice.id.in_(ids),
    ))).all()
    return {'numbers': {str(id): number for id, number in rows}}


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
    
    await db.execute(select(Administration.id).where(Administration.id == administration.id).with_for_update())
    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(
            ZZPInvoice.id == invoice_id,
            ZZPInvoice.administration_id == administration.id
        ).with_for_update()
    )
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(
            status_code=404,
            detail={"code": "INVOICE_NOT_FOUND", "message": "Factuur niet gevonden."}
        )
    
    if invoice.status not in (InvoiceStatus.DRAFT.value, InvoiceStatus.CANCELLED.value):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVOICE_NOT_EDITABLE", "message": "Alleen concept of geannuleerde facturen kunnen worden bewerkt."}
        )

    await require_open_dates(db, administration.id, invoice.issue_date,
        date.fromisoformat(invoice_in.issue_date) if invoice_in.issue_date else None)
    # Auto-restore cancelled invoices to draft before applying changes
    if invoice.status == InvoiceStatus.CANCELLED.value:
        invoice.status = InvoiceStatus.DRAFT.value

    # Update invoice number if provided and different from the current one
    if invoice_in.invoice_number is not None and invoice_in.invoice_number != (invoice.invoice_number or ''):
        # Enforce uniqueness within this administration
        conflict_result = await db.execute(
            select(ZZPInvoice.id).where(
                ZZPInvoice.administration_id == administration.id,
                ZZPInvoice.invoice_number == invoice_in.invoice_number,
                ZZPInvoice.id != invoice.id,
            )
        )
        if conflict_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=409,
                detail={"code": "INVOICE_NUMBER_CONFLICT", "message": "Dit factuurnummer is al in gebruik binnen jouw administratie."}
            )
        invoice.invoice_number = invoice_in.invoice_number

    # Update basic fields
    if invoice_in.issue_date:
        invoice.issue_date = date.fromisoformat(invoice_in.issue_date)
    if 'due_date' in invoice_in.model_fields_set:
        invoice.due_date = date.fromisoformat(invoice_in.due_date) if invoice_in.due_date else None
    if 'delivery_date' in invoice_in.model_fields_set:
        invoice.delivery_date = date.fromisoformat(invoice_in.delivery_date) if invoice_in.delivery_date else None
    if 'notes' in invoice_in.model_fields_set:
        invoice.notes = invoice_in.notes
    if invoice.due_date and invoice.due_date < invoice.issue_date:
        raise HTTPException(422, detail={'code': 'INVALID_DUE_DATE', 'message': 'Vervaldatum mag niet vóór de factuurdatum liggen.'})
    await refresh_seller_snapshot(invoice, administration.id, db)
    
    # Update customer if changed
    if invoice_in.customer_id:
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
    
    await db.flush()
    await sync_invoice(db, administration.id, invoice)
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(409, detail={'code': 'INVOICE_NUMBER_CONFLICT', 'message': 'Factuurnummer bestaat al. Probeer opnieuw.'}) from error

    # Reload with lines
    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .execution_options(populate_existing=True)
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
        ).with_for_update()
    )
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(
            status_code=404,
            detail={"code": "INVOICE_NOT_FOUND", "message": "Factuur niet gevonden."}
        )
    
    await require_open_dates(db, administration.id, invoice.issue_date,
        invoice.paid_at.date() if invoice.paid_at else None,
        date.today() if status_in.status == 'paid' else None)
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
        InvoiceStatus.CANCELLED.value: [InvoiceStatus.DRAFT.value],  # Allow "restore to concept"
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
    
    if current_status == InvoiceStatus.DRAFT.value and new_status == InvoiceStatus.SENT.value:
        await refresh_seller_snapshot(invoice, administration.id, db)
    invoice.status = new_status
    
    # Update paid_at timestamp based on status change
    if new_status == InvoiceStatus.PAID.value:
        # Mark as paid: set paid_at to current time (timezone-aware)
        invoice.paid_at = datetime.now(timezone.utc)
        invoice.amount_paid_cents = invoice.total_cents
    elif current_status == InvoiceStatus.PAID.value and new_status != InvoiceStatus.PAID.value:
        # Mark as unpaid (transitioning from paid to another status): clear paid_at
        invoice.paid_at = None
        invoice.amount_paid_cents = 0
    
    await db.flush()
    await sync_invoice(db, administration.id, invoice)
    await db.commit()

    # Refresh invoice with lines eagerly loaded
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
        ).with_for_update()
    )
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(
            status_code=404,
            detail={"code": "INVOICE_NOT_FOUND", "message": "Factuur niet gevonden."}
        )
    
    if invoice.status not in (InvoiceStatus.DRAFT.value, InvoiceStatus.CANCELLED.value):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVOICE_NOT_DELETABLE", "message": "Alleen concept- en geannuleerde facturen kunnen worden verwijderd."}
        )
    
    await require_open_dates(db, administration.id, invoice.issue_date, invoice.paid_at.date() if invoice.paid_at else None)
    await sync_invoice(db, administration.id, invoice, delete=True)
    await db.delete(invoice)
    await db.commit()
    
    return None


@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    download: bool = Query(default=False),
):
    """Download a PDF with Bearer authentication; no login token is accepted in URLs."""
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
        pdf_bytes = await run_in_threadpool(render_invoice_pdf, invoice)
    except Exception as error:
        raise HTTPException(503, detail={'code': 'PDF_NOT_AVAILABLE', 'message': 'PDF-generatie is tijdelijk niet beschikbaar. Probeer opnieuw.'}) from error

    # Cache-Control: use no-store for explicit download requests so that
    # browsers (especially iOS Safari) never serve a stale cached copy.
    cache_control = "no-store" if download else "no-cache, no-store, must-revalidate"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": pdf_disposition(invoice),
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": cache_control,
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
        ).with_for_update()
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

    if invoice.status == InvoiceStatus.CANCELLED.value:
        raise HTTPException(409, detail={'code': 'INVOICE_CANCELLED', 'message': 'Een geannuleerde factuur kan niet worden verzonden.'})
    if not email_service.client:
        raise HTTPException(503, detail={'code': 'EMAIL_NOT_CONFIGURED', 'message': 'E-mailservice is niet geconfigureerd. De factuur is niet verzonden.'})
    # Validate and prepare the posting before contacting the email provider.
    # Resending a paid/overdue invoice must preserve its financial state.
    await require_open_dates(db, administration.id, invoice.issue_date)
    if invoice.status == InvoiceStatus.DRAFT.value:
        await refresh_seller_snapshot(invoice, administration.id, db)
        invoice.status = InvoiceStatus.SENT.value
    await db.flush()
    await sync_invoice(db, administration.id, invoice)
    
    customer_email = invoice.customer.email
    customer_name = invoice.customer.name
    
    # Generate PDF
    try:
        pdf_bytes = await run_in_threadpool(render_invoice_pdf, invoice)
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
        seller_name = (
            invoice.seller_company_name
            or invoice.seller_trading_name
            or settings.INVOICE_FROM_NAME
        )

        # Build a production-safe "From" display name of the form
        # "[Company Name] via ZZPersHub". The underlying email address
        # (INVOICE_FROM_EMAIL) is kept unchanged so DKIM/SPF alignment on the
        # verified sending domain is preserved for deliverability.
        # The display name is sanitized to avoid breaking the RFC 5322 header
        # (strip quotes, angle brackets and newlines) and wrapped in double
        # quotes so names containing commas/periods/non-ASCII remain valid.
        def _sanitize_display_name(name: str) -> str:
            cleaned = "".join(
                ch for ch in (name or "") if ch not in ('"', "<", ">", "\r", "\n")
            ).strip()
            # Collapse internal whitespace
            cleaned = " ".join(cleaned.split())
            return cleaned

        safe_seller_name = (
            _sanitize_display_name(seller_name)
            or _sanitize_display_name(settings.INVOICE_FROM_NAME)
            or "Facturatie"
        )
        display_name = f"{safe_seller_name} via ZZPersHub"
        from_address = f'"{display_name}" <{settings.INVOICE_FROM_EMAIL}>'

        # Reply-To: prefer the seller's own email when present and plausibly
        # valid (contains "@" and no whitespace/header-injection chars).
        # Otherwise fall back to the configured platform reply-to address.
        # The customer email is NOT used for reply-to (the customer is the
        # recipient, not the responder).
        def _looks_like_email(value: Optional[str]) -> bool:
            if not value:
                return False
            v = value.strip()
            if not v or any(ch in v for ch in (" ", "\r", "\n", ",", ";", "<", ">", '"')):
                return False
            if "@" not in v or v.startswith("@") or v.endswith("@"):
                return False
            local, _, domain = v.partition("@")
            return bool(local) and "." in domain

        reply_to_address = (
            invoice.seller_email.strip()
            if _looks_like_email(invoice.seller_email)
            else settings.INVOICE_REPLY_TO
        )

        subject = f"Uw factuur {invoice_number} van {seller_name}"

        html_content = f"""<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Factuur {invoice_number}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:30px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a56db;padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.3px;">ZZPers Hub</h1>
              <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Facturatie</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:15px;color:#111827;">Beste {customer_name},</p>
              <p style="margin:0 0 16px;font-size:15px;color:#374151;">
                Hierbij ontvangt u factuur <strong>{invoice_number}</strong> van <strong>{seller_name}</strong> voor een totaalbedrag van <strong>{total_amount}</strong> (incl. btw).
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                De factuur is als PDF bijgevoegd aan dit bericht.
              </p>
              <p style="margin:0;font-size:15px;color:#374151;">
                Met vriendelijke groet,<br>
                <strong>{seller_name}</strong>
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;">
              <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">
                <strong style="color:#374151;">ZZPers Hub</strong>
              </p>
              <p style="margin:0 0 2px;font-size:12px;color:#6b7280;">
                <a href="https://zzpershub.nl" style="color:#1a56db;text-decoration:none;">www.zzpershub.nl</a>
              </p>
              <p style="margin:0;font-size:12px;color:#6b7280;">
                <a href="mailto:info@zzpershub.nl" style="color:#1a56db;text-decoration:none;">info@zzpershub.nl</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

        text_content = f"""Beste {customer_name},

Hierbij ontvangt u factuur {invoice_number} van {seller_name} voor een totaalbedrag van {total_amount} (incl. btw).

De factuur is als PDF bijgevoegd aan dit bericht.

Met vriendelijke groet,
{seller_name}

--
ZZPers Hub
www.zzpershub.nl
info@zzpershub.nl
"""

        # Send via Resend
        # Encode PDF as base64 for attachment
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

        logger.info(
            "Sending invoice email",
            extra={
                "event": "invoice_email_sending",
                "provider": "resend",
                "from": from_address,
                "to": customer_email,
                "subject": subject,
                "invoice_id": str(invoice_id),
                "invoice_number": invoice_number,
                "has_attachment": True,
                "attachment_filename": filename,
            }
        )

        result = email_service.client.Emails.send({
            "from": from_address,
            "to": [customer_email],
            "reply_to": reply_to_address,
            "subject": subject,
            "html": html_content,
            "text": text_content,
            "headers": {
                "X-Entity-Ref-ID": str(invoice_id),
                "X-Mailer": "ZZPers Hub Facturatie",
            },
            "tags": [
                {"name": "category", "value": "invoice"},
            ],
            "attachments": [
                {
                    "filename": filename,
                    "content": pdf_base64,
                    "content_type": "application/pdf",
                }
            ]
        })

        message_id = result.get("id") if isinstance(result, dict) else None
        logger.info(
            "Invoice email sent successfully",
            extra={
                "event": "invoice_email_sent",
                "provider": "resend",
                "from": from_address,
                "to": customer_email,
                "invoice_id": str(invoice_id),
                "invoice_number": invoice_number,
                "message_id": message_id,
            }
        )

    except Exception as email_error:
        logger.error(
            f"Failed to send email for invoice {invoice_id}: {email_error}",
            extra={
                "event": "invoice_email_failed",
                "invoice_id": str(invoice_id),
                "to": customer_email,
                "error": str(email_error),
            }
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "EMAIL_SEND_FAILED",
                "message": f"Kon de e-mail niet verzenden: {str(email_error)}"
            }
        )
    
    await db.commit()
    
    # Reload invoice with lines eagerly loaded
    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(ZZPInvoice.id == invoice.id)
    )
    invoice = result.scalar_one()
    
    return invoice_to_response(invoice)


@router.get("/invoices/suggest-price/{customer_id}")
async def suggest_invoice_price(
    customer_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    description: Optional[str] = Query(None, description="Service description to match"),
):
    """
    Suggest unit price based on previous invoices for the customer.
    
    Logic:
    1. If description is provided, prefer last invoice line with same description
    2. Otherwise use the most recent invoice line for that customer
    3. Return suggested price in cents and euros
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    # Verify customer exists and belongs to this administration
    customer = await db.scalar(
        select(ZZPCustomer).where(
            ZZPCustomer.id == customer_id,
            ZZPCustomer.administration_id == administration.id,
        )
    )
    if not customer:
        raise HTTPException(
            status_code=404,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."}
        )
    
    # Query for previous invoice lines for this customer
    # Order by invoice issue_date descending to get most recent first
    query = (
        select(ZZPInvoiceLine)
        .join(ZZPInvoice)
        .where(
            ZZPInvoice.customer_id == customer_id,
            ZZPInvoice.administration_id == administration.id,
        )
        .order_by(ZZPInvoice.issue_date.desc(), ZZPInvoiceLine.line_number.asc())
    )
    
    result = await db.execute(query)
    all_lines = result.scalars().all()
    
    if not all_lines:
        # No previous invoices for this customer
        return {
            "suggested_price_cents": None,
            "suggested_price_euros": None,
            "match_reason": "no_history",
            "message": "Geen eerdere facturen gevonden voor deze klant"
        }
    
    # If description provided, try to find matching line
    suggested_line = None
    match_reason = "most_recent"
    
    if description and description.strip():
        normalized_description = description.strip().lower()
        for line in all_lines:
            if line.description.strip().lower() == normalized_description:
                suggested_line = line
                match_reason = "matching_description"
                break
    
    # If no matching description found, use most recent
    if not suggested_line:
        suggested_line = all_lines[0]
    
    suggested_price_cents = suggested_line.unit_price_cents
    suggested_price_euros = Decimal(suggested_price_cents) / Decimal("100")
    
    return {
        "suggested_price_cents": suggested_price_cents,
        "suggested_price_euros": float(suggested_price_euros),
        "match_reason": match_reason,
        "message": (
            f"Prijs uit eerdere factuur met dezelfde omschrijving" 
            if match_reason == "matching_description" 
            else f"Prijs uit meest recente factuur voor deze klant"
        )
    }
