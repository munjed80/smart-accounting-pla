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
    return f"\u20ac {dutch_formatted}"


def format_date_nl(date_obj) -> str:
    """Format date in Dutch format (dd-mm-yyyy)."""
    if isinstance(date_obj, str):
        date_obj = datetime.fromisoformat(date_obj.replace("Z", "+00:00")).date()
    return date_obj.strftime("%d-%m-%Y")


def format_quantity_nl(qty) -> str:
    """
    Format a quantity value in Dutch decimal notation.

    Whole numbers are shown without decimals; fractional values use a comma as
    the decimal separator, e.g. 28.75 → "28,75".
    """
    val = float(qty)
    if val == int(val):
        return str(int(val))
    return f"{val:.2f}".replace(".", ",")


def generate_invoice_html(invoice: ZZPInvoice) -> str:
    """
    Generate HTML for an invoice.

    Args:
        invoice: ZZPInvoice model with lines loaded

    Returns:
        HTML string for the invoice
    """
    # ── Company / seller details ───────────────────────────────────────────────
    company_name = invoice.seller_company_name or invoice.seller_trading_name
    company_missing = not company_name
    if company_missing:
        company_name = "Bedrijfsgegevens ontbreken"
    seller_detail_lines = []
    if company_missing:
        seller_detail_lines.append(
            "Vul uw bedrijfsprofiel volledig in via Instellingen."
        )
    else:
        if invoice.seller_address_street:
            seller_detail_lines.append(invoice.seller_address_street)
        postal_city = " ".join(filter(None, [
            invoice.seller_address_postal_code, invoice.seller_address_city
        ]))
        if postal_city:
            seller_detail_lines.append(postal_city)
        if invoice.seller_address_country and invoice.seller_address_country.lower() != "nederland":
            seller_detail_lines.append(invoice.seller_address_country)
        if invoice.seller_kvk_number:
            seller_detail_lines.append(f"KvK {invoice.seller_kvk_number}")
        if invoice.seller_btw_number:
            seller_detail_lines.append(f"BTW {invoice.seller_btw_number}")
        contact_parts = list(filter(None, [invoice.seller_email, invoice.seller_phone]))
        if contact_parts:
            seller_detail_lines.append(" &nbsp;&middot;&nbsp; ".join(contact_parts))

    seller_details_html = "<br>".join(seller_detail_lines)

    # ── Customer address ───────────────────────────────────────────────────────
    customer_addr_lines = []
    if invoice.customer_address_street:
        customer_addr_lines.append(invoice.customer_address_street)
    cust_postal_city = " ".join(filter(None, [
        invoice.customer_address_postal_code, invoice.customer_address_city
    ]))
    if cust_postal_city:
        customer_addr_lines.append(cust_postal_city)
    if invoice.customer_address_country and invoice.customer_address_country.lower() != "nederland":
        customer_addr_lines.append(invoice.customer_address_country)

    customer_addr_html = "<br>".join(customer_addr_lines)

    # ── Invoice lines ──────────────────────────────────────────────────────────
    lines_html = ""
    for line in invoice.lines:
        qty_str = format_quantity_nl(line.quantity)
        vat_str = f"{float(line.vat_rate):g}%"
        lines_html += f"""
        <tr>
            <td class="col-desc">{line.description}</td>
            <td class="col-qty">{qty_str}</td>
            <td class="col-price">{format_amount(line.unit_price_cents)}</td>
            <td class="col-vat">{vat_str}</td>
            <td class="col-amount">{format_amount(line.line_total_cents)}</td>
        </tr>"""

    # ── Dates ──────────────────────────────────────────────────────────────────
    issue_date_str = format_date_nl(invoice.issue_date)
    due_date_str   = format_date_nl(invoice.due_date) if invoice.due_date else "&mdash;"

    # ── Payment details ────────────────────────────────────────────────────────
    payment_rows_html = ""
    tnv = invoice.seller_company_name or invoice.seller_trading_name
    if tnv:
        payment_rows_html += f'<div class="pd-row"><span class="pd-lbl">T.n.v.</span><span class="pd-val">{tnv}</span></div>'
    if invoice.seller_iban:
        payment_rows_html += f'<div class="pd-row"><span class="pd-lbl">IBAN</span><span class="pd-val">{invoice.seller_iban}</span></div>'
    payment_rows_html += f'<div class="pd-row"><span class="pd-lbl">Kenmerk</span><span class="pd-val">{invoice.invoice_number}</span></div>'
    if invoice.seller_kvk_number:
        payment_rows_html += f'<div class="pd-row"><span class="pd-lbl">KvK</span><span class="pd-val">{invoice.seller_kvk_number}</span></div>'
    if invoice.seller_btw_number:
        payment_rows_html += f'<div class="pd-row"><span class="pd-lbl">BTW-nummer</span><span class="pd-val">{invoice.seller_btw_number}</span></div>'

    # ── Notes block ────────────────────────────────────────────────────────────
    notes_html = ""
    if invoice.notes:
        notes_html = f"""
        <div class="notes-box">
            <div class="notes-title">Opmerkingen</div>
            <div class="notes-text">{invoice.notes}</div>
        </div>"""

    # ── Render ─────────────────────────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
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
            line-height: 1.5;
            color: #1e293b;
        }}

        /* ── HEADER ─────────────────────────────────────────────────────────── */
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 16px;
            border-bottom: 2.5px solid #1d4ed8;
            margin-bottom: 24px;
        }}

        .company-name {{
            font-size: 20pt;
            font-weight: 700;
            color: #1d4ed8;
            line-height: 1.1;
            margin-bottom: 5px;
        }}

        .company-details {{
            font-size: 8pt;
            color: #64748b;
            line-height: 1.7;
        }}

        .factuur-block {{
            text-align: right;
            flex-shrink: 0;
        }}

        .factuur-title {{
            font-size: 30pt;
            font-weight: 800;
            color: #1d4ed8;
            letter-spacing: 3px;
            line-height: 1;
            margin-bottom: 10px;
        }}

        /* Invoice meta table inside header (right column) */
        .meta-table {{
            margin-left: auto;
            border-collapse: collapse;
        }}

        .meta-table td {{
            font-size: 8.5pt;
            padding: 3px 0;
        }}

        .meta-table td.ml {{
            color: #64748b;
            padding-right: 14px;
            text-align: right;
            white-space: nowrap;
        }}

        .meta-table td.mv {{
            font-weight: 600;
            color: #1e293b;
            text-align: right;
        }}

        .meta-sep td {{
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
        }}

        .meta-below-sep td {{
            padding-top: 5px;
        }}

        /* ── CUSTOMER ────────────────────────────────────────────────────────── */
        .customer-section {{
            margin-bottom: 20px;
        }}

        .section-label {{
            font-size: 7pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.3px;
            color: #94a3b8;
            margin-bottom: 4px;
        }}

        .customer-name {{
            font-size: 12pt;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 3px;
        }}

        .customer-address {{
            font-size: 9pt;
            color: #475569;
            line-height: 1.6;
        }}

        /* ── INTRO LINE ──────────────────────────────────────────────────────── */
        .intro-text {{
            font-size: 9pt;
            color: #64748b;
            font-style: italic;
            margin-bottom: 18px;
        }}

        /* ── INVOICE TABLE ───────────────────────────────────────────────────── */
        .lines-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            font-size: 9.5pt;
        }}

        .lines-table thead tr {{
            background: #1d4ed8;
        }}

        .lines-table th {{
            padding: 9px 10px;
            font-size: 8pt;
            font-weight: 700;
            color: #ffffff;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}

        .lines-table th.col-desc  {{ text-align: left; }}
        .lines-table th.col-qty   {{ text-align: center; }}
        .lines-table th.col-price {{ text-align: right; }}
        .lines-table th.col-vat   {{ text-align: center; }}
        .lines-table th.col-amount {{ text-align: right; }}

        .lines-table td {{
            padding: 9px 10px;
            border-bottom: 1px solid #e2e8f0;
            color: #1e293b;
            vertical-align: top;
        }}

        .lines-table td.col-desc   {{ text-align: left; }}
        .lines-table td.col-qty    {{ text-align: center; white-space: nowrap; }}
        .lines-table td.col-price  {{ text-align: right; white-space: nowrap; }}
        .lines-table td.col-vat    {{ text-align: center; }}
        .lines-table td.col-amount {{ text-align: right; white-space: nowrap; }}

        .lines-table tbody tr:nth-child(even) {{
            background: #f8fafc;
        }}

        .lines-table tbody tr:last-child td {{
            border-bottom: 2px solid #1d4ed8;
        }}

        /* ── TOTALS ──────────────────────────────────────────────────────────── */
        .totals-wrapper {{
            display: flex;
            justify-content: flex-end;
            margin-bottom: 28px;
        }}

        .totals-box {{
            width: 230px;
        }}

        .totals-row {{
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            font-size: 9.5pt;
            color: #64748b;
            border-bottom: 1px solid #e2e8f0;
        }}

        .totals-row:last-child {{
            border-bottom: none;
        }}

        .totals-row.grand-total {{
            background: #eff6ff;
            border-radius: 4px;
            padding: 9px 10px;
            margin-top: 6px;
            font-size: 13pt;
            font-weight: 700;
            color: #1d4ed8;
        }}

        /* ── PAYMENT BOX ─────────────────────────────────────────────────────── */
        .payment-box {{
            background: #f0fdf4;
            border-top: 2.5px solid #16a34a;
            padding: 14px 16px;
            margin-bottom: 18px;
        }}

        .payment-title {{
            font-size: 8pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #16a34a;
            margin-bottom: 10px;
        }}

        .pd-row {{
            display: flex;
            gap: 0;
            padding: 2px 0;
            font-size: 8.5pt;
        }}

        .pd-lbl {{
            color: #64748b;
            min-width: 88px;
        }}

        .pd-val {{
            font-weight: 600;
            color: #1e293b;
        }}

        /* ── NOTES ───────────────────────────────────────────────────────────── */
        .notes-box {{
            background: #fefce8;
            border-top: 2.5px solid #ca8a04;
            padding: 14px 16px;
            margin-bottom: 16px;
        }}

        .notes-title {{
            font-size: 8pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #a16207;
            margin-bottom: 8px;
        }}

        .notes-text {{
            font-size: 9pt;
            color: #1e293b;
            line-height: 1.6;
        }}

        /* ── PAGE FOOTER ─────────────────────────────────────────────────────── */
        .page-footer {{
            margin-top: 24px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 7.5pt;
            color: #cbd5e1;
        }}
    </style>
</head>
<body>
    <div class="invoice-container">

        <!-- ── HEADER ── -->
        <div class="header">
            <div class="sender-block">
                <div class="company-name">{company_name}</div>
                {f'<div class="company-details">{seller_details_html}</div>' if seller_details_html else ''}
            </div>
            <div class="factuur-block">
                <div class="factuur-title">FACTUUR</div>
                <table class="meta-table">
                    <tr>
                        <td class="ml">Factuurdatum</td>
                        <td class="mv">{issue_date_str}</td>
                    </tr>
                    <tr class="meta-sep">
                        <td class="ml">Vervaldatum</td>
                        <td class="mv">{due_date_str}</td>
                    </tr>
                    <tr class="meta-below-sep">
                        <td class="ml">Factuurnummer</td>
                        <td class="mv">{invoice.invoice_number}</td>
                    </tr>
                </table>
            </div>
        </div>

        <!-- ── CUSTOMER ── -->
        <div class="customer-section">
            <div class="section-label">Factuur voor</div>
            {f'<div class="customer-name">{invoice.customer_name}</div>' if invoice.customer_name else ''}
            {f'<div class="customer-address">{customer_addr_html}</div>' if customer_addr_html else ''}
            {f'<div class="customer-address">KvK: {invoice.customer_kvk_number}</div>' if invoice.customer_kvk_number else ''}
            {f'<div class="customer-address">BTW: {invoice.customer_btw_number}</div>' if invoice.customer_btw_number else ''}
        </div>

        <!-- ── INTRO LINE ── -->
        <p class="intro-text">Bedankt voor uw vertrouwen. Hieronder vindt u de factuur voor de geleverde diensten.</p>

        <!-- ── INVOICE TABLE ── -->
        <table class="lines-table">
            <thead>
                <tr>
                    <th class="col-desc">Omschrijving</th>
                    <th class="col-qty">Aantal</th>
                    <th class="col-price">Tarief</th>
                    <th class="col-vat">BTW</th>
                    <th class="col-amount">Bedrag</th>
                </tr>
            </thead>
            <tbody>
                {lines_html}
            </tbody>
        </table>

        <!-- ── TOTALS ── -->
        <div class="totals-wrapper">
            <div class="totals-box">
                <div class="totals-row">
                    <span>Subtotaal</span>
                    <span>{format_amount(invoice.subtotal_cents)}</span>
                </div>
                <div class="totals-row">
                    <span>BTW</span>
                    <span>{format_amount(invoice.vat_total_cents)}</span>
                </div>
                <div class="totals-row grand-total">
                    <span>Totaal</span>
                    <span>{format_amount(invoice.total_cents)}</span>
                </div>
            </div>
        </div>

        <!-- ── PAYMENT DETAILS ── -->
        <div class="payment-box">
            <div class="payment-title">Betaalgegevens</div>
            {payment_rows_html}
        </div>

        {notes_html}

        <!-- ── PAGE FOOTER ── -->
        <div class="page-footer">
            Powered by MHM IT &bull; zzpershub.nl
        </div>

    </div>
</body>
</html>"""

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
