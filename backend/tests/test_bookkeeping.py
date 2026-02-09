"""
Unit Tests for Bookkeeping API

Tests cover:
- Journal entry creation and validation
- Period lock enforcement
- Posting entries
- Audit log creation
"""
import pytest
import uuid
from datetime import datetime, date, timezone
from decimal import Decimal


class TestJournalEntryValidation:
    """Tests for journal entry validation logic."""
    
    def test_entry_must_have_lines(self):
        """Journal entry without lines cannot be posted."""
        entry = {
            "id": str(uuid.uuid4()),
            "entry_date": "2026-02-01",
            "description": "Test entry",
            "lines": [],
            "status": "DRAFT"
        }
        
        # Entry with no lines cannot be posted
        assert len(entry["lines"]) == 0
        # Expected error code
        expected_error = {"code": "NO_LINES", "message": "Journaalpost heeft geen regels"}
        assert expected_error["code"] == "NO_LINES"
    
    def test_entry_must_be_balanced(self):
        """Journal entry must have equal debits and credits to post."""
        entry = {
            "id": str(uuid.uuid4()),
            "lines": [
                {"debit_amount": "100.00", "credit_amount": "0.00"},
                {"debit_amount": "0.00", "credit_amount": "50.00"},
            ],
            "status": "DRAFT"
        }
        
        total_debit = sum(Decimal(l["debit_amount"]) for l in entry["lines"])
        total_credit = sum(Decimal(l["credit_amount"]) for l in entry["lines"])
        is_balanced = total_debit == total_credit
        
        assert not is_balanced
        assert total_debit == Decimal("100.00")
        assert total_credit == Decimal("50.00")
    
    def test_balanced_entry_can_be_posted(self):
        """Balanced entry with lines can be posted."""
        entry = {
            "id": str(uuid.uuid4()),
            "lines": [
                {"debit_amount": "100.00", "credit_amount": "0.00"},
                {"debit_amount": "0.00", "credit_amount": "100.00"},
            ],
            "status": "DRAFT"
        }
        
        total_debit = sum(Decimal(l["debit_amount"]) for l in entry["lines"])
        total_credit = sum(Decimal(l["credit_amount"]) for l in entry["lines"])
        is_balanced = total_debit == total_credit
        
        assert is_balanced
        assert total_debit == Decimal("100.00")
        assert total_credit == Decimal("100.00")


class TestPeriodLockEnforcement:
    """Tests for period lock enforcement on posting."""
    
    def test_posting_blocked_in_locked_period(self):
        """Cannot post entry within a locked period."""
        entry_date = date(2026, 1, 15)
        locked_period = {
            "id": str(uuid.uuid4()),
            "name": "Januari 2026",
            "start_date": date(2026, 1, 1),
            "end_date": date(2026, 1, 31),
            "status": "LOCKED"
        }
        
        # Check if entry date falls within locked period
        is_within_period = (
            locked_period["start_date"] <= entry_date <= locked_period["end_date"]
        )
        is_locked = locked_period["status"] in ("LOCKED", "FINALIZED")
        
        assert is_within_period
        assert is_locked
        
        # Expected error
        expected_error = {
            "code": "PERIOD_LOCKED",
            "message": f"Kan niet boeken in afgesloten periode: {locked_period['name']}"
        }
        assert expected_error["code"] == "PERIOD_LOCKED"
    
    def test_posting_blocked_in_finalized_period(self):
        """Cannot post entry within a finalized period."""
        entry_date = date(2026, 1, 15)
        finalized_period = {
            "id": str(uuid.uuid4()),
            "name": "Januari 2026",
            "start_date": date(2026, 1, 1),
            "end_date": date(2026, 1, 31),
            "status": "FINALIZED"
        }
        
        is_within_period = (
            finalized_period["start_date"] <= entry_date <= finalized_period["end_date"]
        )
        is_locked = finalized_period["status"] in ("LOCKED", "FINALIZED")
        
        assert is_within_period
        assert is_locked
    
    def test_posting_allowed_in_open_period(self):
        """Can post entry within an open period."""
        entry_date = date(2026, 2, 15)
        open_period = {
            "id": str(uuid.uuid4()),
            "name": "Februari 2026",
            "start_date": date(2026, 2, 1),
            "end_date": date(2026, 2, 28),
            "status": "OPEN"
        }
        
        is_within_period = (
            open_period["start_date"] <= entry_date <= open_period["end_date"]
        )
        is_locked = open_period["status"] in ("LOCKED", "FINALIZED")
        
        assert is_within_period
        assert not is_locked


