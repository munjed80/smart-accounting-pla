import logging
import os
from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Tokens that indicate an obviously-unsafe SECRET_KEY (defaults / placeholders).
# Comparison is done after .strip().lower() on the SECRET_KEY value.
_UNSAFE_SECRET_KEYS: frozenset[str] = frozenset({
    "change-me-in-production-use-openssl-rand-hex-32",
    "change-me-use-openssl-rand-hex-32-for-production",
    "change-me",
    "changeme",
    "secret",
    "",
})

# Substrings that indicate a placeholder DATABASE_URL was not overridden.
_UNSAFE_DB_TOKENS: tuple[str, ...] = ("change_me", "change-me")

# Hostnames/URLs that must NOT be used in production for user-facing URLs.
_NON_PRODUCTION_URL_HOSTS: tuple[str, ...] = (
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
)


def _is_unsafe_secret(value: str) -> bool:
    """Return True if the given SECRET_KEY value is obviously unsafe."""
    if not value:
        return True
    normalized = value.strip().lower()
    if normalized in _UNSAFE_SECRET_KEYS:
        return True
    if len(value.strip()) < 32:
        return True
    return False


def _url_is_local(url: Optional[str]) -> bool:
    """Return True if the given URL points at a non-production host."""
    if not url:
        return False
    lowered = url.lower()
    return any(host in lowered for host in _NON_PRODUCTION_URL_HOSTS)


