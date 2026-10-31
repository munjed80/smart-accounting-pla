"""A scheduled email is sent before it can be marked as sent."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import pytest
from app.services.reminders import process_scheduled_reminders, ReminderService, ReminderServiceError

@pytest.mark.asyncio
@pytest.mark.parametrize('failed', [True, False])
async def test_scheduled_reminder_requires_delivery_acceptance(monkeypatch, failed):
    reminder = SimpleNamespace(channel='EMAIL', created_by_id='accountant', status='SCHEDULED', sent_at=None)
    db = AsyncMock()
    result = Mock()
    result.scalars.return_value.all.return_value = [reminder]
    db.execute.return_value = result
    send = AsyncMock(side_effect=ReminderServiceError('provider rejected') if failed else None)
    monkeypatch.setattr(ReminderService, '_send_email', send)
    count = await process_scheduled_reminders(db)
    send.assert_awaited_once_with(reminder)
    assert reminder.status == ('FAILED' if failed else 'SENT')
    assert count == (0 if failed else 1)
    assert (reminder.sent_at is None) == failed
