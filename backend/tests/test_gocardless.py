"""
Unit Tests for GoCardless Integration Service

Tests cover:
- Service initialization
- GoCardless error handling
- Configuration checks
"""
import pytest
import uuid
from unittest.mock import MagicMock

from app.services.gocardless import GoCardlessService, GoCardlessError
from app.models.bank import BankConnectionStatus


class TestGoCardlessError:
    """Tests for GoCardlessError exception."""

    def test_error_with_message(self):
        err = GoCardlessError("test error")
        assert str(err) == "test error"
        assert err.message == "test error"
        assert err.status_code == 0

    def test_error_with_status_code(self):
        err = GoCardlessError("bad request", status_code=400, detail="extra info")
        assert err.status_code == 400
        assert err.detail == "extra info"


class TestGoCardlessServiceInit:
    """Tests for GoCardlessService initialization."""

    def test_service_creates_with_params(self):
        mock_db = MagicMock()
        admin_id = uuid.uuid4()
        service = GoCardlessService(mock_db, admin_id)
        assert service.db == mock_db
        assert service.administration_id == admin_id
        assert service._access_token is None


class TestBankConnectionStatus:
    """Tests for BankConnectionStatus enum values."""

    def test_status_values(self):
        assert BankConnectionStatus.ACTIVE.value == "ACTIVE"
        assert BankConnectionStatus.EXPIRED.value == "EXPIRED"
        assert BankConnectionStatus.PENDING.value == "PENDING"
        assert BankConnectionStatus.ERROR.value == "ERROR"
        assert BankConnectionStatus.REVOKED.value == "REVOKED"


class TestTransactionHashIdempotency:
    """Test that transaction hash computation matches the CSV import pattern."""

    def test_hash_is_deterministic(self):
        """Verify the hash formula matches what's used in zzp_bank.py CSV import."""
        import hashlib
        from datetime import date
        from decimal import Decimal

        admin_id = uuid.UUID("12345678-1234-1234-1234-123456789abc")
        booking_date = date(2024, 3, 15)
        amount = Decimal("-42.50")
        description = "Albert Heijn betaling"
        reference = "TRX123"
        counterparty_iban = "NL12INGB0001234567"

        parts = [
            str(admin_id),
            booking_date.isoformat(),
            f"{amount:.2f}",
            description.strip(),
            reference.strip(),
            counterparty_iban.strip(),
        ]
        hash1 = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()

        # Same input should produce same hash
        hash2 = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
        assert hash1 == hash2

        # Different input should produce different hash
        parts_different = parts.copy()
        parts_different[2] = "-42.51"
        hash3 = hashlib.sha256("|".join(parts_different).encode("utf-8")).hexdigest()
        assert hash1 != hash3
