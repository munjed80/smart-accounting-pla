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
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">{brand_html}</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="margin-top: 0;">{greeting}</p>
                <p>Welkom bij {brand_html}. Bevestig je e-mailadres om je account te activeren.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{verify_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">E-mailadres bevestigen</a>
                </div>
                <p style="color: #666; font-size: 14px;">Deze link is {settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS} uur geldig.</p>
                <p style="color: #666; font-size: 14px;">Heb je geen account aangemaakt? Dan kun je deze e-mail veilig negeren.</p>
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                <p style="color: #888; font-size: 12px; margin-bottom: 0;">
                    Hulp nodig? Neem contact op via <a href="mailto:{settings.SUPPORT_EMAIL}" style="color: #667eea;">{settings.SUPPORT_EMAIL}</a>
                </p>
            </div>
        </body>
        </html>
        """
        
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
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">{brand_html}</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="margin-top: 0;">{greeting}</p>
                <p>We hebben een verzoek ontvangen om je wachtwoord opnieuw in te stellen. Klik hieronder om een nieuw wachtwoord te kiezen.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Wachtwoord opnieuw instellen</a>
                </div>
                <p style="color: #666; font-size: 14px;"><strong>Deze link is {settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS} uur geldig.</strong></p>
                <p style="color: #666; font-size: 14px;">Heb je dit niet aangevraagd? Dan kun je deze e-mail veilig negeren. Je wachtwoord blijft ongewijzigd.</p>
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                <p style="color: #888; font-size: 12px; margin-bottom: 0;">
                    Hulp nodig? Neem contact op via <a href="mailto:{settings.SUPPORT_EMAIL}" style="color: #667eea;">{settings.SUPPORT_EMAIL}</a>
                </p>
            </div>
        </body>
        </html>
        """
        
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
