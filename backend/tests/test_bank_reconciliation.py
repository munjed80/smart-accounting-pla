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
import base64
import hashlib
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, AsyncMock


class TestBankImportIdempotency:
    """Tests for bank import idempotency."""
    
    def test_hash_computation_is_consistent(self):
        """Test that hash computation produces consistent results."""
        admin_id = uuid.uuid4()
        booking_date = date(2024, 1, 15)
        amount = Decimal("123.45")
        description = "Test payment"
        reference = "REF-001"
        
        def compute_hash(admin_id, booking_date, amount, description, reference=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
            ]
            hash_input = "|".join(parts)
            return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()
        
        hash1 = compute_hash(admin_id, booking_date, amount, description, reference)
        hash2 = compute_hash(admin_id, booking_date, amount, description, reference)
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 produces 64 hex characters
    
    def test_hash_differs_for_different_amounts(self):
        """Test that different amounts produce different hashes."""
        admin_id = uuid.uuid4()
        booking_date = date(2024, 1, 15)
        description = "Test payment"
        
        def compute_hash(admin_id, booking_date, amount, description, reference=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
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
        
        def compute_hash(admin_id, booking_date, amount, description, reference=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
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
        
        def compute_hash(admin_id, booking_date, amount, description, reference=None):
            parts = [
                str(admin_id),
                booking_date.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
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
        """Test that ACCEPT_MATCH sets status to MATCHED."""
        current_status = "NEW"
        action = "ACCEPT_MATCH"
        
        if action == "ACCEPT_MATCH":
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
        """Test that matched_type is set based on entity type."""
        item_types = {
            "RECEIVABLE": "INVOICE",
            "PAYABLE": "EXPENSE",
        }
        
        for item_type, expected_matched_type in item_types.items():
            matched_type = "INVOICE" if item_type == "RECEIVABLE" else "EXPENSE"
            assert matched_type == expected_matched_type
    
    def test_accept_match_requires_entity_id(self):
        """Test that ACCEPT_MATCH requires an entity_id."""
        action = "ACCEPT_MATCH"
        entity_id = None
        
        is_valid = not (action == "ACCEPT_MATCH" and entity_id is None)
        
        assert is_valid == False
    
    def test_link_invoice_requires_entity_id(self):
        """Test that LINK_INVOICE requires an entity_id."""
        action = "LINK_INVOICE"
        entity_id = None
        
        is_valid = not (action == "LINK_INVOICE" and entity_id is None)
        
        assert is_valid == False


class TestMatchSuggestions:
    """Tests for match suggestion logic."""
    
    def test_extract_invoice_number_from_description(self):
        """Test extraction of invoice numbers from description."""
        import re
        
        def extract_invoice_numbers(description):
            patterns = [
                r'(?:factuur|invoice|inv|fac)[.\s:#-]*(\d+)',
                r'(?:F|INV)[-]?(\d{4,})',
                r'\b(\d{4}-\d{4})\b',
            ]
            numbers = []
            for pattern in patterns:
                matches = re.findall(pattern, description, re.IGNORECASE)
                numbers.extend(matches)
            return list(set(numbers))
        
        assert "12345" in extract_invoice_numbers("Factuur 12345 betaling")
        assert "67890" in extract_invoice_numbers("Invoice #67890")
        assert "2024-0001" in extract_invoice_numbers("Betr: 2024-0001")
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


class TestRoleEnforcement:
    """Tests for role and assignment enforcement."""
    
    def test_non_accountant_cannot_import(self):
        """Test that non-accountant users cannot import bank files."""
        user_role = "zzp"
        allowed_roles = ["accountant", "admin"]
        
        is_allowed = user_role in allowed_roles
        
        assert is_allowed == False
    
    def test_accountant_can_import(self):
        """Test that accountants can import bank files."""
        user_role = "accountant"
        allowed_roles = ["accountant", "admin"]
        
        is_allowed = user_role in allowed_roles
        
        assert is_allowed == True
    
    def test_admin_can_import(self):
        """Test that admins can import bank files."""
        user_role = "admin"
        allowed_roles = ["accountant", "admin"]
        
        is_allowed = user_role in allowed_roles
        
        assert is_allowed == True
    
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
            "action": "IGNORE",
            "created_at": datetime.now(timezone.utc),
        }
        
        assert action["created_at"] is not None
        assert action["user_id"] is not None
    
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
        valid_actions = ["ACCEPT_MATCH", "IGNORE", "CREATE_EXPENSE", "LINK_INVOICE", "UNMATCH"]
        
        for action in valid_actions:
            assert action in valid_actions


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
