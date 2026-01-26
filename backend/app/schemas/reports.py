"""
Report Schemas

Pydantic schemas for financial reports.
"""
from datetime import date
from typing import Optional, List
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel
from enum import Enum


class AccountBalanceResponse(BaseModel):
    """Balance for a single account."""
    account_id: UUID
    account_code: str
    account_name: str
    account_type: str
    debit_total: Decimal
    credit_total: Decimal
    balance: Decimal


class BalanceSheetSectionResponse(BaseModel):
    """Section of the balance sheet."""
    name: str
    accounts: List[AccountBalanceResponse]
    total: Decimal


class BalanceSheetResponse(BaseModel):
    """Complete balance sheet report."""
    as_of_date: date
    # Assets (Activa)
    current_assets: BalanceSheetSectionResponse
    fixed_assets: BalanceSheetSectionResponse
    total_assets: Decimal
    # Liabilities + Equity (Passiva)
    current_liabilities: BalanceSheetSectionResponse
    long_term_liabilities: BalanceSheetSectionResponse
    equity: BalanceSheetSectionResponse
    total_liabilities_equity: Decimal
    is_balanced: bool


class PnLSectionResponse(BaseModel):
    """Section of the P&L statement."""
    name: str
    accounts: List[AccountBalanceResponse]
    total: Decimal


class ProfitAndLossResponse(BaseModel):
    """Complete P&L report."""
    start_date: date
    end_date: date
    revenue: PnLSectionResponse
    cost_of_goods_sold: PnLSectionResponse
    gross_profit: Decimal
    operating_expenses: PnLSectionResponse
    operating_income: Decimal
    other_income: PnLSectionResponse
    other_expenses: PnLSectionResponse
    net_income: Decimal


class OpenItemResponse(BaseModel):
    """Single open item in AR/AP report."""
    party_id: UUID
    party_name: str
    party_code: Optional[str] = None
    document_number: Optional[str] = None
    document_date: date
    due_date: date
    original_amount: Decimal
    paid_amount: Decimal
    open_amount: Decimal
    days_overdue: int
    status: str


class SubledgerReportResponse(BaseModel):
    """AR or AP subledger report."""
    report_type: str
    as_of_date: date
    items: List[OpenItemResponse]
    total_original: Decimal
    total_paid: Decimal
    total_open: Decimal
    overdue_amount: Decimal
