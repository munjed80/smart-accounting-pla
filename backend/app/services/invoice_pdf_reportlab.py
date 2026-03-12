"""
Invoice PDF Generation Service (ReportLab)

Generates professional PDF invoices using ReportLab.
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
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

from app.models.zzp import ZZPInvoice

logger = logging.getLogger(__name__)

# ── Page geometry ─────────────────────────────────────────────────────────────
_PAGE_W = 170 * mm   # usable width: A4 (210mm) − 2×20mm margins
_LEFT_COL = 100 * mm
_RIGHT_COL = 70 * mm

# ── Brand colours ─────────────────────────────────────────────────────────────
_C_BLUE        = colors.HexColor('#1d4ed8')
_C_BLUE_LIGHT  = colors.HexColor('#eff6ff')
_C_TEXT        = colors.HexColor('#1e293b')
_C_MUTED       = colors.HexColor('#64748b')
_C_SEP         = colors.HexColor('#e2e8f0')
_C_ROW_ALT     = colors.HexColor('#f8fafc')
_C_GREEN_BG    = colors.HexColor('#f0fdf4')
_C_GREEN       = colors.HexColor('#16a34a')
_C_YELLOW_BG   = colors.HexColor('#fefce8')
_C_YELLOW      = colors.HexColor('#ca8a04')


def format_amount(cents: int) -> str:
    """
    Format cents as EUR currency string in Dutch format.

    Dutch format uses period (.) as thousand separator and comma (,) as decimal
    separator. Example: 1 234 567 cents → "€ 12.345,67"
    """
    euros = Decimal(cents) / 100
    formatted = f"{euros:,.2f}"
    dutch = formatted.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return f"\u20ac {dutch}"


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


class NumberedCanvas(canvas.Canvas):
    """Custom canvas that adds a footer with page numbers and branding."""

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
            self._draw_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def _draw_footer(self, page_count: int) -> None:
        """Render page number and branding in the footer area."""
        y = 1.2 * cm
        self.setFont("Helvetica", 7.5)
        self.setFillColor(_C_MUTED)
        self.drawCentredString(A4[0] / 2, y, "Powered by MHM IT \u2022 zzpershub.nl")
        self.setFont("Helvetica", 7.5)
        self.drawRightString(A4[0] - 2 * cm, y, f"Pagina {self._pageNumber} van {page_count}")


def _make_style(base_styles, name: str, parent: str = "Normal", **kwargs) -> ParagraphStyle:
    return ParagraphStyle(name, parent=base_styles[parent], **kwargs)


def generate_invoice_pdf_reportlab(invoice: ZZPInvoice) -> bytes:
    """
    Generate a professional Dutch ZZP invoice PDF using ReportLab.

    Args:
        invoice: ZZPInvoice model with lines pre-loaded.

    Returns:
        Raw PDF bytes.

    Raises:
        RuntimeError: If PDF generation fails.
    """
    try:
        buffer = io.BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20 * mm,
            leftMargin=20 * mm,
            topMargin=20 * mm,
            bottomMargin=22 * mm,
        )

        elements: list = []
        base = getSampleStyleSheet()

        # ── Typography ────────────────────────────────────────────────────────
        s_company_name = _make_style(
            base, "RL_CompanyName",
            fontSize=18, fontName="Helvetica-Bold",
            textColor=_C_BLUE, leading=22, spaceAfter=2,
        )
        s_company_detail = _make_style(
            base, "RL_CompanyDetail",
            fontSize=8, textColor=_C_MUTED, leading=12,
        )
        s_factuur_title = _make_style(
            base, "RL_FactuurTitle",
            fontSize=30, fontName="Helvetica-Bold",
            textColor=_C_BLUE, alignment=TA_RIGHT, leading=34, spaceAfter=6,
        )
        s_meta_label = _make_style(
            base, "RL_MetaLabel",
            fontSize=8, textColor=_C_MUTED, alignment=TA_RIGHT,
        )
        s_meta_value = _make_style(
            base, "RL_MetaValue",
            fontSize=8, fontName="Helvetica-Bold",
            textColor=_C_TEXT, alignment=TA_RIGHT,
        )
        s_section_label = _make_style(
            base, "RL_SectionLabel",
            fontSize=7, fontName="Helvetica-Bold",
            textColor=_C_MUTED, spaceAfter=2,
        )
        s_customer_name = _make_style(
            base, "RL_CustomerName",
            fontSize=12, fontName="Helvetica-Bold",
            textColor=_C_TEXT, spaceAfter=2,
        )
        s_customer_addr = _make_style(
            base, "RL_CustomerAddr",
            fontSize=9, textColor=colors.HexColor("#475569"), leading=14,
        )
        s_intro = _make_style(
            base, "RL_Intro",
            fontSize=9, textColor=_C_MUTED, leading=14,
        )
        s_th = _make_style(
            base, "RL_TH",
            fontSize=8, fontName="Helvetica-Bold",
            textColor=colors.white, alignment=TA_LEFT,
        )
        s_th_r = _make_style(
            base, "RL_TH_R",
            fontSize=8, fontName="Helvetica-Bold",
            textColor=colors.white, alignment=TA_RIGHT,
        )
        s_th_c = _make_style(
            base, "RL_TH_C",
            fontSize=8, fontName="Helvetica-Bold",
            textColor=colors.white, alignment=TA_CENTER,
        )
        s_td = _make_style(
            base, "RL_TD",
            fontSize=9, textColor=_C_TEXT, leading=13,
        )
        s_td_r = _make_style(
            base, "RL_TD_R",
            fontSize=9, textColor=_C_TEXT, alignment=TA_RIGHT,
        )
        s_td_c = _make_style(
            base, "RL_TD_C",
            fontSize=9, textColor=_C_TEXT, alignment=TA_CENTER,
        )
        s_totals_lbl = _make_style(
            base, "RL_TotalsLbl",
            fontSize=9, textColor=_C_MUTED, alignment=TA_RIGHT,
        )
        s_totals_val = _make_style(
            base, "RL_TotalsVal",
            fontSize=9, textColor=_C_TEXT, alignment=TA_RIGHT,
        )
        s_grand_lbl = _make_style(
            base, "RL_GrandLbl",
            fontSize=13, fontName="Helvetica-Bold",
            textColor=_C_BLUE, alignment=TA_RIGHT,
        )
        s_grand_val = _make_style(
            base, "RL_GrandVal",
            fontSize=13, fontName="Helvetica-Bold",
            textColor=_C_BLUE, alignment=TA_RIGHT,
        )
        s_pay_title = _make_style(
            base, "RL_PayTitle",
            fontSize=8.5, fontName="Helvetica-Bold",
            textColor=_C_GREEN, spaceAfter=4,
        )
        s_pay_lbl = _make_style(
            base, "RL_PayLbl",
            fontSize=8.5, textColor=_C_MUTED,
        )
        s_pay_val = _make_style(
            base, "RL_PayVal",
            fontSize=8.5, fontName="Helvetica-Bold", textColor=_C_TEXT,
        )
        s_notes_title = _make_style(
            base, "RL_NotesTitle",
            fontSize=8.5, fontName="Helvetica-Bold",
            textColor=_C_YELLOW, spaceAfter=4,
        )
        s_notes_body = _make_style(
            base, "RL_NotesBody",
            fontSize=9, textColor=_C_TEXT, leading=14,
        )

        # ── Dates ─────────────────────────────────────────────────────────────
        issue_date_str = format_date_nl(invoice.issue_date)
        due_date_str   = format_date_nl(invoice.due_date) if invoice.due_date else "\u2014"

        # ── Company details block (left column of header) ──────────────────────
        company_name = invoice.seller_company_name or "Uw Bedrijfsnaam"
        company_lines: List[str] = []
        if invoice.seller_address_street:
            company_lines.append(invoice.seller_address_street)
        postal_city = " ".join(filter(None, [
            invoice.seller_address_postal_code, invoice.seller_address_city
        ]))
        if postal_city:
            company_lines.append(postal_city)
        if invoice.seller_address_country and invoice.seller_address_country.lower() != "nederland":
            company_lines.append(invoice.seller_address_country)
        if invoice.seller_kvk_number:
            company_lines.append(f"KvK {invoice.seller_kvk_number}")
        if invoice.seller_btw_number:
            company_lines.append(f"BTW {invoice.seller_btw_number}")
        contact = "  \u00b7  ".join(filter(None, [invoice.seller_email, invoice.seller_phone]))
        if contact:
            company_lines.append(contact)

        company_detail_text = "<br/>".join(company_lines)

        # ── Header: company (left) + FACTUUR + meta (right) ───────────────────
        # Left inner table: company name + detail lines
        left_rows: list = [[Paragraph(company_name, s_company_name)]]
        if company_detail_text:
            left_rows.append([Paragraph(company_detail_text, s_company_detail)])

        left_inner = Table(left_rows, colWidths=[_LEFT_COL])
        left_inner.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ]))

        # Right inner table: FACTUUR title + meta table
        meta_rows = [
            [Paragraph("Factuurdatum",  s_meta_label), Paragraph(issue_date_str,          s_meta_value)],
            [Paragraph("Vervaldatum",   s_meta_label), Paragraph(due_date_str,             s_meta_value)],
            [Paragraph("Factuurnummer", s_meta_label), Paragraph(invoice.invoice_number,   s_meta_value)],
        ]
        meta_tbl = Table(meta_rows, colWidths=[38 * mm, 32 * mm])
        meta_tbl.setStyle(TableStyle([
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            # Separator above Factuurnummer row
            ("LINEABOVE",     (0, 2), (-1, 2), 0.5, _C_SEP),
        ]))

        right_inner = Table(
            [[Paragraph("FACTUUR", s_factuur_title)], [meta_tbl]],
            colWidths=[_RIGHT_COL],
        )
        right_inner.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ]))

        header_tbl = Table([[left_inner, right_inner]], colWidths=[_LEFT_COL, _RIGHT_COL])
        header_tbl.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ]))

        elements.append(header_tbl)
        elements.append(Spacer(1, 4 * mm))
        elements.append(HRFlowable(width=_PAGE_W, thickness=2, color=_C_BLUE, spaceAfter=10))

        # ── Customer section ──────────────────────────────────────────────────
        cust_addr_lines: List[str] = []
        if invoice.customer_address_street:
            cust_addr_lines.append(invoice.customer_address_street)
        cust_postal_city = " ".join(filter(None, [
            invoice.customer_address_postal_code, invoice.customer_address_city
        ]))
        if cust_postal_city:
            cust_addr_lines.append(cust_postal_city)
        if invoice.customer_address_country and invoice.customer_address_country.lower() != "nederland":
            cust_addr_lines.append(invoice.customer_address_country)

        elements.append(Paragraph("FACTUUR VOOR", s_section_label))
        elements.append(Paragraph(invoice.customer_name or "\u2014", s_customer_name))
        if cust_addr_lines:
            elements.append(Paragraph("<br/>".join(cust_addr_lines), s_customer_addr))
        if invoice.customer_btw_number:
            elements.append(Paragraph(f"BTW: {invoice.customer_btw_number}", s_customer_addr))

        elements.append(Spacer(1, 8 * mm))

        # ── Intro line ────────────────────────────────────────────────────────
        elements.append(Paragraph(
            "Bedankt voor uw vertrouwen. "
            "Hieronder vindt u de factuur voor de geleverde diensten.",
            s_intro,
        ))
        elements.append(Spacer(1, 6 * mm))

        # ── Invoice lines table ───────────────────────────────────────────────
        # Column widths: Omschrijving | Aantal | Tarief | BTW | Bedrag = 170 mm
        col_w = [76 * mm, 22 * mm, 28 * mm, 16 * mm, 28 * mm]

        line_data = [[
            Paragraph("Omschrijving", s_th),
            Paragraph("Aantal",       s_th_c),
            Paragraph("Tarief",       s_th_r),
            Paragraph("BTW",          s_th_c),
            Paragraph("Bedrag",       s_th_r),
        ]]

        for line in invoice.lines:
            qty_str = format_quantity_nl(line.quantity)
            vat_str = f"{float(line.vat_rate):g}%"
            line_data.append([
                Paragraph(line.description,                   s_td),
                Paragraph(qty_str,                            s_td_c),
                Paragraph(format_amount(line.unit_price_cents), s_td_r),
                Paragraph(vat_str,                            s_td_c),
                Paragraph(format_amount(line.line_total_cents), s_td_r),
            ])

        # Subtle alternating row background on data rows
        zebra_cmds = [
            ("BACKGROUND", (0, i), (-1, i), _C_ROW_ALT)
            for i in range(2, len(line_data), 2)
        ]

        lines_tbl = Table(line_data, colWidths=col_w, repeatRows=1)
        lines_tbl.setStyle(TableStyle([
            # Header row
            ("BACKGROUND",    (0, 0), (-1, 0), _C_BLUE),
            ("TOPPADDING",    (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("LEFTPADDING",   (0, 0), (-1, 0), 8),
            ("RIGHTPADDING",  (0, 0), (-1, 0), 8),
            # Data rows
            ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE",      (0, 1), (-1, -1), 9),
            ("TOPPADDING",    (0, 1), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
            ("LEFTPADDING",   (0, 1), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 1), (-1, -1), 8),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            # Row separators
            ("LINEBELOW",     (0, 1), (-1, -2), 0.5, _C_SEP),
            # Bold blue line at bottom of table
            ("LINEBELOW",     (0, -1), (-1, -1), 1.5, _C_BLUE),
        ] + zebra_cmds))

        elements.append(lines_tbl)
        elements.append(Spacer(1, 4 * mm))

        # ── Totals (right-aligned) ────────────────────────────────────────────
        # Inner totals table: label col + amount col, both right-aligned
        totals_inner_w = [36 * mm, 34 * mm]  # 70 mm total = _RIGHT_COL

        totals_data = [
            [Paragraph("Subtotaal", s_totals_lbl), Paragraph(format_amount(invoice.subtotal_cents), s_totals_val)],
            [Paragraph("BTW",       s_totals_lbl), Paragraph(format_amount(invoice.vat_total_cents), s_totals_val)],
            [Paragraph("Totaal",    s_grand_lbl),  Paragraph(format_amount(invoice.total_cents),     s_grand_val)],
        ]

        totals_tbl = Table(totals_data, colWidths=totals_inner_w)
        totals_tbl.setStyle(TableStyle([
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            # Separator above grand total row
            ("LINEABOVE",     (0, 2), (-1, 2), 1.5, _C_BLUE),
            # Light blue background on grand total row
            ("BACKGROUND",    (0, 2), (-1, 2), _C_BLUE_LIGHT),
            # Separator between subtotal rows
            ("LINEBELOW",     (0, 0), (-1, 1), 0.5, _C_SEP),
        ]))

        # Wrapper pushes totals to the right side of the page
        totals_wrapper = Table([["", totals_tbl]], colWidths=[_LEFT_COL, _RIGHT_COL])
        totals_wrapper.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ]))

        elements.append(totals_wrapper)
        elements.append(Spacer(1, 10 * mm))

        # ── Payment details ───────────────────────────────────────────────────
        payment_rows: list = []
        tnv = invoice.seller_company_name or invoice.seller_trading_name
        if tnv:
            payment_rows.append([Paragraph("T.n.v.",      s_pay_lbl), Paragraph(tnv,                      s_pay_val)])
        if invoice.seller_iban:
            payment_rows.append([Paragraph("IBAN",        s_pay_lbl), Paragraph(invoice.seller_iban,       s_pay_val)])
        payment_rows.append(    [Paragraph("Kenmerk",     s_pay_lbl), Paragraph(invoice.invoice_number,    s_pay_val)])
        if invoice.seller_kvk_number:
            payment_rows.append([Paragraph("KvK",         s_pay_lbl), Paragraph(invoice.seller_kvk_number, s_pay_val)])
        if invoice.seller_btw_number:
            payment_rows.append([Paragraph("BTW-nummer",  s_pay_lbl), Paragraph(invoice.seller_btw_number, s_pay_val)])

        if payment_rows:
            pay_inner = Table(payment_rows, colWidths=[30 * mm, 116 * mm])
            pay_inner.setStyle(TableStyle([
                ("VALIGN",        (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING",    (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING",   (0, 0), (-1, -1), 0),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ]))

            pay_box = Table(
                [[Paragraph("BETAALGEGEVENS", s_pay_title)], [pay_inner]],
                colWidths=[_PAGE_W],
            )
            pay_box.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), _C_GREEN_BG),
                ("LINEABOVE",     (0, 0), (-1, 0),  2, _C_GREEN),
                ("TOPPADDING",    (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING",   (0, 0), (-1, -1), 14),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
            ]))
            elements.append(pay_box)

        # ── Notes ─────────────────────────────────────────────────────────────
        if invoice.notes:
            elements.append(Spacer(1, 6 * mm))
            notes_box = Table(
                [[Paragraph("OPMERKINGEN", s_notes_title)], [Paragraph(invoice.notes, s_notes_body)]],
                colWidths=[_PAGE_W],
            )
            notes_box.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), _C_YELLOW_BG),
                ("LINEABOVE",     (0, 0), (-1, 0),  2, _C_YELLOW),
                ("TOPPADDING",    (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING",   (0, 0), (-1, -1), 14),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
            ]))
            elements.append(notes_box)

        # ── Render ────────────────────────────────────────────────────────────
        doc.build(elements, canvasmaker=NumberedCanvas)

        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        logger.error(
            f"Failed to generate PDF for invoice {invoice.invoice_number}: {e}",
            exc_info=True,
        )
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