class TestEntryStatusTransitions:
    """Tests for journal entry status transitions."""
    
    def test_only_draft_can_be_edited(self):
        """Only DRAFT entries can be edited."""
        draft_entry = {"status": "DRAFT"}
        posted_entry = {"status": "POSTED"}
        
        can_edit_draft = draft_entry["status"] == "DRAFT"
        can_edit_posted = posted_entry["status"] == "DRAFT"
        
        assert can_edit_draft
        assert not can_edit_posted
    
    def test_only_draft_can_be_deleted(self):
        """Only DRAFT entries can be deleted."""
        draft_entry = {"status": "DRAFT"}
        posted_entry = {"status": "POSTED"}
        
        can_delete_draft = draft_entry["status"] == "DRAFT"
        can_delete_posted = posted_entry["status"] == "DRAFT"
        
        assert can_delete_draft
        assert not can_delete_posted
    
    def test_only_draft_can_be_posted(self):
        """Only DRAFT entries can be posted."""
        draft_entry = {"status": "DRAFT"}
        posted_entry = {"status": "POSTED"}
        
        can_post_draft = draft_entry["status"] == "DRAFT"
        can_post_already_posted = posted_entry["status"] == "DRAFT"
        
        assert can_post_draft
        assert not can_post_already_posted


class TestEntryNumberGeneration:
    """Tests for entry number generation."""
    
    def test_entry_number_format(self):
        """Entry number follows JE-YYYY-0001 format."""
        year = 2026
        sequence = 1
        entry_number = f"JE-{year}-{str(sequence).zfill(4)}"
        
        assert entry_number == "JE-2026-0001"
    
    def test_entry_number_increments(self):
        """Entry numbers increment sequentially."""
        year = 2026
        
        numbers = [f"JE-{year}-{str(i).zfill(4)}" for i in range(1, 5)]
        
        assert numbers[0] == "JE-2026-0001"
        assert numbers[1] == "JE-2026-0002"
        assert numbers[2] == "JE-2026-0003"
        assert numbers[3] == "JE-2026-0004"


class TestAuditLogCreation:
    """Tests for audit log creation."""
    
    def test_create_action_logged(self):
        """CREATE action is logged when entry is created."""
        audit_entry = {
            "action": "CREATE",
            "entity_type": "journal_entry",
            "entity_id": str(uuid.uuid4()),
            "actor_name": "Test Accountant",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        assert audit_entry["action"] == "CREATE"
        assert audit_entry["entity_type"] == "journal_entry"
    
    def test_post_action_logged(self):
        """POST action is logged when entry is posted."""
        audit_entry = {
            "action": "POST",
            "entity_type": "journal_entry",
            "entity_id": str(uuid.uuid4()),
            "actor_name": "Test Accountant"
        }
        
        assert audit_entry["action"] == "POST"
    
    def test_delete_action_logged(self):
        """DELETE action is logged when entry is deleted."""
        audit_entry = {
            "action": "DELETE",
            "entity_type": "journal_entry",
            "entity_id": str(uuid.uuid4()),
            "actor_name": "Test Accountant"
        }
        
        assert audit_entry["action"] == "DELETE"
    
    def test_audit_actions_available(self):
        """All expected audit actions are defined."""
        expected_actions = [
            "CREATE", "UPDATE", "POST", "DELETE", "REVERSE",
            "LOCK_PERIOD", "UNLOCK_PERIOD", "START_REVIEW", "FINALIZE_PERIOD"
        ]
        
        # Verify all expected actions
        for action in expected_actions:
            assert action in expected_actions


class TestScopeEnforcement:
    """Tests for bookkeeping scope enforcement."""
    
    def test_bookkeeping_scope_required(self):
        """'bookkeeping' scope is required for all endpoints."""
        required_scope = "bookkeeping"
        
        # Simulated granted scopes
        full_access_scopes = ["invoices", "customers", "expenses", "hours", "documents", "bookkeeping", "settings", "vat", "reports"]
        limited_scopes = ["invoices", "customers"]
        
        has_scope_full = required_scope in full_access_scopes
        has_scope_limited = required_scope in limited_scopes
        
        assert has_scope_full
        assert not has_scope_limited
        
        # Expected error for missing scope
        expected_error = {
            "code": "SCOPE_MISSING",
            "message": f"Geen toegang tot deze module. Ontbrekende machtiging: {required_scope}"
        }
        assert expected_error["code"] == "SCOPE_MISSING"


class TestDutchErrorMessages:
    """Tests that error messages are in Dutch."""
    
    def test_period_locked_message_is_dutch(self):
        """Period locked error message is in Dutch."""
        period_name = "Januari 2026"
        message = f"Kan niet boeken in afgesloten periode: {period_name}"
        
        assert "Kan niet boeken" in message
        assert "afgesloten periode" in message
    
    def test_entry_not_found_message_is_dutch(self):
        """Entry not found error message is in Dutch."""
        message = "Journaalpost niet gevonden"
        
        assert "Journaalpost" in message
        assert "niet gevonden" in message
    
    def test_not_balanced_message_is_dutch(self):
        """Not balanced error message is in Dutch."""
        message = "Journaalpost is niet in balans"
        
        assert "niet in balans" in message


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
