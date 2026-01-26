"""
VAT Report Service (BTW Aangifte Generator)

Generates Dutch VAT returns (BTW aangifte) with:
- VAT return boxes mapping (Dutch format)
- Anomaly detection for accountant review
- ICP (Intra-Community) supplies listing
- Period integration with snapshots

All operations are:
- Multi-tenant: always scoped by administration_id
- Deterministic: same input produces same output
- Testable: pure calculations where possible
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ledger import (
    AccountingPeriod, 
    PeriodStatus, 
    JournalEntry, 
    JournalLine, 
    JournalEntryStatus,
)
from app.models.accounting import VatCode, VatCategory
from app.models.subledger import Party


class VatReportError(Exception):
    """Base exception for VAT report operations."""
    pass


class PeriodNotEligibleError(VatReportError):
    """Raised when period status doesn't allow VAT report generation."""
    pass


@dataclass
class VatBoxAmount:
    """Amount for a single VAT return box."""
    box_code: str
    box_name: str
    turnover_amount: Decimal = Decimal("0.00")
    vat_amount: Decimal = Decimal("0.00")
    transaction_count: int = 0


@dataclass
class VatAnomaly:
    """VAT anomaly detected during validation."""
    id: str
    code: str
    severity: str  # RED or YELLOW
    title: str
    description: str
    journal_entry_id: Optional[uuid.UUID] = None
    journal_line_id: Optional[uuid.UUID] = None
    document_id: Optional[uuid.UUID] = None
    suggested_fix: Optional[str] = None
    amount_discrepancy: Optional[Decimal] = None


@dataclass
class VatCodeSummary:
    """Summary totals for a single VAT code."""
    vat_code_id: uuid.UUID
    vat_code: str
    vat_code_name: str
    vat_rate: Decimal
    category: str
    base_amount: Decimal = Decimal("0.00")
    vat_amount: Decimal = Decimal("0.00")
    transaction_count: int = 0


@dataclass
class ICPEntry:
    """Single ICP (Intra-Community) supplies entry."""
    customer_vat_number: str
    country_code: str
    customer_name: Optional[str]
    customer_id: Optional[uuid.UUID]
    taxable_base: Decimal = Decimal("0.00")
    transaction_count: int = 0


@dataclass
class BTWAangifteReport:
    """
    Complete Dutch VAT return (BTW Aangifte) report.
    
    Box structure follows Dutch Belastingdienst format:
    - 1a: Leveringen/diensten belast met hoog tarief
    - 1b: Leveringen/diensten belast met laag tarief
    - 1c: Leveringen/diensten belast met ander tarief
    - 1d: Privégebruik
    - 1e: Leveringen/diensten belast met 0% of niet bij u belast
    - 2a: Verwerving uit landen binnen de EU
    - 3a: Leveringen naar landen binnen de EU
    - 3b: Leveringen naar/diensten in landen binnen de EU
    - 4a: Verlegde btw binnen de EU - diensten
    - 4b: Verlegde btw - overig
    - 5a: Verschuldigde btw (subtotaal)
    - 5b: Voorbelasting
    - 5c: Subtotaal
    - 5d: Vermindering volgens kleineondernemersregeling
    - 5e: Schatting vorige tijdvak(ken)
    - 5f: Schatting dit tijdvak
    - 5g: Totaal te betalen / te ontvangen
    """
    period_id: uuid.UUID
    period_name: str
    start_date: date
    end_date: date
    generated_at: datetime
    
    # VAT boxes
    boxes: Dict[str, VatBoxAmount] = field(default_factory=dict)
    
    # Summaries
    vat_code_summaries: List[VatCodeSummary] = field(default_factory=list)
    
    # Totals
    total_turnover: Decimal = Decimal("0.00")
    total_vat_payable: Decimal = Decimal("0.00")
    total_vat_receivable: Decimal = Decimal("0.00")
    net_vat: Decimal = Decimal("0.00")
    
    # Validation
    anomalies: List[VatAnomaly] = field(default_factory=list)
    has_red_anomalies: bool = False
    has_yellow_anomalies: bool = False
    
    # ICP
    icp_entries: List[ICPEntry] = field(default_factory=list)
    total_icp_supplies: Decimal = Decimal("0.00")


