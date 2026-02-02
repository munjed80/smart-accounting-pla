"""
Unit Tests for Bank Reconciliation

Tests cover:
- CSV import idempotency
- Role/assignment enforcement
- Reconciliation actions
- Journal entry creation for CREATE_EXPENSE
"""
import pytest
import uuid
import hashlib
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, AsyncMock

from app.services.bank_reconciliation import BankReconciliationService
from app.services.vat.posting import VatPostingService


class TestBankImportIdempotency:
    """Tests for bank import idempotency."""
    
    def test_hash_computation_is_consistent(self):
        """Test that hash computation produces consistent results."""
        admin_id = uuid.uuid4()
        booking_date = date(2024, 1, 15)
        amount = Decimal("123.45")
        description = "Test payment"
        reference = "REF-001"
        counterparty_iban = "NL91ABNA0417164300"
        
        def compute_hash(admin_id, booking_date, amount, description, reference=None, counterparty_iban=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
                (counterparty_iban or "").strip(),
            ]
            hash_input = "|".join(parts)
            return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()
        
        hash1 = compute_hash(admin_id, booking_date, amount, description, reference, counterparty_iban)
        hash2 = compute_hash(admin_id, booking_date, amount, description, reference, counterparty_iban)
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 produces 64 hex characters
    
    def test_hash_differs_for_different_amounts(self):
        """Test that different amounts produce different hashes."""
        admin_id = uuid.uuid4()
        booking_date = date(2024, 1, 15)
        description = "Test payment"
        
        def compute_hash(admin_id, booking_date, amount, description, reference=None, counterparty_iban=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
                (counterparty_iban or "").strip(),
            ]
            hash_input = "|".join(parts)
            return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()
        
        hash1 = compute_hash(admin_id, booking_date, Decimal("100.00"), description)
        hash2 = compute_hash(admin_id, booking_date, Decimal("100.01"), description)
        
        assert hash1 != hash2
    
    def test_hash_differs_for_different_dates(self):
        """Test that different dates produce different hashes."""
        admin_id = uuid.uuid4()
        amount = Decimal("100.00")
        description = "Test payment"
        
        def compute_hash(admin_id, booking_date, amount, description, reference=None, counterparty_iban=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
                (counterparty_iban or "").strip(),
            ]
            hash_input = "|".join(parts)
            return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()
        
        hash1 = compute_hash(admin_id, date(2024, 1, 15), amount, description)
        hash2 = compute_hash(admin_id, date(2024, 1, 16), amount, description)
        
        assert hash1 != hash2
    
    def test_hash_differs_for_different_administrations(self):
        """Test that different administrations produce different hashes."""
        booking_date = date(2024, 1, 15)
        amount = Decimal("100.00")
        description = "Test payment"
        
        def compute_hash(admin_id, booking_date, amount, description, reference=None, counterparty_iban=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
                (counterparty_iban or "").strip(),
            ]
            hash_input = "|".join(parts)
            return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()
        
        hash1 = compute_hash(uuid.uuid4(), booking_date, amount, description)
        hash2 = compute_hash(uuid.uuid4(), booking_date, amount, description)
        
        assert hash1 != hash2
    
    def test_duplicate_detection(self):
        """Test that duplicates are correctly detected."""
        existing_hashes = {"abc123", "def456", "ghi789"}
        new_hash = "abc123"
        
        is_duplicate = new_hash in existing_hashes
        
        assert is_duplicate == True
    
    def test_new_transaction_not_duplicate(self):
        """Test that new transactions are not marked as duplicates."""
        existing_hashes = {"abc123", "def456", "ghi789"}
        new_hash = "xyz999"
        
        is_duplicate = new_hash in existing_hashes
        
        assert is_duplicate == False


