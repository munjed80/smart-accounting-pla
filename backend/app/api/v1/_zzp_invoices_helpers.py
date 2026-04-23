"""
Internal helpers for the ZZP invoices route module.

Extracted from `app.api.v1.zzp_invoices` as part of the routes-file
decomposition. Behavior is unchanged.
"""
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.administration import Administration, AdministrationMember
from app.models.zzp import (
    InvoiceStatus,  # noqa: F401  (re-exported for parity with original module)
    ZZPInvoice,
    ZZPInvoiceCounter,
)
from app.schemas.zzp import (
    InvoiceLineResponse,
    InvoiceResponse,
)


async def _get_user_for_pdf(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Optional[str] = Query(default=None),
) -> "User":  # type: ignore[name-defined]  # noqa: F821 (forward ref)
    """
    Resolve the current user for PDF download.

    Supports two auth methods so that iOS Safari can navigate directly to the
    PDF URL without custom request headers:
      1. Query parameter  ?token=<jwt>  (used by direct browser navigation)
      2. Authorization: Bearer <jwt>    (used by fetch/axios calls)
    """
    from app.models.user import User as _User

    # Prefer Authorization header; fall back to ?token= query parameter.
    bearer = request.headers.get("Authorization", "")
    if bearer.startswith("Bearer "):
        jwt_token = bearer.split(" ", 1)[1]
    elif token:
        jwt_token = token
    else:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(jwt_token)
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(_User).where(_User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    return user


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


__all__ = [
    "_get_user_for_pdf",
    "get_user_administration",
    "generate_invoice_number",
    "calculate_line_totals",
    "invoice_to_response",
]
