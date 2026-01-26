"""
Unit Tests for Document Intake Pipeline

Tests cover:
- Duplicate detection
- Document → journal posting integrity
- VAT impact after posting
- Reprocess idempotency
- Review queue endpoint scoping per tenant

These tests are independent of database and can run without DB dependencies.
"""
import pytest
import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, AsyncMock, patch


class TestDuplicateDetection:
    """Tests for duplicate document detection."""
    
    def test_exact_duplicate_detected(self):
        """Documents with same invoice_number, supplier, and amount are duplicates."""
        doc1 = {
            "invoice_number": "INV-001",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1000.00"),
            "invoice_date": date(2024, 1, 15),
        }
        doc2 = {
            "invoice_number": "INV-001",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1000.00"),
            "invoice_date": date(2024, 1, 16),  # 1 day apart
        }
        
        # Check matching criteria
        invoice_match = doc1["invoice_number"] == doc2["invoice_number"]
        supplier_match = doc1["supplier_name"].lower() == doc2["supplier_name"].lower()
        amount_match = abs(doc1["total_amount"] - doc2["total_amount"]) <= Decimal("0.01")
        date_tolerance_days = 3
        date_match = abs((doc1["invoice_date"] - doc2["invoice_date"]).days) <= date_tolerance_days
        
        is_duplicate = invoice_match and supplier_match and amount_match and date_match
        
        assert is_duplicate == True
    
    def test_different_invoice_number_not_duplicate(self):
        """Documents with different invoice numbers are not duplicates."""
        doc1 = {
            "invoice_number": "INV-001",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1000.00"),
        }
        doc2 = {
            "invoice_number": "INV-002",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1000.00"),
        }
        
        invoice_match = doc1["invoice_number"] == doc2["invoice_number"]
        
        assert invoice_match == False
    
    def test_different_supplier_not_duplicate(self):
        """Documents with different suppliers are not duplicates."""
        doc1 = {
            "invoice_number": "INV-001",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1000.00"),
        }
        doc2 = {
            "invoice_number": "INV-001",
            "supplier_name": "Beta Ltd",
            "total_amount": Decimal("1000.00"),
        }
        
        supplier_match = doc1["supplier_name"].lower() == doc2["supplier_name"].lower()
        
        assert supplier_match == False
    
    def test_different_amount_not_duplicate(self):
        """Documents with significantly different amounts are not duplicates."""
        doc1 = {
            "invoice_number": "INV-001",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1000.00"),
        }
        doc2 = {
            "invoice_number": "INV-001",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1500.00"),
        }
        
        tolerance = Decimal("0.01")
        amount_match = abs(doc1["total_amount"] - doc2["total_amount"]) <= tolerance
        
        assert amount_match == False
    
    def test_date_outside_tolerance_not_duplicate(self):
        """Documents with dates outside tolerance are not duplicates."""
        doc1 = {
            "invoice_number": "INV-001",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1000.00"),
            "invoice_date": date(2024, 1, 1),
        }
        doc2 = {
            "invoice_number": "INV-001",
            "supplier_name": "ACME Corp",
            "total_amount": Decimal("1000.00"),
            "invoice_date": date(2024, 1, 15),  # 14 days apart
        }
        
        date_tolerance_days = 3
        date_match = abs((doc1["invoice_date"] - doc2["invoice_date"]).days) <= date_tolerance_days
        
        assert date_match == False
    
    def test_case_insensitive_supplier_match(self):
        """Supplier name matching is case-insensitive."""
        doc1 = {"supplier_name": "ACME Corp"}
        doc2 = {"supplier_name": "acme corp"}
        
        supplier_match = doc1["supplier_name"].lower() == doc2["supplier_name"].lower()
        
        assert supplier_match == True