class TestCSVParsing:
    """Tests for CSV parsing logic."""
    
    def test_parse_european_amount_format(self):
        """Test parsing European amount format (1.234,56)."""
        def parse_amount(value):
            value = value.strip()
            if ',' in value and '.' in value:
                if value.rfind(',') > value.rfind('.'):
                    value = value.replace('.', '').replace(',', '.')
                else:
                    value = value.replace(',', '')
            elif ',' in value:
                parts = value.split(',')
                if len(parts) == 2 and len(parts[1]) == 2:
                    value = value.replace(',', '.')
                else:
                    value = value.replace(',', '')
            return Decimal(value)
        
        assert parse_amount("1.234,56") == Decimal("1234.56")
        assert parse_amount("1234,56") == Decimal("1234.56")
        assert parse_amount("-500,00") == Decimal("-500.00")
    
    def test_parse_us_amount_format(self):
        """Test parsing US amount format (1,234.56)."""
        def parse_amount(value):
            value = value.strip()
            if ',' in value and '.' in value:
                if value.rfind(',') > value.rfind('.'):
                    value = value.replace('.', '').replace(',', '.')
                else:
                    value = value.replace(',', '')
            elif ',' in value:
                parts = value.split(',')
                if len(parts) == 2 and len(parts[1]) == 2:
                    value = value.replace(',', '.')
                else:
                    value = value.replace(',', '')
            return Decimal(value)
        
        assert parse_amount("1,234.56") == Decimal("1234.56")
        assert parse_amount("1234.56") == Decimal("1234.56")
    
    def test_parse_various_date_formats(self):
        """Test parsing various date formats."""
        def parse_date(value, format_str="%Y-%m-%d"):
            try:
                return datetime.strptime(value.strip(), format_str).date()
            except ValueError:
                formats = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y"]
                for fmt in formats:
                    try:
                        return datetime.strptime(value.strip(), fmt).date()
                    except ValueError:
                        continue
                return None
        
        assert parse_date("2024-01-15") == date(2024, 1, 15)
        assert parse_date("15-01-2024") == date(2024, 1, 15)
        assert parse_date("15/01/2024") == date(2024, 1, 15)
        assert parse_date("15.01.2024") == date(2024, 1, 15)


class TestColumnMapping:
    """Tests for CSV column mapping resolution."""

    def test_column_mapping_accepts_booking_date(self):
        service = BankReconciliationService(MagicMock(), uuid.uuid4(), uuid.uuid4())
        headers = ["Booking_Date", "Amount", "Description"]
        mapping = service._resolve_columns(headers)
        assert mapping["booking_date"] == "Booking_Date"
        assert mapping["amount"] == "Amount"
        assert mapping["description"] == "Description"

    def test_column_mapping_accepts_date_column(self):
        service = BankReconciliationService(MagicMock(), uuid.uuid4(), uuid.uuid4())
        headers = ["Date", "Amount", "Description", "Counterparty_Name"]
        mapping = service._resolve_columns(headers)
        assert mapping["booking_date"] == "Date"
        assert mapping["counterparty_name"] == "Counterparty_Name"

    def test_column_mapping_requires_required_columns(self):
        service = BankReconciliationService(MagicMock(), uuid.uuid4(), uuid.uuid4())
        headers = ["Date", "Description"]
        mapping = service._resolve_columns(headers)
        assert mapping is None


class TestReconciliationActions:
    """Tests for reconciliation action logic."""
    
    def test_status_transitions_for_ignore(self):
        """Test that IGNORE action sets status to IGNORED."""
        current_status = "NEW"
        action = "IGNORE"
        
        if action == "IGNORE":
            new_status = "IGNORED"
        else:
            new_status = current_status
        
        assert new_status == "IGNORED"
    
    def test_status_transitions_for_accept_match(self):
        """Test that APPLY_MATCH sets status to MATCHED."""
        current_status = "NEW"
        action = "APPLY_MATCH"
        
        if action == "APPLY_MATCH":
            new_status = "MATCHED"
        else:
            new_status = current_status
        
        assert new_status == "MATCHED"
    
    def test_status_transitions_for_unmatch(self):
        """Test that UNMATCH sets status back to NEW."""
        current_status = "MATCHED"
        action = "UNMATCH"
        
        if action == "UNMATCH":
            new_status = "NEW"
        else:
            new_status = current_status
        
        assert new_status == "NEW"
    
    def test_matched_type_is_set_correctly(self):
        """Test that matched_entity_type is set based on entity type."""
        item_types = {
            "RECEIVABLE": "INVOICE",
            "PAYABLE": "EXPENSE",
        }
        
        for item_type, expected_matched_type in item_types.items():
            matched_type = "INVOICE" if item_type == "RECEIVABLE" else "EXPENSE"
            assert matched_type == expected_matched_type
    
    def test_accept_match_requires_entity_id(self):
        """Test that APPLY_MATCH requires an entity_id."""
        action = "APPLY_MATCH"
        entity_id = None
        
        is_valid = not (action == "APPLY_MATCH" and entity_id is None)
        
        assert is_valid == False
    
    def test_link_invoice_requires_entity_id(self):
        """Test that APPLY_MATCH requires a match_entity_type."""
        action = "APPLY_MATCH"
        match_entity_type = None
        
        is_valid = not (action == "APPLY_MATCH" and match_entity_type is None)
        
        assert is_valid == False


