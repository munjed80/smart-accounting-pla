"""
Financial Reports Service

Provides financial reports:
- Balance Sheet (Activa/Passiva)
- Profit & Loss (Winst- en verliesrekening)
- Accounts Receivable (Debiteuren)
- Accounts Payable (Crediteuren)
"""
import uuid
from datetime import date
from decimal import Decimal
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ledger import JournalEntry, JournalLine, JournalEntryStatus
from app.models.accounting import ChartOfAccount
from app.models.subledger import OpenItem, OpenItemStatus, Party


@dataclass
class AccountBalance:
    """Balance for a single account."""
    account_id: uuid.UUID
    account_code: str
    account_name: str
    account_type: str
    debit_total: Decimal = Decimal("0.00")
    credit_total: Decimal = Decimal("0.00")
    balance: Decimal = Decimal("0.00")
    children: List["AccountBalance"] = field(default_factory=list)


@dataclass
class BalanceSheetSection:
    """Section of the balance sheet."""
    name: str
    accounts: List[AccountBalance]
    total: Decimal = Decimal("0.00")


@dataclass
class BalanceSheet:
    """Complete balance sheet report."""
    as_of_date: date
    # Assets (Activa)
    current_assets: BalanceSheetSection
    fixed_assets: BalanceSheetSection
    # Liabilities + Equity (Passiva)
    current_liabilities: BalanceSheetSection
    long_term_liabilities: BalanceSheetSection
    equity: BalanceSheetSection
    # Computed totals (fields with defaults must come last)
    total_assets: Decimal = Decimal("0.00")
    total_liabilities_equity: Decimal = Decimal("0.00")
    is_balanced: bool = False


@dataclass
class PnLSection:
    """Section of the P&L statement."""
    name: str
    accounts: List[AccountBalance]
    total: Decimal = Decimal("0.00")


@dataclass
class ProfitAndLoss:
    """Complete P&L report."""
    start_date: date
    end_date: date
    revenue: PnLSection
    cost_of_goods_sold: PnLSection
    operating_expenses: PnLSection
    other_income: PnLSection
    other_expenses: PnLSection
    # Computed totals (fields with defaults must come last)
    gross_profit: Decimal = Decimal("0.00")
    operating_income: Decimal = Decimal("0.00")
    net_income: Decimal = Decimal("0.00")


@dataclass
class OpenItemReport:
    """Single open item in AR/AP report."""
    party_id: uuid.UUID
    party_name: str
    party_code: Optional[str]
    document_number: Optional[str]
    document_date: date
    due_date: date
    original_amount: Decimal
    paid_amount: Decimal
    open_amount: Decimal
    days_overdue: int
    status: str


@dataclass
class SubledgerReport:
    """AR or AP subledger report."""
    report_type: str  # RECEIVABLE or PAYABLE
    as_of_date: date
    items: List[OpenItemReport]
    total_original: Decimal = Decimal("0.00")
    total_paid: Decimal = Decimal("0.00")
    total_open: Decimal = Decimal("0.00")
    overdue_amount: Decimal = Decimal("0.00")


