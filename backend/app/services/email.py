"""
Email service for authentication-related emails using Resend API.

Features:
- Email verification emails
- Password reset emails
- Professional, clear email templates
- Configurable via environment variables
"""
import html
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _safe_brand(value: str) -> str:
    """Return a brand string safe to interpolate into HTML and plain-text
    email bodies. Strips control characters and HTML-escapes special chars
    so a misconfigured APP_NAME cannot break the template or inject markup.
    """
    cleaned = "".join(ch for ch in (value or "") if ch.isprintable() and ch not in ("\r", "\n"))
    return html.escape(cleaned.strip(), quote=True) or "ZZPers Hub"


def _auth_email(*, brand: str, title: str, greeting: str, body: str,
                action: str, url: str, expiry: int, notice: str) -> str:
    """Email-safe shared layout with inline styles and a plain-link fallback."""
    safe_url = html.escape(url, quote=True)
    support = html.escape(settings.SUPPORT_EMAIL, quote=True)
    return f'''<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:24px 12px;background:#f7f6f0;color:#192e2b;font-family:Arial,Helvetica,sans-serif;line-height:1.65;">
<table role="presentation" style="width:100%;max-width:560px;margin:0 auto;border-collapse:collapse;"><tr><td style="padding:20px 0;">
<span style="display:inline-block;background:#245c4e;color:#ffffff;border-radius:9px;padding:2px 12px;font-size:30px;font-weight:bold;vertical-align:middle;">z<span style="color:#d9e8aa;">.</span></span>
<span style="font-size:23px;font-weight:bold;margin-left:10px;vertical-align:middle;">{brand}</span>
</td></tr><tr><td style="background:#ffffff;border:1px solid #dcded5;border-radius:12px;padding:28px;">
<h1 style="margin:0 0 24px;font-size:26px;line-height:1.25;color:#192e2b;">{title}</h1>
<p>{html.escape(greeting)}</p><p>{body}</p>
<p style="margin:28px 0;"><a href="{safe_url}" style="display:inline-block;background:#245c4e;color:#ffffff;padding:13px 22px;border-radius:7px;font-weight:bold;text-decoration:none;">{action}</a></p>
<p style="color:#60716b;font-size:14px;">Deze link is {expiry} uur geldig.</p>
<p style="color:#60716b;font-size:14px;">{notice}</p>
<hr style="border:0;border-top:1px solid #dcded5;margin:24px 0;">
<p style="font-size:12px;color:#60716b;">Werkt de knop niet? Open deze link:<br><a href="{safe_url}" style="color:#245c4e;word-break:break-all;">{safe_url}</a></p>
</td></tr><tr><td style="padding:20px 0;font-size:12px;color:#60716b;">{brand} · Je administratie op één plek.<br>Hulp nodig? <a href="mailto:{support}" style="color:#245c4e;">{support}</a></td></tr></table></body></html>'''


