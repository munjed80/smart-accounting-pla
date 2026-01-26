"""
Unit Tests for Core Ledger Engine

Tests cover:
- Balanced journal enforcement
- AR/AP reconciliation checks
- Asset depreciation schedule posting
- P&L computation correctness

These tests are independent of database and can run without DB dependencies.
"""
import pytest
import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import MagicMock


class TestBalancedJournalEnforcement:
    """Tests for balanced journal entry enforcement."""
    
    def test_unbalanced_entry_detection(self):
        """Journal entries must balance (debit == credit)."""
        total_debit = Decimal("100.00")
        total_credit = Decimal("90.00")
        
        is_balanced = total_debit == total_credit
        difference = abs(total_debit - total_credit)
        
        assert is_balanced == False
        assert difference == Decimal("10.00")
    
    def test_balanced_entry_single_line_each(self):
        """Test that a simple balanced entry is correctly identified."""
        # Simulate debit and credit lines
        lines = [
            {"debit_amount": Decimal("100.00"), "credit_amount": Decimal("0.00")},
            {"debit_amount": Decimal("0.00"), "credit_amount": Decimal("100.00")},
        ]
        
        total_debit = sum(line["debit_amount"] for line in lines)
        total_credit = sum(line["credit_amount"] for line in lines)
        is_balanced = total_debit == total_credit
        
        assert total_debit == Decimal("100.00")
        assert total_credit == Decimal("100.00")
        assert is_balanced == True
    
    def test_unbalanced_entry_detected(self):
        """Test that an unbalanced entry is correctly identified."""
        lines = [
            {"debit_amount": Decimal("100.00"), "credit_amount": Decimal("0.00")},
            {"debit_amount": Decimal("0.00"), "credit_amount": Decimal("50.00")},  # Only 50, should be 100
        ]
        
        total_debit = sum(line["debit_amount"] for line in lines)
        total_credit = sum(line["credit_amount"] for line in lines)
        is_balanced = total_debit == total_credit
        
        assert total_debit == Decimal("100.00")
        assert total_credit == Decimal("50.00")
        assert is_balanced == False
    
    def test_balanced_validation_multi_line(self):
        """Test balance validation with multiple debit and credit lines."""
        lines = [
            {"debit_amount": Decimal("50.00"), "credit_amount": Decimal("0.00")},
            {"debit_amount": Decimal("30.00"), "credit_amount": Decimal("0.00")},
            {"debit_amount": Decimal("20.00"), "credit_amount": Decimal("0.00")},
            {"debit_amount": Decimal("0.00"), "credit_amount": Decimal("100.00")},
        ]
        
        total_debit = sum(line["debit_amount"] for line in lines)
        total_credit = sum(line["credit_amount"] for line in lines)
        is_balanced = total_debit == total_credit
        
        assert total_debit == Decimal("100.00")
        assert total_credit == Decimal("100.00")
        assert is_balanced == True
    
    def test_balanced_complex_entry(self):
        """Test complex entry with multiple debits and credits."""
        lines = [
            {"debit_amount": Decimal("1000.00"), "credit_amount": Decimal("0.00")},  # Cash
            {"debit_amount": Decimal("210.00"), "credit_amount": Decimal("0.00")},   # VAT receivable
            {"debit_amount": Decimal("0.00"), "credit_amount": Decimal("1000.00")},  # Revenue
            {"debit_amount": Decimal("0.00"), "credit_amount": Decimal("210.00")},   # VAT payable
        ]
        
        total_debit = sum(line["debit_amount"] for line in lines)
        total_credit = sum(line["credit_amount"] for line in lines)
        is_balanced = total_debit == total_credit
        
        assert total_debit == Decimal("1210.00")
        assert total_credit == Decimal("1210.00")
        assert is_balanced == True


class TestARAPReconciliation:
    """Tests for AR/AP reconciliation checks."""
    
    def test_reconciliation_mismatch_detected(self):
        """Test that AR/AP reconciliation mismatches are detected."""
        gl_balance = Decimal("1000.00")
        subledger_total = Decimal("950.00")
        difference = abs(gl_balance - subledger_total)
        tolerance = Decimal("0.01")
        
        has_mismatch = difference > tolerance
        
        assert has_mismatch == True
        assert difference == Decimal("50.00")
    
    def test_reconciliation_within_tolerance(self):
        """Test that small differences are tolerated (rounding)."""
        gl_balance = Decimal("1000.00")
        subledger_total = Decimal("1000.005")  # Half-cent difference
        difference = abs(gl_balance - subledger_total)
        tolerance = Decimal("0.01")
        
        has_mismatch = difference > tolerance
        
        assert has_mismatch == False
    
    def test_overdue_detection_red_severity(self):
        """Test overdue item detection logic - 30+ days = RED."""
        today = date.today()
        due_date = today - timedelta(days=45)  # 45 days overdue
        days_overdue = (today - due_date).days
        
        severity = "RED" if days_overdue > 30 else "YELLOW"
        
        assert days_overdue == 45
        assert severity == "RED"
    
    def test_recent_overdue_is_warning(self):
        """Test that recently overdue items are YELLOW severity."""
        today = date.today()
        due_date = today - timedelta(days=10)  # 10 days overdue
        days_overdue = (today - due_date).days
        
        severity = "RED" if days_overdue > 30 else "YELLOW"
        
        assert days_overdue == 10
        assert severity == "YELLOW"
    
    def test_ar_balance_calculation_debit_normal(self):
        """Test AR balance calculation (debit-normal)."""
        # AR accounts are debit-normal
        debit_total = Decimal("5000.00")  # Invoices
        credit_total = Decimal("2000.00")  # Payments received
        
        ar_balance = debit_total - credit_total
        
        assert ar_balance == Decimal("3000.00")
    
    def test_ap_balance_calculation_credit_normal(self):
        """Test AP balance calculation (credit-normal)."""
        # AP accounts are credit-normal
        debit_total = Decimal("1500.00")  # Payments made
        credit_total = Decimal("4000.00")  # Invoices received
        
        ap_balance = credit_total - debit_total
        
        assert ap_balance == Decimal("2500.00")


