"""
Email service for authentication-related emails using Resend API.

Features:
- Email verification emails
- Password reset emails
- Professional, clear email templates
- Configurable via environment variables
"""
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


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
            if settings.ENV == "development":
                verify_url = self._build_verify_url(token)
                logger.info(f"DEV: Verification URL: {verify_url}")
            return False
        
        verify_url = self._build_verify_url(token)
        greeting = f"Hi {user_name}," if user_name else "Hi,"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Smart Accounting Platform</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="margin-top: 0;">{greeting}</p>
                <p>Thank you for registering with Smart Accounting Platform. Please verify your email address to complete your registration.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{verify_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email Address</a>
                </div>
                <p style="color: #666; font-size: 14px;">This link will expire in {settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS} hours.</p>
                <p style="color: #666; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                <p style="color: #888; font-size: 12px; margin-bottom: 0;">
                    Need help? Contact us at <a href="mailto:{settings.SUPPORT_EMAIL}" style="color: #667eea;">{settings.SUPPORT_EMAIL}</a>
                </p>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
{greeting}

Thank you for registering with Smart Accounting Platform. Please verify your email address to complete your registration.

Click this link to verify your email:
{verify_url}

This link will expire in {settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS} hours.

If you didn't create an account, you can safely ignore this email.

Need help? Contact us at {settings.SUPPORT_EMAIL}
        """
        
        try:
            self.client.Emails.send({
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": "Verify your email - Smart Accounting Platform",
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
            if settings.ENV == "development":
                reset_url = self._build_reset_url(token)
                logger.info(f"DEV: Password reset URL: {reset_url}")
            return False
        
        reset_url = self._build_reset_url(token)
        greeting = f"Hi {user_name}," if user_name else "Hi,"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Smart Accounting Platform</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="margin-top: 0;">{greeting}</p>
                <p>We received a request to reset your password. Click the button below to create a new password.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
                </div>
                <p style="color: #666; font-size: 14px;"><strong>This link will expire in {settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS} hour(s).</strong></p>
                <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                <p style="color: #888; font-size: 12px; margin-bottom: 0;">
                    Need help? Contact us at <a href="mailto:{settings.SUPPORT_EMAIL}" style="color: #667eea;">{settings.SUPPORT_EMAIL}</a>
                </p>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
{greeting}

We received a request to reset your password. Click the link below to create a new password:

{reset_url}

This link will expire in {settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS} hour(s).

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.

Need help? Contact us at {settings.SUPPORT_EMAIL}
        """
        
        try:
            self.client.Emails.send({
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": "Reset your password - Smart Accounting Platform",
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
