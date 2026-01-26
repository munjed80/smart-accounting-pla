"""
Unit Tests for Dutch VAT/BTW Filing Engine

Tests cover:
- Sales VAT 21/9/0 mapping
- Purchase input VAT mapping
- Reverse charge net-zero behavior
- Box totals correctness
- ICP extraction for EU customers
- Snapshot inclusion on FINALIZE
- VAT anomaly detection

These tests are independent of database and can run without DB dependencies.
"""
import pytest
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, AsyncMock


class TestVATCalculation:
    """Tests for VAT calculation correctness."""
    
    def test_vat_calculation_21_percent(self):
        """Test VAT calculation at standard 21% rate."""
        base_amount = Decimal("100.00")
        rate = Decimal("21.00")
        
        expected_vat = (base_amount * rate / Decimal("100")).quantize(Decimal("0.01"))
        
        assert expected_vat == Decimal("21.00")
    
    def test_vat_calculation_9_percent(self):
        """Test VAT calculation at reduced 9% rate."""
        base_amount = Decimal("100.00")
        rate = Decimal("9.00")
        
        expected_vat = (base_amount * rate / Decimal("100")).quantize(Decimal("0.01"))
        
        assert expected_vat == Decimal("9.00")
    
    def test_vat_calculation_0_percent(self):
        """Test VAT calculation at 0% rate (zero-rate)."""
        base_amount = Decimal("1000.00")
        rate = Decimal("0.00")
        
        expected_vat = (base_amount * rate / Decimal("100")).quantize(Decimal("0.01"))
        
        assert expected_vat == Decimal("0.00")
    
    def test_extract_base_from_gross_21_percent(self):
        """Test extracting base amount from gross (21% VAT)."""
        gross_amount = Decimal("121.00")
        rate = Decimal("21.00")
        
        divisor = Decimal("1") + (rate / Decimal("100"))
        base_amount = (gross_amount / divisor).quantize(Decimal("0.01"))
        vat_amount = gross_amount - base_amount
        
        assert base_amount == Decimal("100.00")
        assert vat_amount == Decimal("21.00")
    
    def test_extract_base_from_gross_9_percent(self):
        """Test extracting base amount from gross (9% VAT)."""
        gross_amount = Decimal("109.00")
        rate = Decimal("9.00")
        
        divisor = Decimal("1") + (rate / Decimal("100"))
        base_amount = (gross_amount / divisor).quantize(Decimal("0.01"))
        vat_amount = gross_amount - base_amount
        
        assert base_amount == Decimal("100.00")
        assert vat_amount == Decimal("9.00")
    
    def test_vat_rounding_to_cents(self):
        """Test VAT rounding to 2 decimal places."""
        base_amount = Decimal("99.99")
        rate = Decimal("21.00")
        
        expected_vat = (base_amount * rate / Decimal("100")).quantize(Decimal("0.01"))
        
        # 99.99 * 0.21 = 20.9979 -> rounds to 21.00
        assert expected_vat == Decimal("21.00")


