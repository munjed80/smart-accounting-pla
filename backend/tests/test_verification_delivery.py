"""Real verification request flow: provider failures and existing usable links."""
from unittest.mock import AsyncMock

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
    monkeypatch.setattr(auth.email_service, 'send_verification_email', AsyncMock(return_value=False))
    response = await async_client.post('/api/v1/auth/resend-verification', json={'email': 'verify.me@example.com'})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'EMAIL_DELIVERY_FAILED'
    assert old not in response.text
    tokens = (await db_session.execute(select(AuthToken))).scalars().all()
    assert next(token for token in tokens if token.token_hash == hash_token(old)).used_at is None
    assert sum(token.used_at is not None for token in tokens) == 1


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
    assert 'If an account' in response.json()['message']
    send.assert_not_called()


@pytest.mark.asyncio
async def test_registration_rejects_duplicate_email_casing(async_client, db_session, unverified_user):
    response = await async_client.post('/api/v1/auth/register', json={
        'email':'VERIFY.ME@example.com', 'password':'StrongPassword123', 'full_name':'Duplicate', 'role':'zzp',
    })
    assert response.status_code == 409
    assert len((await db_session.execute(select(User))).scalars().all()) == 1
    assert (await get_user_by_email(db_session, '  verify.me@example.com  ')).id == unverified_user.id