class ReportService:
    """
    Service for generating financial reports.
    
    All reports are:
    - Multi-tenant: always scoped by administration_id
    - Point-in-time: based on as_of_date or date range
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def get_balance_sheet(self, as_of_date: date) -> BalanceSheet:
        """
        Generate balance sheet (Activa/Passiva) as of a specific date.
        """
        # Get all account balances
        balances = await self._get_account_balances(as_of_date)
        
        # Categorize accounts
        assets = [b for b in balances if b.account_type == "ASSET"]
        liabilities = [b for b in balances if b.account_type == "LIABILITY"]
        equity = [b for b in balances if b.account_type == "EQUITY"]
        
        # Further categorize assets (simple categorization based on account code)
        current_assets = [a for a in assets if a.account_code.startswith(("1", "10", "11", "12", "13"))]
        fixed_assets = [a for a in assets if a.account_code.startswith(("0", "01", "02", "03", "04", "05"))]
        
        # Categorize liabilities
        current_liabilities = [l for l in liabilities if l.account_code.startswith(("14", "15", "16"))]
        long_term_liabilities = [l for l in liabilities if l.account_code.startswith(("06", "07", "08"))]
        
        # Create sections
        current_assets_section = BalanceSheetSection(
            name="Vlottende Activa (Current Assets)",
            accounts=current_assets,
            total=sum(a.balance for a in current_assets),
        )
        
        fixed_assets_section = BalanceSheetSection(
            name="Vaste Activa (Fixed Assets)",
            accounts=fixed_assets,
            total=sum(a.balance for a in fixed_assets),
        )
        
        current_liabilities_section = BalanceSheetSection(
            name="Kortlopende Schulden (Current Liabilities)",
            accounts=current_liabilities,
            total=sum(l.balance for l in current_liabilities),
        )
        
        long_term_liabilities_section = BalanceSheetSection(
            name="Langlopende Schulden (Long-term Liabilities)",
            accounts=long_term_liabilities,
            total=sum(l.balance for l in long_term_liabilities),
        )
        
        equity_section = BalanceSheetSection(
            name="Eigen Vermogen (Equity)",
            accounts=equity,
            total=sum(e.balance for e in equity),
        )
        
        total_assets = current_assets_section.total + fixed_assets_section.total
        total_liabilities_equity = (
            current_liabilities_section.total + 
            long_term_liabilities_section.total + 
            equity_section.total
        )
        
        return BalanceSheet(
            as_of_date=as_of_date,
            current_assets=current_assets_section,
            fixed_assets=fixed_assets_section,
            total_assets=total_assets,
            current_liabilities=current_liabilities_section,
            long_term_liabilities=long_term_liabilities_section,
            equity=equity_section,
            total_liabilities_equity=total_liabilities_equity,
            is_balanced=abs(total_assets - total_liabilities_equity) < Decimal("0.01"),
        )
    
    async def get_profit_and_loss(
        self, 
        start_date: date, 
        end_date: date
    ) -> ProfitAndLoss:
        """
        Generate P&L statement (Winst- en verliesrekening) for a date range.
        """
        # Get account activity for the period
        balances = await self._get_account_activity(start_date, end_date)
        
        # Categorize accounts
        revenue_accounts = [b for b in balances if b.account_type == "REVENUE"]
        expense_accounts = [b for b in balances if b.account_type == "EXPENSE"]
        
        # Further categorize (based on Dutch standard chart structure)
        # 8xxx = Revenue, 4xxx = Cost of goods, 4xxx-7xxx = Operating expenses
        cogs = [e for e in expense_accounts if e.account_code.startswith(("4", "40", "41"))]
        operating_exp = [e for e in expense_accounts if e.account_code.startswith(("42", "43", "44", "45", "46", "47"))]
        other_exp = [e for e in expense_accounts if e.account_code.startswith(("48", "49"))]
        
        # Create sections
        revenue_section = PnLSection(
            name="Omzet (Revenue)",
            accounts=revenue_accounts,
            total=sum(a.balance for a in revenue_accounts),
        )
        
        cogs_section = PnLSection(
            name="Kostprijs Omzet (Cost of Goods Sold)",
            accounts=cogs,
            total=sum(a.balance for a in cogs),
        )
        
        gross_profit = revenue_section.total - cogs_section.total
        
        operating_exp_section = PnLSection(
            name="Bedrijfskosten (Operating Expenses)",
            accounts=operating_exp,
            total=sum(a.balance for a in operating_exp),
        )
        
        operating_income = gross_profit - operating_exp_section.total
        
        other_income_section = PnLSection(
            name="Overige Baten (Other Income)",
            accounts=[],  # Would need specific categorization
            total=Decimal("0.00"),
        )
        
        other_exp_section = PnLSection(
            name="Overige Lasten (Other Expenses)",
            accounts=other_exp,
            total=sum(a.balance for a in other_exp),
        )
        
        net_income = operating_income + other_income_section.total - other_exp_section.total
        
        return ProfitAndLoss(
            start_date=start_date,
            end_date=end_date,
            revenue=revenue_section,
            cost_of_goods_sold=cogs_section,
            gross_profit=gross_profit,
            operating_expenses=operating_exp_section,
            operating_income=operating_income,
            other_income=other_income_section,
            other_expenses=other_exp_section,
            net_income=net_income,
        )
    
    async def get_accounts_receivable(
        self, 
        as_of_date: Optional[date] = None
    ) -> SubledgerReport:
        """
        Generate AR (Debiteuren) report showing open items.
        """
        return await self._get_subledger_report("RECEIVABLE", as_of_date)
    
    async def get_accounts_payable(
        self, 
        as_of_date: Optional[date] = None
    ) -> SubledgerReport:
        """
        Generate AP (Crediteuren) report showing open items.
        """
        return await self._get_subledger_report("PAYABLE", as_of_date)
    
    async def _get_account_balances(
        self, 
        as_of_date: date
    ) -> List[AccountBalance]:
        """Get all account balances as of a specific date."""
        # Get all accounts
        accounts_result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.is_active == True)
            .order_by(ChartOfAccount.account_code)
        )
        accounts = accounts_result.scalars().all()
        
        balances = []
        for account in accounts:
            # Get posted journal line totals for this account
            result = await self.db.execute(
                select(
                    func.coalesce(func.sum(JournalLine.debit_amount), 0),
                    func.coalesce(func.sum(JournalLine.credit_amount), 0),
                )
                .select_from(JournalLine)
                .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
                .where(JournalLine.account_id == account.id)
                .where(JournalEntry.administration_id == self.administration_id)
                .where(JournalEntry.status == JournalEntryStatus.POSTED)
                .where(JournalEntry.entry_date <= as_of_date)
            )
            row = result.one()
            debit_total = Decimal(str(row[0]))
            credit_total = Decimal(str(row[1]))
            
            # Calculate balance based on account type
            # Assets and Expenses are debit-normal
            # Liabilities, Equity, and Revenue are credit-normal
            if account.account_type in ("ASSET", "EXPENSE"):
                balance = debit_total - credit_total
            else:
                balance = credit_total - debit_total
            
            if balance != 0 or debit_total != 0 or credit_total != 0:
                balances.append(AccountBalance(
                    account_id=account.id,
                    account_code=account.account_code,
                    account_name=account.account_name,
                    account_type=account.account_type,
                    debit_total=debit_total,
                    credit_total=credit_total,
                    balance=balance,
                ))
        
        return balances
    
    async def _get_account_activity(
        self, 
        start_date: date, 
        end_date: date
    ) -> List[AccountBalance]:
        """Get account activity for a date range (for P&L)."""
        # Get revenue and expense accounts
        accounts_result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.is_active == True)
            .where(ChartOfAccount.account_type.in_(["REVENUE", "EXPENSE"]))
            .order_by(ChartOfAccount.account_code)
        )
        accounts = accounts_result.scalars().all()
        
        balances = []
        for account in accounts:
            # Get posted journal line totals for this account in the date range
            result = await self.db.execute(
                select(
                    func.coalesce(func.sum(JournalLine.debit_amount), 0),
                    func.coalesce(func.sum(JournalLine.credit_amount), 0),
                )
                .select_from(JournalLine)
                .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
                .where(JournalLine.account_id == account.id)
                .where(JournalEntry.administration_id == self.administration_id)
                .where(JournalEntry.status == JournalEntryStatus.POSTED)
                .where(JournalEntry.entry_date >= start_date)
                .where(JournalEntry.entry_date <= end_date)
            )
            row = result.one()
            debit_total = Decimal(str(row[0]))
            credit_total = Decimal(str(row[1]))
            
            # For P&L: Revenue is credit-normal, Expense is debit-normal
            if account.account_type == "REVENUE":
                balance = credit_total - debit_total
            else:
                balance = debit_total - credit_total
            
            if balance != 0:
                balances.append(AccountBalance(
                    account_id=account.id,
                    account_code=account.account_code,
                    account_name=account.account_name,
                    account_type=account.account_type,
                    debit_total=debit_total,
                    credit_total=credit_total,
                    balance=balance,
                ))
        
        return balances
    
    async def _get_subledger_report(
        self, 
        item_type: str,
        as_of_date: Optional[date] = None
    ) -> SubledgerReport:
        """Generate AR or AP subledger report."""
        today = as_of_date or date.today()
        
        # Get open items with party info
        result = await self.db.execute(
            select(OpenItem, Party)
            .join(Party, OpenItem.party_id == Party.id)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.item_type == item_type)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .order_by(Party.name, OpenItem.due_date)
        )
        
        items = []
        total_original = Decimal("0.00")
        total_paid = Decimal("0.00")
        total_open = Decimal("0.00")
        overdue_amount = Decimal("0.00")
        
        for open_item, party in result.all():
            days_overdue = max(0, (today - open_item.due_date).days)
            
            items.append(OpenItemReport(
                party_id=party.id,
                party_name=party.name,
                party_code=party.code,
                document_number=open_item.document_number,
                document_date=open_item.document_date,
                due_date=open_item.due_date,
                original_amount=open_item.original_amount,
                paid_amount=open_item.paid_amount,
                open_amount=open_item.open_amount,
                days_overdue=days_overdue,
                status=open_item.status.value,
            ))
            
            total_original += open_item.original_amount
            total_paid += open_item.paid_amount
            total_open += open_item.open_amount
            if days_overdue > 0:
                overdue_amount += open_item.open_amount
        
        return SubledgerReport(
            report_type=item_type,
            as_of_date=today,
            items=items,
            total_original=total_original,
            total_paid=total_paid,
            total_open=total_open,
            overdue_amount=overdue_amount,
        )
    
    async def get_trial_balance(self, as_of_date: date) -> List[AccountBalance]:
        """
        Get trial balance (proefbalans) as of a specific date.
        Returns all accounts with their debit/credit totals and balances.
        """
        return await self._get_account_balances(as_of_date)
