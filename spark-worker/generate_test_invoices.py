#!/usr/bin/env python3
"""
Test Invoice Generator
Creates synthetic invoice images for testing the OCR processor
"""

from PIL import Image, ImageDraw, ImageFont
import random
from pathlib import Path
from datetime import date, timedelta

# Sample merchant data
MERCHANTS = [
    {
        'name': 'Shell Station Amsterdam',
        'category': 'Fuel',
        'expected_account': '4310',
        'vat_rate': 0.21
    },
    {
        'name': 'Albert Heijn',
        'category': 'Groceries',
        'expected_account': '1450',
        'vat_rate': 0.09
    },
    {
        'name': 'Microsoft Nederland B.V.',
        'category': 'Software',
        'expected_account': '4500',
        'vat_rate': 0.21
    },
    {
        'name': 'Restaurant De Librije',
        'category': 'Dining',
        'expected_account': '4710',
        'vat_rate': 0.21
    },
    {
        'name': 'Staples Office Centre',
        'category': 'Office',
        'expected_account': '4400',
        'vat_rate': 0.21
    },
    {
        'name': 'KPN Telecom',
        'category': 'Telecom',
        'expected_account': '5010',
        'vat_rate': 0.21
    },
]


def generate_invoice_image(merchant, amount, output_path):
    """Generate a simple text-based invoice image"""
    
    # Create image
    img = Image.new('RGB', (800, 1000), color='white')
    draw = ImageDraw.Draw(img)
    
    # Try to use a nice font, fallback to default
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()
    
    # Invoice header
    y = 50
    draw.text((50, y), merchant['name'], fill='black', font=font_large)
    y += 60
    
    # Date
    invoice_date = date.today() - timedelta(days=random.randint(1, 30))
    draw.text((50, y), f"Factuurdatum: {invoice_date.strftime('%d-%m-%Y')}", fill='black', font=font_small)
    y += 40
    
    # Invoice number
    invoice_num = f"INV-{random.randint(10000, 99999)}"
    draw.text((50, y), f"Factuurnummer: {invoice_num}", fill='black', font=font_small)
    y += 60
    
    # Line separator
    draw.line([(50, y), (750, y)], fill='black', width=2)
    y += 40
    
    # Items
    draw.text((50, y), "Omschrijving", fill='black', font=font_medium)
    draw.text((600, y), "Bedrag", fill='black', font=font_medium)
    y += 40
    
    net_amount = amount / (1 + merchant['vat_rate'])
    vat_amount = amount - net_amount
    
    draw.text((50, y), merchant['category'], fill='black', font=font_small)
    draw.text((600, y), f"€ {net_amount:.2f}", fill='black', font=font_small)
    y += 60
    
    # VAT
    draw.text((50, y), f"BTW {int(merchant['vat_rate']*100)}%", fill='black', font=font_small)
    draw.text((600, y), f"€ {vat_amount:.2f}", fill='black', font=font_small)
    y += 60
    
    # Line separator
    draw.line([(50, y), (750, y)], fill='black', width=2)
    y += 40
    
    # Total
    draw.text((50, y), "TOTAAL", fill='black', font=font_large)
    draw.text((600, y), f"€ {amount:.2f}", fill='black', font=font_large)
    y += 80
    
    # Footer
    draw.text((50, y), "Betaal binnen 14 dagen", fill='gray', font=font_small)
    y += 30
    draw.text((50, y), f"BTW nummer: NL{random.randint(100000000, 999999999)}B01", fill='gray', font=font_small)
    
    # Save
    img.save(output_path)
    print(f"✅ Generated: {output_path} - {merchant['name']} - €{amount:.2f} -> Expected Account: {merchant['expected_account']}")


def main():
    """Generate test invoices"""
    output_dir = Path("/workspaces/spark-template/test-invoices")
    output_dir.mkdir(exist_ok=True)
    
    print("Generating test invoices...")
    print("=" * 80)
    
    for i, merchant in enumerate(MERCHANTS):
        amount = round(random.uniform(20, 500), 2)
        filename = f"invoice_{i+1}_{merchant['name'].replace(' ', '_')}.jpg"
        output_path = output_dir / filename
        
        generate_invoice_image(merchant, amount, output_path)
    
    print("=" * 80)
    print(f"Generated {len(MERCHANTS)} test invoices in {output_dir}")
    print("\nTo test the processor:")
    print(f"  cp {output_dir}/*.jpg /path/to/uploads/")
    print("  # Watch processor logs for automatic processing")


if __name__ == "__main__":
    main()
