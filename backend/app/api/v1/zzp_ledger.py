
from app.services.zzp_administration import get_user_administration
from datetime import date
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, require_zzp
from app.core.database import get_db
from app.models.accounting import ChartOfAccount
from app.models.administration import Administration
from app.models.ledger import JournalEntry, JournalLine

router = APIRouter()


@router.get('/ledger')
async def list_zzp_ledger_entries(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    account_id: Optional[UUID] = Query(None),
):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    query = (
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines).selectinload(JournalLine.account))
        .where(JournalEntry.administration_id == administration.id)
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc())
    )

    if from_date:
        query = query.where(JournalEntry.entry_date >= from_date)
    if to_date:
        query = query.where(JournalEntry.entry_date <= to_date)

    result = await db.execute(query)
    entries = result.scalars().all()

    if account_id:
        entries = [e for e in entries if any(l.account_id == account_id for l in e.lines)]

    balance_query = (
        select(
            ChartOfAccount.id,
            ChartOfAccount.account_code,
            ChartOfAccount.account_name,
            func.coalesce(func.sum(JournalLine.debit_amount), 0).label('total_debit'),
            func.coalesce(func.sum(JournalLine.credit_amount), 0).label('total_credit'),
        )
        .join(JournalLine, JournalLine.account_id == ChartOfAccount.id)
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .where(ChartOfAccount.administration_id == administration.id)
        .group_by(ChartOfAccount.id, ChartOfAccount.account_code, ChartOfAccount.account_name)
        .order_by(ChartOfAccount.account_code)
    )

    if from_date:
        balance_query = balance_query.where(JournalEntry.entry_date >= from_date)
    if to_date:
        balance_query = balance_query.where(JournalEntry.entry_date <= to_date)
    if account_id:
        balance_query = balance_query.where(ChartOfAccount.id == account_id)
    balances_result = await db.execute(balance_query)
    balances = []
    for row in balances_result:
        total_debit = Decimal(str(row.total_debit or 0))
        total_credit = Decimal(str(row.total_credit or 0))
        balances.append(
            {
                'account_id': str(row.id),
                'account_code': row.account_code,
                'account_name': row.account_name,
                'total_debit': str(total_debit),
                'total_credit': str(total_credit),
                'balance': str(total_debit - total_credit),
            }
        )

    account_list_result = await db.execute(
        select(ChartOfAccount)
        .where(ChartOfAccount.administration_id == administration.id)
        .where(ChartOfAccount.is_active.is_(True))
        .order_by(ChartOfAccount.account_code)
    )

    return {
        'entries': [
            {
                'id': str(entry.id),
                'date': entry.entry_date.isoformat(),
                'description': entry.description,
                'reference': entry.reference,
                'posted': entry.posted,
                'lines': [
                    {
                        'id': str(line.id),
                        'account_id': str(line.account_id),
                        'account_code': line.account.account_code if line.account else None,
                        'account_name': line.account.account_name if line.account else None,
                        'debit': str(line.debit_amount),
                        'credit': str(line.credit_amount),
                    }
                    for line in entry.lines
                ],
            }
            for entry in entries
        ],
        'account_balances': balances,
        'accounts': [
            {
                'id': str(acc.id),
                'code': acc.account_code,
                'name': acc.account_name,
            }
            for acc in account_list_result.scalars().all()
        ],
    }
