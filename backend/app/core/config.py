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
    
    # File uploads
    UPLOAD_DIR: str = "/data/uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS string into a list of origins."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