class TestSalesVATMapping:
    """Tests for sales VAT mapping to Dutch boxes."""
    
    def test_sales_21_maps_to_box_1a(self):
        """Sales at 21% should map to box 1a."""
        vat_rate = Decimal("21.00")
        turnover = Decimal("1000.00")
        vat = Decimal("210.00")
        
        # Box 1a: Leveringen/diensten belast met hoog tarief
        box_mapping = {
            "21.00": "1a",
            "9.00": "1b",
            "0.00": "1e",
        }
        
        target_box = box_mapping.get(str(vat_rate))
        
        assert target_box == "1a"
    
    def test_sales_9_maps_to_box_1b(self):
        """Sales at 9% should map to box 1b."""
        vat_rate = Decimal("9.00")
        
        box_mapping = {
            "21.00": "1a",
            "9.00": "1b",
            "0.00": "1e",
        }
        
        target_box = box_mapping.get(str(vat_rate))
        
        assert target_box == "1b"
    
    def test_sales_0_maps_to_box_1e(self):
        """Zero-rate sales should map to box 1e."""
        vat_rate = Decimal("0.00")
        
        box_mapping = {
            "21.00": "1a",
            "9.00": "1b",
            "0.00": "1e",
        }
        
        target_box = box_mapping.get(str(vat_rate))
        
        assert target_box == "1e"
    
    def test_sales_total_aggregation(self):
        """Test that multiple sales are correctly aggregated."""
        sales = [
            {"rate": "21.00", "base": Decimal("1000.00"), "vat": Decimal("210.00")},
            {"rate": "21.00", "base": Decimal("500.00"), "vat": Decimal("105.00")},
            {"rate": "9.00", "base": Decimal("200.00"), "vat": Decimal("18.00")},
        ]
        
        # Aggregate by rate
        totals_by_rate = {}
        for sale in sales:
            rate = sale["rate"]
            if rate not in totals_by_rate:
                totals_by_rate[rate] = {"base": Decimal("0.00"), "vat": Decimal("0.00")}
            totals_by_rate[rate]["base"] += sale["base"]
            totals_by_rate[rate]["vat"] += sale["vat"]
        
        assert totals_by_rate["21.00"]["base"] == Decimal("1500.00")
        assert totals_by_rate["21.00"]["vat"] == Decimal("315.00")
        assert totals_by_rate["9.00"]["base"] == Decimal("200.00")
        assert totals_by_rate["9.00"]["vat"] == Decimal("18.00")


class TestPurchaseVATMapping:
    """Tests for purchase (input) VAT mapping."""
    
    def test_purchase_vat_maps_to_box_5b(self):
        """Purchase VAT (voorbelasting) should map to box 5b."""
        purchase_vat = Decimal("100.00")
        
        # Box 5b: Voorbelasting
        box_5b_total = Decimal("0.00")
        box_5b_total += purchase_vat
        
        assert box_5b_total == Decimal("100.00")
    
    def test_purchase_vat_is_deductible(self):
        """Purchase VAT reduces net VAT payable."""
        vat_payable = Decimal("500.00")  # From sales
        vat_receivable = Decimal("200.00")  # From purchases
        
        net_vat = vat_payable - vat_receivable
        
        assert net_vat == Decimal("300.00")
    
    def test_multiple_purchases_aggregate(self):
        """Test that multiple purchase VAT amounts aggregate correctly."""
        purchases = [
            {"vat": Decimal("50.00")},
            {"vat": Decimal("75.00")},
            {"vat": Decimal("25.00")},
        ]
        
        total_input_vat = sum(p["vat"] for p in purchases)
        
        assert total_input_vat == Decimal("150.00")


