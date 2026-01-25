#!/usr/bin/env python3
"""
Manual Test Script for Invoice Processor
Tests OCR and AI prediction without database connection
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from processor import InvoiceOCRProcessor, LedgerAccountPredictor


def test_ocr_only(image_path: str):
    """Test OCR extraction only"""
    print("=" * 80)
    print("Testing OCR Extraction")
    print("=" * 80)
    
    processor = InvoiceOCRProcessor()
    result = processor.process(image_path)
    
    print(f"\n📄 Invoice: {image_path}")
    print(f"🏪 Merchant: {result['merchant']}")
    print(f"📅 Date: {result['invoice_date']}")
    print(f"💰 Total: €{result['total_amount']:.2f}")
    print(f"💰 Net: €{result['net_amount']:.2f}")
    print(f"💰 VAT: €{result['vat_amount']:.2f}")
    print(f"\n🤖 AI Prediction:")
    print(f"   Account: {result['predicted_account_code']} - {result['predicted_account_name']}")
    print(f"   Confidence: {result['prediction_confidence']}%")
    
    print(f"\n📝 OCR Text Preview (first 500 chars):")
    print("-" * 80)
    print(result['ocr_text'][:500])
    print("-" * 80)


def test_predictor(merchant: str, description: str = ""):
    """Test ledger account prediction"""
    print("=" * 80)
    print("Testing AI Ledger Account Prediction")
    print("=" * 80)
    
    account_code, account_name, confidence = LedgerAccountPredictor.predict(
        merchant, description
    )
    
    print(f"\n🏪 Input: {merchant}")
    if description:
        print(f"📝 Description: {description}")
    
    print(f"\n🤖 Prediction:")
    print(f"   Account Code: {account_code}")
    print(f"   Account Name: {account_name}")
    print(f"   Confidence Score: {confidence}")


def show_account_rules():
    """Display all configured account rules"""
    print("=" * 80)
    print("Configured Ledger Account Rules")
    print("=" * 80)
    
    for code, rule in sorted(LedgerAccountPredictor.ACCOUNT_RULES.items()):
        print(f"\n{code}: {rule['name']}")
        print(f"   Priority: {rule['priority']} (lower = higher priority)")
        if rule['keywords']:
            print(f"   Keywords: {', '.join(rule['keywords'][:5])}" + 
                  (f" (+{len(rule['keywords'])-5} more)" if len(rule['keywords']) > 5 else ""))


def run_test_suite():
    """Run comprehensive test suite"""
    print("=" * 80)
    print("Smart Accounting Platform - Processor Test Suite")
    print("=" * 80)
    
    # Test predictor with various merchants
    test_cases = [
        ("Shell", "Fuel purchase"),
        ("Albert Heijn", "Groceries"),
        ("Microsoft", "Office 365 subscription"),
        ("Google Ads", "Marketing campaign"),
        ("KPN", "Internet service"),
        ("Unknown Merchant XYZ", ""),
    ]
    
    print("\n\n🧪 Testing AI Predictions:")
    print("=" * 80)
    
    for merchant, desc in test_cases:
        code, name, conf = LedgerAccountPredictor.predict(merchant, desc)
        print(f"{merchant:30} → {code} ({name:40}) [{conf}% confidence]")


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test the invoice processor")
    parser.add_argument('--ocr', type=str, help='Test OCR on image file')
    parser.add_argument('--predict', type=str, help='Test prediction for merchant name')
    parser.add_argument('--rules', action='store_true', help='Show all account rules')
    parser.add_argument('--test-suite', action='store_true', help='Run full test suite')
    
    args = parser.parse_args()
    
    if args.ocr:
        test_ocr_only(args.ocr)
    elif args.predict:
        test_predictor(args.predict)
    elif args.rules:
        show_account_rules()
    elif args.test_suite:
        run_test_suite()
    else:
        print("Usage:")
        print("  python3 test_processor.py --ocr invoice.jpg")
        print("  python3 test_processor.py --predict 'Shell'")
        print("  python3 test_processor.py --rules")
        print("  python3 test_processor.py --test-suite")


if __name__ == "__main__":
    main()
