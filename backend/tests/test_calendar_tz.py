"""Regression test for tz-naive vs tz-aware comparison in calendar list."""
from datetime import datetime, timezone
import pytest
import uuid

from app.models.zzp import ZZPCalendarEvent


@pytest.mark.asyncio
async def test_list_calendar_events_with_tz_aware_db_event(
    async_client, auth_headers, db_session, test_administration
):
    """
    Regression: events stored with tz-aware datetimes (Postgres TIMESTAMPTZ)
    must not crash list_calendar_events with
    'TypeError: can't compare offset-naive and offset-aware datetimes'.
    """
    # Insert event with tz-aware datetimes (mimics Postgres TIMESTAMPTZ read-back)
    event = ZZPCalendarEvent(
        id=uuid.uuid4(),
        administration_id=test_administration.id,
        title="Aware Event",
        start_datetime=datetime(2025, 10, 15, 9, 0, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2025, 10, 15, 10, 0, 0, tzinfo=timezone.utc),
    )
    db_session.add(event)
    await db_session.commit()

    # year/month listing
    resp = await async_client.get(
        "/api/v1/zzp/calendar-events?year=2025&month=10", headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 1
    assert data["events"][0]["title"] == "Aware Event"

    # date-range listing
    resp2 = await async_client.get(
        "/api/v1/zzp/calendar-events?from_date=2025-10-13&to_date=2025-10-19",
        headers=auth_headers,
    )
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()["total"] == 1


@pytest.mark.asyncio
async def test_list_calendar_events_with_recurring_aware_event(
    async_client, auth_headers, db_session, test_administration
):
    """Recurring expansion must also handle tz-aware events + aware recurrence end."""
    from datetime import date as date_cls

    event = ZZPCalendarEvent(
        id=uuid.uuid4(),
        administration_id=test_administration.id,
        title="Weekly Aware",
        start_datetime=datetime(2025, 10, 6, 9, 0, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2025, 10, 6, 10, 0, 0, tzinfo=timezone.utc),
        recurrence="weekly",
        recurrence_end_date=date_cls(2025, 10, 31),
    )
    db_session.add(event)
    await db_session.commit()

    resp = await async_client.get(
        "/api/v1/zzp/calendar-events?year=2025&month=10", headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # 4 occurrences: Oct 6, 13, 20, 27
    assert data["total"] == 4
