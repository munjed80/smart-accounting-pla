"""
ZZP Quotes (Offertes) API Endpoints

CRUD operations for ZZP quotes with lines, status transitions,
race-safe quote number generation, and conversion to invoice.
"""
from datetime import datetime, date
from decimal import Decimal
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.zzp import (
    ZZPQuote, 
    ZZPQuoteLine, 
    ZZPQuoteCounter, 
    ZZPInvoice,
    ZZPInvoiceLine,
    ZZPInvoiceCounter,
    ZZPCustomer, 
    BusinessProfile,
    QuoteStatus,
    InvoiceStatus,
)
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    QuoteCreate,
    QuoteUpdate,
    QuoteStatusUpdate,
    QuoteResponse,
    QuoteListResponse,
    QuoteLineResponse,
    QuoteConvertToInvoiceResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    """Get the primary administration for a ZZP user."""
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user_id)
        .where(Administration.is_active.is_(True))
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


async def generate_quote_number(admin_id: UUID, db: AsyncSession) -> str:
    """
    Generate a sequential quote number for an administration.
    Uses SELECT FOR UPDATE to prevent race conditions.
    Format: OFF-YYYY-0001
    """
    current_year = datetime.now().year
    
    # Try to get or create counter with lock
    result = await db.execute(
        select(ZZPQuoteCounter)
        .where(ZZPQuoteCounter.administration_id == admin_id)
        .with_for_update()
    )
    counter = result.scalar_one_or_none()
    
    if counter is None:
        # Create new counter
        counter = ZZPQuoteCounter(
            administration_id=admin_id,
            current_year=current_year,
            current_sequence=1
        )
        db.add(counter)
        await db.flush()
        return f"OFF-{current_year}-0001"
    
    # Check if we need to reset for new year
    if counter.current_year != current_year:
        counter.current_year = current_year
        counter.current_sequence = 1
    else:
        counter.current_sequence += 1
    
    await db.flush()
    return f"OFF-{current_year}-{counter.current_sequence:04d}"


def quote_to_response(quote: ZZPQuote) -> QuoteResponse:
    """Convert quote model to response schema."""
    return QuoteResponse(
        id=quote.id,
        administration_id=quote.administration_id,
        customer_id=quote.customer_id,
        quote_number=quote.quote_number,
        status=quote.status,
        issue_date=quote.issue_date.isoformat(),
        valid_until=quote.valid_until.isoformat() if quote.valid_until else None,
        invoice_id=quote.invoice_id,
        seller_company_name=quote.seller_company_name,
        seller_trading_name=quote.seller_trading_name,
        seller_address_street=quote.seller_address_street,
        seller_address_postal_code=quote.seller_address_postal_code,
        seller_address_city=quote.seller_address_city,
        seller_address_country=quote.seller_address_country,
        seller_kvk_number=quote.seller_kvk_number,
        seller_btw_number=quote.seller_btw_number,
        seller_iban=quote.seller_iban,
        seller_email=quote.seller_email,
        seller_phone=quote.seller_phone,
        customer_name=quote.customer_name,
        customer_address_street=quote.customer_address_street,
        customer_address_postal_code=quote.customer_address_postal_code,
        customer_address_city=quote.customer_address_city,
        customer_address_country=quote.customer_address_country,
        customer_kvk_number=quote.customer_kvk_number,
        customer_btw_number=quote.customer_btw_number,
        subtotal_cents=quote.subtotal_cents,
        vat_total_cents=quote.vat_total_cents,
        total_cents=quote.total_cents,
        title=quote.title,
        notes=quote.notes,
        terms=quote.terms,
        created_at=quote.created_at,
        updated_at=quote.updated_at,
        lines=[
            QuoteLineResponse(
                id=line.id,
                quote_id=line.quote_id,
                line_number=line.line_number,
                description=line.description,
                quantity=float(line.quantity),
                unit_price_cents=line.unit_price_cents,
                vat_rate=float(line.vat_rate),
                vat_amount_cents=line.vat_amount_cents,
                line_total_cents=line.line_total_cents,
            )
            for line in (quote.lines or [])
        ],
    )


