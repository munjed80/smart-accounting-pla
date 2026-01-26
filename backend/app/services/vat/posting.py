"""
VAT Posting Service

Implements VAT posting rules for double-entry accounting:
- Sales VAT: revenue + VAT payable
- Purchase VAT: expense/asset + VAT receivable
- Reverse charge: VAT payable and VAT receivable (net zero)

All operations are:
- Transactional: uses DB transactions
- Multi-tenant: always scoped by administration_id
- Compliant: follows Dutch BTW rules
"""
import uuid
from datetime import date
from decimal import Decimal
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting import VatCode, VatCategory, ChartOfAccount
from app.models.ledger import JournalEntry, JournalLine, JournalEntryStatus


class VatPostingError(Exception):
    """Base exception for VAT posting operations."""
    pass


@dataclass
class VatLineData:
    """Data for a VAT-related journal line."""
    account_id: uuid.UUID
    description: str
    debit_amount: Decimal
    credit_amount: Decimal
    vat_code_id: Optional[uuid.UUID] = None
    vat_amount: Optional[Decimal] = None
    vat_base_amount: Optional[Decimal] = None
    vat_country: Optional[str] = None
    vat_is_reverse_charge: bool = False
    party_type: Optional[str] = None
    party_id: Optional[uuid.UUID] = None
    party_vat_number: Optional[str] = None


@dataclass
class VatPostingResult:
    """Result of VAT posting calculation."""
    lines: List[VatLineData]
    total_vat_payable: Decimal
    total_vat_receivable: Decimal
    net_vat: Decimal
    is_reverse_charge: bool = False
    is_icp: bool = False


