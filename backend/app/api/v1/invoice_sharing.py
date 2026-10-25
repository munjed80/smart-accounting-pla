"""
Public Invoice Sharing

Provides signed, time-limited URLs so ZZP users can share invoice PDFs
with external customers who do not have a login.

Two endpoints:
  POST /zzp/invoices/{id}/share-link   – authenticated; creates the token
  GET  /invoices/public/{token}         – public; validates & serves the PDF
"""
import hashlib
import hmac
import logging
import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.models.zzp import ZZPInvoice
from app.models.administration import Administration, AdministrationMember
from app.api.v1.deps import CurrentUser, require_zzp
from starlette.concurrency import run_in_threadpool
from app.services.invoice_rendering import render_invoice_pdf, pdf_disposition

logger = logging.getLogger(__name__)

# ── Token helpers ────────────────────────────────────────────────────
SHARE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days
_SEP = "."  # separator inside the URL-safe token


def _make_signature(invoice_id: str, expires: int) -> str:
    """HMAC-SHA256 over ``invoice_id|expires`` using the app SECRET_KEY."""
    msg = f"{invoice_id}|{expires}".encode()
    return hmac.new(
        settings.SECRET_KEY.encode(), msg, hashlib.sha256
    ).hexdigest()


def create_share_token(invoice_id: UUID) -> str:
    """Return a URL-safe ``<invoice_id>.<expires>.<signature>`` token."""
    expires = int(time.time()) + SHARE_TOKEN_TTL_SECONDS
    sig = _make_signature(str(invoice_id), expires)
    return f"{invoice_id}{_SEP}{expires}{_SEP}{sig}"


def verify_share_token(token: str) -> UUID:
    """Validate *token* and return the embedded invoice UUID.

    Raises ``HTTPException(404)`` on any validation failure so that
    attackers cannot distinguish "bad signature" from "expired".
    """
    parts = token.split(_SEP)
    if len(parts) != 3:
        raise HTTPException(status_code=404, detail="Ongeldige of verlopen link.")

    raw_id, raw_expires, sig = parts

    # ── Expiry check ──
    try:
        expires = int(raw_expires)
    except ValueError:
        raise HTTPException(status_code=404, detail="Ongeldige of verlopen link.")

    if time.time() > expires:
        raise HTTPException(status_code=404, detail="Ongeldige of verlopen link.")

    # ── Signature check ──
    expected = _make_signature(raw_id, expires)
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=404, detail="Ongeldige of verlopen link.")

    # ── UUID parse ──
    try:
        return UUID(raw_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Ongeldige of verlopen link.")


# ── Routers ──────────────────────────────────────────────────────────
# The *authenticated* part lives under the existing /zzp prefix (paywall
# applied via main.py).  The *public* part is registered separately
# without any auth dependencies.

authenticated_router = APIRouter()
public_router = APIRouter()


# ── Authenticated: generate a share link ─────────────────────────────
@authenticated_router.post("/invoices/{invoice_id}/share-link")
async def create_invoice_share_link(
    invoice_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
):
    """Generate a public share link for the given invoice.

    The link contains a signed token valid for 30 days.
    Only the invoice owner can generate a link.
    """
    require_zzp(current_user)

    # Verify the invoice belongs to this user's administration
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == current_user.id)
        .where(Administration.is_active == True)
        .order_by(Administration.created_at)
        .limit(1)
    )
    administration = result.scalar_one_or_none()
    if not administration:
        raise HTTPException(status_code=404, detail="Geen administratie gevonden.")

    inv_result = await db.execute(
        select(ZZPInvoice).where(
            ZZPInvoice.id == invoice_id,
            ZZPInvoice.administration_id == administration.id,
        )
    )
    invoice = inv_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden.")

    token = create_share_token(invoice_id)
    public_url = f"{settings.APP_URL}/api/v1/invoices/public/{token}"

    return {"url": public_url, "expires_in_days": 30}


# ── Public: serve the PDF ────────────────────────────────────────────
@public_router.get("/invoices/public/{token}")
async def get_public_invoice_pdf(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Serve an invoice PDF via a signed share token.

    No authentication required.  The token is validated for:
    - correct HMAC signature (tied to SECRET_KEY)
    - non-expired timestamp
    - existing invoice ID
    """
    invoice_id = verify_share_token(token)

    result = await db.execute(
        select(ZZPInvoice)
        .options(selectinload(ZZPInvoice.lines))
        .where(ZZPInvoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden.")

    try:
        pdf_bytes = await run_in_threadpool(render_invoice_pdf, invoice)
    except Exception as error:
        raise HTTPException(503, detail='PDF-generatie is tijdelijk niet beschikbaar.') from error

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": pdf_disposition(invoice, inline=True),
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-store",
        },
    )
