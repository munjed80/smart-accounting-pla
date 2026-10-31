"""Customer emails keep the product identity and safely render untrusted names."""
from unittest.mock import Mock
import pytest
from app.services import email as email_module


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["send_verification_email", "send_password_reset_email"])
async def test_auth_emails_share_brand_palette_and_escape_customer_name(monkeypatch, method):
    settings = Mock(
        email_enabled=True, is_development=False, APP_NAME="ZZPers Hub",
        FRONTEND_URL="https://zzpershub.nl", SUPPORT_EMAIL="info@zzpershub.nl",
        RESEND_FROM_EMAIL="no-reply@zzpershub.nl", EMAIL_VERIFY_TOKEN_EXPIRE_HOURS=24,
        PASSWORD_RESET_TOKEN_EXPIRE_HOURS=1,
    )
    monkeypatch.setattr(email_module, "settings", settings)
    service = email_module.EmailService()
    service._client = Mock()
    service._client.Emails.send.return_value = {"id": "re_test_message"}
    assert await getattr(service, method)("person@example.com", "safe-token", '<script>alert(1)</script>')
    payload = service._client.Emails.send.call_args.args[0]
    assert payload["from"] == "ZZPers Hub <no-reply@zzpershub.nl>"
    assert "ZZPers Hub" in payload["subject"]
    assert "#245c4e" in payload["html"] and "#f7f6f0" in payload["html"]
    assert "<script>" not in payload["html"]
    assert "&lt;script&gt;" in payload["html"]
    assert 'lang="nl"' in payload["html"]
    assert "https://zzpershub.nl/" in payload["text"]
    assert "safe-token" in payload["text"]
    assert "#667eea" not in payload["html"]


@pytest.mark.asyncio
@pytest.mark.parametrize('response', [{}, {'error': 'rejected'}])
async def test_verification_email_requires_provider_acceptance(monkeypatch, response):
    monkeypatch.setattr(email_module, 'settings', Mock(
        email_enabled=True, is_development=False, APP_NAME='ZZPers Hub',
        FRONTEND_URL='https://zzpershub.nl', SUPPORT_EMAIL='info@zzpershub.nl',
        RESEND_FROM_EMAIL='no-reply@zzpershub.nl', EMAIL_VERIFY_TOKEN_EXPIRE_HOURS=24,
    ))
    service = email_module.EmailService()
    service._client = Mock()
    service._client.Emails.send.return_value = response
    assert not await service.send_verification_email('person@example.com', 'safe-token')

@pytest.mark.asyncio
@pytest.mark.parametrize('response', [{}, {'error': 'rejected'}])
async def test_password_reset_requires_provider_acceptance(monkeypatch, response):
    monkeypatch.setattr(email_module, 'settings', Mock(
        email_enabled=True, is_development=False, APP_NAME='Old Product',
        FRONTEND_URL='https://zzpershub.nl', SUPPORT_EMAIL='info@zzpershub.nl',
        RESEND_FROM_EMAIL='no-reply@zzpershub.nl', PASSWORD_RESET_TOKEN_EXPIRE_HOURS=1,
    ))
    service = email_module.EmailService()
    service._client = Mock()
    service._client.Emails.send.return_value = response
    assert not await service.send_password_reset_email('person@example.com', 'safe-token')
    payload = service._client.Emails.send.call_args.args[0]
    assert 'Old Product' not in payload['text'] + payload['html'] + payload['subject']
    assert payload['reply_to'] == 'info@zzpershub.nl'


def test_shared_layout_escapes_subject_and_preheader():
    result = email_module.render_email(title='<img src=x>', preheader='<script>',
        content='<p>Veilige inhoud</p>', support='info@zzpershub.nl')
    assert '<img src=x>' not in result and '<script>' not in result
    assert '&lt;img src=x&gt;' in result
    assert 'prefers-color-scheme:dark' in result