class EmailService:
    """Service for sending authentication-related emails via Resend."""
    
    def __init__(self):
        self._client = None
        
    @property
    def client(self):
        """Lazy-load Resend client."""
        if self._client is None and settings.email_enabled:
            try:
                import resend
                resend.api_key = settings.RESEND_API_KEY
                self._client = resend
            except ImportError:
                logger.error("Resend package not installed")
                raise
        return self._client
    
    def _build_verify_url(self, token: str) -> str:
        """Build the email verification URL."""
        return f"{settings.FRONTEND_URL}/verify-email?token={token}"
    
    def _build_reset_url(self, token: str) -> str:
        """Build the password reset URL."""
        return f"{settings.FRONTEND_URL}/reset-password?token={token}"
    
    async def send_verification_email(
        self,
        to_email: str,
        token: str,
        user_name: Optional[str] = None,
    ) -> bool:
        """
        Send email verification email.
        
        Args:
            to_email: Recipient email address
            token: Raw verification token
            user_name: Optional user's name for personalization
            
        Returns:
            True if email sent successfully, False otherwise
        """
        if not settings.email_enabled:
            logger.warning(
                "Email sending disabled (RESEND_API_KEY not configured). "
                f"Verification email for {to_email} not sent."
            )
            # In development, log the verification URL
            if settings.is_development:
                verify_url = self._build_verify_url(token)
                logger.info(f"DEV: Verification URL: {verify_url}")
            return False
        
        verify_url = self._build_verify_url(token)
        greeting = f"Hallo {user_name}," if user_name else "Hallo,"
        brand_html = _safe_brand(settings.APP_NAME)
        brand_text = " ".join((settings.APP_NAME or "ZZPers Hub").split())
        
        html_content = _auth_email(
            brand=brand_html, title="Welkom bij ZZPers Hub", greeting=greeting,
            body=f"Welkom bij {brand_html}. Bevestig je e-mailadres om je account te activeren.",
            action="E-mailadres bevestigen", url=verify_url,
            expiry=settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS,
            notice="Heb je geen account aangemaakt? Dan kun je deze e-mail veilig negeren.",
        )

        text_content = f"""
{greeting}

Welkom bij {brand_text}. Bevestig je e-mailadres om je account te activeren.

Bevestig je e-mailadres via deze link:
{verify_url}

Deze link is {settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS} uur geldig.

Heb je geen account aangemaakt? Dan kun je deze e-mail veilig negeren.

Hulp nodig? Neem contact op via {settings.SUPPORT_EMAIL}
        """
        
        try:
            self.client.Emails.send({
                "from": f"ZZPers Hub <{settings.RESEND_FROM_EMAIL}>",
                "to": [to_email],
                "subject": f"Bevestig je e-mailadres - {brand_text}",
                "html": html_content,
                "text": text_content,
            })
            
            logger.info(
                f"Verification email sent",
                extra={
                    "event": "email_verification_sent",
                    "to_email": to_email,
                }
            )
            return True
            
        except Exception as e:
            logger.error(
                f"Failed to send verification email: {e}",
                extra={
                    "event": "email_verification_failed",
                    "to_email": to_email,
                    "error": str(e),
                }
            )
            return False
    
    async def send_password_reset_email(
        self,
        to_email: str,
        token: str,
        user_name: Optional[str] = None,
    ) -> bool:
        """
        Send password reset email.
        
        Args:
            to_email: Recipient email address
            token: Raw reset token
            user_name: Optional user's name for personalization
            
        Returns:
            True if email sent successfully, False otherwise
        """
        if not settings.email_enabled:
            logger.warning(
                "Email sending disabled (RESEND_API_KEY not configured). "
                f"Password reset email for {to_email} not sent."
            )
            # In development, log the reset URL
            if settings.is_development:
                reset_url = self._build_reset_url(token)
                logger.info(f"DEV: Password reset URL: {reset_url}")
            return False
        
        reset_url = self._build_reset_url(token)
        greeting = f"Hallo {user_name}," if user_name else "Hallo,"
        brand_html = _safe_brand(settings.APP_NAME)
        brand_text = " ".join((settings.APP_NAME or "ZZPers Hub").split())
        
        html_content = _auth_email(
            brand=brand_html, title="Een nieuw wachtwoord kiezen", greeting=greeting,
            body="We hebben een verzoek ontvangen om je wachtwoord opnieuw in te stellen. Kies hieronder een nieuw wachtwoord.",
            action="Wachtwoord opnieuw instellen", url=reset_url,
            expiry=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS,
            notice="Heb je dit niet aangevraagd? Negeer deze e-mail. Je wachtwoord blijft ongewijzigd.",
        )

        text_content = f"""
{greeting}

We hebben een verzoek ontvangen om je wachtwoord opnieuw in te stellen. Gebruik deze link:

{reset_url}

Deze link is {settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS} uur geldig.

Heb je dit niet aangevraagd? Dan kun je deze e-mail veilig negeren. Je wachtwoord blijft ongewijzigd.

Hulp nodig? Neem contact op via {settings.SUPPORT_EMAIL}
        """
        
        try:
            self.client.Emails.send({
                "from": f"ZZPers Hub <{settings.RESEND_FROM_EMAIL}>",
                "to": [to_email],
                "subject": f"Stel je wachtwoord opnieuw in - {brand_text}",
                "html": html_content,
                "text": text_content,
            })
            
            logger.info(
                f"Password reset email sent",
                extra={
                    "event": "password_reset_sent",
                    "to_email": to_email,
                }
            )
            return True
            
        except Exception as e:
            logger.error(
                f"Failed to send password reset email: {e}",
                extra={
                    "event": "password_reset_failed",
                    "to_email": to_email,
                    "error": str(e),
                }
            )
            return False


# Global email service instance
email_service = EmailService()
