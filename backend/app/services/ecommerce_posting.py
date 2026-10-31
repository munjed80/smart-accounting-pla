"""Post reviewed store sales as balanced ledger entries, never as fake bank receipts."""
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from sqlalchemy import select
from app.models.administration import Administration
from app.models.ledger import AccountingPeriod
from app.models.ecommerce import EcommerceOrder, EcommerceRefund
from app.repositories.ledger_repository import LedgerRepository
from app.services.zzp_integrity import require_open_dates


def reject(message):
    raise HTTPException(409, detail=message)


async def post_mapping(db, mapping):
    await db.scalar(select(Administration.id).where(Administration.id == mapping.administration_id).with_for_update())
    repository = LedgerRepository(db, mapping.administration_id)
    entries = await repository.active_entries('ECOMMERCE', mapping.id)
    if entries:
        return entries[0]
    if mapping.currency != 'EUR':
        reject('Boekingen ondersteunen EUR. Laat andere valuta eerst door je boekhouder omrekenen.')
    if not mapping.accounting_date or mapping.vat_status not in ('auto', 'manual') or mapping.vat_rate is None:
        reject('Controleer de boekingsdatum en bevestig de btw voordat je boekt.')
    await require_open_dates(db, mapping.administration_id, mapping.accounting_date)
    if mapping.order_id:
        source = await db.get(EcommerceOrder, mapping.order_id)
        if source.status.value == 'cancelled':
            reject('Geannuleerde bestellingen kunnen niet als omzet worden geboekt.')
        if (source.total_amount_cents, source.tax_cents, source.currency) != (mapping.net_amount_cents, mapping.tax_cents, mapping.currency):
            reject('De bestelling is gewijzigd. Vernieuw en controleer de gegevens opnieuw.')
    if mapping.refund_id:
        source = await db.get(EcommerceRefund, mapping.refund_id)
        if (source.amount_cents, source.currency) != (mapping.refund_cents, mapping.currency):
            reject('De restitutie is gewijzigd. Vernieuw en controleer de gegevens opnieuw.')
    closed = await db.scalar(select(AccountingPeriod.id).where(
        AccountingPeriod.administration_id == mapping.administration_id,
        AccountingPeriod.start_date <= mapping.accounting_date,
        AccountingPeriod.end_date >= mapping.accounting_date,
        AccountingPeriod.is_closed.is_(True)).limit(1))
    if closed:
        reject('Deze boekingsperiode is afgesloten.')
    gross = abs(mapping.net_amount_cents)
    tax = mapping.vat_amount_cents
    if mapping.record_type == 'refund':
        if mapping.vat_status != 'manual':
            reject('Bevestig de btw van deze restitutie handmatig.')
        tax = int((Decimal(gross) * mapping.vat_rate / (100 + mapping.vat_rate)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
        mapping.vat_amount_cents = tax
    if gross <= 0 or tax < 0 or tax > gross:
        reject('Ongeldige boekingsbedragen.')
    accounts = {}
    for code in ('1300', '8000', '1700'):
        accounts[code] = await repository.get_account_by_code(code)
        if not accounts[code]:
            reject(f'Grootboekrekening {code} ontbreekt of is niet actief.')
    amount = lambda value: Decimal(value) / 100
    lines = [dict(account_id=accounts['1300'].id, debit_amount=amount(gross)),
             dict(account_id=accounts['8000'].id, credit_amount=amount(gross-tax))]
    if tax:
        lines.append(dict(account_id=accounts['1700'].id, credit_amount=amount(tax)))
    if mapping.record_type == 'refund':
        for line in lines:
            line['debit_amount'], line['credit_amount'] = line.get('credit_amount', 0), line.get('debit_amount', 0)
    return await repository.create_journal_entry(entry_date=mapping.accounting_date,
        description=f'{mapping.provider} {mapping.external_ref}', reference=mapping.external_ref,
        source_type='ECOMMERCE', source_id=mapping.id, lines=lines)
