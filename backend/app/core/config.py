from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


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
    DIGIPOORT_ENDPOINT: Optional[str] = None  # Digipoort API endpoint URL
    DIGIPOORT_CLIENT_ID: Optional[str] = None  # Client ID for Digipoort authentication
    DIGIPOORT_CLIENT_SECRET: Optional[str] = None  # Client secret for Digipoort
    DIGIPOORT_CERT_PATH: Optional[str] = None  # Path to client certificate (if required)
    
    @property
    def digipoort_enabled(self) -> bool:
        """Check if Digipoort submission is enabled."""
        return bool(self.DIGIPOORT_ENABLED and str(self.DIGIPOORT_ENABLED).lower() == 'true')
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