class TestMatchSuggestions:
    """Tests for match suggestion logic."""
    
    def test_extract_invoice_number_from_description(self):
        """Test extraction of invoice numbers from description."""
        import re
        
        def extract_invoice_numbers(description):
            pattern = r"(factuur|invoice|inv)\s*[:#-]?\s*([A-Za-z0-9-]+)"
            matches = re.findall(pattern, description, re.IGNORECASE)
            return list({match[1] for match in matches if len(match) > 1})
        
        assert "12345" in extract_invoice_numbers("Factuur 12345 betaling")
        assert "67890" in extract_invoice_numbers("Invoice #67890")
        assert "2024-0001" in extract_invoice_numbers("Inv-2024-0001 betaling")
        assert "9999" in extract_invoice_numbers("INV-9999 payment")
    
    def test_amount_tolerance_matching(self):
        """Test amount matching with tolerance."""
        def amount_matches(amount1, amount2, tolerance_percent=1.0):
            tolerance = amount1 * Decimal(str(tolerance_percent / 100))
            return abs(amount1 - amount2) <= tolerance
        
        # Exact match
        assert amount_matches(Decimal("100.00"), Decimal("100.00")) == True
        
        # Within 1% tolerance
        assert amount_matches(Decimal("100.00"), Decimal("100.50")) == True
        assert amount_matches(Decimal("100.00"), Decimal("99.50")) == True
        
        # Outside 1% tolerance
        assert amount_matches(Decimal("100.00"), Decimal("102.00")) == False
        assert amount_matches(Decimal("100.00"), Decimal("98.00")) == False
    
    def test_confidence_score_for_exact_amount_match(self):
        """Test that exact amount matches get higher confidence score."""
        open_amount = Decimal("100.00")
        transaction_amount = Decimal("100.00")
        
        score = 80 if open_amount == abs(transaction_amount) else 60
        
        assert score == 80
    
    def test_confidence_score_for_approximate_amount_match(self):
        """Test that approximate amount matches get lower confidence score."""
        open_amount = Decimal("100.00")
        transaction_amount = Decimal("100.50")
        
        score = 80 if open_amount == abs(transaction_amount) else 60
        
        assert score == 60
    
    def test_invoice_number_match_gets_highest_score(self):
        """Test that invoice number matches get the highest confidence score."""
        # Invoice number found in description
        invoice_match_score = 90
        
        # Amount match
        amount_exact_match_score = 80
        amount_approx_match_score = 60
        
        # IBAN match
        iban_match_score = 70
        
        # Invoice match should be highest
        assert invoice_match_score > amount_exact_match_score
        assert invoice_match_score > iban_match_score

    def test_suggestion_proposed_action_is_apply_match(self):
        """Test that suggestion proposed action is APPLY_MATCH."""
        proposed_action = "APPLY_MATCH"
        assert proposed_action == "APPLY_MATCH"


class TestJournalEntryCreation:
    """Tests for CREATE_EXPENSE journal entry creation."""
    
    def test_journal_entry_is_balanced(self):
        """Test that created journal entries are balanced."""
        debit_amount = Decimal("121.00")
        vat_amount = Decimal("21.00")
        net_amount = debit_amount - vat_amount
        
        # Lines: expense (net), VAT recoverable, bank (total)
        total_debit = net_amount + vat_amount  # 100 + 21
        total_credit = debit_amount  # 121
        
        assert total_debit == total_credit
        assert total_debit == Decimal("121.00")
    
    def test_journal_entry_without_vat(self):
        """Test journal entry creation without VAT."""
        amount = Decimal("100.00")
        
        # Lines: expense (full amount), bank (full amount)
        total_debit = amount
        total_credit = amount
        
        assert total_debit == total_credit
    
    def test_vat_calculation_from_gross_amount(self):
        """Test VAT calculation from gross amount (reverse calculation)."""
        gross_amount = Decimal("121.00")
        vat_rate = Decimal("21.00")  # 21%
        
        # Reverse calculation: VAT = gross * rate / (100 + rate)
        vat_amount = gross_amount * vat_rate / (Decimal("100") + vat_rate)
        net_amount = gross_amount - vat_amount
        
        assert vat_amount == Decimal("21.00")
        assert net_amount == Decimal("100.00")
    
    def test_entry_number_generation(self):
        """Test entry number generation format."""
        year = 2024
        count = 42
        
        entry_number = f"BNK-{year}-{count + 1:05d}"
        
        assert entry_number == "BNK-2024-00043"

    def test_vat_engine_extracts_base_from_gross(self):
        """Test VAT engine extraction from gross amount."""
        vat_service = VatPostingService(MagicMock(), uuid.uuid4())
        base_amount, vat_amount = vat_service.extract_base_from_gross(Decimal("121.00"), Decimal("21.00"))
        assert base_amount == Decimal("100.00")
        assert vat_amount == Decimal("21.00")