class VatPostingService:
    """
    Service for VAT posting rules.
    
    Handles:
    - VAT calculation and posting for sales/purchases
    - Reverse charge mechanism (net-zero VAT)
    - ICP supplies classification
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def get_vat_code(self, vat_code_id: uuid.UUID) -> Optional[VatCode]:
        """Get a VAT code by ID."""
        result = await self.db.execute(
            select(VatCode).where(VatCode.id == vat_code_id)
        )
        return result.scalar_one_or_none()
    
    async def get_vat_code_by_code(self, code: str) -> Optional[VatCode]:
        """Get a VAT code by its code string."""
        result = await self.db.execute(
            select(VatCode).where(VatCode.code == code)
        )
        return result.scalar_one_or_none()
    
    def calculate_vat_amount(
        self,
        base_amount: Decimal,
        vat_rate: Decimal
    ) -> Decimal:
        """
        Calculate VAT amount from base amount and rate.
        
        Args:
            base_amount: The base/net amount
            vat_rate: VAT rate as percentage (e.g., 21.00 for 21%)
            
        Returns:
            VAT amount rounded to 2 decimal places
        """
        vat_amount = (base_amount * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        return vat_amount
    
    def extract_base_from_gross(
        self,
        gross_amount: Decimal,
        vat_rate: Decimal
    ) -> Tuple[Decimal, Decimal]:
        """
        Extract base amount and VAT from gross amount.
        
        Args:
            gross_amount: The gross amount (base + VAT)
            vat_rate: VAT rate as percentage (e.g., 21.00 for 21%)
            
        Returns:
            Tuple of (base_amount, vat_amount)
        """
        divisor = Decimal("1") + (vat_rate / Decimal("100"))
        base_amount = (gross_amount / divisor).quantize(Decimal("0.01"))
        vat_amount = gross_amount - base_amount
        return base_amount, vat_amount
    
    async def create_sales_vat_posting(
        self,
        revenue_account_id: uuid.UUID,
        receivable_account_id: uuid.UUID,
        vat_payable_account_id: uuid.UUID,
        gross_amount: Decimal,
        vat_code_id: uuid.UUID,
        description: str,
        party_id: Optional[uuid.UUID] = None,
        party_vat_number: Optional[str] = None,
        vat_country: str = "NL",
    ) -> VatPostingResult:
        """
        Create posting lines for a sales transaction with VAT.
        
        Double-entry for sales:
        - Dr Receivable (gross)
        - Cr Revenue (net)
        - Cr VAT Payable (VAT)
        
        Args:
            revenue_account_id: Revenue account for net amount
            receivable_account_id: AR account for gross amount
            vat_payable_account_id: VAT liability account
            gross_amount: Total invoice amount including VAT
            vat_code_id: VAT code to apply
            description: Transaction description
            party_id: Customer ID
            party_vat_number: Customer VAT number (for ICP)
            vat_country: Country code
            
        Returns:
            VatPostingResult with calculated lines
        """
        vat_code = await self.get_vat_code(vat_code_id)
        if not vat_code:
            raise VatPostingError(f"VAT code not found: {vat_code_id}")
        
        base_amount, vat_amount = self.extract_base_from_gross(gross_amount, vat_code.rate)
        
        lines = []
        is_icp = vat_code.is_icp
        
        # For ICP supplies (0% VAT), no VAT posting needed
        if is_icp or vat_code.category == VatCategory.ZERO_RATE:
            vat_amount = Decimal("0.00")
        
        # Dr Receivable (gross amount)
        lines.append(VatLineData(
            account_id=receivable_account_id,
            description=f"Receivable: {description}",
            debit_amount=gross_amount,
            credit_amount=Decimal("0.00"),
            party_type="CUSTOMER",
            party_id=party_id,
            party_vat_number=party_vat_number,
            vat_country=vat_country,
        ))
        
        # Cr Revenue (net amount)
        lines.append(VatLineData(
            account_id=revenue_account_id,
            description=f"Revenue: {description}",
            debit_amount=Decimal("0.00"),
            credit_amount=base_amount,
            vat_code_id=vat_code_id,
            vat_base_amount=base_amount,
            vat_country=vat_country,
        ))
        
        # Cr VAT Payable (VAT amount) - only if VAT > 0
        if vat_amount > 0:
            lines.append(VatLineData(
                account_id=vat_payable_account_id,
                description=f"VAT Payable: {description}",
                debit_amount=Decimal("0.00"),
                credit_amount=vat_amount,
                vat_code_id=vat_code_id,
                vat_amount=vat_amount,
                vat_base_amount=base_amount,
                vat_country=vat_country,
            ))
        
        return VatPostingResult(
            lines=lines,
            total_vat_payable=vat_amount,
            total_vat_receivable=Decimal("0.00"),
            net_vat=vat_amount,
            is_icp=is_icp,
        )
    
    async def create_purchase_vat_posting(
        self,
        expense_account_id: uuid.UUID,
        payable_account_id: uuid.UUID,
        vat_receivable_account_id: uuid.UUID,
        gross_amount: Decimal,
        vat_code_id: uuid.UUID,
        description: str,
        party_id: Optional[uuid.UUID] = None,
        party_vat_number: Optional[str] = None,
        vat_country: str = "NL",
    ) -> VatPostingResult:
        """
        Create posting lines for a purchase transaction with VAT.
        
        Double-entry for purchases:
        - Dr Expense/Asset (net)
        - Dr VAT Receivable (VAT)
        - Cr Payable (gross)
        
        Args:
            expense_account_id: Expense/asset account for net amount
            payable_account_id: AP account for gross amount
            vat_receivable_account_id: VAT asset account
            gross_amount: Total invoice amount including VAT
            vat_code_id: VAT code to apply
            description: Transaction description
            party_id: Supplier ID
            party_vat_number: Supplier VAT number
            vat_country: Country code
            
        Returns:
            VatPostingResult with calculated lines
        """
        vat_code = await self.get_vat_code(vat_code_id)
        if not vat_code:
            raise VatPostingError(f"VAT code not found: {vat_code_id}")
        
        base_amount, vat_amount = self.extract_base_from_gross(gross_amount, vat_code.rate)
        
        lines = []
        is_reverse_charge = vat_code.is_reverse_charge
        
        # Check for reverse charge
        if is_reverse_charge:
            return await self.create_reverse_charge_posting(
                expense_account_id=expense_account_id,
                payable_account_id=payable_account_id,
                vat_payable_account_id=vat_receivable_account_id,  # Same account for simplicity
                vat_receivable_account_id=vat_receivable_account_id,
                base_amount=gross_amount,  # For RC, gross = net (no VAT charged by supplier)
                vat_code_id=vat_code_id,
                description=description,
                party_id=party_id,
                party_vat_number=party_vat_number,
                vat_country=vat_country,
            )
        
        # Dr Expense (net amount)
        lines.append(VatLineData(
            account_id=expense_account_id,
            description=f"Expense: {description}",
            debit_amount=base_amount,
            credit_amount=Decimal("0.00"),
            vat_code_id=vat_code_id,
            vat_base_amount=base_amount,
            vat_country=vat_country,
        ))
        
        # Dr VAT Receivable (VAT amount)
        if vat_amount > 0:
            lines.append(VatLineData(
                account_id=vat_receivable_account_id,
                description=f"VAT Receivable: {description}",
                debit_amount=vat_amount,
                credit_amount=Decimal("0.00"),
                vat_code_id=vat_code_id,
                vat_amount=vat_amount,
                vat_base_amount=base_amount,
                vat_country=vat_country,
            ))
        
        # Cr Payable (gross amount)
        lines.append(VatLineData(
            account_id=payable_account_id,
            description=f"Payable: {description}",
            debit_amount=Decimal("0.00"),
            credit_amount=gross_amount,
            party_type="SUPPLIER",
            party_id=party_id,
            party_vat_number=party_vat_number,
            vat_country=vat_country,
        ))
        
        return VatPostingResult(
            lines=lines,
            total_vat_payable=Decimal("0.00"),
            total_vat_receivable=vat_amount,
            net_vat=-vat_amount,  # Negative because it's recoverable
        )
    
    async def create_reverse_charge_posting(
        self,
        expense_account_id: uuid.UUID,
        payable_account_id: uuid.UUID,
        vat_payable_account_id: uuid.UUID,
        vat_receivable_account_id: uuid.UUID,
        base_amount: Decimal,
        vat_code_id: uuid.UUID,
        description: str,
        party_id: Optional[uuid.UUID] = None,
        party_vat_number: Optional[str] = None,
        vat_country: str = "NL",
    ) -> VatPostingResult:
        """
        Create posting lines for a reverse charge transaction.
        
        Reverse charge results in NET ZERO VAT:
        - Dr Expense (base amount)
        - Cr Payable (base amount)
        - Dr VAT Receivable (calculated VAT)
        - Cr VAT Payable (calculated VAT)
        
        The VAT entries cancel out but must be reported.
        
        Args:
            expense_account_id: Expense/asset account
            payable_account_id: AP account
            vat_payable_account_id: VAT liability account
            vat_receivable_account_id: VAT asset account
            base_amount: Net amount (no VAT charged by supplier)
            vat_code_id: VAT code for reverse charge
            description: Transaction description
            party_id: Supplier ID
            party_vat_number: Supplier VAT number
            vat_country: Country code of supplier
            
        Returns:
            VatPostingResult with reverse charge lines
        """
        vat_code = await self.get_vat_code(vat_code_id)
        if not vat_code:
            raise VatPostingError(f"VAT code not found: {vat_code_id}")
        
        # Calculate VAT at the applicable rate (even though supplier didn't charge it)
        vat_amount = self.calculate_vat_amount(base_amount, vat_code.rate)
        
        lines = []
        
        # Dr Expense (base amount)
        lines.append(VatLineData(
            account_id=expense_account_id,
            description=f"Expense: {description}",
            debit_amount=base_amount,
            credit_amount=Decimal("0.00"),
            vat_code_id=vat_code_id,
            vat_base_amount=base_amount,
            vat_country=vat_country,
            vat_is_reverse_charge=True,
        ))
        
        # Cr Payable (base amount - no VAT)
        lines.append(VatLineData(
            account_id=payable_account_id,
            description=f"Payable: {description}",
            debit_amount=Decimal("0.00"),
            credit_amount=base_amount,
            party_type="SUPPLIER",
            party_id=party_id,
            party_vat_number=party_vat_number,
            vat_country=vat_country,
        ))
        
        # Dr VAT Receivable (calculated VAT - reverse charge)
        lines.append(VatLineData(
            account_id=vat_receivable_account_id,
            description=f"RC VAT Receivable: {description}",
            debit_amount=vat_amount,
            credit_amount=Decimal("0.00"),
            vat_code_id=vat_code_id,
            vat_amount=vat_amount,
            vat_base_amount=base_amount,
            vat_country=vat_country,
            vat_is_reverse_charge=True,
        ))
        
        # Cr VAT Payable (calculated VAT - reverse charge)
        lines.append(VatLineData(
            account_id=vat_payable_account_id,
            description=f"RC VAT Payable: {description}",
            debit_amount=Decimal("0.00"),
            credit_amount=vat_amount,
            vat_code_id=vat_code_id,
            vat_amount=vat_amount,
            vat_base_amount=base_amount,
            vat_country=vat_country,
            vat_is_reverse_charge=True,
        ))
        
        return VatPostingResult(
            lines=lines,
            total_vat_payable=vat_amount,
            total_vat_receivable=vat_amount,
            net_vat=Decimal("0.00"),  # NET ZERO for reverse charge
            is_reverse_charge=True,
        )
    
    async def create_icp_supply_posting(
        self,
        revenue_account_id: uuid.UUID,
        receivable_account_id: uuid.UUID,
        net_amount: Decimal,
        vat_code_id: uuid.UUID,
        description: str,
        party_id: uuid.UUID,
        party_vat_number: str,
        vat_country: str,
    ) -> VatPostingResult:
        """
        Create posting lines for an ICP (Intra-Community) supply.
        
        ICP supplies are at 0% VAT but must be reported separately.
        
        Double-entry for ICP sales:
        - Dr Receivable (net amount)
        - Cr Revenue (net amount)
        - No VAT posting
        
        Args:
            revenue_account_id: Revenue account
            receivable_account_id: AR account
            net_amount: Invoice amount (0% VAT)
            vat_code_id: ICP VAT code
            description: Transaction description
            party_id: Customer ID (required for ICP)
            party_vat_number: Customer VAT number (required for ICP)
            vat_country: Customer country code
            
        Returns:
            VatPostingResult with ICP supply lines
        """
        if not party_vat_number:
            raise VatPostingError("ICP supplies require customer VAT number")
        
        vat_code = await self.get_vat_code(vat_code_id)
        if not vat_code:
            raise VatPostingError(f"VAT code not found: {vat_code_id}")
        
        if not vat_code.is_icp:
            raise VatPostingError(f"VAT code {vat_code.code} is not an ICP code")
        
        lines = []
        
        # Dr Receivable
        lines.append(VatLineData(
            account_id=receivable_account_id,
            description=f"ICP Receivable: {description}",
            debit_amount=net_amount,
            credit_amount=Decimal("0.00"),
            party_type="CUSTOMER",
            party_id=party_id,
            party_vat_number=party_vat_number,
            vat_country=vat_country,
        ))
        
        # Cr Revenue (with ICP marker)
        lines.append(VatLineData(
            account_id=revenue_account_id,
            description=f"ICP Revenue: {description}",
            debit_amount=Decimal("0.00"),
            credit_amount=net_amount,
            vat_code_id=vat_code_id,
            vat_base_amount=net_amount,
            vat_country=vat_country,
            party_vat_number=party_vat_number,
        ))
        
        return VatPostingResult(
            lines=lines,
            total_vat_payable=Decimal("0.00"),
            total_vat_receivable=Decimal("0.00"),
            net_vat=Decimal("0.00"),
            is_icp=True,
        )
    
    def validate_vat_reconciliation(
        self,
        base_amount: Decimal,
        vat_amount: Decimal,
        vat_rate: Decimal,
        tolerance: Decimal = Decimal("0.05"),
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate that VAT amount reconciles with base amount and rate.
        
        Args:
            base_amount: The base/taxable amount
            vat_amount: The VAT amount posted
            vat_rate: VAT rate as percentage
            tolerance: Acceptable rounding difference
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        expected_vat = self.calculate_vat_amount(base_amount, vat_rate)
        difference = abs(vat_amount - expected_vat)
        
        if difference > tolerance:
            return False, (
                f"VAT amount {vat_amount} does not match expected {expected_vat} "
                f"for base {base_amount} at {vat_rate}%. Difference: {difference}"
            )
        
        return True, None
