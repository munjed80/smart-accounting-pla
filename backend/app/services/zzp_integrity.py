"""Shared guards for operational ZZP mutations and their ledger postings."""
import logging
from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import AccountingPeriod, PeriodStatus
from app.repositories.ledger_repository import LedgerRepository
from app.services.ledger_service import LedgerPostingService, MissingLedgerAccountError

logger = logging.getLogger(__name__)


async def require_open_dates(db: AsyncSession, administration_id: UUID, *dates: date | None) -> None:
    for day in set(d for d in dates if d is not None):
        period = await db.scalar(select(AccountingPeriod).where(
            AccountingPeriod.administration_id == administration_id,
            AccountingPeriod.start_date <= day, AccountingPeriod.end_date >= day,
            AccountingPeriod.status.in_([PeriodStatus.FINALIZED, PeriodStatus.LOCKED]),
        ).with_for_update().limit(1))
        if period:
            raise HTTPException(409, detail={'code': 'PERIOD_LOCKED', 'message': f'Afgesloten periode: {period.name}.'})


async def sync_expense(db: AsyncSession, administration_id: UUID, expense_id: UUID, *, replace: bool = False, delete: bool = False) -> None:
    service = LedgerPostingService(LedgerRepository(db, administration_id))
    active = await service.repository.active_entries('EXPENSE', expense_id)
    try:
        async with db.begin_nested():
            if replace or delete:
                await service.reverse_source('EXPENSE', expense_id)
            if not delete:
                await service.post_expense(expense_id)
    except MissingLedgerAccountError as exc:
        # A fresh administration without a chart can store operational records.
        # Existing ledger postings must never diverge from an accepted mutation.
        if active:
            await db.rollback()
            raise HTTPException(409, detail={'code': 'LEDGER_ACCOUNT_MISSING', 'message': str(exc)}) from exc
        logger.warning('Expense saved without posting: %s', exc)


async def sync_invoice(db: AsyncSession, administration_id: UUID, invoice, *, delete: bool = False) -> None:
    service = LedgerPostingService(LedgerRepository(db, administration_id))
    active = (await service.repository.active_entries('INVOICE', invoice.id)
              + await service.repository.active_entries('INVOICE_PAYMENT', invoice.id))
    try:
        async with db.begin_nested():
            if delete or invoice.status in ('draft', 'cancelled'):
                await service.reverse_source('INVOICE_PAYMENT', invoice.id)
                await service.reverse_source('INVOICE', invoice.id)
            else:
                await service.post_invoice(invoice.id)
                if invoice.status == 'paid':
                    await service.post_invoice_payment(invoice.id)
                else:
                    await service.reverse_source('INVOICE_PAYMENT', invoice.id)
    except MissingLedgerAccountError as exc:
        if active:
            await db.rollback()
            raise HTTPException(409, detail={'code': 'LEDGER_ACCOUNT_MISSING', 'message': str(exc)}) from exc
        logger.warning('Invoice saved without posting: %s', exc)