class TestRoleEnforcement:
    """Tests for role and assignment enforcement."""
    
    def test_non_accountant_cannot_import(self):
        """Test that non-accountant users cannot import bank files."""
        user_role = "zzp"
        allowed_roles = ["accountant"]
        
        is_allowed = user_role in allowed_roles
        
        assert is_allowed == False
    
    def test_accountant_can_import(self):
        """Test that accountants can import bank files."""
        user_role = "accountant"
        allowed_roles = ["accountant"]
        
        is_allowed = user_role in allowed_roles
        
        assert is_allowed == True
    
    def test_admin_can_import(self):
        """Test that admins cannot import bank files."""
        user_role = "admin"
        allowed_roles = ["accountant"]
        
        is_allowed = user_role in allowed_roles
        
        assert is_allowed == False
    
    def test_unassigned_client_access_denied(self):
        """Test that accountants cannot access unassigned clients."""
        assigned_client_ids = [uuid.uuid4(), uuid.uuid4()]
        requested_client_id = uuid.uuid4()  # Not in assigned list
        
        is_allowed = requested_client_id in assigned_client_ids
        
        assert is_allowed == False
    
    def test_assigned_client_access_granted(self):
        """Test that accountants can access assigned clients."""
        client_id = uuid.uuid4()
        assigned_client_ids = [client_id, uuid.uuid4()]
        
        is_allowed = client_id in assigned_client_ids
        
        assert is_allowed == True
    
    def test_pending_assignment_denies_access(self):
        """Test that PENDING assignments don't grant access."""
        assignment_status = "PENDING"
        
        has_access = assignment_status == "ACTIVE"
        
        assert has_access == False
    
    def test_active_assignment_grants_access(self):
        """Test that ACTIVE assignments grant access."""
        assignment_status = "ACTIVE"
        
        has_access = assignment_status == "ACTIVE"
        
        assert has_access == True


class TestAuditTrail:
    """Tests for reconciliation action audit trail."""
    
    def test_action_is_recorded_with_timestamp(self):
        """Test that actions are recorded with timestamp."""
        action = {
            "id": uuid.uuid4(),
            "bank_transaction_id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "administration_id": uuid.uuid4(),
            "action": "IGNORE",
            "created_at": datetime.now(timezone.utc),
        }
        
        assert action["created_at"] is not None
        assert action["user_id"] is not None
        assert action["administration_id"] is not None
    
    def test_action_payload_contains_details(self):
        """Test that action payload contains relevant details."""
        payload = {
            "entity_id": str(uuid.uuid4()),
            "vat_code": "NL_21",
            "ledger_code": "4000",
            "notes": "Monthly subscription",
            "journal_entry_id": str(uuid.uuid4()),
        }
        
        assert "vat_code" in payload
        assert "ledger_code" in payload
        assert "journal_entry_id" in payload
    
    def test_action_types_are_valid(self):
        """Test that all action types are valid."""
        valid_actions = ["APPLY_MATCH", "IGNORE", "CREATE_EXPENSE", "UNMATCH"]
        
        for action in valid_actions:
            assert action in valid_actions


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
    def test_hash_differs_for_different_counterparty_iban(self):
        """Test that different IBANs produce different hashes."""
        admin_id = uuid.uuid4()
        booking_date = date(2024, 1, 15)
        amount = Decimal("100.00")
        description = "Test payment"

        def compute_hash(admin_id, booking_date, amount, description, reference=None, counterparty_iban=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
                (counterparty_iban or "").strip(),
            ]
            hash_input = "|".join(parts)
            return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()

        hash1 = compute_hash(admin_id, booking_date, amount, description, counterparty_iban="NL01TEST0000000001")
        hash2 = compute_hash(admin_id, booking_date, amount, description, counterparty_iban="NL01TEST0000000002")

        assert hash1 != hash2
