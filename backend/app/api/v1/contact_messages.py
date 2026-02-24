"""
Contact Messages API

Public endpoint for contact form submissions and super-admin inbox endpoints.
"""
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, require_super_admin
from app.core.database import get_db
from app.models.contact_message import ContactMessage, ContactMessageStatus
from app.models.subscription import AdminAuditLog
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiting constants
# ---------------------------------------------------------------------------
RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW_MINUTES = 10


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ContactSubmitRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    email: EmailStr
    subject: str | None = Field(default=None, max_length=500)
    message: str = Field(min_length=10, max_length=10000)
    page_url: str | None = Field(default=None, max_length=2000)


class ContactMessageListItem(BaseModel):
    id: UUID
    created_at: datetime
    status: ContactMessageStatus
    name: str | None
    email: str
    subject: str | None
    message_snippet: str  # First 150 chars

    model_config = {"from_attributes": True}


class ContactMessageListResponse(BaseModel):
    items: list[ContactMessageListItem]
    total: int
    page: int
    page_size: int


class ContactMessageDetail(BaseModel):
    id: UUID
    created_at: datetime
    updated_at: datetime
    status: ContactMessageStatus
    name: str | None
    email: str
    subject: str | None
    message: str
    page_url: str | None
    user_id: UUID | None
    user_agent: str | None
    administration_id: UUID | None
    internal_note: str | None

    model_config = {"from_attributes": True}


class UpdateContactMessageRequest(BaseModel):
    status: ContactMessageStatus | None = None
    internal_note: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


def _ensure_super_admin(current_user: CurrentUser) -> User:
    require_super_admin(current_user)
    return current_user


SuperAdminUser = Annotated[User, Depends(_ensure_super_admin)]


async def _write_audit_log(
    db: AsyncSession,
    actor_user_id: UUID,
    action: str,
    target_id: str,
    details: dict | None = None,
) -> None:
    entry = AdminAuditLog(
        actor_user_id=actor_user_id,
        action=action,
        target_type="contact_message",
        target_id=target_id,
        details=json.dumps(details) if details else None,
    )
    db.add(entry)


# ---------------------------------------------------------------------------
# Public endpoint
# ---------------------------------------------------------------------------

@router.post("/public/contact")
async def submit_contact(
    payload: ContactSubmitRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Public contact form submission endpoint.

    Rate-limited: max RATE_LIMIT_MAX submissions per ip_hash in RATE_LIMIT_WINDOW_MINUTES minutes.
    """
    # Compute ip_hash (no raw IP stored)
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
    # Use first IP if X-Forwarded-For contains multiple
    client_ip = client_ip.split(",")[0].strip()
    ip_hash = _hash_ip(client_ip)

    # Simple rate limiting: count recent submissions with same ip_hash
    window_start = datetime.now(timezone.utc) - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)
    recent_count = (
        await db.execute(
            select(func.count())
            .select_from(ContactMessage)
            .where(
                and_(
                    ContactMessage.ip_hash == ip_hash,
                    ContactMessage.created_at >= window_start,
                )
            )
        )
    ).scalar() or 0

    if recent_count >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Te veel berichten verstuurd. Probeer over {RATE_LIMIT_WINDOW_MINUTES} minuten opnieuw.",
        )

    user_agent = request.headers.get("User-Agent", "")[:500]

    msg = ContactMessage(
        status=ContactMessageStatus.NEW,
        name=payload.name,
        email=str(payload.email),
        subject=payload.subject,
        message=payload.message,
        page_url=payload.page_url,
        ip_hash=ip_hash,
        user_agent=user_agent,
    )
    db.add(msg)
    await db.commit()

    logger.info(
        "Contact form submitted",
        extra={"event": "contact_form_submitted", "email": str(payload.email)},
    )

    return {"ok": True}


# ---------------------------------------------------------------------------
# Super Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/contact-messages", response_model=ContactMessageListResponse)
async def list_contact_messages(
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: ContactMessageStatus | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    stmt = select(ContactMessage).order_by(ContactMessage.created_at.desc())

    if status:
        stmt = stmt.where(ContactMessage.status == status)
    if q:
        pattern = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(ContactMessage.email).like(pattern),
                func.lower(func.coalesce(ContactMessage.subject, "")).like(pattern),
                func.lower(ContactMessage.message).like(pattern),
            )
        )
    if date_from:
        stmt = stmt.where(ContactMessage.created_at >= date_from)
    if date_to:
        stmt = stmt.where(ContactMessage.created_at <= date_to)

    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar() or 0

    offset = (page - 1) * page_size
    rows = (await db.execute(stmt.offset(offset).limit(page_size))).scalars().all()

    items = [
        ContactMessageListItem(
            id=row.id,
            created_at=row.created_at,
            status=row.status,
            name=row.name,
            email=row.email,
            subject=row.subject,
            message_snippet=row.message[:150],
        )
        for row in rows
    ]

    return ContactMessageListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/admin/contact-messages/{message_id}", response_model=ContactMessageDetail)
async def get_contact_message(
    message_id: UUID,
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    msg = (
        await db.execute(select(ContactMessage).where(ContactMessage.id == message_id))
    ).scalar_one_or_none()

    if not msg:
        raise HTTPException(status_code=404, detail="Bericht niet gevonden")

    # Auto-mark as READ if still NEW
    if msg.status == ContactMessageStatus.NEW:
        msg.status = ContactMessageStatus.READ
        await _write_audit_log(
            db,
            actor_user_id=super_admin.id,
            action="CONTACT_MESSAGE_READ",
            target_id=str(msg.id),
        )
        await db.commit()
        await db.refresh(msg)

    return ContactMessageDetail.model_validate(msg)


@router.patch("/admin/contact-messages/{message_id}", response_model=ContactMessageDetail)
async def update_contact_message(
    message_id: UUID,
    payload: UpdateContactMessageRequest,
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    msg = (
        await db.execute(select(ContactMessage).where(ContactMessage.id == message_id))
    ).scalar_one_or_none()

    if not msg:
        raise HTTPException(status_code=404, detail="Bericht niet gevonden")

    old_status = msg.status
    changed = False

    if payload.status is not None and payload.status != msg.status:
        msg.status = payload.status
        changed = True

    if payload.internal_note is not None:
        msg.internal_note = payload.internal_note
        changed = True

    if changed:
        action = (
            "CONTACT_MESSAGE_RESOLVED"
            if payload.status == ContactMessageStatus.RESOLVED
            else "CONTACT_MESSAGE_READ"
        )
        await _write_audit_log(
            db,
            actor_user_id=super_admin.id,
            action=action,
            target_id=str(msg.id),
            details={"old_status": old_status.value if old_status else None, "new_status": payload.status.value if payload.status else None},
        )
        await db.commit()
        await db.refresh(msg)

    return ContactMessageDetail.model_validate(msg)
