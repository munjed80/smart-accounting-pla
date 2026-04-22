import logging
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

_UNSAFE_SECRET_KEYS: frozenset[str] = frozenset({
    "change-me-in-production-use-openssl-rand-hex-32",
    "change-me",
    "secret",
    "",
})


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Smart Accounting Platform"
    DEBUG: bool = False
    ENV: str = "production"
    
    # Server
    PORT: int = 8000
    
    # URLs
    APP_URL: str = "http://localhost:8000"  # Backend URL
    FRONTEND_URL: str = "http://localhost:5173"  # Frontend URL for email links
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://accounting_user:change_me@db:5432/accounting_db"
    DATABASE_URL_SYNC: str = "postgresql://accounting_user:change_me@db:5432/accounting_db"
    
    # Redis (optional - set to None or empty string to disable)
    REDIS_URL: Optional[str] = None
    
    @property
    def redis_enabled(self) -> bool:
        """Check if Redis is configured and enabled."""
        return bool(self.REDIS_URL and self.REDIS_URL.strip())
    
    # Security
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # Email (Resend)
    RESEND_API_KEY: Optional[str] = None
    RESEND_FROM_EMAIL: str = "no-reply@example.com"
    SUPPORT_EMAIL: str = "support@example.com"

    # Invoice-specific email settings (ZZPers Hub)
    # Used for outbound invoice emails to improve deliverability and trust
    INVOICE_FROM_EMAIL: str = "no-reply@zzpershub.nl"
    # Neutral, non-branded fallback display name used for the invoice
    # "From" header only when the seller (the ZZP'er) has not configured a
    # company_name or trading_name on their business profile. Avoid using
    # platform branding here, because the email is sent on behalf of the
    # seller, not the platform.
    INVOICE_FROM_NAME: str = "Facturatie"
    INVOICE_REPLY_TO: str = "info@zzpershub.nl"
    
    @property
    def email_enabled(self) -> bool:
        """Check if email sending is configured."""
        return bool(self.RESEND_API_KEY and self.RESEND_API_KEY.strip())
    
    # Token expiry times (in hours)
    EMAIL_VERIFY_TOKEN_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_TOKEN_EXPIRE_HOURS: int = 1
    
    # File uploads
    UPLOAD_DIR: str = "/data/uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # CORS
    # Include production frontend URLs by default for ZZPersHub
    # These can be overridden via CORS_ORIGINS env var
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,https://zzpershub.nl,https://www.zzpershub.nl"
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS string into a list of origins."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
    
    # Admin whitelist - comma-separated list of emails allowed to use admin role
    # Admin users can only be created via database seed or protected internal commands
    # Example: "admin@example.com,superadmin@company.com"
    ADMIN_WHITELIST: str = ""
    
    @property
    def admin_whitelist_list(self) -> list[str]:
        """Parse ADMIN_WHITELIST string into a list of whitelisted admin emails."""
        return [email.strip().lower() for email in self.ADMIN_WHITELIST.split(",") if email.strip()]
    
    # Digipoort tax submission connector (optional)
    DIGIPOORT_ENABLED: Optional[str] = None  # Set to "true" to enable Digipoort mode
    DIGIPOORT_SANDBOX_MODE: Optional[str] = "true"  # Set to "false" for production mode
    DIGIPOORT_ENDPOINT: Optional[str] = None  # Digipoort API endpoint URL
    DIGIPOORT_CLIENT_ID: Optional[str] = None  # Client ID for Digipoort authentication
    DIGIPOORT_CLIENT_SECRET: Optional[str] = None  # Client secret for Digipoort
    DIGIPOORT_CERT_PATH: Optional[str] = None  # Path to client certificate (if required)
    
    @property
    def digipoort_enabled(self) -> bool:
        """Check if Digipoort submission is enabled."""
        return bool(self.DIGIPOORT_ENABLED and str(self.DIGIPOORT_ENABLED).lower() == 'true')
    
    @property
    def digipoort_sandbox_mode(self) -> bool:
        """Check if Digipoort is in sandbox mode (no real network calls)."""
        return str(self.DIGIPOORT_SANDBOX_MODE).lower() != 'false'
    
    # Mollie payment integration (optional)
    MOLLIE_API_KEY: Optional[str] = None  # Mollie API key (test_xxx or live_xxx)
    MOLLIE_WEBHOOK_SECRET: Optional[str] = None  # Webhook secret for verification
    APP_PUBLIC_URL: Optional[str] = None  # Public URL for webhooks (e.g., https://yourdomain.com)
    MOLLIE_LOCALE: str = "nl_NL"  # BCP-47 locale sent to Mollie checkout; controls which payment
                                   # methods are shown. "nl_NL" makes iDEAL visible for Dutch users.
    
    @property
    def mollie_enabled(self) -> bool:
        """Check if Mollie integration is enabled."""
        return bool(self.MOLLIE_API_KEY and self.MOLLIE_API_KEY.strip())
    
    # ==========================================
    # Billing Force Paywall (temporary test mode)
    # ==========================================
    # BILLING_FORCE_PAYWALL=true:  Any ZZP user without ACTIVE subscription is blocked
    #                               from using the app (except subscription page + logout).
    #                               Accountants and super_admin are NOT blocked.
    # BILLING_TRIAL_OVERRIDE_DAYS: If set, all TRIALING subscriptions get their trial_end_at
    #                               shortened to now + N days (0 = immediate expiry).
    #                               Also used for new subscriptions created while override is active.
    # To revert: set BILLING_FORCE_PAYWALL=false, unset BILLING_TRIAL_OVERRIDE_DAYS, redeploy.
    BILLING_FORCE_PAYWALL: bool = False
    BILLING_TRIAL_OVERRIDE_DAYS: Optional[int] = None  # e.g. 0 or 1

    # GoCardless Bank Account Data (PSD2 bank connection)
    # Get credentials from https://bankaccountdata.gocardless.com/
    GOCARDLESS_SECRET_ID: Optional[str] = None
    GOCARDLESS_SECRET_KEY: Optional[str] = None

    @property
    def gocardless_enabled(self) -> bool:
        """Check if GoCardless bank connection is configured."""
        return bool(self.GOCARDLESS_SECRET_ID and self.GOCARDLESS_SECRET_KEY)

    # Web Push (VAPID) keys – optional, enables push notifications
    # Generate with: npx web-push generate-vapid-keys
    VAPID_PUBLIC_KEY: Optional[str] = None
    VAPID_PRIVATE_KEY: Optional[str] = None

    @property
    def push_enabled(self) -> bool:
        """Check if Web Push is configured (both VAPID keys must be set)."""
        return bool(self.VAPID_PUBLIC_KEY and self.VAPID_PRIVATE_KEY)

    @property
    def billing_force_paywall(self) -> bool:
        """Check if billing force-paywall mode is enabled."""
        return bool(self.BILLING_FORCE_PAYWALL)

    @property
    def billing_trial_override_days(self) -> Optional[int]:
        """Return trial override days if set, else None."""
        return self.BILLING_TRIAL_OVERRIDE_DAYS

    def validate_production_secrets(self) -> None:
        """
        Fail fast if SECRET_KEY is unsafe in production.

        In non-production environments a warning is logged but startup continues,
        so local development with the default key still works.
        """
        if self.ENV.lower() == "production":
            if self.SECRET_KEY in _UNSAFE_SECRET_KEYS or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "FATAL: SECRET_KEY is not configured for production. "
                    "Set a strong SECRET_KEY (min 32 chars) via environment variable. "
                    "Generate one with: openssl rand -hex 32"
                )
        else:
            if self.SECRET_KEY in _UNSAFE_SECRET_KEYS or len(self.SECRET_KEY) < 32:
                logger.warning(
                    "SECRET_KEY is using an insecure default. "
                    "Set a strong SECRET_KEY before deploying to production."
                )

    def validate_production_database(self) -> None:
        """
        Fail fast if DATABASE_URL contains default/placeholder credentials in production.

        In non-production environments a warning is logged but startup continues.
        """
        if self.ENV.lower() == "production":
            if "change_me" in self.DATABASE_URL:
                raise ValueError(
                    "FATAL: DATABASE_URL contains default credentials ('change_me'). "
                    "Set proper database credentials via environment variables for production."
                )
        else:
            if "change_me" in self.DATABASE_URL:
                logger.warning(
                    "DATABASE_URL contains default credentials ('change_me'). "
                    "Set proper database credentials before deploying to production."
                )

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
