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
