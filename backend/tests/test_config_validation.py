"""
Tests for `app.core.config` production-readiness validation.

These tests cover the unified `validate_production_environment()` entry point
used by `startup.sh` (pre-flight) and `app.main.lifespan` (in-process), plus
the backward-compatible shims `validate_production_secrets()` and
`validate_production_database()`.
"""
import logging

import pytest

from app.core.config import (
    Settings,
    _is_unsafe_secret,
    _url_is_local,
)


def _prod_settings(**overrides) -> Settings:
    """Build a Settings instance that represents a fully-valid production env."""
    defaults = dict(
        ENV="production",
        SECRET_KEY="a" * 64,
        DATABASE_URL="postgresql+asyncpg://user:realpw@db:5432/accounting_db",
        DATABASE_URL_SYNC="postgresql://user:realpw@db:5432/accounting_db",
        APP_URL="https://api.zzpershub.nl",
        FRONTEND_URL="https://zzpershub.nl",
        CORS_ORIGINS="https://zzpershub.nl",
        APP_PUBLIC_URL="https://api.zzpershub.nl",
    )
    defaults.update(overrides)
    return Settings(**defaults)


# ---------- helpers ----------


def test_is_unsafe_secret_rejects_placeholders_and_short_keys():
    assert _is_unsafe_secret("")
    assert _is_unsafe_secret("change-me")
    assert _is_unsafe_secret("CHANGE-ME-IN-PRODUCTION-USE-OPENSSL-RAND-HEX-32")
    assert _is_unsafe_secret("short")
    # 32 chars exactly is the minimum
    assert not _is_unsafe_secret("a" * 32)
    assert not _is_unsafe_secret("x" * 64)


def test_url_is_local_detects_loopback_hosts():
    assert _url_is_local("http://localhost:8000")
    assert _url_is_local("https://127.0.0.1")
    assert _url_is_local("http://0.0.0.0:5173")
    assert not _url_is_local("https://api.zzpershub.nl")
    assert not _url_is_local(None)


def test_is_production_helper_is_case_insensitive():
    assert Settings(ENV="production").is_production
    assert Settings(ENV="PRODUCTION").is_production
    assert Settings(ENV=" Production ").is_production
    assert not Settings(ENV="staging").is_production
    assert not Settings(ENV="development").is_production


def test_is_development_helper_accepts_aliases():
    assert Settings(ENV="development").is_development
    assert Settings(ENV="dev").is_development
    assert Settings(ENV="LOCAL").is_development
    assert not Settings(ENV="production").is_development


def test_public_url_prefers_app_public_url():
    s = Settings(APP_PUBLIC_URL="https://public.example.com/", APP_URL="https://api.example.com")
    assert s.public_url == "https://public.example.com"
    s2 = Settings(APP_PUBLIC_URL=None, APP_URL="https://api.example.com/")
    assert s2.public_url == "https://api.example.com"


# ---------- digipoort bool coercion (backward compat with "true"/"false") ----------


@pytest.mark.parametrize("value,expected", [
    ("true", True),
    ("TRUE", True),
    ("1", True),
    ("yes", True),
    ("on", True),
    ("false", False),
    ("0", False),
    ("no", False),
    ("", False),
])
def test_digipoort_enabled_accepts_legacy_string_values(value, expected):
    s = Settings(DIGIPOORT_ENABLED=value)
    assert s.digipoort_enabled is expected


def test_digipoort_sandbox_default_is_true():
    s = Settings()
    assert s.digipoort_sandbox_mode is True


# ---------- validate_production_environment ----------


def test_valid_production_passes_without_raising():
    s = _prod_settings()
    s.validate_production_environment()  # should not raise


def test_production_fails_on_unsafe_secret_key():
    s = _prod_settings(SECRET_KEY="change-me")
    with pytest.raises(ValueError) as exc:
        s.validate_production_environment()
    assert "SECRET_KEY" in str(exc.value)


def test_production_fails_on_placeholder_database_url():
    s = _prod_settings(DATABASE_URL="postgresql+asyncpg://u:change_me@db/dbname")
    with pytest.raises(ValueError) as exc:
        s.validate_production_environment()
    assert "DATABASE_URL" in str(exc.value)


def test_production_fails_on_localhost_app_url():
    s = _prod_settings(APP_URL="http://localhost:8000")
    with pytest.raises(ValueError) as exc:
        s.validate_production_environment()
    assert "APP_URL" in str(exc.value)


def test_production_fails_on_localhost_frontend_url():
    s = _prod_settings(FRONTEND_URL="http://127.0.0.1:5173")
    with pytest.raises(ValueError) as exc:
        s.validate_production_environment()
    assert "FRONTEND_URL" in str(exc.value)


def test_production_fails_when_cors_has_no_public_origin():
    s = _prod_settings(CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:5173")
    with pytest.raises(ValueError) as exc:
        s.validate_production_environment()
    assert "CORS_ORIGINS" in str(exc.value)


def test_production_fails_when_mollie_enabled_without_webhook_secret():
    s = _prod_settings(MOLLIE_API_KEY="live_xxx", MOLLIE_WEBHOOK_SECRET=None)
    with pytest.raises(ValueError) as exc:
        s.validate_production_environment()
    assert "MOLLIE_WEBHOOK_SECRET" in str(exc.value)


def test_production_fails_when_mollie_enabled_without_public_url():
    # APP_PUBLIC_URL unset and APP_URL pointing at localhost should trip the
    # Mollie-specific check (in addition to the general APP_URL check).
    s = _prod_settings(
        MOLLIE_API_KEY="live_xxx",
        MOLLIE_WEBHOOK_SECRET="z" * 32,
        APP_PUBLIC_URL=None,
        APP_URL="http://localhost:8000",
    )
    with pytest.raises(ValueError) as exc:
        s.validate_production_environment()
    assert "Mollie" in str(exc.value)


def test_production_collects_multiple_issues_in_one_error():
    s = _prod_settings(SECRET_KEY="change-me", APP_URL="http://localhost:8000")
    with pytest.raises(ValueError) as exc:
        s.validate_production_environment()
    msg = str(exc.value)
    assert "SECRET_KEY" in msg
    assert "APP_URL" in msg


def test_non_production_logs_warnings_but_does_not_raise(caplog):
    s = Settings(
        ENV="development",
        SECRET_KEY="change-me",  # unsafe but non-prod
        DATABASE_URL="postgresql+asyncpg://u:change_me@db/dbname",
        DATABASE_URL_SYNC="postgresql://u:change_me@db/dbname",
        APP_URL="http://localhost:8000",
        FRONTEND_URL="http://localhost:5173",
    )
    with caplog.at_level(logging.WARNING, logger="app.core.config"):
        s.validate_production_environment()  # must not raise
    assert any("SECRET_KEY" in r.message for r in caplog.records)


# ---------- backward-compatible shims ----------


def test_legacy_validate_production_secrets_still_works():
    s = _prod_settings()
    # No raise on a valid prod config.
    s.validate_production_secrets()


def test_legacy_validate_production_database_still_works():
    s = _prod_settings()
    s.validate_production_database()


def test_legacy_validate_production_secrets_raises_in_prod_for_bad_secret():
    s = _prod_settings(SECRET_KEY="x")
    with pytest.raises(ValueError):
        s.validate_production_secrets()
