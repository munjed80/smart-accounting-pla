"""
Invoice PDF Generation Service

Generates professional PDF invoices using WeasyPrint.
Uses HTML/CSS templates for flexible layout control.
"""
import io
from datetime import datetime
from typing import Optional
from decimal import Decimal
import logging

from app.models.zzp import ZZPInvoice

logger = logging.getLogger(__name__)


def format_amount(cents: int) -> str:
    """
    Format cents as EUR currency string in Dutch format.
    
    Dutch format uses period (.) as thousand separator and comma (,) as decimal separator.
    Example: 1234567 cents -> "€ 12.345,67"
    """
    euros = Decimal(cents) / 100
    # Format with US-style thousand separators first
    formatted = f"{euros:,.2f}"
    # Convert to Dutch format: swap , and . using a temporary placeholder
    # Step 1: , (thousands) -> temp
    # Step 2: . (decimal) -> ,
    # Step 3: temp -> . (thousands)
    dutch_formatted = formatted.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return f"€ {dutch_formatted}"


def format_date_nl(date_obj) -> str:
    """Format date in Dutch format (dd-mm-yyyy)."""
    if isinstance(date_obj, str):
        date_obj = datetime.fromisoformat(date_obj.replace("Z", "+00:00")).date()
    return date_obj.strftime("%d-%m-%Y")