@router.get(
    "/quotes",
    response_model=QuoteListResponse,
    summary="List quotes",
    description="List all quotes for the authenticated ZZP user's administration."
)
async def list_quotes(
    user: Annotated[CurrentUser, Depends(require_zzp)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(None, description="Filter by status"),
    customer_id: Optional[UUID] = Query(None, description="Filter by customer"),
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
) -> QuoteListResponse:
    """List all quotes with optional filters."""
    administration = await get_user_administration(user.id, db)
    
    query = (
        select(ZZPQuote)
        .where(ZZPQuote.administration_id == administration.id)
        .options(selectinload(ZZPQuote.lines))
        .order_by(ZZPQuote.created_at.desc())
    )
    
    if status:
        query = query.where(ZZPQuote.status == status)
    if customer_id:
        query = query.where(ZZPQuote.customer_id == customer_id)
    if from_date:
        query = query.where(ZZPQuote.issue_date >= date.fromisoformat(from_date))
    if to_date:
        query = query.where(ZZPQuote.issue_date <= date.fromisoformat(to_date))
    
    result = await db.execute(query)
    quotes = result.scalars().all()
    
    # Calculate stats
    stats = {
        "draft": 0,
        "sent": 0,
        "accepted": 0,
        "rejected": 0,
        "expired": 0,
        "converted": 0,
    }
    total_amount = 0
    for q in quotes:
        if q.status in stats:
            stats[q.status] += 1
        total_amount += q.total_cents
    
    return QuoteListResponse(
        quotes=[quote_to_response(q) for q in quotes],
        total=len(quotes),
        total_amount_cents=total_amount,
        stats=stats,
    )


@router.get(
    "/quotes/{quote_id}",
    response_model=QuoteResponse,
    summary="Get quote",
    description="Get a specific quote by ID."
)
async def get_quote(
    quote_id: UUID,
    user: Annotated[CurrentUser, Depends(require_zzp)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuoteResponse:
    """Get a specific quote."""
    administration = await get_user_administration(user.id, db)
    
    result = await db.execute(
        select(ZZPQuote)
        .where(ZZPQuote.id == quote_id)
        .where(ZZPQuote.administration_id == administration.id)
        .options(selectinload(ZZPQuote.lines))
    )
    quote = result.scalar_one_or_none()
    
    if not quote:
        raise HTTPException(
            status_code=404,
            detail={"code": "QUOTE_NOT_FOUND", "message": "Offerte niet gevonden."}
        )
    
    return quote_to_response(quote)


@router.post(
    "/quotes",
    response_model=QuoteResponse,
    status_code=201,
    summary="Create quote",
    description="Create a new quote with line items."
)
async def create_quote(
    data: QuoteCreate,
    user: Annotated[CurrentUser, Depends(require_zzp)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuoteResponse:
    """Create a new quote."""
    administration = await get_user_administration(user.id, db)
    
    # Verify customer exists and belongs to this administration
    customer_result = await db.execute(
        select(ZZPCustomer)
        .where(ZZPCustomer.id == data.customer_id)
        .where(ZZPCustomer.administration_id == administration.id)
    )
    customer = customer_result.scalar_one_or_none()
    
    if not customer:
        raise HTTPException(
            status_code=404,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."}
        )
    
    # Get business profile for seller snapshot
    profile_result = await db.execute(
        select(BusinessProfile)
        .where(BusinessProfile.administration_id == administration.id)
    )
    profile = profile_result.scalar_one_or_none()
    
    # Generate quote number
    quote_number = await generate_quote_number(administration.id, db)
    
    # Calculate line totals
    subtotal_cents = 0
    vat_total_cents = 0
    
    quote_lines = []
    for idx, line_data in enumerate(data.lines, start=1):
        line_total = int(Decimal(str(line_data.quantity)) * line_data.unit_price_cents)
        vat_amount = int(line_total * Decimal(str(line_data.vat_rate)) / 100)
        
        quote_lines.append({
            "line_number": idx,
            "description": line_data.description,
            "quantity": Decimal(str(line_data.quantity)),
            "unit_price_cents": line_data.unit_price_cents,
            "vat_rate": Decimal(str(line_data.vat_rate)),
            "vat_amount_cents": vat_amount,
            "line_total_cents": line_total,
        })
        
        subtotal_cents += line_total
        vat_total_cents += vat_amount
    
    total_cents = subtotal_cents + vat_total_cents
    
    # Create quote
    quote = ZZPQuote(
        administration_id=administration.id,
        customer_id=customer.id,
        quote_number=quote_number,
        status=QuoteStatus.DRAFT.value,
        issue_date=date.fromisoformat(data.issue_date),
        valid_until=date.fromisoformat(data.valid_until) if data.valid_until else None,
        title=data.title,
        notes=data.notes,
        terms=data.terms,
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
        # Totals
        subtotal_cents=subtotal_cents,
        vat_total_cents=vat_total_cents,
        total_cents=total_cents,
    )
    
    db.add(quote)
    await db.flush()
    
    # Add lines
    for line_data in quote_lines:
        line = ZZPQuoteLine(
            quote_id=quote.id,
            **line_data
        )
        db.add(line)
    
    await db.commit()
    
    # Reload with lines
    result = await db.execute(
        select(ZZPQuote)
        .where(ZZPQuote.id == quote.id)
        .options(selectinload(ZZPQuote.lines))
    )
    quote = result.scalar_one()
    
    return quote_to_response(quote)


@router.put(
    "/quotes/{quote_id}",
    response_model=QuoteResponse,
    summary="Update quote",
    description="Update a quote. Only draft quotes can be fully updated."
)
async def update_quote(
    quote_id: UUID,
    data: QuoteUpdate,
    user: Annotated[CurrentUser, Depends(require_zzp)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuoteResponse:
    """Update a quote."""
    administration = await get_user_administration(user.id, db)
    
    result = await db.execute(
        select(ZZPQuote)
        .where(ZZPQuote.id == quote_id)
        .where(ZZPQuote.administration_id == administration.id)
        .options(selectinload(ZZPQuote.lines))
    )
    quote = result.scalar_one_or_none()
    
    if not quote:
        raise HTTPException(
            status_code=404,
            detail={"code": "QUOTE_NOT_FOUND", "message": "Offerte niet gevonden."}
        )
    
    if quote.status not in [QuoteStatus.DRAFT.value, QuoteStatus.SENT.value]:
        raise HTTPException(
            status_code=400,
            detail={"code": "QUOTE_NOT_EDITABLE", "message": "Deze offerte kan niet meer worden bewerkt."}
        )
    
    # Update basic fields
    if data.issue_date is not None:
        quote.issue_date = date.fromisoformat(data.issue_date)
    if data.valid_until is not None:
        quote.valid_until = date.fromisoformat(data.valid_until)
    if data.title is not None:
        quote.title = data.title
    if data.notes is not None:
        quote.notes = data.notes
    if data.terms is not None:
        quote.terms = data.terms
    
    # Update customer if changed
    if data.customer_id is not None and data.customer_id != quote.customer_id:
        customer_result = await db.execute(
            select(ZZPCustomer)
            .where(ZZPCustomer.id == data.customer_id)
            .where(ZZPCustomer.administration_id == administration.id)
        )
        customer = customer_result.scalar_one_or_none()
        
        if not customer:
            raise HTTPException(
                status_code=404,
                detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."}
            )
        
        quote.customer_id = customer.id
        quote.customer_name = customer.name
        quote.customer_address_street = customer.address_street
        quote.customer_address_postal_code = customer.address_postal_code
        quote.customer_address_city = customer.address_city
        quote.customer_address_country = customer.address_country
        quote.customer_kvk_number = customer.kvk_number
        quote.customer_btw_number = customer.btw_number
    
    # Update lines if provided (full replacement)
    if data.lines is not None:
        # Delete existing lines
        for line in quote.lines:
            await db.delete(line)
        
        # Add new lines
        subtotal_cents = 0
        vat_total_cents = 0
        
        for idx, line_data in enumerate(data.lines, start=1):
            line_total = int(Decimal(str(line_data.quantity)) * line_data.unit_price_cents)
            vat_amount = int(line_total * Decimal(str(line_data.vat_rate)) / 100)
            
            line = ZZPQuoteLine(
                quote_id=quote.id,
                line_number=idx,
                description=line_data.description,
                quantity=Decimal(str(line_data.quantity)),
                unit_price_cents=line_data.unit_price_cents,
                vat_rate=Decimal(str(line_data.vat_rate)),
                vat_amount_cents=vat_amount,
                line_total_cents=line_total,
            )
            db.add(line)
            
            subtotal_cents += line_total
            vat_total_cents += vat_amount
        
        quote.subtotal_cents = subtotal_cents
        quote.vat_total_cents = vat_total_cents
        quote.total_cents = subtotal_cents + vat_total_cents
    
    await db.commit()
    
    # Reload with lines
    result = await db.execute(
        select(ZZPQuote)
        .where(ZZPQuote.id == quote.id)
        .options(selectinload(ZZPQuote.lines))
    )
    quote = result.scalar_one()
    
    return quote_to_response(quote)


@router.patch(
    "/quotes/{quote_id}/status",
    response_model=QuoteResponse,
    summary="Update quote status",
    description="Update quote status (sent, accepted, rejected, expired)."
)
async def update_quote_status(
    quote_id: UUID,
    data: QuoteStatusUpdate,
    user: Annotated[CurrentUser, Depends(require_zzp)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuoteResponse:
    """Update quote status."""
    administration = await get_user_administration(user.id, db)
    
    result = await db.execute(
        select(ZZPQuote)
        .where(ZZPQuote.id == quote_id)
        .where(ZZPQuote.administration_id == administration.id)
        .options(selectinload(ZZPQuote.lines))
    )
    quote = result.scalar_one_or_none()
    
    if not quote:
        raise HTTPException(
            status_code=404,
            detail={"code": "QUOTE_NOT_FOUND", "message": "Offerte niet gevonden."}
        )
    
    # Validate status transitions
    valid_transitions = {
        QuoteStatus.DRAFT.value: [QuoteStatus.SENT.value],
        QuoteStatus.SENT.value: [QuoteStatus.ACCEPTED.value, QuoteStatus.REJECTED.value, QuoteStatus.EXPIRED.value],
        QuoteStatus.ACCEPTED.value: [],  # Can only be converted to invoice
        QuoteStatus.REJECTED.value: [],
        QuoteStatus.EXPIRED.value: [],
        QuoteStatus.CONVERTED.value: [],
    }
    
    if data.status.value not in valid_transitions.get(quote.status, []):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_STATUS_TRANSITION",
                "message": f"Kan status niet wijzigen van '{quote.status}' naar '{data.status.value}'."
            }
        )
    
    quote.status = data.status.value
    await db.commit()
    
    return quote_to_response(quote)


@router.post(
    "/quotes/{quote_id}/convert",
    response_model=QuoteConvertToInvoiceResponse,
    summary="Convert quote to invoice",
    description="Convert an accepted quote to an invoice."
)
async def convert_quote_to_invoice(
    quote_id: UUID,
    user: Annotated[CurrentUser, Depends(require_zzp)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuoteConvertToInvoiceResponse:
    """Convert a quote to an invoice."""
    administration = await get_user_administration(user.id, db)
    
    result = await db.execute(
        select(ZZPQuote)
        .where(ZZPQuote.id == quote_id)
        .where(ZZPQuote.administration_id == administration.id)
        .options(selectinload(ZZPQuote.lines))
    )
    quote = result.scalar_one_or_none()
    
    if not quote:
        raise HTTPException(
            status_code=404,
            detail={"code": "QUOTE_NOT_FOUND", "message": "Offerte niet gevonden."}
        )
    
    if quote.status == QuoteStatus.CONVERTED.value:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ALREADY_CONVERTED",
                "message": "Deze offerte is al omgezet naar een factuur."
            }
        )
    
    # Allow conversion from draft, sent, or accepted status
    # This is intentionally more permissive than status transitions,
    # as businesses often need to convert quotes at any stage
    if quote.status not in [QuoteStatus.ACCEPTED.value, QuoteStatus.SENT.value, QuoteStatus.DRAFT.value]:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CANNOT_CONVERT",
                "message": "Alleen concept, verzonden of geaccepteerde offertes kunnen worden omgezet."
            }
        )
    
    # Generate invoice number
    current_year = datetime.now().year
    counter_result = await db.execute(
        select(ZZPInvoiceCounter)
        .where(ZZPInvoiceCounter.administration_id == administration.id)
        .with_for_update()
    )
    counter = counter_result.scalar_one_or_none()
    
    if counter is None:
        counter = ZZPInvoiceCounter(
            administration_id=administration.id,
            current_year=current_year,
            current_sequence=1
        )
        db.add(counter)
        await db.flush()
        invoice_number = f"INV-{current_year}-0001"
    else:
        if counter.current_year != current_year:
            counter.current_year = current_year
            counter.current_sequence = 1
        else:
            counter.current_sequence += 1
        await db.flush()
        invoice_number = f"INV-{current_year}-{counter.current_sequence:04d}"
    
    # Create invoice from quote
    invoice = ZZPInvoice(
        administration_id=administration.id,
        customer_id=quote.customer_id,
        invoice_number=invoice_number,
        status=InvoiceStatus.DRAFT.value,
        issue_date=date.today(),
        due_date=date.today(),  # Default, can be updated
        # Copy seller snapshot
        seller_company_name=quote.seller_company_name,
        seller_trading_name=quote.seller_trading_name,
        seller_address_street=quote.seller_address_street,
        seller_address_postal_code=quote.seller_address_postal_code,
        seller_address_city=quote.seller_address_city,
        seller_address_country=quote.seller_address_country,
        seller_kvk_number=quote.seller_kvk_number,
        seller_btw_number=quote.seller_btw_number,
        seller_iban=quote.seller_iban,
        seller_email=quote.seller_email,
        seller_phone=quote.seller_phone,
        # Copy customer snapshot
        customer_name=quote.customer_name,
        customer_address_street=quote.customer_address_street,
        customer_address_postal_code=quote.customer_address_postal_code,
        customer_address_city=quote.customer_address_city,
        customer_address_country=quote.customer_address_country,
        customer_kvk_number=quote.customer_kvk_number,
        customer_btw_number=quote.customer_btw_number,
        # Copy totals
        subtotal_cents=quote.subtotal_cents,
        vat_total_cents=quote.vat_total_cents,
        total_cents=quote.total_cents,
        notes=f"Gebaseerd op offerte {quote.quote_number}" + (f"\n{quote.notes}" if quote.notes else ""),
    )
    
    db.add(invoice)
    await db.flush()
    
    # Copy lines
    for quote_line in quote.lines:
        invoice_line = ZZPInvoiceLine(
            invoice_id=invoice.id,
            line_number=quote_line.line_number,
            description=quote_line.description,
            quantity=quote_line.quantity,
            unit_price_cents=quote_line.unit_price_cents,
            vat_rate=quote_line.vat_rate,
            vat_amount_cents=quote_line.vat_amount_cents,
            line_total_cents=quote_line.line_total_cents,
        )
        db.add(invoice_line)
    
    # Update quote status
    quote.status = QuoteStatus.CONVERTED.value
    quote.invoice_id = invoice.id
    
    await db.commit()
    
    # Reload quote
    result = await db.execute(
        select(ZZPQuote)
        .where(ZZPQuote.id == quote.id)
        .options(selectinload(ZZPQuote.lines))
    )
    quote = result.scalar_one()
    
    return QuoteConvertToInvoiceResponse(
        quote=quote_to_response(quote),
        invoice_id=invoice.id,
        invoice_number=invoice_number,
    )


@router.delete(
    "/quotes/{quote_id}",
    status_code=204,
    summary="Delete quote",
    description="Delete a quote. Only draft quotes can be deleted."
)
async def delete_quote(
    quote_id: UUID,
    user: Annotated[CurrentUser, Depends(require_zzp)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a quote."""
    administration = await get_user_administration(user.id, db)
    
    result = await db.execute(
        select(ZZPQuote)
        .where(ZZPQuote.id == quote_id)
        .where(ZZPQuote.administration_id == administration.id)
    )
    quote = result.scalar_one_or_none()
    
    if not quote:
        raise HTTPException(
            status_code=404,
            detail={"code": "QUOTE_NOT_FOUND", "message": "Offerte niet gevonden."}
        )
    
    if quote.status != QuoteStatus.DRAFT.value:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CANNOT_DELETE",
                "message": "Alleen concept offertes kunnen worden verwijderd."
            }
        )
    
    await db.delete(quote)
    await db.commit()
