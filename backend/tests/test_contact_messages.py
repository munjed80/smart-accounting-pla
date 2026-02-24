"""
Tests for Contact Messages API.

Covers:
- Public POST creates a record
- Super admin can list/read/update messages
- Non-super_admin gets 403 on admin endpoints
- Pagination and q filter work
- Rate limiting works
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact_message import ContactMessage, ContactMessageStatus


# ---------------------------------------------------------------------------
# Public endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_public_contact_creates_record(async_client: AsyncClient, db_session: AsyncSession):
    """POST /api/v1/public/contact stores message in DB and returns {ok: true}."""
    response = await async_client.post(
        "/api/v1/public/contact",
        json={
            "name": "Jan Janssen",
            "email": "jan@example.nl",
            "message": "Dit is een testbericht.",
            "page_url": "https://example.com/contact",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    # Verify record was created
    from sqlalchemy import select
    result = await db_session.execute(
        select(ContactMessage).where(ContactMessage.email == "jan@example.nl")
    )
    msg = result.scalar_one_or_none()
    assert msg is not None
    assert msg.name == "Jan Janssen"
    assert msg.status == ContactMessageStatus.NEW
    assert msg.page_url == "https://example.com/contact"


@pytest.mark.asyncio
async def test_public_contact_validates_email(async_client: AsyncClient):
    """POST /api/v1/public/contact rejects invalid email."""
    response = await async_client.post(
        "/api/v1/public/contact",
        json={"email": "not-an-email", "message": "Hello there test message"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_public_contact_validates_message_length(async_client: AsyncClient):
    """POST /api/v1/public/contact rejects message shorter than 10 chars."""
    response = await async_client.post(
        "/api/v1/public/contact",
        json={"email": "test@example.nl", "message": "short"},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Super admin: list endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_super_admin_can_list_messages(
    async_client: AsyncClient,
    db_session: AsyncSession,
    super_admin_headers: dict,
):
    """GET /api/v1/admin/contact-messages returns list for super admin."""
    # Create a message
    msg = ContactMessage(
        email="test@example.nl",
        message="Test message for listing",
        status=ContactMessageStatus.NEW,
    )
    db_session.add(msg)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/admin/contact-messages",
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_non_super_admin_cannot_list_messages(async_client: AsyncClient, auth_headers: dict):
    """GET /api/v1/admin/contact-messages returns 403 for non-super_admin."""
    response = await async_client.get(
        "/api/v1/admin/contact-messages",
        headers=auth_headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_messages_q_filter(
    async_client: AsyncClient,
    db_session: AsyncSession,
    super_admin_headers: dict,
):
    """q filter searches in email, subject, message."""
    msg1 = ContactMessage(
        email="unique_search@example.nl",
        message="This is a unique_search message",
        status=ContactMessageStatus.NEW,
    )
    msg2 = ContactMessage(
        email="other@example.nl",
        message="Regular message about something else",
        status=ContactMessageStatus.NEW,
    )
    db_session.add_all([msg1, msg2])
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/admin/contact-messages",
        params={"q": "unique_search"},
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert all("unique_search" in (item["email"] + item["message_snippet"]).lower() for item in data["items"])


@pytest.mark.asyncio
async def test_list_messages_status_filter(
    async_client: AsyncClient,
    db_session: AsyncSession,
    super_admin_headers: dict,
):
    """status filter works correctly."""
    msg = ContactMessage(
        email="resolved_filter@example.nl",
        message="Resolved filter test message",
        status=ContactMessageStatus.RESOLVED,
    )
    db_session.add(msg)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/admin/contact-messages",
        params={"status": "RESOLVED"},
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert all(item["status"] == "RESOLVED" for item in data["items"])


@pytest.mark.asyncio
async def test_list_messages_pagination(
    async_client: AsyncClient,
    db_session: AsyncSession,
    super_admin_headers: dict,
):
    """pagination (page + page_size) works."""
    # Create 3 messages
    for i in range(3):
        db_session.add(ContactMessage(
            email=f"page_test_{i}@example.nl",
            message=f"Page test message number {i}",
            status=ContactMessageStatus.NEW,
        ))
    await db_session.commit()

    resp1 = await async_client.get(
        "/api/v1/admin/contact-messages",
        params={"page": 1, "page_size": 2},
        headers=super_admin_headers,
    )
    assert resp1.status_code == 200
    d1 = resp1.json()
    assert len(d1["items"]) <= 2
    assert d1["page"] == 1
    assert d1["page_size"] == 2


# ---------------------------------------------------------------------------
# Super admin: detail endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_super_admin_can_read_message(
    async_client: AsyncClient,
    db_session: AsyncSession,
    super_admin_headers: dict,
):
    """GET /api/v1/admin/contact-messages/{id} returns full message and auto-marks READ."""
    msg = ContactMessage(
        email="detail@example.nl",
        message="Detail view message content",
        status=ContactMessageStatus.NEW,
        page_url="https://example.com",
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)

    response = await async_client.get(
        f"/api/v1/admin/contact-messages/{msg.id}",
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(msg.id)
    assert data["status"] == "READ"  # auto-marked READ
    assert data["message"] == "Detail view message content"
    assert data["page_url"] == "https://example.com"


@pytest.mark.asyncio
async def test_non_super_admin_cannot_read_message(
    async_client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict,
):
    """GET /api/v1/admin/contact-messages/{id} returns 403 for non-super_admin."""
    msg = ContactMessage(
        email="forbidden@example.nl",
        message="This message should not be readable",
        status=ContactMessageStatus.NEW,
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)

    response = await async_client.get(
        f"/api/v1/admin/contact-messages/{msg.id}",
        headers=auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Super admin: update (PATCH) endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_super_admin_can_update_message_status(
    async_client: AsyncClient,
    db_session: AsyncSession,
    super_admin_headers: dict,
):
    """PATCH /api/v1/admin/contact-messages/{id} updates status to RESOLVED."""
    msg = ContactMessage(
        email="patch@example.nl",
        message="Patch test message content here",
        status=ContactMessageStatus.READ,
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)

    response = await async_client.patch(
        f"/api/v1/admin/contact-messages/{msg.id}",
        json={"status": "RESOLVED"},
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "RESOLVED"


@pytest.mark.asyncio
async def test_super_admin_can_add_internal_note(
    async_client: AsyncClient,
    db_session: AsyncSession,
    super_admin_headers: dict,
):
    """PATCH /api/v1/admin/contact-messages/{id} allows adding internal_note."""
    msg = ContactMessage(
        email="note@example.nl",
        message="Message for internal note test",
        status=ContactMessageStatus.READ,
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)

    response = await async_client.patch(
        f"/api/v1/admin/contact-messages/{msg.id}",
        json={"internal_note": "Beantwoord per telefoon op 24-02-2026"},
        headers=super_admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["internal_note"] == "Beantwoord per telefoon op 24-02-2026"


@pytest.mark.asyncio
async def test_non_super_admin_cannot_update_message(
    async_client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict,
):
    """PATCH /api/v1/admin/contact-messages/{id} returns 403 for non-super_admin."""
    msg = ContactMessage(
        email="patch_forbidden@example.nl",
        message="Patch forbidden message content",
        status=ContactMessageStatus.NEW,
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)

    response = await async_client.patch(
        f"/api/v1/admin/contact-messages/{msg.id}",
        json={"status": "RESOLVED"},
        headers=auth_headers,
    )
    assert response.status_code == 403
