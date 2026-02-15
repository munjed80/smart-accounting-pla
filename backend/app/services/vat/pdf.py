"""PDF generator for accountant VAT overviews."""
from datetime import datetime
from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from app.models.administration import Administration
from app.services.vat.report import BTWAangifteReport


VAT_BOX_ORDER = [
    "1a", "1b", "1c", "1d", "2a", "3a", "3b", "3c", "4a", "4b",
    "5a", "5b", "5c", "5d", "5e", "5f", "5g",
]


def _money(value: Decimal) -> str:
    amount = value if isinstance(value, Decimal) else Decimal(str(value))
    return f"€ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def generate_vat_overview_pdf(administration: Administration, report: BTWAangifteReport) -> bytes:
    """Generate PDF bytes for VAT overview."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=f"BTW overzicht {report.period_name}")
    styles = getSampleStyleSheet()
    items = []

    items.append(Paragraph("BTW-overzicht (handmatige aangifte)", styles["Title"]))
    items.append(Paragraph(f"Bedrijf: {administration.name}", styles["Normal"]))
    if administration.kvk_number:
        items.append(Paragraph(f"KVK: {administration.kvk_number}", styles["Normal"]))
    if administration.btw_number:
        items.append(Paragraph(f"BTW-id: {administration.btw_number}", styles["Normal"]))
    items.append(Paragraph(f"Periode: {report.period_name} ({report.start_date} t/m {report.end_date})", styles["Normal"]))
    items.append(Paragraph(f"Gegenereerd: {datetime.now().strftime('%d-%m-%Y %H:%M')}", styles["Normal"]))
    items.append(Spacer(1, 12))

    rubriek_rows = [["Rubriek", "Omschrijving", "Omzet", "BTW"]]
    for code in VAT_BOX_ORDER:
      box = report.boxes.get(code)
      if not box:
          rubriek_rows.append([code, "-", _money(Decimal("0.00")), _money(Decimal("0.00"))])
      else:
          rubriek_rows.append([code, box.box_name, _money(box.turnover_amount), _money(box.vat_amount)])

    rubriek_table = Table(rubriek_rows, colWidths=[55, 245, 110, 110])
    rubriek_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    items.append(rubriek_table)
    items.append(Spacer(1, 12))

    items.append(Paragraph(f"Te betalen / te ontvangen (5g): {_money(report.net_vat)}", styles["Heading3"]))

    icp_rows = [["BTW-nummer", "Land", "Naam", "Bedrag"]]
    for entry in report.icp_entries:
        icp_rows.append([
            entry.customer_vat_number,
            entry.country_code,
            entry.customer_name or "-",
            _money(entry.taxable_base),
        ])
    if len(icp_rows) == 1:
        icp_rows.append(["-", "-", "Geen ICP transacties", _money(Decimal("0.00"))])

    icp_table = Table(icp_rows, colWidths=[130, 60, 220, 110])
    icp_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
    ]))
    items.append(Spacer(1, 8))
    items.append(Paragraph("ICP-overzicht", styles["Heading3"]))
    items.append(icp_table)
    items.append(Spacer(1, 8))

    items.append(Paragraph("Validatie", styles["Heading3"]))
    if report.anomalies:
        for anomaly in report.anomalies[:25]:
            items.append(Paragraph(f"• [{anomaly.severity}] {anomaly.title} — {anomaly.description}", styles["Normal"]))
    else:
        items.append(Paragraph("Geen afwijkingen gevonden.", styles["Normal"]))

    doc.build(items)
    return buffer.getvalue()