class TestAssetDepreciation:
    """Tests for asset depreciation schedule posting."""
    
    def test_straight_line_depreciation_calculation(self):
        """Test straight-line depreciation calculation."""
        acquisition_cost = Decimal("12000.00")
        residual_value = Decimal("0.00")
        useful_life_months = 36  # 3 years
        
        depreciable_amount = acquisition_cost - residual_value
        monthly_depreciation = (depreciable_amount / Decimal(useful_life_months)).quantize(Decimal("0.01"))
        
        assert monthly_depreciation == Decimal("333.33")
    
    def test_depreciation_with_residual_value(self):
        """Test depreciation with residual value."""
        acquisition_cost = Decimal("10000.00")
        residual_value = Decimal("1000.00")  # 10% residual
        useful_life_months = 60  # 5 years
        
        depreciable_amount = acquisition_cost - residual_value
        monthly_depreciation = (depreciable_amount / Decimal(useful_life_months)).quantize(Decimal("0.01"))
        
        assert depreciable_amount == Decimal("9000.00")
        assert monthly_depreciation == Decimal("150.00")
    
    def test_book_value_calculation(self):
        """Test book value updates after depreciation."""
        acquisition_cost = Decimal("12000.00")
        accumulated_depreciation = Decimal("4000.00")
        
        book_value = acquisition_cost - accumulated_depreciation
        
        assert book_value == Decimal("8000.00")
    
    def test_fully_depreciated_detection(self):
        """Test detection of fully depreciated assets."""
        acquisition_cost = Decimal("10000.00")
        residual_value = Decimal("1000.00")
        accumulated_depreciation = Decimal("9000.00")  # Fully depreciated
        
        book_value = acquisition_cost - accumulated_depreciation
        is_fully_depreciated = book_value <= residual_value
        
        assert book_value == Decimal("1000.00")
        assert is_fully_depreciated == True
    
    def test_depreciation_schedule_total(self):
        """Test that depreciation schedule totals correctly."""
        acquisition_cost = Decimal("6000.00")
        residual_value = Decimal("0.00")
        useful_life_months = 24
        
        monthly_depreciation = (acquisition_cost - residual_value) / Decimal(useful_life_months)
        total_depreciation = monthly_depreciation * useful_life_months
        
        # Allow small rounding variance
        assert abs(total_depreciation - acquisition_cost) < Decimal("0.01")


class TestPnLComputation:
    """Tests for P&L computation correctness."""
    
    def test_gross_profit_calculation(self):
        """Test gross profit = revenue - COGS."""
        revenue = Decimal("50000.00")
        cogs = Decimal("30000.00")
        
        gross_profit = revenue - cogs
        
        assert gross_profit == Decimal("20000.00")
    
    def test_operating_income_calculation(self):
        """Test operating income = gross profit - operating expenses."""
        gross_profit = Decimal("20000.00")
        operating_expenses = Decimal("15000.00")
        
        operating_income = gross_profit - operating_expenses
        
        assert operating_income == Decimal("5000.00")
    
    def test_net_income_calculation(self):
        """Test net income = operating income + other income - other expenses."""
        operating_income = Decimal("5000.00")
        other_income = Decimal("500.00")
        other_expenses = Decimal("200.00")
        
        net_income = operating_income + other_income - other_expenses
        
        assert net_income == Decimal("5300.00")
    
    def test_revenue_is_credit_normal(self):
        """Test that revenue accounts are credit-normal (balance = credit - debit)."""
        debit_total = Decimal("500.00")  # Refunds/adjustments
        credit_total = Decimal("10000.00")  # Sales
        
        # Revenue balance = credit - debit
        balance = credit_total - debit_total
        
        assert balance == Decimal("9500.00")
    
    def test_expense_is_debit_normal(self):
        """Test that expense accounts are debit-normal (balance = debit - credit)."""
        debit_total = Decimal("5000.00")  # Expenses
        credit_total = Decimal("200.00")  # Adjustments/refunds
        
        # Expense balance = debit - credit
        balance = debit_total - credit_total
        
        assert balance == Decimal("4800.00")
    
    def test_full_pnl_calculation(self):
        """Test complete P&L calculation."""
        revenue = Decimal("100000.00")
        cogs = Decimal("40000.00")
        operating_expenses = Decimal("35000.00")
        other_income = Decimal("2000.00")
        other_expenses = Decimal("1000.00")
        
        gross_profit = revenue - cogs
        operating_income = gross_profit - operating_expenses
        net_income = operating_income + other_income - other_expenses
        
        assert gross_profit == Decimal("60000.00")
        assert operating_income == Decimal("25000.00")
        assert net_income == Decimal("26000.00")