def _running_in_production() -> bool:
    """Best-effort check for production env, used before Settings is constructed."""
    return os.environ.get("ENV", "").strip().lower() == "production"


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
    # Production-safe defaults aligned with the public brand domain. The
    # sending domain MUST be verified in the Resend dashboard (DKIM/SPF/DMARC
    # records); otherwise Resend rejects the send. Override per-environment
    # via env vars.
    RESEND_FROM_EMAIL: str = "no-reply@zzpershub.nl"
    SUPPORT_EMAIL: str = "info@zzpershub.nl"

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
    # Booleans accept the strings "true"/"false" (case-insensitive) for backward compatibility.
    DIGIPOORT_ENABLED: bool = False  # Set to "true" to enable Digipoort mode
    DIGIPOORT_SANDBOX_MODE: bool = True  # Set to "false" for production mode
    DIGIPOORT_ENDPOINT: Optional[str] = None  # Digipoort API endpoint URL
    DIGIPOORT_CLIENT_ID: Optional[str] = None  # Client ID for Digipoort authentication
    DIGIPOORT_CLIENT_SECRET: Optional[str] = None  # Client secret for Digipoort
    DIGIPOORT_CERT_PATH: Optional[str] = None  # Path to client certificate (if required)

    @field_validator("DIGIPOORT_ENABLED", "DIGIPOORT_SANDBOX_MODE", mode="before")
    @classmethod
    def _coerce_optional_bool(cls, value):
        """Accept legacy "true"/"false" strings (and None/"") for boolean flags.

        - None or empty string -> False (treated as "unset" → disabled / non-sandbox-overridden)
        - bool -> returned as-is
        - str  -> True for {"1","true","yes","on"} (case-insensitive), else False
        - other -> bool(value)
        """
        if value is None or value == "":
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "yes", "on")
        return bool(value)

    @property
    def digipoort_enabled(self) -> bool:
        """Check if Digipoort submission is enabled."""
        return bool(self.DIGIPOORT_ENABLED)

    @property
    def digipoort_sandbox_mode(self) -> bool:
        """Check if Digipoort is in sandbox mode (no real network calls)."""
        return bool(self.DIGIPOORT_SANDBOX_MODE)
    
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

    # ----- Environment helpers -----
    @property
    def is_production(self) -> bool:
        """True when ENV is 'production' (case-insensitive, whitespace-tolerant)."""
        return (self.ENV or "").strip().lower() == "production"

    @property
    def is_development(self) -> bool:
        """True when ENV is 'development' (case-insensitive)."""
        return (self.ENV or "").strip().lower() in ("development", "dev", "local")

    @property
    def public_url(self) -> str:
        """
        Resolve the canonical public URL of the backend.

        Prefers APP_PUBLIC_URL (used for webhooks behind reverse proxies/Coolify),
        falling back to APP_URL. Always returns a string.
        """
        return (self.APP_PUBLIC_URL or self.APP_URL or "").rstrip("/")

    # ----- Production fail-fast validation -----
    def _collect_production_issues(self) -> list[str]:
        """
        Build a list of fatal configuration issues for production deployment.

        This is the single source of truth for production readiness. Returns
        an empty list when the configuration looks safe.
        """
        issues: list[str] = []

        # SECRET_KEY must be strong
        if _is_unsafe_secret(self.SECRET_KEY):
            issues.append(
                "SECRET_KEY is unset, too short (<32 chars) or a known placeholder. "
                "Generate one with: openssl rand -hex 32 and inject it via Coolify."
            )

        # DATABASE_URL must not contain placeholder credentials
        if any(token in (self.DATABASE_URL or "") for token in _UNSAFE_DB_TOKENS):
            issues.append(
                "DATABASE_URL contains placeholder credentials (e.g. 'change_me'). "
                "Set the production database URL via Coolify env."
            )
        if any(token in (self.DATABASE_URL_SYNC or "") for token in _UNSAFE_DB_TOKENS):
            issues.append(
                "DATABASE_URL_SYNC contains placeholder credentials (e.g. 'change_me'). "
                "Set the production sync database URL via Coolify env."
            )

        # User-facing URLs must not point at localhost
        if _url_is_local(self.APP_URL):
            issues.append(
                f"APP_URL='{self.APP_URL}' points at a non-production host. "
                "Set it to the public backend URL (e.g. https://api.zzpershub.nl)."
            )
        if _url_is_local(self.FRONTEND_URL):
            issues.append(
                f"FRONTEND_URL='{self.FRONTEND_URL}' points at a non-production host. "
                "Set it to the public frontend URL (e.g. https://zzpershub.nl). "
                "This URL is embedded in verification/reset emails."
            )

        # CORS must include at least one explicit, non-localhost origin
        explicit_origins = [
            o for o in self.cors_origins_list
            if not _url_is_local(o) and o != "*"
        ]
        if not explicit_origins:
            issues.append(
                "CORS_ORIGINS does not contain any production origin. "
                "Add the public frontend origin (e.g. https://zzpershub.nl)."
            )

        # When Mollie is enabled, webhook secret + public URL are required for safety.
        if self.mollie_enabled:
            if not self.MOLLIE_WEBHOOK_SECRET:
                issues.append(
                    "MOLLIE_API_KEY is set but MOLLIE_WEBHOOK_SECRET is not. "
                    "Webhooks would be rejected; configure the webhook secret."
                )
            if not self.public_url or _url_is_local(self.public_url):
                issues.append(
                    "MOLLIE_API_KEY is set but APP_PUBLIC_URL/APP_URL is not a public URL. "
                    "Mollie webhooks require a publicly reachable URL."
                )

        return issues

    def validate_production_environment(self) -> None:
        """
        Single fail-fast entry point used at application startup.

        - In production: raises ValueError listing every configuration problem.
        - Outside production: logs each problem as a warning but allows startup,
          so local development with the bundled .env keeps working.
        """
        issues = self._collect_production_issues()
        if not issues:
            return

        if self.is_production:
            joined = "\n  - ".join(issues)
            raise ValueError(
                "FATAL: production environment validation failed:\n  - "
                f"{joined}"
            )

        for issue in issues:
            logger.warning("Config check (non-prod): %s", issue)

    # ----- Backward-compatible shims -----
    def validate_production_secrets(self) -> None:
        """Deprecated: use validate_production_environment(). Kept for compat."""
        self.validate_production_environment()

    def validate_production_database(self) -> None:
        """Deprecated: use validate_production_environment(). Kept for compat."""
        # Implementation is intentionally a no-op when called after
        # validate_production_environment() — running the full validator twice
        # is safe (idempotent) but unnecessary.
        self.validate_production_environment()

    # ----- Pydantic-settings v2 config -----
    # In production, Coolify (or the orchestrator) is the source of truth for
    # environment variables. We deliberately disable .env loading in that case
    # so a stale .env file shipped in an image cannot silently shadow the
    # injected runtime configuration.
    model_config = SettingsConfigDict(
        env_file=None if _running_in_production() else ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
