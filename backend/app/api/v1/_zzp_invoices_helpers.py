"""Shared invoice numbering, snapshots, arithmetic and response conversion."""
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.administration import Administration, AdministrationMember
from app.models.zzp import (
    ZZPInvoice,
    ZZPInvoiceCounter, BusinessProfile,
)
from app.schemas.zzp import (
    InvoiceLineResponse,
    InvoiceResponse,
)


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


async def refresh_seller_snapshot(invoice, administration_id, db):
    profile = await db.scalar(select(BusinessProfile).where(BusinessProfile.administration_id == administration_id))
    if profile:
        for name in ('company_name', 'trading_name', 'address_street', 'address_postal_code', 'address_city', 'address_country', 'kvk_number', 'btw_number', 'iban', 'email', 'phone'):
            setattr(invoice, f'seller_{name}', getattr(profile, name))


async def generate_invoice_number(admin_id: UUID, db: AsyncSession) -> str:
    """
    Generate a sequential invoice number for an administration.

    Uses SELECT FOR UPDATE to prevent race conditions.
    Format: INV-YYYY-0001
    """
    current_year = datetime.now().year

    # Lock an existing parent before the first counter can exist.
    await db.execute(select(Administration.id).where(Administration.id == admin_id).with_for_update())

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
    while True:
        invoice_number = f"INV-{current_year}-{counter.counter:04d}"
        exists = await db.scalar(select(ZZPInvoice.id).where(
            ZZPInvoice.administration_id == admin_id, ZZPInvoice.invoice_number == invoice_number,
        ))
        if exists is None:
            return invoice_number
        counter.counter += 1


def calculate_line_totals(quantity: float, unit_price_cents: int, vat_rate: float) -> tuple[int, int]:
    """Calculate line total and VAT amount in cents."""
    line_total = int((Decimal(str(quantity)) * Decimal(str(unit_price_cents))).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    vat_amount = int((Decimal(str(line_total)) * Decimal(str(vat_rate)) / Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
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
        delivery_date=invoice.delivery_date.isoformat() if invoice.delivery_date else None,
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


__all__ = [
    "get_user_administration",
    "generate_invoice_number",
    "refresh_seller_snapshot",
    "calculate_line_totals",
    "invoice_to_response",
]
