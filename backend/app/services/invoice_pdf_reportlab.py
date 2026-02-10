"""
Invoice PDF Generation Service (ReportLab Alternative)

Generates professional PDF invoices using ReportLab as an alternative to WeasyPrint.
ReportLab is a pure-Python library that doesn't require system dependencies,
making it more reliable in Docker environments.
"""
import io
from datetime import datetime
from decimal import Decimal
from typing import List
import logging

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

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
    # Convert to Dutch format: swap , and .
    dutch_formatted = formatted.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return f"€ {dutch_formatted}"


def format_date_nl(date_obj) -> str:
    """Format date in Dutch format (dd-mm-yyyy)."""
    if isinstance(date_obj, str):
        date_obj = datetime.fromisoformat(date_obj.replace("Z", "+00:00")).date()
    return date_obj.strftime("%d-%m-%Y")


class NumberedCanvas(canvas.Canvas):
    """Custom canvas for adding page numbers and footer."""
    
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []
        
    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()
        
    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)
        
    def draw_page_number(self, page_count):
        """Add page number to footer."""
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.grey)
        page_num_text = f"Pagina {self._pageNumber} van {page_count}"
        self.drawRightString(A4[0] - 2*cm, 1.5*cm, page_num_text)


def generate_invoice_pdf_reportlab(invoice: ZZPInvoice) -> bytes:
    """
    Generate a PDF for an invoice using ReportLab.
    
    Args:
        invoice: ZZPInvoice model with lines loaded
        
    Returns:
        PDF bytes
        
    Raises:
        RuntimeError: If PDF generation fails
    """
    try:
        buffer = io.BytesIO()
        
        # Create PDF with custom canvas for page numbers
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm,
        )
        
        # Build elements
        elements = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#2563eb'),
            spaceAfter=6,
            alignment=TA_RIGHT,
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#2563eb'),
            spaceAfter=12,
        )
        
        normal_style = styles['Normal']
        small_style = ParagraphStyle(
            'Small',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
        )
        
        # Header section with company name and invoice title
        header_data = [
            [
                Paragraph(f"<b>{invoice.seller_company_name or 'Bedrijfsnaam'}</b>", heading_style),
                Paragraph("<b>FACTUUR</b>", title_style),
            ],
        ]
        
        # Build company details
        company_details = []
        if invoice.seller_address_street:
            company_details.append(invoice.seller_address_street)
        if invoice.seller_address_postal_code or invoice.seller_address_city:
            address = f"{invoice.seller_address_postal_code or ''} {invoice.seller_address_city or ''}".strip()
            company_details.append(address)
        if invoice.seller_address_country and invoice.seller_address_country != "Nederland":
            company_details.append(invoice.seller_address_country)
        if invoice.seller_email:
            company_details.append(invoice.seller_email)
        if invoice.seller_phone:
            company_details.append(invoice.seller_phone)
        
        company_text = "<br/>".join(company_details)
        
        header_data.append([
            Paragraph(company_text, small_style),
            Paragraph(f"<b>{invoice.invoice_number}</b>", normal_style),
        ])
        
        header_table = Table(header_data, colWidths=[9*cm, 8*cm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#2563eb')),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 0.5*cm))
        
        # From/To addresses
        # Build customer address
        customer_address = []
        if invoice.customer_address_street:
            customer_address.append(invoice.customer_address_street)
        if invoice.customer_address_postal_code or invoice.customer_address_city:
            address = f"{invoice.customer_address_postal_code or ''} {invoice.customer_address_city or ''}".strip()
            customer_address.append(address)
        if invoice.customer_address_country and invoice.customer_address_country != "Nederland":
            customer_address.append(invoice.customer_address_country)
        
        customer_text = "<br/>".join(customer_address) if customer_address else "-"
        
        address_data = [
            [
                Paragraph("<b>Van</b>", small_style),
                Paragraph("<b>Aan</b>", small_style),
            ],
            [
                Paragraph(f"<b>{invoice.seller_company_name or '-'}</b><br/>{company_text}", normal_style),
                Paragraph(f"<b>{invoice.customer_name or '-'}</b><br/>{customer_text}", normal_style),
            ],
        ]
        
        address_table = Table(address_data, colWidths=[8.5*cm, 8.5*cm])
        address_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, 0), 0),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ]))
        elements.append(address_table)
        elements.append(Spacer(1, 0.5*cm))
        
        # Invoice metadata
        issue_date_str = format_date_nl(invoice.issue_date)
        due_date_str = format_date_nl(invoice.due_date) if invoice.due_date else "-"
        
        meta_data = [
            ["Factuurnummer:", invoice.invoice_number],
            ["Factuurdatum:", issue_date_str],
            ["Vervaldatum:", due_date_str],
        ]
        
        if invoice.customer_btw_number:
            meta_data.append(["Klant BTW-nummer:", invoice.customer_btw_number])
        
        meta_table = Table(meta_data, colWidths=[4*cm, 13*cm])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.grey),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.white),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 0.8*cm))
        
        # Invoice lines table
        line_data = [
            ["Omschrijving", "Aantal", "Prijs", "BTW", "Totaal"]
        ]
        
        for line in invoice.lines:
            line_data.append([
                line.description,
                f"{float(line.quantity):g}",
                format_amount(line.unit_price_cents),
                f"{float(line.vat_rate):g}%",
                format_amount(line.line_total_cents),
            ])
        
        lines_table = Table(
            line_data,
            colWidths=[7*cm, 2*cm, 3*cm, 2*cm, 3*cm],
        )
        lines_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563eb')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
            ('ALIGN', (4, 0), (4, -1), 'RIGHT'),
            # Data rows
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LINEBELOW', (0, 1), (-1, -2), 0.5, colors.HexColor('#e5e7eb')),
            ('LINEBELOW', (0, -1), (-1, -1), 2, colors.HexColor('#2563eb')),
        ]))
        elements.append(lines_table)
        elements.append(Spacer(1, 0.5*cm))
        
        # Totals section (aligned to the right)
        totals_data = [
            ["Subtotaal", format_amount(invoice.subtotal_cents)],
            ["BTW", format_amount(invoice.vat_total_cents)],
            ["<b>Totaal</b>", f"<b>{format_amount(invoice.total_cents)}</b>"],
        ]
        
        totals_table = Table(totals_data, colWidths=[4*cm, 4*cm])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LINEABOVE', (0, 0), (-1, 0), 1, colors.HexColor('#e5e7eb')),
            ('LINEABOVE', (0, 2), (-1, 2), 2, colors.HexColor('#2563eb')),
            ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 2), (-1, 2), 12),
            ('TEXTCOLOR', (0, 2), (-1, 2), colors.HexColor('#2563eb')),
        ]))
        
        # Create wrapper table to align totals to the right
        wrapper_data = [["", totals_table]]
        wrapper_table = Table(wrapper_data, colWidths=[9*cm, 8*cm])
        wrapper_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        elements.append(wrapper_table)
        elements.append(Spacer(1, 1*cm))
        
        # Payment information
        payment_info_parts = []
        if invoice.seller_iban:
            payment_info_parts.append(f"<b>IBAN:</b> {invoice.seller_iban}")
        payment_info_parts.append(f"<b>T.n.v.:</b> {invoice.seller_company_name or '-'}")
        payment_info_parts.append(f"<b>Kenmerk:</b> {invoice.invoice_number}")
        
        payment_text = "<br/>".join(payment_info_parts)
        
        payment_data = [[Paragraph("<b>Betalingsgegevens</b><br/>" + payment_text, normal_style)]]
        payment_table = Table(payment_data, colWidths=[17*cm])
        payment_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0fdf4')),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#22c55e')),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ]))
        elements.append(payment_table)
        
        # Notes (if any)
        if invoice.notes:
            elements.append(Spacer(1, 0.5*cm))
            notes_data = [[Paragraph(f"<b>Opmerkingen:</b><br/>{invoice.notes}", normal_style)]]
            notes_table = Table(notes_data, colWidths=[17*cm])
            notes_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fefce8')),
                ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#eab308')),
                ('LEFTPADDING', (0, 0), (-1, -1), 12),
                ('RIGHTPADDING', (0, 0), (-1, -1), 12),
                ('TOPPADDING', (0, 0), (-1, -1), 12),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ]))
            elements.append(notes_table)
        
        # Business IDs footer
        elements.append(Spacer(1, 0.5*cm))
        business_ids = []
        if invoice.seller_kvk_number:
            business_ids.append(f"KVK: {invoice.seller_kvk_number}")
        if invoice.seller_btw_number:
            business_ids.append(f"BTW: {invoice.seller_btw_number}")
        
        if business_ids:
            footer_text = " | ".join(business_ids)
            footer_para = Paragraph(
                f"<para align=center>{footer_text}</para>",
                small_style
            )
            elements.append(footer_para)
        
        # Build PDF
        doc.build(elements, canvasmaker=NumberedCanvas)
        
        buffer.seek(0)
        return buffer.read()
        
    except Exception as e:
        logger.error(f"Failed to generate PDF for invoice {invoice.invoice_number}: {e}", exc_info=True)
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
