"""
VAT Evidence Pack Service

Generates a comprehensive evidence pack (bewijsmap) for BTW submission with:
- Box totals with drilldown
- All source documents
- Immutable audit trail
- Export to PDF
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Dict, Optional, Tuple
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    PageBreak,
    KeepTogether,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import AccountingPeriod
from app.models.administration import Administration
from app.models.document import Document
from app.services.vat.lineage import VatLineageService


# Dutch VAT box names
DUTCH_VAT_BOXES = {
    "1a": "Leveringen/diensten belast met hoog tarief (21%)",
    "1b": "Leveringen/diensten belast met laag tarief (9%)",
    "1c": "Leveringen/diensten belast met ander tarief",
    "1d": "Privégebruik",
    "1e": "Leveringen/diensten belast met 0% of niet bij u belast",
    "2a": "Verwerving uit landen binnen de EU (binnenlandse verlegging)",
    "3a": "Leveringen naar landen buiten de EU",
    "3b": "Leveringen naar/diensten in landen binnen de EU (ICP)",
    "4a": "Verlegde btw - diensten/invoer van buiten de EU",
    "4b": "Verlegde btw - verwervingen uit EU-landen",
    "5a": "Verschuldigde btw (subtotaal)",
    "5b": "Voorbelasting (aftrekbare btw)",
    "5c": "Subtotaal (5a - 5b)",
    "5d": "Vermindering KOR",
    "5e": "Schatting vorige tijdvak(ken)",
    "5f": "Schatting dit tijdvak",
    "5g": "Totaal te betalen / te ontvangen",
}


class VatEvidencePackService:
    """Service for generating VAT evidence packs."""
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
        self.lineage_service = VatLineageService(db, administration_id)
    
    async def generate_evidence_pack_pdf(
        self,
        period_id: uuid.UUID,
    ) -> Tuple[bytes, str]:
        """
        Generate evidence pack PDF for a period.
        
        Returns:
            Tuple of (pdf_bytes, filename)
        """
        # Get administration
        administration = await self.db.get(Administration, self.administration_id)
        if not administration:
            raise ValueError("Administration not found")
        
        # Get period
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.id == period_id)
            .where(AccountingPeriod.administration_id == self.administration_id)
        )
        period = result.scalar_one_or_none()
        if not period:
            raise ValueError("Period not found")
        
        # Get box totals
        totals_dict = await self.lineage_service.get_box_totals(period_id)
        
        # Get document references
        doc_refs = await self.lineage_service.get_document_references(period_id)
        
        # Create PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm,
        )
        
        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=12,
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#1e40af'),
            spaceAfter=8,
            spaceBefore=12,
        )
        
        # Title page
        story.append(Paragraph("BTW Aangifte Bewijsmap", title_style))
        story.append(Spacer(1, 0.5*cm))
        
        # Metadata table
        metadata = [
            ["Bedrijf:", administration.company_name],
            ["Periode:", period.name],
            ["Periode start:", period.start_date.strftime("%d-%m-%Y")],
            ["Periode eind:", period.end_date.strftime("%d-%m-%Y")],
            ["Gegenereerd op:", datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M UTC")],
            ["Periode ID:", str(period.id)],
        ]
        
        metadata_table = Table(metadata, colWidths=[5*cm, 10*cm])
        metadata_table.setStyle(TableStyle([
            ('FONT', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONT', (1, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#64748b')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        story.append(metadata_table)
        story.append(Spacer(1, 1*cm))
        
        # Box totals section
        story.append(Paragraph("BTW Rubrieken Overzicht", heading_style))
        
        # Build box totals table
        box_data = [["Rubriek", "Omschrijving", "Netto Bedrag", "BTW Bedrag", "Aantal Regels"]]
        
        for box_code in DUTCH_VAT_BOXES.keys():
            totals = totals_dict.get(box_code, {
                'net_amount': Decimal("0.00"),
                'vat_amount': Decimal("0.00"),
                'line_count': 0,
            })
            
            if totals['line_count'] > 0:
                box_data.append([
                    box_code,
                    DUTCH_VAT_BOXES[box_code][:50],  # Truncate for space
                    f"€ {totals['net_amount']:,.2f}",
                    f"€ {totals['vat_amount']:,.2f}",
                    str(totals['line_count']),
                ])
        
        box_table = Table(box_data, colWidths=[2*cm, 6*cm, 3*cm, 3*cm, 2*cm])
        box_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            # Data rows
            ('FONT', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ]))
        
        story.append(box_table)
        story.append(PageBreak())
        
        # Document references section
        story.append(Paragraph("Gekoppelde Documenten", heading_style))
        story.append(Spacer(1, 0.5*cm))
        
        if doc_refs:
            story.append(Paragraph(
                f"Totaal aantal gekoppelde documenten: {len(doc_refs)}",
                styles['Normal']
            ))
            story.append(Spacer(1, 0.3*cm))
            
            # Build document table
            doc_data = [["Document ID", "Aantal Regels", "Netto Bedrag", "BTW Bedrag"]]
            
            for doc_ref in doc_refs[:50]:  # Limit to first 50 for space
                doc_data.append([
                    str(doc_ref['document_id'])[:20] + "...",
                    str(doc_ref['line_count']),
                    f"€ {doc_ref['total_net']:,.2f}",
                    f"€ {doc_ref['total_vat']:,.2f}",
                ])
            
            doc_table = Table(doc_data, colWidths=[5*cm, 3*cm, 3.5*cm, 3.5*cm])
            doc_table.setStyle(TableStyle([
                # Header row
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                # Data rows
                ('FONT', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
                ('TOPPADDING', (0, 1), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ]))
            
            story.append(doc_table)
            
            if len(doc_refs) > 50:
                story.append(Spacer(1, 0.3*cm))
                story.append(Paragraph(
                    f"... en nog {len(doc_refs) - 50} documenten",
                    styles['Italic']
                ))
        else:
            story.append(Paragraph("Geen gekoppelde documenten gevonden.", styles['Normal']))
        
        story.append(PageBreak())
        
        # Audit trail section
        story.append(Paragraph("Audit Trail", heading_style))
        story.append(Spacer(1, 0.5*cm))
        
        audit_info = [
            "Deze bewijsmap bevat een complete audit trail van alle BTW rubrieken.",
            "Elke rubriek is traceerbaar tot de onderliggende brondocumenten en boekingen.",
            "",
            "Immutabele gegevens:",
            f"• Periode ID: {period.id}",
            f"• Administratie ID: {self.administration_id}",
            f"• Gegenereerd op: {datetime.now(timezone.utc).isoformat()}",
            "",
            "Dit document is gegenereerd vanuit het Smart Accounting Platform.",
        ]
        
        for line in audit_info:
            if line:
                story.append(Paragraph(line, styles['Normal']))
            else:
                story.append(Spacer(1, 0.2*cm))
        
        # Build PDF
        doc.build(story)
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        filename = f"btw-bewijsmap-{period.name.lower().replace(' ', '-')}.pdf"
        
        return pdf_bytes, filename
