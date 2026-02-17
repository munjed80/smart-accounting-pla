"""
VAT Box Lineage Service

Populates and queries the VAT box lineage table for audit trail and drilldown reporting.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Dict, Optional, Tuple, Any
from sqlalchemy import select, delete, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ledger import (
    AccountingPeriod,
    JournalEntry,
    JournalLine,
    JournalEntryStatus,
)
from app.models.accounting import VatCode, VatCategory
from app.models.document import Document
from app.models.subledger import Party
from app.models.vat_lineage import VatBoxLineage


class VatLineageService:
    """
    Service for managing VAT box lineage data.
    
    Handles:
    - Population of lineage data during VAT report generation
    - Querying lineage data for drilldown reports
    - Cleanup and refresh of lineage data
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def populate_lineage_for_period(
        self,
        period: AccountingPeriod,
        vat_codes: List[VatCode],
    ) -> int:
        """
        Populate VAT box lineage data for a period.
        
        This method:
        1. Deletes existing lineage data for the period
        2. Queries all posted journal lines with VAT codes
        3. Maps each line to its VAT boxes based on VAT code configuration
        4. Creates lineage records for audit trail
        
        Args:
            period: The accounting period
            vat_codes: List of active VAT codes
            
        Returns:
            Number of lineage records created
        """
        # Build VAT code map
        vat_code_map = {vc.id: vc for vc in vat_codes}
        
        # Delete existing lineage data for this period
        await self.db.execute(
            delete(VatBoxLineage)
            .where(VatBoxLineage.period_id == period.id)
            .where(VatBoxLineage.administration_id == self.administration_id)
        )
        await self.db.flush()
        
        # Get all posted journal lines with VAT codes for the period
        result = await self.db.execute(
            select(JournalLine, JournalEntry)
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .options(selectinload(JournalLine.vat_code))
            .where(JournalEntry.administration_id == self.administration_id)
            .where(JournalEntry.status == JournalEntryStatus.POSTED)
            .where(JournalEntry.period_id == period.id)
            .where(JournalLine.vat_code_id.isnot(None))
            .order_by(JournalEntry.entry_date, JournalLine.line_number)
        )
        vat_lines = list(result.all())
        
        # Create lineage records
        lineage_records = []
        for line, entry in vat_lines:
            vat_code = vat_code_map.get(line.vat_code_id)
            if not vat_code:
                continue
            
            # Calculate amounts
            base_amount = line.vat_base_amount or line.taxable_amount or Decimal("0.00")
            vat_amount = line.vat_amount or Decimal("0.00")
            
            # Determine sign based on debit/credit
            net_amount = base_amount
            if line.credit_amount > 0:
                # Credit side (revenue/liability)
                pass  # Keep positive
            else:
                # Debit side (expense/asset)
                if vat_code.category != VatCategory.PURCHASES:
                    # For non-purchase debits, flip the sign
                    # (e.g., credit notes, returns)
                    net_amount = -base_amount
                    vat_amount = -vat_amount
            
            # Determine source type
            source_type = "JOURNAL_LINE"  # Default
            if entry.source_type:
                # Map entry source types to lineage source types
                source_type_map = {
                    "invoice": "INVOICE_LINE",
                    "expense": "EXPENSE_LINE",
                    "journal": "JOURNAL_LINE",
                    "zzp_invoice": "INVOICE_LINE",
                    "zzp_expense": "EXPENSE_LINE",
                }
                source_type = source_type_map.get(entry.source_type, "JOURNAL_LINE")
            
            # Get party information
            party_id = line.party_id
            party_name = None
            party_vat_number = line.party_vat_number
            
            # Try to load party details if we have a party_id
            if party_id and not party_name:
                party = await self.db.get(Party, party_id)
                if party:
                    party_name = party.name
                    if not party_vat_number:
                        party_vat_number = party.vat_number
            
            # Map to VAT boxes
            box_mappings = self._get_box_mappings_for_line(vat_code, net_amount, vat_amount)
            
            # Create a lineage record for each box mapping
            for box_code, box_net, box_vat in box_mappings:
                lineage = VatBoxLineage(
                    administration_id=self.administration_id,
                    period_id=period.id,
                    vat_box_code=box_code,
                    net_amount=box_net,
                    vat_amount=box_vat,
                    source_type=source_type,
                    source_id=line.id,  # Use journal_line.id as source_id
                    document_id=entry.document_id,
                    journal_entry_id=entry.id,
                    journal_line_id=line.id,
                    vat_code_id=vat_code.id,
                    transaction_date=entry.entry_date,
                    reference=entry.reference,
                    description=line.description or entry.description,
                    party_id=party_id,
                    party_name=party_name,
                    party_vat_number=party_vat_number,
                )
                lineage_records.append(lineage)
        
        # Bulk insert
        if lineage_records:
            self.db.add_all(lineage_records)
            await self.db.flush()
        
        return len(lineage_records)
    
    def _get_box_mappings_for_line(
        self,
        vat_code: VatCode,
        net_amount: Decimal,
        vat_amount: Decimal,
    ) -> List[Tuple[str, Decimal, Decimal]]:
        """
        Get box mappings for a journal line.
        
        Returns a list of tuples: (box_code, net_amount, vat_amount)
        A single line can map to multiple boxes (e.g., reverse charge).
        """
        mappings = []
        box_mapping = vat_code.box_mapping or {}
        
        # Get target boxes from VAT code mapping
        turnover_box = box_mapping.get("turnover_box")
        vat_box = box_mapping.get("vat_box")
        deductible_box = box_mapping.get("deductible_box")
        
        # Map turnover
        if turnover_box:
            mappings.append((turnover_box, net_amount, Decimal("0.00")))
        
        # Map VAT payable
        if vat_box:
            mappings.append((vat_box, Decimal("0.00"), vat_amount))
        
        # Map deductible VAT (for purchases/reverse charge/EU acquisitions)
        if deductible_box:
            mappings.append((deductible_box, Decimal("0.00"), vat_amount))
        
        # Fallback handling when box_mapping is incomplete
        if not mappings:
            # Apply category-specific defaults
            if vat_code.category == VatCategory.SALES:
                if vat_code.rate == Decimal("21.00"):
                    mappings.append(("1a", net_amount, vat_amount))
                elif vat_code.rate == Decimal("9.00"):
                    mappings.append(("1b", net_amount, vat_amount))
                else:
                    mappings.append(("1c", net_amount, vat_amount))
            
            elif vat_code.category == VatCategory.PURCHASES:
                # Input VAT goes to box 5b
                mappings.append(("5b", Decimal("0.00"), vat_amount))
            
            elif vat_code.category in (VatCategory.ZERO_RATE, VatCategory.EXEMPT):
                mappings.append(("1e", net_amount, Decimal("0.00")))
            
            elif vat_code.category == VatCategory.INTRA_EU and vat_code.is_icp:
                # ICP supplies go to 3b
                mappings.append(("3b", net_amount, Decimal("0.00")))
        
        return mappings
    
    async def get_box_totals(
        self,
        period_id: uuid.UUID,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get aggregated totals for each VAT box in a period.
        
        Returns:
            Dict mapping box_code to totals dict with net_amount, vat_amount, line_count
        """
        result = await self.db.execute(
            select(
                VatBoxLineage.vat_box_code,
                func.sum(VatBoxLineage.net_amount).label('total_net'),
                func.sum(VatBoxLineage.vat_amount).label('total_vat'),
                func.count(VatBoxLineage.id).label('line_count'),
            )
            .where(VatBoxLineage.period_id == period_id)
            .where(VatBoxLineage.administration_id == self.administration_id)
            .group_by(VatBoxLineage.vat_box_code)
        )
        
        totals = {}
        for row in result.all():
            totals[row.vat_box_code] = {
                'net_amount': row.total_net or Decimal("0.00"),
                'vat_amount': row.total_vat or Decimal("0.00"),
                'line_count': row.line_count,
            }
        
        return totals
    
    async def get_box_lines(
        self,
        period_id: uuid.UUID,
        box_code: str,
        limit: int = 100,
        offset: int = 0,
        source_type: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> Tuple[List[VatBoxLineage], int]:
        """
        Get drilldown lines for a specific VAT box.
        
        Returns:
            Tuple of (list of lineage records, total count)
        """
        # Build query
        query = (
            select(VatBoxLineage)
            .where(VatBoxLineage.period_id == period_id)
            .where(VatBoxLineage.administration_id == self.administration_id)
            .where(VatBoxLineage.vat_box_code == box_code)
        )
        
        # Apply filters
        if source_type:
            query = query.where(VatBoxLineage.source_type == source_type)
        
        if from_date:
            query = query.where(VatBoxLineage.transaction_date >= from_date)
        
        if to_date:
            query = query.where(VatBoxLineage.transaction_date <= to_date)
        
        # Get total count
        count_result = await self.db.execute(
            select(func.count(VatBoxLineage.id)).select_from(query.subquery())
        )
        total_count = count_result.scalar() or 0
        
        # Get paginated results
        query = query.order_by(
            VatBoxLineage.transaction_date.desc(),
            VatBoxLineage.created_at.desc()
        ).limit(limit).offset(offset)
        
        result = await self.db.execute(query)
        lines = list(result.scalars().all())
        
        return lines, total_count
    
    async def get_document_references(
        self,
        period_id: uuid.UUID,
    ) -> List[Dict[str, Any]]:
        """
        Get list of all documents referenced in the lineage for a period.
        
        Returns list of dicts with document_id, count, and total amounts.
        """
        result = await self.db.execute(
            select(
                VatBoxLineage.document_id,
                func.count(VatBoxLineage.id).label('line_count'),
                func.sum(VatBoxLineage.net_amount).label('total_net'),
                func.sum(VatBoxLineage.vat_amount).label('total_vat'),
            )
            .where(VatBoxLineage.period_id == period_id)
            .where(VatBoxLineage.administration_id == self.administration_id)
            .where(VatBoxLineage.document_id.isnot(None))
            .group_by(VatBoxLineage.document_id)
            .order_by(func.count(VatBoxLineage.id).desc())
        )
        
        docs = []
        for row in result.all():
            docs.append({
                'document_id': row.document_id,
                'line_count': row.line_count,
                'total_net': row.total_net or Decimal("0.00"),
                'total_vat': row.total_vat or Decimal("0.00"),
            })
        
        return docs