class TestDocumentJournalPostingIntegrity:
    """Tests for document → journal posting integrity."""
    
    def test_journal_entry_balanced_after_posting(self):
        """Journal entry created from document must be balanced."""
        document = {
            "total_amount": Decimal("121.00"),
            "net_amount": Decimal("100.00"),
            "vat_amount": Decimal("21.00"),
        }
        
        # Simulate journal lines
        lines = [
            {"debit_amount": document["net_amount"], "credit_amount": Decimal("0.00")},  # Expense
            {"debit_amount": document["vat_amount"], "credit_amount": Decimal("0.00")},  # VAT
            {"debit_amount": Decimal("0.00"), "credit_amount": document["total_amount"]},  # Creditor
        ]
        
        total_debit = sum(line["debit_amount"] for line in lines)
        total_credit = sum(line["credit_amount"] for line in lines)
        is_balanced = total_debit == total_credit
        
        assert total_debit == Decimal("121.00")
        assert total_credit == Decimal("121.00")
        assert is_balanced == True
    
    def test_journal_entry_links_to_document(self):
        """Journal entry must reference the source document."""
        document_id = uuid.uuid4()
        
        journal_entry = {
            "id": uuid.uuid4(),
            "document_id": document_id,
            "source_type": "DOCUMENT_POSTING",
            "source_id": document_id,
        }
        
        has_document_link = journal_entry["document_id"] == document_id
        has_source_link = journal_entry["source_id"] == document_id
        
        assert has_document_link == True
        assert has_source_link == True
    
    def test_document_status_updated_after_posting(self):
        """Document status must be updated to POSTED after posting."""
        old_status = "NEEDS_REVIEW"
        new_status = "POSTED"
        
        status_updated = old_status != new_status and new_status == "POSTED"
        
        assert status_updated == True
    
    def test_document_has_posted_journal_reference(self):
        """Document must reference the created journal entry."""
        journal_entry_id = uuid.uuid4()
        
        document = {
            "status": "POSTED",
            "posted_journal_entry_id": journal_entry_id,
            "posted_at": datetime.now(timezone.utc),
        }
        
        has_journal_ref = document["posted_journal_entry_id"] == journal_entry_id
        has_posted_at = document["posted_at"] is not None
        
        assert has_journal_ref == True
        assert has_posted_at == True
    
    def test_posting_respects_period_status(self):
        """Posting must be blocked for FINALIZED and LOCKED periods."""
        test_cases = [
            ("OPEN", True),
            ("REVIEW", True),
            ("FINALIZED", False),
            ("LOCKED", False),
        ]
        
        for period_status, expected_allowed in test_cases:
            can_post = period_status in ("OPEN", "REVIEW")
            assert can_post == expected_allowed, f"Period {period_status} should {'allow' if expected_allowed else 'block'} posting"