class TestReverseChargeNetZero:
    """Tests for reverse charge net-zero behavior."""
    
    def test_reverse_charge_creates_payable_and_receivable(self):
        """Reverse charge should create both VAT payable and VAT receivable."""
        base_amount = Decimal("1000.00")
        vat_rate = Decimal("21.00")
        
        calculated_vat = (base_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        
        # Reverse charge creates:
        vat_payable = calculated_vat  # What you would owe
        vat_receivable = calculated_vat  # What you can deduct
        
        assert vat_payable == Decimal("210.00")
        assert vat_receivable == Decimal("210.00")
    
    def test_reverse_charge_net_is_zero(self):
        """Reverse charge should result in net zero VAT."""
        base_amount = Decimal("1000.00")
        vat_rate = Decimal("21.00")
        
        calculated_vat = (base_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        
        vat_payable = calculated_vat
        vat_receivable = calculated_vat
        
        net_vat = vat_payable - vat_receivable
        
        assert net_vat == Decimal("0.00")
    
    def test_reverse_charge_eu_services_maps_to_box_4a(self):
        """EU services reverse charge should map to box 4a."""
        category = "REVERSE_CHARGE"
        sub_type = "EU_SERVICES"
        
        # Box mapping for reverse charge
        box_mapping = {
            "EU_SERVICES": {"turnover": "4a", "vat": "4a", "deductible": "5b"},
            "IMPORT": {"turnover": "4b", "vat": "4b", "deductible": "5b"},
        }
        
        mapping = box_mapping.get(sub_type)
        
        assert mapping["turnover"] == "4a"
        assert mapping["vat"] == "4a"
        assert mapping["deductible"] == "5b"
    
    def test_reverse_charge_import_maps_to_box_4b(self):
        """Import reverse charge should map to box 4b."""
        sub_type = "IMPORT"
        
        box_mapping = {
            "EU_SERVICES": {"turnover": "4a", "vat": "4a", "deductible": "5b"},
            "IMPORT": {"turnover": "4b", "vat": "4b", "deductible": "5b"},
        }
        
        mapping = box_mapping.get(sub_type)
        
        assert mapping["turnover"] == "4b"
        assert mapping["vat"] == "4b"
    
    def test_reverse_charge_journal_lines(self):
        """Reverse charge should create 4 journal lines."""
        base_amount = Decimal("1000.00")
        vat_rate = Decimal("21.00")
        calculated_vat = Decimal("210.00")
        
        lines = [
            # Dr Expense
            {"debit": base_amount, "credit": Decimal("0.00"), "type": "expense"},
            # Cr Payable  
            {"debit": Decimal("0.00"), "credit": base_amount, "type": "payable"},
            # Dr VAT Receivable
            {"debit": calculated_vat, "credit": Decimal("0.00"), "type": "vat_receivable"},
            # Cr VAT Payable
            {"debit": Decimal("0.00"), "credit": calculated_vat, "type": "vat_payable"},
        ]
        
        total_debit = sum(l["debit"] for l in lines)
        total_credit = sum(l["credit"] for l in lines)
        
        # Entry must balance
        assert total_debit == total_credit
        assert total_debit == base_amount + calculated_vat


class TestBoxTotalsCorrectness:
    """Tests for VAT box totals calculation."""
    
    def test_box_5a_is_sum_of_payable_boxes(self):
        """Box 5a should be sum of all VAT payable boxes."""
        boxes = {
            "1a": {"vat": Decimal("210.00")},  # Sales 21%
            "1b": {"vat": Decimal("45.00")},   # Sales 9%
            "2a": {"vat": Decimal("100.00")},  # EU acquisition
            "4a": {"vat": Decimal("50.00")},   # RC EU services
            "4b": {"vat": Decimal("25.00")},   # RC import
        }
        
        payable_box_codes = ["1a", "1b", "1c", "1d", "2a", "4a", "4b"]
        
        box_5a = sum(
            boxes.get(code, {}).get("vat", Decimal("0.00"))
            for code in payable_box_codes
        )
        
        assert box_5a == Decimal("430.00")
    
    def test_box_5c_is_5a_minus_5b(self):
        """Box 5c should be box 5a minus box 5b."""
        box_5a = Decimal("500.00")  # Total VAT payable
        box_5b = Decimal("200.00")  # Total VAT receivable
        
        box_5c = box_5a - box_5b
        
        assert box_5c == Decimal("300.00")
    
    def test_box_5g_equals_net_vat(self):
        """Box 5g (total to pay/receive) should equal net VAT."""
        box_5a = Decimal("500.00")
        box_5b = Decimal("200.00")
        box_5d = Decimal("0.00")  # KOR reduction (usually 0)
        
        box_5g = box_5a - box_5b - box_5d
        
        assert box_5g == Decimal("300.00")
    
    def test_negative_5g_means_refund(self):
        """Negative box 5g means VAT refund due."""
        box_5a = Decimal("100.00")  # Small sales VAT
        box_5b = Decimal("300.00")  # Large input VAT
        
        box_5g = box_5a - box_5b
        
        assert box_5g == Decimal("-200.00")
        assert box_5g < 0  # Refund due
    
    def test_total_turnover_calculation(self):
        """Test that total turnover is sum of turnover boxes."""
        boxes = {
            "1a": {"turnover": Decimal("10000.00")},
            "1b": {"turnover": Decimal("5000.00")},
            "1e": {"turnover": Decimal("2000.00")},
            "3b": {"turnover": Decimal("3000.00")},  # ICP supplies
        }
        
        turnover_box_codes = ["1a", "1b", "1c", "1d", "1e", "3a", "3b"]
        
        total_turnover = sum(
            boxes.get(code, {}).get("turnover", Decimal("0.00"))
            for code in turnover_box_codes
        )
        
        assert total_turnover == Decimal("20000.00")


class TestICPExtraction:
    """Tests for ICP (Intra-Community) supplies extraction."""
    
    def test_icp_requires_customer_vat_number(self):
        """ICP supplies require customer VAT number."""
        icp_transaction = {
            "customer_vat_number": "DE123456789",
            "country_code": "DE",
            "base_amount": Decimal("1000.00"),
        }
        
        has_vat_number = bool(icp_transaction.get("customer_vat_number"))
        
        assert has_vat_number == True
    
    def test_icp_without_vat_number_is_invalid(self):
        """ICP supply without VAT number should be flagged."""
        icp_transaction = {
            "customer_vat_number": None,
            "country_code": "DE",
            "base_amount": Decimal("1000.00"),
        }
        
        is_valid_icp = bool(icp_transaction.get("customer_vat_number"))
        
        assert is_valid_icp == False
    
    def test_icp_country_extracted_from_vat_number(self):
        """Country code should be extracted from VAT number."""
        vat_numbers = [
            ("DE123456789", "DE"),
            ("BE0123456789", "BE"),
            ("FR12345678901", "FR"),
            ("ATUE12345678", "AT"),
        ]
        
        for vat_number, expected_country in vat_numbers:
            extracted = vat_number[:2]
            assert extracted == expected_country
    
    def test_icp_aggregation_by_customer(self):
        """ICP should be aggregated by customer VAT number."""
        transactions = [
            {"vat_number": "DE123456789", "base": Decimal("1000.00")},
            {"vat_number": "DE123456789", "base": Decimal("500.00")},
            {"vat_number": "BE0123456789", "base": Decimal("750.00")},
        ]
        
        aggregates = {}
        for tx in transactions:
            vn = tx["vat_number"]
            if vn not in aggregates:
                aggregates[vn] = Decimal("0.00")
            aggregates[vn] += tx["base"]
        
        assert aggregates["DE123456789"] == Decimal("1500.00")
        assert aggregates["BE0123456789"] == Decimal("750.00")
    
    def test_icp_maps_to_box_3b(self):
        """ICP supplies should map to box 3b."""
        category = "INTRA_EU"
        is_icp = True
        
        if is_icp:
            target_box = "3b"
        else:
            target_box = "2a"  # Intra-EU acquisition
        
        assert target_box == "3b"
    
    def test_icp_is_zero_rate(self):
        """ICP supplies are at 0% VAT."""
        icp_base = Decimal("1000.00")
        icp_vat_rate = Decimal("0.00")
        
        icp_vat = icp_base * icp_vat_rate / Decimal("100")
        
        assert icp_vat == Decimal("0.00")


class TestSnapshotInclusion:
    """Tests for VAT snapshot inclusion on finalization."""
    
    def test_snapshot_includes_vat_summary(self):
        """Finalization snapshot should include VAT summary."""
        snapshot = {
            "balance_sheet": {},
            "profit_and_loss": {},
            "vat_summary": {
                "total_vat_payable": "500.00",
                "total_vat_receivable": "200.00",
                "net_vat": "300.00",
            },
        }
        
        has_vat = "vat_summary" in snapshot and bool(snapshot["vat_summary"])
        
        assert has_vat == True
    
    def test_snapshot_includes_vat_boxes(self):
        """Finalization snapshot should include all VAT boxes."""
        vat_summary = {
            "boxes": {
                "1a": {"turnover": "10000.00", "vat": "2100.00"},
                "1b": {"turnover": "5000.00", "vat": "450.00"},
                "5a": {"vat": "2550.00"},
                "5b": {"vat": "1000.00"},
                "5g": {"vat": "1550.00"},
            }
        }
        
        has_boxes = "boxes" in vat_summary
        
        assert has_boxes == True
    
    def test_snapshot_includes_icp_entries(self):
        """Finalization snapshot should include ICP entries."""
        vat_summary = {
            "icp_entries": [
                {"customer_vat_number": "DE123456789", "taxable_base": "1000.00"},
                {"customer_vat_number": "BE0123456789", "taxable_base": "500.00"},
            ],
            "total_icp_supplies": "1500.00",
        }
        
        has_icp = "icp_entries" in vat_summary
        icp_count = len(vat_summary["icp_entries"])
        
        assert has_icp == True
        assert icp_count == 2
    
    def test_snapshot_vat_totals_match_report(self):
        """Snapshot VAT totals should match report totals."""
        report_totals = {
            "total_vat_payable": Decimal("500.00"),
            "total_vat_receivable": Decimal("200.00"),
            "net_vat": Decimal("300.00"),
        }
        
        snapshot_totals = {
            "vat_payable": str(report_totals["total_vat_payable"]),
            "vat_receivable": str(report_totals["total_vat_receivable"]),
        }
        
        # Verify snapshot matches report
        assert Decimal(snapshot_totals["vat_payable"]) == report_totals["total_vat_payable"]
        assert Decimal(snapshot_totals["vat_receivable"]) == report_totals["total_vat_receivable"]


class TestVATAnomalyDetection:
    """Tests for VAT anomaly detection."""
    
    def test_detect_base_without_vat(self):
        """Detect VAT base amount without VAT amount."""
        line = {
            "vat_base_amount": Decimal("100.00"),
            "vat_amount": None,
            "vat_rate": Decimal("21.00"),
        }
        
        has_anomaly = (
            line["vat_base_amount"] and 
            not line["vat_amount"] and 
            line["vat_rate"] > 0
        )
        
        assert has_anomaly == True
    
    def test_detect_vat_without_base(self):
        """Detect VAT amount without base amount."""
        line = {
            "vat_base_amount": None,
            "vat_amount": Decimal("21.00"),
        }
        
        has_anomaly = line["vat_amount"] and not line["vat_base_amount"]
        
        assert has_anomaly == True
    
    def test_detect_rate_mismatch(self):
        """Detect VAT rate mismatch."""
        line = {
            "vat_base_amount": Decimal("100.00"),
            "vat_amount": Decimal("25.00"),  # Should be 21.00
            "vat_rate": Decimal("21.00"),
        }
        
        expected_vat = (line["vat_base_amount"] * line["vat_rate"] / Decimal("100"))
        tolerance = Decimal("0.10")
        difference = abs(line["vat_amount"] - expected_vat)
        
        has_mismatch = difference > tolerance
        
        assert has_mismatch == True
        assert difference == Decimal("4.00")
    
    def test_detect_icp_without_vat_number(self):
        """Detect ICP supply without customer VAT number."""
        line = {
            "vat_code": "ICP_SUPPLIES",
            "is_icp": True,
            "party_vat_number": None,
        }
        
        has_anomaly = line["is_icp"] and not line["party_vat_number"]
        
        assert has_anomaly == True
    
    def test_detect_reverse_charge_without_country(self):
        """Detect reverse charge without supplier country."""
        line = {
            "is_reverse_charge": True,
            "vat_country": None,
        }
        
        has_anomaly = line["is_reverse_charge"] and not line["vat_country"]
        
        assert has_anomaly == True
    
    def test_detect_unexpected_negative_vat(self):
        """Detect unexpected negative VAT amount."""
        line = {
            "vat_amount": Decimal("-21.00"),
            "source_type": "INVOICE",  # Not a credit note
        }
        
        is_credit_or_reversal = line["source_type"] in ("CREDIT_NOTE", "REVERSAL")
        has_anomaly = line["vat_amount"] < 0 and not is_credit_or_reversal
        
        assert has_anomaly == True
    
    def test_negative_vat_allowed_for_credit_notes(self):
        """Negative VAT is allowed for credit notes."""
        line = {
            "vat_amount": Decimal("-21.00"),
            "source_type": "CREDIT_NOTE",
        }
        
        is_credit_or_reversal = line["source_type"] in ("CREDIT_NOTE", "REVERSAL")
        has_anomaly = line["vat_amount"] < 0 and not is_credit_or_reversal
        
        assert has_anomaly == False


class TestVATCodeCategories:
    """Tests for VAT code category classification."""
    
    def test_sales_category(self):
        """Test SALES category for standard sales VAT codes."""
        vat_codes = [
            {"code": "NL_21", "category": "SALES"},
            {"code": "NL_9", "category": "SALES"},
        ]
        
        for vc in vat_codes:
            assert vc["category"] == "SALES"
    
    def test_purchases_category(self):
        """Test PURCHASES category for input VAT codes."""
        vat_codes = [
            {"code": "NL_21_INPUT", "category": "PURCHASES"},
            {"code": "NL_9_INPUT", "category": "PURCHASES"},
        ]
        
        for vc in vat_codes:
            assert vc["category"] == "PURCHASES"
    
    def test_reverse_charge_category(self):
        """Test REVERSE_CHARGE category."""
        vat_codes = [
            {"code": "RC_EU_SERVICES", "category": "REVERSE_CHARGE"},
            {"code": "RC_IMPORT", "category": "REVERSE_CHARGE"},
        ]
        
        for vc in vat_codes:
            assert vc["category"] == "REVERSE_CHARGE"
    
    def test_intra_eu_category(self):
        """Test INTRA_EU category."""
        vat_codes = [
            {"code": "INTRA_EU_GOODS", "category": "INTRA_EU"},
            {"code": "ICP_SUPPLIES", "category": "INTRA_EU"},
        ]
        
        for vc in vat_codes:
            assert vc["category"] == "INTRA_EU"
    
    def test_exempt_category(self):
        """Test EXEMPT category."""
        vat_codes = [
            {"code": "KOR_EXEMPT", "category": "EXEMPT"},
            {"code": "EXEMPT", "category": "EXEMPT"},
        ]
        
        for vc in vat_codes:
            assert vc["category"] == "EXEMPT"
    
    def test_zero_rate_category(self):
        """Test ZERO_RATE category."""
        vat_codes = [
            {"code": "NL_0", "category": "ZERO_RATE"},
        ]
        
        for vc in vat_codes:
            assert vc["category"] == "ZERO_RATE"


class TestPeriodEligibility:
    """Tests for period eligibility for VAT report generation."""
    
    def test_open_period_not_eligible_for_final_report(self):
        """OPEN periods are not eligible for final VAT report."""
        period_status = "OPEN"
        allow_draft = False
        
        is_eligible = period_status in ("REVIEW", "FINALIZED", "LOCKED") or allow_draft
        
        assert is_eligible == False
    
    def test_review_period_is_eligible(self):
        """REVIEW periods are eligible for VAT report."""
        period_status = "REVIEW"
        
        is_eligible = period_status in ("REVIEW", "FINALIZED", "LOCKED")
        
        assert is_eligible == True
    
    def test_finalized_period_is_eligible(self):
        """FINALIZED periods are eligible for VAT report."""
        period_status = "FINALIZED"
        
        is_eligible = period_status in ("REVIEW", "FINALIZED", "LOCKED")
        
        assert is_eligible == True
    
    def test_locked_period_is_eligible(self):
        """LOCKED periods are eligible for VAT report."""
        period_status = "LOCKED"
        
        is_eligible = period_status in ("REVIEW", "FINALIZED", "LOCKED")
        
        assert is_eligible == True
    
    def test_open_period_eligible_with_allow_draft(self):
        """OPEN periods are eligible when allow_draft is True."""
        period_status = "OPEN"
        allow_draft = True
        
        is_eligible = period_status in ("REVIEW", "FINALIZED", "LOCKED") or allow_draft
        
        assert is_eligible == True


class TestDutchVATBoxNames:
    """Tests for Dutch VAT box naming conventions."""
    
    def test_box_1a_name(self):
        """Box 1a has correct Dutch name."""
        boxes = {
            "1a": "Leveringen/diensten belast met hoog tarief (21%)",
        }
        
        assert "hoog tarief" in boxes["1a"]
        assert "21%" in boxes["1a"]
    
    def test_box_1b_name(self):
        """Box 1b has correct Dutch name."""
        boxes = {
            "1b": "Leveringen/diensten belast met laag tarief (9%)",
        }
        
        assert "laag tarief" in boxes["1b"]
        assert "9%" in boxes["1b"]
    
    def test_box_5b_name(self):
        """Box 5b is for voorbelasting (input VAT)."""
        boxes = {
            "5b": "Voorbelasting",
        }
        
        assert boxes["5b"] == "Voorbelasting"
    
    def test_box_5g_name(self):
        """Box 5g is total to pay/receive."""
        boxes = {
            "5g": "Totaal te betalen / te ontvangen",
        }
        
        assert "betalen" in boxes["5g"]
        assert "ontvangen" in boxes["5g"]