def generate_invoice_html(invoice: ZZPInvoice) -> str:
    """
    Generate HTML for an invoice.
    
    Args:
        invoice: ZZPInvoice model with lines loaded
        
    Returns:
        HTML string for the invoice
    """
    # Build seller address
    seller_address_parts = []
    if invoice.seller_address_street:
        seller_address_parts.append(invoice.seller_address_street)
    if invoice.seller_address_postal_code or invoice.seller_address_city:
        seller_address_parts.append(
            f"{invoice.seller_address_postal_code or ''} {invoice.seller_address_city or ''}".strip()
        )
    if invoice.seller_address_country and invoice.seller_address_country != "Nederland":
        seller_address_parts.append(invoice.seller_address_country)
    
    # Build customer address
    customer_address_parts = []
    if invoice.customer_address_street:
        customer_address_parts.append(invoice.customer_address_street)
    if invoice.customer_address_postal_code or invoice.customer_address_city:
        customer_address_parts.append(
            f"{invoice.customer_address_postal_code or ''} {invoice.customer_address_city or ''}".strip()
        )
    if invoice.customer_address_country and invoice.customer_address_country != "Nederland":
        customer_address_parts.append(invoice.customer_address_country)
    
    # Build invoice lines HTML
    lines_html = ""
    for line in invoice.lines:
        lines_html += f"""
        <tr>
            <td class="description">{line.description}</td>
            <td class="quantity">{float(line.quantity):g}</td>
            <td class="price">{format_amount(line.unit_price_cents)}</td>
            <td class="vat">{float(line.vat_rate):g}%</td>
            <td class="total">{format_amount(line.line_total_cents)}</td>
        </tr>
        """
    
    # Format dates
    issue_date_str = format_date_nl(invoice.issue_date)
    due_date_str = format_date_nl(invoice.due_date) if invoice.due_date else "-"
    
    html = f"""
    <!DOCTYPE html>
    <html lang="nl">
    <head>
        <meta charset="UTF-8">
        <title>Factuur {invoice.invoice_number}</title>
        <style>
            @page {{
                size: A4;
                margin: 2cm;
            }}
            
            * {{
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }}
            
            body {{
                font-family: 'Helvetica', 'Arial', sans-serif;
                font-size: 10pt;
                line-height: 1.5;
                color: #1a1a1a;
            }}
            
            .invoice-container {{
                max-width: 100%;
            }}
            
            /* Header section */
            .header {{
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #2563eb;
            }}
            
            .company-info {{
                flex: 1;
            }}
            
            .company-name {{
                font-size: 18pt;
                font-weight: bold;
                color: #2563eb;
                margin-bottom: 5px;
            }}
            
            .company-details {{
                font-size: 9pt;
                color: #666;
            }}
            
            .invoice-title {{
                text-align: right;
            }}
            
            .invoice-title h1 {{
                font-size: 24pt;
                color: #2563eb;
                text-transform: uppercase;
                letter-spacing: 2px;
            }}
            
            .invoice-number {{
                font-size: 11pt;
                color: #333;
                margin-top: 5px;
            }}
            
            /* Addresses section */
            .addresses {{
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
            }}
            
            .address-block {{
                width: 45%;
            }}
            
            .address-label {{
                font-size: 8pt;
                text-transform: uppercase;
                color: #666;
                margin-bottom: 5px;
                letter-spacing: 1px;
            }}
            
            .address-content {{
                font-size: 10pt;
            }}
            
            .address-content strong {{
                display: block;
                font-size: 11pt;
                margin-bottom: 3px;
            }}
            
            /* Invoice meta */
            .invoice-meta {{
                background: #f8fafc;
                padding: 15px;
                border-radius: 5px;
                margin-bottom: 30px;
            }}
            
            .meta-row {{
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
            }}
            
            .meta-label {{
                color: #666;
                font-size: 9pt;
            }}
            
            .meta-value {{
                font-weight: 500;
            }}
            
            /* Lines table */
            .lines-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 30px;
            }}
            
            .lines-table th {{
                background: #2563eb;
                color: white;
                padding: 12px 10px;
                text-align: left;
                font-size: 9pt;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }}
            
            .lines-table th:last-child,
            .lines-table td:last-child {{
                text-align: right;
            }}
            
            .lines-table th.quantity,
            .lines-table td.quantity,
            .lines-table th.vat,
            .lines-table td.vat {{
                text-align: center;
            }}
            
            .lines-table th.price,
            .lines-table td.price,
            .lines-table th.total,
            .lines-table td.total {{
                text-align: right;
            }}
            
            .lines-table td {{
                padding: 12px 10px;
                border-bottom: 1px solid #e5e7eb;
            }}
            
            .lines-table tr:last-child td {{
                border-bottom: 2px solid #2563eb;
            }}
            
            /* Totals section */
            .totals {{
                margin-left: auto;
                width: 300px;
            }}
            
            .totals-row {{
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
            }}
            
            .totals-row.subtotal {{
                border-top: 1px solid #e5e7eb;
            }}
            
            .totals-row.total {{
                border-top: 2px solid #2563eb;
                font-size: 14pt;
                font-weight: bold;
                color: #2563eb;
                padding-top: 12px;
            }}
            
            /* Footer section */
            .footer {{
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
            }}
            
            .payment-info {{
                background: #f0fdf4;
                padding: 15px;
                border-radius: 5px;
                border-left: 4px solid #22c55e;
            }}
            
            .payment-title {{
                font-weight: bold;
                margin-bottom: 10px;
                color: #166534;
            }}
            
            .payment-details {{
                font-size: 9pt;
            }}
            
            .payment-details strong {{
                display: inline-block;
                width: 100px;
            }}
            
            .notes {{
                margin-top: 20px;
                padding: 15px;
                background: #fefce8;
                border-radius: 5px;
                border-left: 4px solid #eab308;
                font-size: 9pt;
            }}
            
            .business-ids {{
                margin-top: 20px;
                font-size: 8pt;
                color: #666;
                text-align: center;
            }}
        </style>
    </head>
    <body>
        <div class="invoice-container">
            <!-- Header -->
            <div class="header">
                <div class="company-info">
                    <div class="company-name">{invoice.seller_company_name or 'Bedrijfsnaam'}</div>
                    <div class="company-details">
                        {('<br>'.join(seller_address_parts)) if seller_address_parts else ''}
                        {f'<br>{invoice.seller_email}' if invoice.seller_email else ''}
                        {f'<br>{invoice.seller_phone}' if invoice.seller_phone else ''}
                    </div>
                </div>
                <div class="invoice-title">
                    <h1>Factuur</h1>
                    <div class="invoice-number">{invoice.invoice_number}</div>
                </div>
            </div>
            
            <!-- Addresses -->
            <div class="addresses">
                <div class="address-block">
                    <div class="address-label">Van</div>
                    <div class="address-content">
                        <strong>{invoice.seller_company_name or '-'}</strong>
                        {('<br>'.join(seller_address_parts)) if seller_address_parts else ''}
                    </div>
                </div>
                <div class="address-block">
                    <div class="address-label">Aan</div>
                    <div class="address-content">
                        <strong>{invoice.customer_name or '-'}</strong>
                        {('<br>'.join(customer_address_parts)) if customer_address_parts else ''}
                    </div>
                </div>
            </div>
            
            <!-- Invoice Meta -->
            <div class="invoice-meta">
                <div class="meta-row">
                    <span class="meta-label">Factuurnummer:</span>
                    <span class="meta-value">{invoice.invoice_number}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Factuurdatum:</span>
                    <span class="meta-value">{issue_date_str}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">Vervaldatum:</span>
                    <span class="meta-value">{due_date_str}</span>
                </div>
                {f'''<div class="meta-row">
                    <span class="meta-label">Klant BTW-nummer:</span>
                    <span class="meta-value">{invoice.customer_btw_number}</span>
                </div>''' if invoice.customer_btw_number else ''}
            </div>
            
            <!-- Lines Table -->
            <table class="lines-table">
                <thead>
                    <tr>
                        <th class="description">Omschrijving</th>
                        <th class="quantity">Aantal</th>
                        <th class="price">Prijs</th>
                        <th class="vat">BTW</th>
                        <th class="total">Totaal</th>
                    </tr>
                </thead>
                <tbody>
                    {lines_html}
                </tbody>
            </table>
            
            <!-- Totals -->
            <div class="totals">
                <div class="totals-row subtotal">
                    <span>Subtotaal</span>
                    <span>{format_amount(invoice.subtotal_cents)}</span>
                </div>
                <div class="totals-row">
                    <span>BTW</span>
                    <span>{format_amount(invoice.vat_total_cents)}</span>
                </div>
                <div class="totals-row total">
                    <span>Totaal</span>
                    <span>{format_amount(invoice.total_cents)}</span>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <div class="payment-info">
                    <div class="payment-title">Betalingsgegevens</div>
                    <div class="payment-details">
                        {f'<strong>IBAN:</strong> {invoice.seller_iban}<br>' if invoice.seller_iban else ''}
                        <strong>T.n.v.:</strong> {invoice.seller_company_name or '-'}<br>
                        <strong>Kenmerk:</strong> {invoice.invoice_number}
                    </div>
                </div>
                
                {f'''<div class="notes">
                    <strong>Opmerkingen:</strong><br>
                    {invoice.notes}
                </div>''' if invoice.notes else ''}
                
                <div class="business-ids">
                    {f'KVK: {invoice.seller_kvk_number}' if invoice.seller_kvk_number else ''}
                    {' | ' if invoice.seller_kvk_number and invoice.seller_btw_number else ''}
                    {f'BTW: {invoice.seller_btw_number}' if invoice.seller_btw_number else ''}
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    return html


def generate_invoice_pdf(invoice: ZZPInvoice) -> bytes:
    """
    Generate a PDF for an invoice.
    
    Args:
        invoice: ZZPInvoice model with lines loaded
        
    Returns:
        PDF bytes
        
    Raises:
        RuntimeError: If WeasyPrint is not available or PDF generation fails
    """
    # Lazy import WeasyPrint to avoid import-time crashes when system libs are missing
    try:
        from weasyprint import HTML, CSS
        WEASYPRINT_AVAILABLE = True
    except Exception as e:
        # Catch any exception (ImportError, OSError, etc.) from missing deps
        logger.error(f"WeasyPrint unavailable: {e}", exc_info=True)
        WEASYPRINT_AVAILABLE = False
    
    if not WEASYPRINT_AVAILABLE:
        raise RuntimeError(
            "PDF generation is not available. WeasyPrint library or its system dependencies are not installed."
        )
    
    try:
        html_content = generate_invoice_html(invoice)
        
        # Generate PDF
        html = HTML(string=html_content)
        pdf_buffer = io.BytesIO()
        html.write_pdf(pdf_buffer)
        pdf_buffer.seek(0)
        
        return pdf_buffer.read()
        
    except Exception as e:
        # Log full exception details for debugging
        logger.error(f"Failed to generate PDF for invoice {invoice.invoice_number}: {e}", exc_info=True)
        # Return user-friendly message without exposing internal details
        raise RuntimeError("PDF generation failed. Please try again later.") from e


def get_invoice_pdf_filename(invoice: ZZPInvoice) -> str:
    """
    Generate a filename for the invoice PDF.
    
    Args:
        invoice: ZZPInvoice model
        
    Returns:
        Filename string (e.g., "INV-2026-0001.pdf")
    """
    return f"{invoice.invoice_number}.pdf"
