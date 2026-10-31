"""Real verification request flow: provider failures and existing usable links."""
from unittest.mock import AsyncMock
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.api.v1 import auth
from app.models.auth_token import AuthToken, TokenType
from app.models.user import User
from app.services.auth_token import create_auth_token, hash_token, get_user_by_email


@pytest_asyncio.fixture
async def unverified_user(db_session, monkeypatch):
    monkeypatch.setattr(auth.settings, 'RESEND_API_KEY', 're_test_not_a_real_key')
    monkeypatch.setattr(auth, 'check_rate_limit', lambda *args: None)
    user = User(email='Verify.Me@example.com', full_name='Verify Customer', role='zzp', hashed_password='not-used', is_active=True)
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_resend_uses_case_insensitive_lookup_and_keeps_delayed_links_valid(async_client, db_session, unverified_user, monkeypatch):
    old = await create_auth_token(db_session, unverified_user.id, TokenType.EMAIL_VERIFY)
    send = AsyncMock(return_value=True)
    monkeypatch.setattr(auth.email_service, 'send_verification_email', send)
    response = await async_client.post('/api/v1/auth/resend-verification', json={'email': 'verify.me@example.com'})
    assert response.status_code == 200
    assert send.call_args.kwargs['to_email'] == 'Verify.Me@example.com'
    tokens = (await db_session.execute(select(AuthToken))).scalars().all()
    assert len(tokens) == 2
    assert all(token.used_at is None for token in tokens)
    verified = await async_client.get('/api/v1/auth/verify-email', params={'token': old})
    assert verified.status_code == 200
    assert verified.json()['verified'] is True


@pytest.mark.asyncio
async def test_provider_failure_is_503_and_does_not_invalidate_an_older_link(async_client, db_session, unverified_user, monkeypatch):
    old = await create_auth_token(db_session, unverified_user.id, TokenType.EMAIL_VERIFY)
    send = AsyncMock(return_value=False)
    monkeypatch.setattr(auth.email_service, 'send_verification_email', send)
    response = await async_client.post('/api/v1/auth/resend-verification', json={'email': 'verify.me@example.com'})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'EMAIL_DELIVERY_FAILED'
    assert old not in response.text
    tokens = (await db_session.execute(select(AuthToken))).scalars().all()
    assert next(token for token in tokens if token.token_hash == hash_token(old)).used_at is None
    assert len(tokens) == 2 and all(token.used_at is None for token in tokens)
    # A timeout might occur after provider acceptance; a late message must still work.
    late_token = send.call_args.kwargs['token']
    late = await async_client.get('/api/v1/auth/verify-email', params={'token': late_token})
    assert late.status_code == 200 and late.json()['verified'] is True


@pytest.mark.asyncio
async def test_missing_provider_configuration_is_not_reported_as_sent(async_client, db_session, unverified_user, monkeypatch):
    monkeypatch.setattr(auth.settings, 'RESEND_API_KEY', None)
    response = await async_client.post('/api/v1/auth/resend-verification', json={'email': 'verify.me@example.com'})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'EMAIL_DELIVERY_UNAVAILABLE'
    assert (await db_session.execute(select(AuthToken))).scalars().all() == []


@pytest.mark.asyncio
async def test_unknown_email_keeps_generic_success_response(async_client, unverified_user, monkeypatch):
    send = AsyncMock()
    monkeypatch.setattr(auth.email_service, 'send_verification_email', send)
    response = await async_client.post('/api/v1/auth/resend-verification', json={'email':'unknown@example.com'})
    assert response.status_code == 200
    assert 'Als er een' in response.json()['message']
    send.assert_not_called()


@pytest.mark.asyncio
async def test_registration_rejects_duplicate_email_casing(async_client, db_session, unverified_user):
    before = len((await db_session.execute(select(User))).scalars().all())
    response = await async_client.post('/api/v1/auth/register', json={
        'email':'VERIFY.ME@example.com', 'password':'StrongPassword123', 'full_name':'Duplicate', 'role':'zzp',
    })
    assert response.status_code == 409
    assert len((await db_session.execute(select(User))).scalars().all()) == before
    assert (await get_user_by_email(db_session, '  verify.me@example.com  ')).id == unverified_user.id


@pytest.mark.asyncio
async def test_expired_verification_token_is_rejected_after_database_roundtrip(async_client, db_session, unverified_user):
    raw = await create_auth_token(db_session, unverified_user.id, TokenType.EMAIL_VERIFY)
    record = (await db_session.execute(select(AuthToken).where(AuthToken.token_hash == hash_token(raw)))).scalar_one()
    record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()
    await db_session.refresh(record)
    response = await async_client.get('/api/v1/auth/verify-email', params={'token':raw})
    assert response.status_code == 400
    assert 'verlopen' in response.json()['detail'].lower()
