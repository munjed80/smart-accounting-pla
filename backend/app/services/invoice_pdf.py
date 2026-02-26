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
    # Build seller address lines
    seller_address_parts = []
    if invoice.seller_address_street:
        seller_address_parts.append(invoice.seller_address_street)
    if invoice.seller_address_postal_code or invoice.seller_address_city:
        seller_address_parts.append(
            f"{invoice.seller_address_postal_code or ''} {invoice.seller_address_city or ''}".strip()
        )
    if invoice.seller_address_country and invoice.seller_address_country != "Nederland":
        seller_address_parts.append(invoice.seller_address_country)

    # Build customer address lines
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

    # Seller contact line (email / phone)
    seller_contact_parts = []
    if invoice.seller_email:
        seller_contact_parts.append(invoice.seller_email)
    if invoice.seller_phone:
        seller_contact_parts.append(invoice.seller_phone)

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
                font-family: Arial, Helvetica, sans-serif;
                font-size: 10pt;
                line-height: 1.6;
                color: #1a1a2e;
            }}

            .invoice-container {{
                max-width: 100%;
            }}

            /* ── TOP HEADER ── */
            .header {{
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 36px;
                padding-bottom: 20px;
                border-bottom: 3px solid #1d4ed8;
            }}

            /* Sender block – top left */
            .sender-block {{
                flex: 1;
            }}

            .sender-name {{
                font-size: 20pt;
                font-weight: 700;
                color: #1d4ed8;
                letter-spacing: -0.5px;
                margin-bottom: 4px;
            }}

            .sender-details {{
                font-size: 8.5pt;
                color: #555;
                line-height: 1.7;
            }}

            /* "FACTUUR" word-mark – top right */
            .factuur-wordmark {{
                text-align: right;
            }}

            .factuur-wordmark h1 {{
                font-size: 26pt;
                font-weight: 800;
                color: #1d4ed8;
                text-transform: uppercase;
                letter-spacing: 4px;
                line-height: 1;
            }}

            /* ── BILLING ROW (client details left, invoice summary box right) ── */
            .billing-row {{
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 32px;
            }}

            /* Client billing details */
            .billing-to {{
                flex: 1;
                padding-right: 20px;
            }}

            .billing-to-label {{
                font-size: 7.5pt;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 1.2px;
                color: #888;
                margin-bottom: 6px;
            }}

            .billing-to-name {{
                font-size: 11pt;
                font-weight: 700;
                color: #1a1a2e;
                margin-bottom: 2px;
            }}

            .billing-to-address {{
                font-size: 9pt;
                color: #444;
                line-height: 1.6;
            }}

            /* Invoice summary box */
            .invoice-summary {{
                width: 240px;
                background: #f1f5fd;
                border-radius: 8px;
                padding: 14px 18px;
                border-left: 4px solid #1d4ed8;
            }}

            .summary-row {{
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                padding: 4px 0;
                border-bottom: 1px solid #dde3f0;
                font-size: 9pt;
            }}

            .summary-row:last-child {{
                border-bottom: none;
            }}

            .summary-label {{
                color: #555;
                white-space: nowrap;
                margin-right: 12px;
            }}

            .summary-value {{
                font-weight: 600;
                color: #1a1a2e;
                text-align: right;
            }}

            .summary-value.highlight {{
                color: #1d4ed8;
            }}

            /* ── LINES TABLE ── */
            .lines-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 24px;
                font-size: 9.5pt;
            }}

            .lines-table thead tr {{
                background: #eef2fb;
            }}

            .lines-table th {{
                padding: 10px 10px;
                text-align: left;
                font-size: 8pt;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                color: #1d4ed8;
                border-bottom: 2px solid #c7d2f0;
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
                padding: 10px 10px;
                border-bottom: 1px solid #e8ecf5;
                color: #1a1a2e;
            }}

            .lines-table tbody tr:nth-child(even) {{
                background: #f8faff;
            }}

            .lines-table tbody tr:last-child td {{
                border-bottom: 2px solid #1d4ed8;
            }}

            /* ── TOTALS ── */
            .totals {{
                margin-left: auto;
                width: 280px;
                margin-bottom: 32px;
            }}

            .totals-row {{
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                font-size: 9.5pt;
            }}

            .totals-row.subtotal {{
                border-top: 1px solid #e8ecf5;
                color: #555;
            }}

            .totals-row.vat-row {{
                color: #555;
            }}

            .totals-row.total {{
                border-top: 2px solid #1d4ed8;
                margin-top: 4px;
                padding-top: 10px;
                font-size: 13pt;
                font-weight: 700;
                color: #1d4ed8;
            }}

            /* ── FOOTER ── */
            .footer {{
                margin-top: 36px;
                padding-top: 20px;
                border-top: 1px solid #e8ecf5;
                display: flex;
                align-items: flex-start;
                gap: 20px;
            }}

            /* Payment info box */
            .payment-info {{
                flex: 1;
                background: #f0fdf4;
                padding: 16px 18px;
                border-radius: 8px;
                border-left: 4px solid #22c55e;
            }}

            .payment-title {{
                font-size: 9pt;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: #166534;
                margin-bottom: 10px;
            }}

            .payment-details {{
                font-size: 8.5pt;
                color: #1a1a2e;
                line-height: 1.8;
            }}

            .payment-details .pd-row {{
                display: flex;
                gap: 6px;
            }}

            .payment-details .pd-label {{
                color: #555;
                min-width: 68px;
            }}

            .payment-details .pd-value {{
                font-weight: 600;
            }}

            .notes {{
                flex: 1;
                padding: 16px 18px;
                background: #fefce8;
                border-radius: 8px;
                border-left: 4px solid #eab308;
                font-size: 8.5pt;
                color: #1a1a2e;
                line-height: 1.7;
            }}

            .notes-title {{
                font-size: 9pt;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: #713f12;
                margin-bottom: 8px;
            }}

            /* Page footer */
            .page-footer {{
                margin-top: 28px;
                padding-top: 10px;
                border-top: 1px solid #e8ecf5;
                text-align: center;
                font-size: 7.5pt;
                color: #bbb;
            }}
        </style>
    </head>
    <body>
        <div class="invoice-container">

            <!-- ── HEADER ── -->
            <div class="header">
                <div class="sender-block">
                    <div class="sender-name">{invoice.seller_company_name or 'Bedrijfsnaam'}</div>
                    <div class="sender-details">
                        {('<br>'.join(seller_address_parts)) if seller_address_parts else ''}
                        {f'<br>{" &nbsp;·&nbsp; ".join(seller_contact_parts)}' if seller_contact_parts else ''}
                    </div>
                </div>
                <div class="factuur-wordmark">
                    <h1>Factuur</h1>
                </div>
            </div>

            <!-- ── BILLING ROW ── -->
            <div class="billing-row">
                <!-- Client billing details (left) -->
                <div class="billing-to">
                    <div class="billing-to-label">Factuur aan</div>
                    {f'<div class="billing-to-name">{invoice.customer_name}</div>' if invoice.customer_name else ''}
                    {f'<div class="billing-to-address">{("<br>".join(customer_address_parts))}</div>' if customer_address_parts else ''}
                    {f'<div class="billing-to-address">BTW: {invoice.customer_btw_number}</div>' if invoice.customer_btw_number else ''}
                </div>

                <!-- Invoice summary box (right) -->
                <div class="invoice-summary">
                    <div class="summary-row">
                        <span class="summary-label">Factuurnummer</span>
                        <span class="summary-value highlight">{invoice.invoice_number}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">Factuurdatum</span>
                        <span class="summary-value">{issue_date_str}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">Vervaldatum</span>
                        <span class="summary-value">{due_date_str}</span>
                    </div>
                </div>
            </div>

            <!-- ── LINE ITEMS TABLE ── -->
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

            <!-- ── TOTALS ── -->
            <div class="totals">
                <div class="totals-row subtotal">
                    <span>Subtotaal</span>
                    <span>{format_amount(invoice.subtotal_cents)}</span>
                </div>
                <div class="totals-row vat-row">
                    <span>BTW</span>
                    <span>{format_amount(invoice.vat_total_cents)}</span>
                </div>
                <div class="totals-row total">
                    <span>Totaal</span>
                    <span>{format_amount(invoice.total_cents)}</span>
                </div>
            </div>

            <!-- ── FOOTER ── -->
            <div class="footer">
                <div class="payment-info">
                    <div class="payment-title">Betalingsgegevens</div>
                    <div class="payment-details">
                        {f'<div class="pd-row"><span class="pd-label">IBAN</span><span class="pd-value">{invoice.seller_iban}</span></div>' if invoice.seller_iban else ''}
                        <div class="pd-row"><span class="pd-label">T.n.v.</span><span class="pd-value">{invoice.seller_company_name or '-'}</span></div>
                        <div class="pd-row"><span class="pd-label">Kenmerk</span><span class="pd-value">{invoice.invoice_number}</span></div>
                        {f'<div class="pd-row"><span class="pd-label">KvK</span><span class="pd-value">{invoice.seller_kvk_number}</span></div>' if invoice.seller_kvk_number else ''}
                        {f'<div class="pd-row"><span class="pd-label">BTW-nr.</span><span class="pd-value">{invoice.seller_btw_number}</span></div>' if invoice.seller_btw_number else ''}
                    </div>
                </div>

                {f'''<div class="notes">
                    <div class="notes-title">Opmerkingen</div>
                    {invoice.notes}
                </div>''' if invoice.notes else ''}
            </div>

            <!-- Page footer -->
            <div class="page-footer">
                Powered by MHM IT &bull; zzpershub.nl
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
    except (ImportError, OSError) as e:
        # ImportError: Python package not installed
        # OSError: System libraries missing (e.g., libgobject-2.0-0)
        logger.error(f"WeasyPrint unavailable: {e}", exc_info=True)
        raise RuntimeError(
            "PDF generation is not available. WeasyPrint library or its system dependencies are not installed."
        ) from e
    
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