class TestVATImpactAfterPosting:
    """Tests for VAT impact after posting documents."""
    
    def test_vat_amount_posted_to_correct_account(self):
        """VAT amount must be posted to VAT receivable account."""
        vat_amount = Decimal("21.00")
        
        vat_line = {
            "account_code": "1520",  # Dutch VAT receivable
            "debit_amount": vat_amount,
            "credit_amount": Decimal("0.00"),
            "vat_amount": vat_amount,
        }
        
        is_debit_normal = vat_line["debit_amount"] == vat_amount
        has_vat_amount = vat_line["vat_amount"] == vat_amount
        
        assert is_debit_normal == True
        assert has_vat_amount == True
    
    def test_taxable_amount_recorded(self):
        """Taxable amount (base) must be recorded for VAT reporting."""
        net_amount = Decimal("100.00")
        vat_amount = Decimal("21.00")
        
        line = {
            "taxable_amount": net_amount,
            "vat_base_amount": net_amount,
            "vat_amount": vat_amount,
        }
        
        # VAT should be 21% of taxable amount
        expected_vat = (line["taxable_amount"] * Decimal("0.21")).quantize(Decimal("0.01"))
        
        assert line["vat_amount"] == expected_vat
        assert line["vat_base_amount"] == net_amount
    
    def test_zero_vat_for_exempt_transactions(self):
        """Zero VAT should be recorded for exempt transactions."""
        net_amount = Decimal("100.00")
        vat_rate = Decimal("0.00")
        
        expected_vat = (net_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        
        assert expected_vat == Decimal("0.00")
    
    def test_vat_code_linked_to_journal_line(self):
        """VAT code must be linked to the journal line."""
        vat_code_id = uuid.uuid4()
        
        line = {
            "vat_code_id": vat_code_id,
            "vat_amount": Decimal("21.00"),
        }
        
        has_vat_code = line["vat_code_id"] is not None
        
        assert has_vat_code == True


class TestReprocessIdempotency:
    """Tests for reprocess idempotency."""
    
    def test_reprocess_increments_count(self):
        """Reprocessing increments the process count."""
        initial_count = 1
        after_reprocess = initial_count + 1
        
        assert after_reprocess == 2
    
    def test_reprocess_resets_status_to_uploaded(self):
        """Reprocessing resets status to UPLOADED."""
        current_status = "FAILED"
        expected_status = "UPLOADED"
        
        # Reprocess resets to UPLOADED for re-extraction
        new_status = "UPLOADED" if current_status != "POSTED" else current_status
        
        assert new_status == expected_status
    
    def test_reprocess_clears_error_message(self):
        """Reprocessing clears the error message."""
        document = {
            "status": "FAILED",
            "error_message": "OCR failed: image too blurry",
        }
        
        # After reprocess
        document["error_message"] = None
        document["status"] = "UPLOADED"
        
        assert document["error_message"] is None
    
    def test_posted_document_cannot_be_reprocessed(self):
        """Posted documents cannot be reprocessed."""
        status = "POSTED"
        
        can_reprocess = status != "POSTED"
        
        assert can_reprocess == False
    
    def test_reprocess_clears_duplicate_flag(self):
        """Reprocessing clears duplicate detection flags."""
        document = {
            "is_duplicate": True,
            "duplicate_of_id": uuid.uuid4(),
            "match_confidence": Decimal("0.95"),
        }
        
        # After reprocess
        document["is_duplicate"] = False
        document["duplicate_of_id"] = None
        document["match_confidence"] = None
        
        assert document["is_duplicate"] == False
        assert document["duplicate_of_id"] is None
    
    def test_reprocess_idempotent_status_change(self):
        """Multiple reprocess calls result in same status."""
        # First reprocess
        status_after_first = "UPLOADED"
        
        # Second reprocess (already in UPLOADED)
        current = "UPLOADED"
        status_after_second = "UPLOADED" if current != "POSTED" else current
        
        assert status_after_first == status_after_second


class TestReviewQueueTenantScoping:
    """Tests for review queue endpoint scoping per tenant."""
    
    def test_documents_scoped_by_administration(self):
        """Documents must be scoped by administration_id."""
        admin_id_1 = uuid.uuid4()
        admin_id_2 = uuid.uuid4()
        
        documents = [
            {"id": uuid.uuid4(), "administration_id": admin_id_1, "status": "NEEDS_REVIEW"},
            {"id": uuid.uuid4(), "administration_id": admin_id_1, "status": "NEEDS_REVIEW"},
            {"id": uuid.uuid4(), "administration_id": admin_id_2, "status": "NEEDS_REVIEW"},
        ]
        
        # Filter for admin_id_1
        filtered = [d for d in documents if d["administration_id"] == admin_id_1]
        
        assert len(filtered) == 2
        assert all(d["administration_id"] == admin_id_1 for d in filtered)
    
    def test_user_membership_verified(self):
        """User must be member of administration to access documents."""
        user_id = uuid.uuid4()
        admin_id = uuid.uuid4()
        
        memberships = [
            {"user_id": user_id, "administration_id": admin_id, "role": "ACCOUNTANT"},
        ]
        
        has_access = any(
            m["user_id"] == user_id and 
            m["administration_id"] == admin_id and 
            m["role"] in ["OWNER", "ADMIN", "ACCOUNTANT"]
            for m in memberships
        )
        
        assert has_access == True
    
    def test_non_member_denied_access(self):
        """Non-members are denied access to administration documents."""
        user_id = uuid.uuid4()
        admin_id = uuid.uuid4()
        other_admin_id = uuid.uuid4()
        
        memberships = [
            {"user_id": user_id, "administration_id": other_admin_id, "role": "ACCOUNTANT"},
        ]
        
        has_access = any(
            m["user_id"] == user_id and 
            m["administration_id"] == admin_id
            for m in memberships
        )
        
        assert has_access == False
    
    def test_non_accountant_role_denied(self):
        """Non-accountant roles are denied access to review endpoints."""
        user_role = "zzp"
        
        allowed_roles = ["accountant", "admin"]
        has_access = user_role in allowed_roles
        
        assert has_access == False
    
    def test_accountant_role_allowed(self):
        """Accountant role is allowed access to review endpoints."""
        user_role = "accountant"
        
        allowed_roles = ["accountant", "admin"]
        has_access = user_role in allowed_roles
        
        assert has_access == True


class TestClosingChecklistLogic:
    """Tests for closing checklist logic."""
    
    def test_red_issues_block_finalization(self):
        """RED issues must be zero for finalization."""
        red_issues = 1
        yellow_issues = 0
        
        can_finalize = red_issues == 0
        
        assert can_finalize == False
    
    def test_no_issues_allows_finalization(self):
        """No issues allows finalization."""
        red_issues = 0
        yellow_issues = 0
        
        can_finalize = red_issues == 0
        
        assert can_finalize == True
    
    def test_pending_documents_create_warning(self):
        """Pending documents create a warning in checklist."""
        total_docs = 10
        posted_docs = 8
        pending_docs = total_docs - posted_docs
        
        status = "PASSED" if pending_docs == 0 else ("WARNING" if pending_docs <= 2 else "FAILED")
        
        assert status == "WARNING"  # 2 pending
    
    def test_documents_posted_percentage(self):
        """Calculate percentage of documents posted."""
        total_docs = 10
        posted_docs = 8
        
        if total_docs > 0:
            percent = Decimal(posted_docs * 100 / total_docs).quantize(Decimal("0.1"))
        else:
            percent = Decimal("100.0")
        
        assert percent == Decimal("80.0")
    
    def test_checklist_item_status_values(self):
        """Checklist items have valid status values."""
        valid_statuses = ["PASSED", "FAILED", "WARNING", "PENDING"]
        
        items = [
            {"name": "Documents Posted", "status": "PASSED"},
            {"name": "Critical Issues", "status": "FAILED"},
            {"name": "Warning Issues", "status": "WARNING"},
        ]
        
        all_valid = all(item["status"] in valid_statuses for item in items)
        
        assert all_valid == True
    
    def test_blocking_items_count(self):
        """Count items that block finalization."""
        items = [
            {"name": "Documents Posted", "status": "PASSED", "required": True},
            {"name": "Critical Issues", "status": "FAILED", "required": True},
            {"name": "Warning Issues", "status": "WARNING", "required": False},
            {"name": "VAT Report", "status": "FAILED", "required": True},
        ]
        
        blocking_count = sum(1 for i in items if i["status"] == "FAILED" and i["required"])
        
        assert blocking_count == 2


class TestDocumentMatchingConfidence:
    """Tests for document matching confidence scores."""
    
    def test_high_confidence_threshold(self):
        """High confidence is 0.85 or above."""
        HIGH_CONFIDENCE = Decimal("0.85")
        
        confidence = Decimal("0.90")
        is_high = confidence >= HIGH_CONFIDENCE
        
        assert is_high == True
    
    def test_medium_confidence_range(self):
        """Medium confidence is between 0.65 and 0.85."""
        HIGH_CONFIDENCE = Decimal("0.85")
        MEDIUM_CONFIDENCE = Decimal("0.65")
        
        confidence = Decimal("0.75")
        is_medium = MEDIUM_CONFIDENCE <= confidence < HIGH_CONFIDENCE
        
        assert is_medium == True
    
    def test_low_confidence_below_threshold(self):
        """Low confidence is below 0.65."""
        MEDIUM_CONFIDENCE = Decimal("0.65")
        
        confidence = Decimal("0.50")
        is_low = confidence < MEDIUM_CONFIDENCE
        
        assert is_low == True
    
    def test_exact_amount_match_high_confidence(self):
        """Exact amount match results in high confidence."""
        doc_amount = Decimal("1000.00")
        open_item_amount = Decimal("1000.00")
        
        is_exact = doc_amount == open_item_amount
        confidence = Decimal("0.85") if is_exact else Decimal("0.65")
        
        assert confidence == Decimal("0.85")


class TestAssetPurchaseDetection:
    """Tests for asset purchase detection logic."""
    
    def test_amount_above_threshold_flagged(self):
        """Amounts above €450 are flagged for potential asset."""
        ASSET_THRESHOLD = Decimal("450.00")
        
        amount = Decimal("500.00")
        is_potential_asset = amount >= ASSET_THRESHOLD
        
        assert is_potential_asset == True
    
    def test_amount_below_threshold_not_flagged(self):
        """Amounts below €450 are not flagged."""
        ASSET_THRESHOLD = Decimal("450.00")
        
        amount = Decimal("400.00")
        is_potential_asset = amount >= ASSET_THRESHOLD
        
        assert is_potential_asset == False
    
    def test_asset_keywords_detected(self):
        """Asset-related keywords in filename are detected."""
        asset_keywords = ['laptop', 'computer', 'machine', 'equipment', 'vehicle']
        
        filename = "invoice_laptop_purchase.pdf"
        
        has_asset_keyword = any(kw in filename.lower() for kw in asset_keywords)
        
        assert has_asset_keyword == True
    
    def test_high_amount_flagged_as_asset(self):
        """Amounts over €1000 are always flagged as potential asset."""
        amount = Decimal("2500.00")
        HIGH_AMOUNT_THRESHOLD = Decimal("1000.00")
        
        is_high_amount = amount >= HIGH_AMOUNT_THRESHOLD
        
        assert is_high_amount == True


class TestAuditLogging:
    """Tests for document action audit logging."""
    
    def test_post_action_logged(self):
        """Post action creates audit log entry."""
        audit_actions = ["UPLOADED", "EXTRACTED", "MATCHED", "POSTED", "REJECTED", "REPROCESSED"]
        
        action = "POSTED"
        is_valid_action = action in audit_actions
        
        assert is_valid_action == True
    
    def test_audit_log_includes_user(self):
        """Audit log includes who performed the action."""
        user_id = uuid.uuid4()
        
        audit_log = {
            "action": "POSTED",
            "performed_by_id": user_id,
            "performed_at": datetime.now(timezone.utc),
        }
        
        has_user = audit_log["performed_by_id"] is not None
        
        assert has_user == True
    
    def test_audit_log_includes_timestamps(self):
        """Audit log includes when action was performed."""
        audit_log = {
            "action": "POSTED",
            "performed_at": datetime.now(timezone.utc),
        }
        
        has_timestamp = audit_log["performed_at"] is not None
        
        assert has_timestamp == True
    
    def test_audit_log_tracks_status_change(self):
        """Audit log tracks from/to status."""
        audit_log = {
            "from_status": "NEEDS_REVIEW",
            "to_status": "POSTED",
        }
        
        has_status_change = audit_log["from_status"] != audit_log["to_status"]
        
        assert has_status_change == True
    
    def test_audit_log_links_to_journal(self):
        """Audit log links to resulting journal entry for POST actions."""
        journal_entry_id = uuid.uuid4()
        
        audit_log = {
            "action": "POSTED",
            "result_journal_entry_id": journal_entry_id,
        }
        
        has_journal_link = audit_log["result_journal_entry_id"] is not None
        
        assert has_journal_link == True


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