# Dutch VAT box definitions
DUTCH_VAT_BOXES = {
    "1a": "Leveringen/diensten belast met hoog tarief (21%)",
    "1b": "Leveringen/diensten belast met laag tarief (9%)",
    "1c": "Leveringen/diensten belast met ander tarief",
    "1d": "Privégebruik",
    "1e": "Leveringen/diensten belast met 0% of niet bij u belast",
    "2a": "Verwerving uit landen binnen de EU",
    "3a": "Leveringen naar landen buiten de EU",
    "3b": "Leveringen naar/diensten in landen binnen de EU",
    "4a": "Verlegde btw - diensten uit EU",
    "4b": "Verlegde btw - overig",
    "5a": "Verschuldigde btw (subtotaal)",
    "5b": "Voorbelasting",
    "5c": "Subtotaal (5a - 5b)",
    "5d": "Vermindering KOR",
    "5e": "Schatting vorige tijdvak(ken)",
    "5f": "Schatting dit tijdvak",
    "5g": "Totaal te betalen / te ontvangen",
}


class VatReportService:
    """
    Service for generating Dutch VAT returns (BTW Aangifte).
    
    Key features:
    - Box mapping according to Dutch Belastingdienst format
    - VAT code aggregation and validation
    - Anomaly detection
    - ICP (Intra-Community) supplies extraction
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def generate_vat_report(
        self,
        period_id: uuid.UUID,
        allow_draft: bool = False,
    ) -> BTWAangifteReport:
        """
        Generate a complete BTW Aangifte report for a period.
        
        Args:
            period_id: The accounting period ID
            allow_draft: If True, generate even for OPEN periods (for preview)
            
        Returns:
            BTWAangifteReport with all VAT data
            
        Raises:
            PeriodNotEligibleError: If period status doesn't allow report
        """
        # Get period
        period = await self._get_period(period_id)
        
        # Check period eligibility
        if not allow_draft and period.status == PeriodStatus.OPEN:
            raise PeriodNotEligibleError(
                f"Period '{period.name}' is OPEN. VAT report can only be generated "
                f"for REVIEW, FINALIZED, or LOCKED periods."
            )
        
        # Initialize report
        report = BTWAangifteReport(
            period_id=period.id,
            period_name=period.name,
            start_date=period.start_date,
            end_date=period.end_date,
            generated_at=datetime.now(timezone.utc),
        )
        
        # Initialize all boxes
        for box_code, box_name in DUTCH_VAT_BOXES.items():
            report.boxes[box_code] = VatBoxAmount(
                box_code=box_code,
                box_name=box_name,
            )
        
        # Get all posted journal lines with VAT codes for the period
        vat_lines = await self._get_vat_lines_for_period(period)
        
        # Get all VAT codes
        vat_codes = await self._get_vat_codes()
        vat_code_map = {vc.id: vc for vc in vat_codes}
        
        # Process lines and aggregate by VAT code
        code_aggregates: Dict[uuid.UUID, VatCodeSummary] = {}
        
        for line, entry in vat_lines:
            if not line.vat_code_id:
                continue
                
            vat_code = vat_code_map.get(line.vat_code_id)
            if not vat_code:
                continue
            
            # Aggregate by VAT code
            if line.vat_code_id not in code_aggregates:
                code_aggregates[line.vat_code_id] = VatCodeSummary(
                    vat_code_id=vat_code.id,
                    vat_code=vat_code.code,
                    vat_code_name=vat_code.name,
                    vat_rate=vat_code.rate,
                    category=vat_code.category.value,
                )
            
            agg = code_aggregates[line.vat_code_id]
            
            # Add base amount
            base = line.vat_base_amount or line.taxable_amount or Decimal("0.00")
            vat = line.vat_amount or Decimal("0.00")
            
            # Determine sign based on debit/credit
            if line.credit_amount > 0:
                # Credit = revenue/liability increase
                agg.base_amount += base
                agg.vat_amount += vat
            else:
                # Debit = expense/asset increase or revenue decrease
                # For purchases, the VAT is on debit side
                if vat_code.category == VatCategory.PURCHASES:
                    agg.base_amount += base
                    agg.vat_amount += vat
                elif vat_code.category == VatCategory.REVERSE_CHARGE:
                    # Reverse charge: both sides
                    agg.base_amount += base
                    agg.vat_amount += vat
            
            agg.transaction_count += 1
            
            # Map to VAT boxes
            self._map_to_vat_box(report, vat_code, base, vat, line.vat_is_reverse_charge)
        
        # Set summaries
        report.vat_code_summaries = list(code_aggregates.values())
        
        # Calculate totals
        self._calculate_totals(report)
        
        # Get ICP entries
        report.icp_entries = await self._get_icp_entries(period)
        report.total_icp_supplies = sum(e.taxable_base for e in report.icp_entries)
        
        # Run validation
        report.anomalies = await self._validate_vat_data(period, vat_lines, vat_code_map)
        report.has_red_anomalies = any(a.severity == "RED" for a in report.anomalies)
        report.has_yellow_anomalies = any(a.severity == "YELLOW" for a in report.anomalies)
        
        return report
    
    async def validate_vat_return(
        self,
        period_id: uuid.UUID,
    ) -> List[VatAnomaly]:
        """
        Validate VAT data and return list of anomalies.
        
        Args:
            period_id: The accounting period ID
            
        Returns:
            List of VAT anomalies
        """
        period = await self._get_period(period_id)
        vat_lines = await self._get_vat_lines_for_period(period)
        vat_codes = await self._get_vat_codes()
        vat_code_map = {vc.id: vc for vc in vat_codes}
        
        return await self._validate_vat_data(period, vat_lines, vat_code_map)
    
    async def get_icp_report(
        self,
        period_id: uuid.UUID,
    ) -> List[ICPEntry]:
        """
        Get ICP (Intra-Community) supplies report for a period.
        
        Args:
            period_id: The accounting period ID
            
        Returns:
            List of ICP entries grouped by customer VAT number
        """
        period = await self._get_period(period_id)
        return await self._get_icp_entries(period)
    
    def report_to_dict(self, report: BTWAangifteReport) -> Dict[str, Any]:
        """Convert report to dictionary for JSON serialization."""
        return {
            "period_id": str(report.period_id),
            "period_name": report.period_name,
            "start_date": report.start_date.isoformat(),
            "end_date": report.end_date.isoformat(),
            "generated_at": report.generated_at.isoformat(),
            "boxes": {
                code: {
                    "box_code": box.box_code,
                    "box_name": box.box_name,
                    "turnover_amount": str(box.turnover_amount),
                    "vat_amount": str(box.vat_amount),
                    "transaction_count": box.transaction_count,
                }
                for code, box in report.boxes.items()
            },
            "vat_code_summaries": [
                {
                    "vat_code_id": str(s.vat_code_id),
                    "vat_code": s.vat_code,
                    "vat_code_name": s.vat_code_name,
                    "vat_rate": str(s.vat_rate),
                    "category": s.category,
                    "base_amount": str(s.base_amount),
                    "vat_amount": str(s.vat_amount),
                    "transaction_count": s.transaction_count,
                }
                for s in report.vat_code_summaries
            ],
            "total_turnover": str(report.total_turnover),
            "total_vat_payable": str(report.total_vat_payable),
            "total_vat_receivable": str(report.total_vat_receivable),
            "net_vat": str(report.net_vat),
            "anomalies": [
                {
                    "id": a.id,
                    "code": a.code,
                    "severity": a.severity,
                    "title": a.title,
                    "description": a.description,
                    "journal_entry_id": str(a.journal_entry_id) if a.journal_entry_id else None,
                    "journal_line_id": str(a.journal_line_id) if a.journal_line_id else None,
                    "document_id": str(a.document_id) if a.document_id else None,
                    "suggested_fix": a.suggested_fix,
                    "amount_discrepancy": str(a.amount_discrepancy) if a.amount_discrepancy else None,
                }
                for a in report.anomalies
            ],
            "has_red_anomalies": report.has_red_anomalies,
            "has_yellow_anomalies": report.has_yellow_anomalies,
            "icp_entries": [
                {
                    "customer_vat_number": e.customer_vat_number,
                    "country_code": e.country_code,
                    "customer_name": e.customer_name,
                    "customer_id": str(e.customer_id) if e.customer_id else None,
                    "taxable_base": str(e.taxable_base),
                    "transaction_count": e.transaction_count,
                }
                for e in report.icp_entries
            ],
            "total_icp_supplies": str(report.total_icp_supplies),
        }
    
    async def _get_period(self, period_id: uuid.UUID) -> AccountingPeriod:
        """Get period by ID with validation."""
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.id == period_id)
            .where(AccountingPeriod.administration_id == self.administration_id)
        )
        period = result.scalar_one_or_none()
        
        if not period:
            raise VatReportError(f"Period {period_id} not found")
        
        return period
    
    async def _get_vat_codes(self) -> List[VatCode]:
        """Get all active VAT codes."""
        result = await self.db.execute(
            select(VatCode)
            .where(VatCode.is_active == True)
            .order_by(VatCode.code)
        )
        return list(result.scalars().all())
    
    async def _get_vat_lines_for_period(
        self,
        period: AccountingPeriod,
    ) -> List[Tuple[JournalLine, JournalEntry]]:
        """Get all journal lines with VAT codes for a period."""
        result = await self.db.execute(
            select(JournalLine, JournalEntry)
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(JournalEntry.administration_id == self.administration_id)
            .where(JournalEntry.status == JournalEntryStatus.POSTED)
            .where(JournalEntry.entry_date >= period.start_date)
            .where(JournalEntry.entry_date <= period.end_date)
            .where(JournalLine.vat_code_id.isnot(None))
            .order_by(JournalEntry.entry_date, JournalLine.line_number)
        )
        return list(result.all())
    
    def _map_to_vat_box(
        self,
        report: BTWAangifteReport,
        vat_code: VatCode,
        base_amount: Decimal,
        vat_amount: Decimal,
        is_reverse_charge: bool,
    ) -> None:
        """Map VAT amounts to the correct Dutch VAT return boxes."""
        box_mapping = vat_code.box_mapping or {}
        
        # Get target boxes from mapping
        turnover_box = box_mapping.get("turnover_box")
        vat_box = box_mapping.get("vat_box")
        deductible_box = box_mapping.get("deductible_box")
        
        # Map turnover
        if turnover_box and turnover_box in report.boxes:
            report.boxes[turnover_box].turnover_amount += base_amount
            report.boxes[turnover_box].transaction_count += 1
        
        # Map VAT payable
        if vat_box and vat_box in report.boxes:
            report.boxes[vat_box].vat_amount += vat_amount
        
        # Map deductible VAT (for purchases/reverse charge)
        if deductible_box and deductible_box in report.boxes:
            report.boxes[deductible_box].vat_amount += vat_amount
        
        # Category-specific handling
        if vat_code.category == VatCategory.SALES:
            if vat_code.rate == Decimal("21.00"):
                if "1a" not in (turnover_box, vat_box):
                    report.boxes["1a"].turnover_amount += base_amount
                    report.boxes["1a"].vat_amount += vat_amount
            elif vat_code.rate == Decimal("9.00"):
                if "1b" not in (turnover_box, vat_box):
                    report.boxes["1b"].turnover_amount += base_amount
                    report.boxes["1b"].vat_amount += vat_amount
        
        elif vat_code.category == VatCategory.PURCHASES:
            # Input VAT goes to box 5b
            if not deductible_box:
                report.boxes["5b"].vat_amount += vat_amount
        
        elif vat_code.category == VatCategory.ZERO_RATE or vat_code.category == VatCategory.EXEMPT:
            if "1e" not in (turnover_box,):
                report.boxes["1e"].turnover_amount += base_amount
        
        elif vat_code.category == VatCategory.INTRA_EU:
            if vat_code.is_icp:
                # ICP supplies go to 3b
                report.boxes["3b"].turnover_amount += base_amount
    
    def _calculate_totals(self, report: BTWAangifteReport) -> None:
        """Calculate total amounts for the report."""
        # Total turnover from boxes 1a-1e, 2a, 3a, 3b
        turnover_boxes = ["1a", "1b", "1c", "1d", "1e", "3a", "3b"]
        report.total_turnover = sum(
            report.boxes[b].turnover_amount 
            for b in turnover_boxes 
            if b in report.boxes
        )
        
        # VAT payable: boxes 1a, 1b, 1c, 1d, 2a, 4a, 4b
        payable_boxes = ["1a", "1b", "1c", "1d", "2a", "4a", "4b"]
        report.total_vat_payable = sum(
            report.boxes[b].vat_amount 
            for b in payable_boxes 
            if b in report.boxes
        )
        
        # Set box 5a (subtotal payable)
        report.boxes["5a"].vat_amount = report.total_vat_payable
        
        # VAT receivable: box 5b
        report.total_vat_receivable = report.boxes["5b"].vat_amount
        
        # Net VAT: 5a - 5b
        report.net_vat = report.total_vat_payable - report.total_vat_receivable
        report.boxes["5c"].vat_amount = report.net_vat
        report.boxes["5g"].vat_amount = report.net_vat
    
    async def _get_icp_entries(
        self,
        period: AccountingPeriod,
    ) -> List[ICPEntry]:
        """Extract ICP (Intra-Community) supplies for the period."""
        # Get ICP VAT codes
        icp_codes_result = await self.db.execute(
            select(VatCode)
            .where(VatCode.is_icp == True)
            .where(VatCode.is_active == True)
        )
        icp_codes = list(icp_codes_result.scalars().all())
        icp_code_ids = [vc.id for vc in icp_codes]
        
        if not icp_code_ids:
            return []
        
        # Get ICP lines with customer VAT numbers
        result = await self.db.execute(
            select(JournalLine, JournalEntry)
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(JournalEntry.administration_id == self.administration_id)
            .where(JournalEntry.status == JournalEntryStatus.POSTED)
            .where(JournalEntry.entry_date >= period.start_date)
            .where(JournalEntry.entry_date <= period.end_date)
            .where(JournalLine.vat_code_id.in_(icp_code_ids))
            .where(JournalLine.party_vat_number.isnot(None))
        )
        lines = list(result.all())
        
        # Aggregate by customer VAT number
        icp_aggregates: Dict[str, ICPEntry] = {}
        
        for line, entry in lines:
            vat_number = line.party_vat_number
            if not vat_number:
                continue
            
            # Extract country code from VAT number
            country_code = vat_number[:2] if len(vat_number) >= 2 else "XX"
            
            if vat_number not in icp_aggregates:
                # Try to get customer name
                customer_name = None
                if line.party_id:
                    party_result = await self.db.execute(
                        select(Party).where(Party.id == line.party_id)
                    )
                    party = party_result.scalar_one_or_none()
                    if party:
                        customer_name = party.name
                
                icp_aggregates[vat_number] = ICPEntry(
                    customer_vat_number=vat_number,
                    country_code=country_code,
                    customer_name=customer_name,
                    customer_id=line.party_id,
                )
            
            # Add to totals (use credit amount for revenue)
            base = line.vat_base_amount or line.credit_amount or Decimal("0.00")
            icp_aggregates[vat_number].taxable_base += base
            icp_aggregates[vat_number].transaction_count += 1
        
        return list(icp_aggregates.values())
    
    async def _validate_vat_data(
        self,
        period: AccountingPeriod,
        vat_lines: List[Tuple[JournalLine, JournalEntry]],
        vat_code_map: Dict[uuid.UUID, VatCode],
    ) -> List[VatAnomaly]:
        """Validate VAT data and return list of anomalies."""
        anomalies = []
        anomaly_counter = 0
        
        for line, entry in vat_lines:
            vat_code = vat_code_map.get(line.vat_code_id) if line.vat_code_id else None
            
            # Check 1: VAT base without VAT amount
            if line.vat_base_amount and not line.vat_amount:
                if vat_code and vat_code.rate > 0 and not vat_code.is_icp:
                    anomaly_counter += 1
                    anomalies.append(VatAnomaly(
                        id=f"VAT_ANOMALY_{anomaly_counter:04d}",
                        code="VAT_BASE_NO_AMOUNT",
                        severity="YELLOW",
                        title="VAT base amount without VAT amount",
                        description=(
                            f"Line has VAT base of €{line.vat_base_amount} but no VAT amount. "
                            f"Expected VAT at {vat_code.rate}%."
                        ),
                        journal_entry_id=entry.id,
                        journal_line_id=line.id,
                        document_id=entry.document_id,
                        suggested_fix=f"Add VAT amount or change to zero-rate code",
                    ))
            
            # Check 2: VAT amount without VAT base
            if line.vat_amount and not line.vat_base_amount and not line.taxable_amount:
                anomaly_counter += 1
                anomalies.append(VatAnomaly(
                    id=f"VAT_ANOMALY_{anomaly_counter:04d}",
                    code="VAT_AMOUNT_NO_BASE",
                    severity="YELLOW",
                    title="VAT amount without base amount",
                    description=(
                        f"Line has VAT amount of €{line.vat_amount} but no base amount."
                    ),
                    journal_entry_id=entry.id,
                    journal_line_id=line.id,
                    document_id=entry.document_id,
                    suggested_fix="Add VAT base amount",
                ))
            
            # Check 3: Inconsistent VAT rate
            if vat_code and line.vat_base_amount and line.vat_amount:
                expected_vat = (line.vat_base_amount * vat_code.rate / Decimal("100")).quantize(Decimal("0.01"))
                tolerance = Decimal("0.10")  # 10 cents tolerance
                difference = abs(line.vat_amount - expected_vat)
                
                if difference > tolerance:
                    anomaly_counter += 1
                    anomalies.append(VatAnomaly(
                        id=f"VAT_ANOMALY_{anomaly_counter:04d}",
                        code="VAT_RATE_MISMATCH",
                        severity="YELLOW" if difference < Decimal("5.00") else "RED",
                        title="VAT rate mismatch",
                        description=(
                            f"VAT amount €{line.vat_amount} doesn't match expected "
                            f"€{expected_vat} for base €{line.vat_base_amount} at {vat_code.rate}%."
                        ),
                        journal_entry_id=entry.id,
                        journal_line_id=line.id,
                        document_id=entry.document_id,
                        suggested_fix="Verify VAT calculation or correct the rate",
                        amount_discrepancy=difference,
                    ))
            
            # Check 4: ICP without customer VAT number
            if vat_code and vat_code.is_icp and not line.party_vat_number:
                anomaly_counter += 1
                anomalies.append(VatAnomaly(
                    id=f"VAT_ANOMALY_{anomaly_counter:04d}",
                    code="ICP_NO_VAT_NUMBER",
                    severity="RED",
                    title="ICP supply without customer VAT number",
                    description=(
                        f"ICP supply coded as {vat_code.code} but customer VAT number is missing. "
                        f"ICP reporting requires customer VAT number."
                    ),
                    journal_entry_id=entry.id,
                    journal_line_id=line.id,
                    document_id=entry.document_id,
                    suggested_fix="Add customer VAT number or reclassify transaction",
                ))
            
            # Check 5: Reverse charge without country
            if vat_code and vat_code.is_reverse_charge and not line.vat_country:
                anomaly_counter += 1
                anomalies.append(VatAnomaly(
                    id=f"VAT_ANOMALY_{anomaly_counter:04d}",
                    code="RC_NO_COUNTRY",
                    severity="YELLOW",
                    title="Reverse charge without country",
                    description=(
                        f"Reverse charge transaction coded as {vat_code.code} "
                        f"but supplier country is not specified."
                    ),
                    journal_entry_id=entry.id,
                    journal_line_id=line.id,
                    document_id=entry.document_id,
                    suggested_fix="Add supplier country code",
                ))
            
            # Check 6: Negative VAT amount (unexpected)
            if line.vat_amount and line.vat_amount < 0:
                # Check if this is a credit note/reversal
                is_expected = entry.source_type in ("CREDIT_NOTE", "REVERSAL")
                if not is_expected:
                    anomaly_counter += 1
                    anomalies.append(VatAnomaly(
                        id=f"VAT_ANOMALY_{anomaly_counter:04d}",
                        code="VAT_NEGATIVE_UNEXPECTED",
                        severity="YELLOW",
                        title="Unexpected negative VAT amount",
                        description=(
                            f"Negative VAT amount €{line.vat_amount} on non-credit transaction."
                        ),
                        journal_entry_id=entry.id,
                        journal_line_id=line.id,
                        document_id=entry.document_id,
                        suggested_fix="Verify transaction type or correct VAT amount",
                    ))
        
        return anomalies
