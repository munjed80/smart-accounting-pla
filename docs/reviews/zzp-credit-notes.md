# ZZP credit notes and registered refunds

This batch follows the explicit VAT basis foundation in #465. Apply migration
`063_zzp_credit_notes` after `062_zzp_vat_policy`, before starting the updated app.
The migration adds four tables and zero-valued settlement caches; it does not
change historical invoice amounts, receipt amounts, document numbers or dates.

## Supported workflow

Open an issued invoice to credit selected quantities from its original lines.
The document gets its own administration/year number, original invoice reference,
reason, seller/customer snapshot and downloadable PDF. It is final: there is no
edit/delete endpoint. The original document remains available and its PDF lists
related credit numbers. Draft invoices can still be cancelled. Issued invoices
require a credit instead of a cancellation that erases their posting.

Line credits use cumulative Decimal rounding of the original recorded net/VAT,
so partial credits reconcile exactly when the full quantity has been credited.
Balances are `original total - credits - receipts + refunds`. Full unpaid credits
do not invent receipts or paid dates. Lists, outstanding cards and the refund
follow-up action use this balance. Original invoice face values remain visible.
Cash receipt cards continue to show gross registered receipts; refunds are shown
separately in the credit history and do not silently rewrite those receipts.

Register an actual customer refund separately, with its date and payment reference.
The app does not initiate a bank transfer or send the credit note to the customer.
A refund is limited both by the invoice's actual remaining liability and by the
selected credit note's unused amount. Refund dates cannot precede the credit,
the latest recorded receipt, or an earlier registered refund. Backdating ahead
of a later receipt is deliberately rejected, even if earlier receipts might
otherwise cover the amount; an accountant must reconcile that case.

## Accounting and safety

- Credit: debit revenue 8000 and VAT payable 1700; credit receivables 1300.
- Refund: debit receivables 1300; credit bank 1100.
- Require an active original INVOICE posting and all required active accounts.
  No backdated original entry is invented. Any failure rolls back the note,
  number, lines, journal and settlement cache together.
- Original periods may be closed; the correction/refund date itself must be open.
- All routes resolve the authenticated administration; quantities must belong to
  that invoice. Administration locks serialize competing payments and corrections.
  UUID idempotency keys prevent duplicate credit/refund writes; changed payloads
  under the same key return 409. History lists have independent bounded pages.
- Status-only legacy paid invoices without a receipt amount, missing receipt dates,
  mismatched original lines and missing postings require reconciliation.
- Payment reversals and legacy bank match/unmatch reject invoices with credit
  history. The old bank matcher has a separate payment representation: its full
  reconciliation with native payments is follow-up work, not implemented here.
  Existing native payment registration supports the remaining credited balance.

## VAT scope

Ordinary price reductions under a confirmed factuurstelsel reduce turnover and
output VAT in the credit issue period, with the original rate breakdown. A refund
does not deduct VAT a second time. Earlier-than-policy originals, foreign,
zero-rate and unsupported-rate transactions require review.

Kasstelsel and unconfirmed periods with credits, affected receipts or refunds
require accountant reconciliation and cannot export a reference XML. The historic
receipt estimate is **not** an automatic cash-basis tax relief calculation. This
batch does not implement bad-debt relief, KOR, reverse charge, ICP, tax-basis
transitions, or electronic tax filing.

Reference material checked 27 October 2026:
- [Belastingdienst: price reduction, waiver and contract termination](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aangifte_doen_en_betalen/aangifte_corrigeren/btw_terugvragen/teruggaaf-door-prijsvermindering-volledige-kwijtschelding-of-verbreking-overeenkomst).
- [VAT invoicing decision, section 3.3.2](https://zoek.officielebekendmakingen.nl/stcrt-2025-15981.html).

## Validation and rollout

API tests cover balance reconciliation, preserved originals and receipts, credits
across periods, cumulative rounding, tenant isolation, idempotency, failed posting
rollback, legacy review and blocked cash-basis exports. PDF tests extract text
from both real renderers; the primary output is also visually inspected. Real
browser tests run the production invoice page in the responsive shell on desktop
and mobile, with HTTP stubs for credit creation, excessive refund prevention,
actual refund registration and PDF download. They do not contact a bank.

PostgreSQL CI additionally tests the frozen migration/constraints/downgrade and
competing full credits and idempotent refunds in separate sessions. After rollout,
check an issued invoice, a partial credit and a recorded refund against the ledger.
Do not downgrade after recording real corrections without preserving their history.