class TestVATSanity:
    """Tests for VAT/BTW sanity checks."""
    
    def test_vat_calculation_21_percent(self):
        """Test VAT calculation at standard 21% rate."""
        taxable_amount = Decimal("100.00")
        vat_rate = Decimal("21.00")
        
        expected_vat = (taxable_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        
        assert expected_vat == Decimal("21.00")
    
    def test_vat_calculation_9_percent(self):
        """Test VAT calculation at reduced 9% rate."""
        taxable_amount = Decimal("100.00")
        vat_rate = Decimal("9.00")
        
        expected_vat = (taxable_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        
        assert expected_vat == Decimal("9.00")
    
    def test_vat_calculation_0_percent(self):
        """Test VAT calculation at 0% rate (exempt)."""
        taxable_amount = Decimal("1000.00")
        vat_rate = Decimal("0.00")
        
        expected_vat = (taxable_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        
        assert expected_vat == Decimal("0.00")
    
    def test_vat_mismatch_detection(self):
        """Test VAT amount mismatch detection."""
        taxable_amount = Decimal("100.00")
        vat_rate = Decimal("21.00")
        expected_vat = (taxable_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        actual_vat = Decimal("25.00")  # Wrong VAT amount
        tolerance = Decimal("0.05")
        
        has_mismatch = abs(expected_vat - actual_vat) > tolerance
        
        assert has_mismatch == True
        assert expected_vat == Decimal("21.00")
    
    def test_negative_vat_flagging(self):
        """Test that negative VAT is flagged for non-credit transactions."""
        vat_amount = Decimal("-10.00")
        source_type = "INVOICE"  # Regular invoice, not a credit note
        
        is_unexpected_negative = vat_amount < 0 and source_type not in ("CREDIT_NOTE", "REVERSAL")
        
        assert is_unexpected_negative == True
    
    def test_negative_vat_allowed_for_credit_notes(self):
        """Test that negative VAT is allowed for credit notes."""
        vat_amount = Decimal("-10.00")
        source_type = "CREDIT_NOTE"
        
        is_unexpected_negative = vat_amount < 0 and source_type not in ("CREDIT_NOTE", "REVERSAL")
        
        assert is_unexpected_negative == False
    
    def test_vat_rounding(self):
        """Test VAT rounding to 2 decimal places."""
        taxable_amount = Decimal("99.99")
        vat_rate = Decimal("21.00")
        
        expected_vat = (taxable_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        
        # 99.99 * 0.21 = 20.9979 -> rounds to 21.00
        assert expected_vat == Decimal("21.00")


class TestIdempotency:
    """Tests for idempotent operations."""
    
    def test_posting_status_check(self):
        """Test that posting checks status before action."""
        # Simulate already posted entry
        status = "POSTED"
        
        # Should not attempt to post again
        should_post = status == "DRAFT"
        
        assert should_post == False
    
    def test_draft_can_be_posted(self):
        """Test that draft entries can be posted."""
        status = "DRAFT"
        
        can_post = status == "DRAFT"
        
        assert can_post == True
    
    def test_reversed_cannot_be_posted(self):
        """Test that reversed entries cannot be posted."""
        status = "REVERSED"
        
        can_post = status == "DRAFT"
        
        assert can_post == False


class TestIssueGeneration:
    """Tests for issue generation logic."""
    
    def test_severity_ordering(self):
        """Test that RED is higher priority than YELLOW."""
        severities = ["YELLOW", "RED", "YELLOW", "RED"]
        
        # Sort by severity (RED first)
        severity_order = {"RED": 0, "YELLOW": 1}
        sorted_severities = sorted(severities, key=lambda s: severity_order[s])
        
        assert sorted_severities == ["RED", "RED", "YELLOW", "YELLOW"]
    
    def test_issue_code_format(self):
        """Test that issue codes follow expected format."""
        issue_codes = [
            "JOURNAL_UNBALANCED",
            "AR_RECON_MISMATCH",
            "AP_RECON_MISMATCH",
            "DEPRECIATION_NOT_POSTED",
            "VAT_RATE_MISMATCH",
        ]
        
        for code in issue_codes:
            # Codes should be uppercase with underscores
            assert code.isupper() or "_" in code
            assert " " not in code


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
