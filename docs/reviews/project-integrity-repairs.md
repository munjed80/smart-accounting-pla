# Project integrity repairs

Addresses the audit of commit `9983fae` (F01–F11).

| Finding | Result |
| --- | --- |
| F01 | Every payment invoice/customer lookup is scoped to its administration before mutation. Cross-tenant reads, payments and reversals return 404 without changing records. |
| F02 | Invoice payment buttons use the actual registered `/zzp/invoices/{id}/mark-paid` and `mark-unpaid` endpoints. |
| F03 | Receipt creation, allocation and reversal enforce the shared closed-period policy. Mutations acquire administration/invoice locks in the same order. |
| F04 | Generic invoice status changes use PaymentService too. Each allocation posts a balanced bank/receivable entry on its payment date, including partial payments. Reversals preserve journal history. |
| F05 | One VAT submission GET route enforces reports permission, supports pagination and compatible kind/submission_type/status filters. The UI can navigate older pages and handle Digipoort statuses. |
| F06 | Quote creation/editing and invoices share Decimal half-up line/VAT rounding. Edited quote responses reload the current lines before returning them. |
| F07 | Manual expense, document, import and commitment calculations share the same inclusive VAT helper. |
| F08 | Receipt images are validated/decoded with size/resolution limits, stored as owned documents and linked to expenses. The form preserves the reference; authenticated downloads verify ownership and storage boundaries. |
| F09 | A public JSON catalog supplies frontend prices and Mollie checkout metadata. Displayed Starter pricing is aligned with the existing EUR 4.95 charge; charging amounts are unchanged. |
| F10 | Removed the inactive newsletter success form and placeholder social links; actual contact destinations remain. |
| F11 | Replaced 17 copied administration resolver definitions with one service, including deterministic ordering and inactive-administration filtering. |

## Accounting compatibility

- Existing invoice/quote amounts are not rewritten. Historical accepted quote
  totals are preserved on conversion; new and explicitly edited quotes use the
  shared rounding policy.
- Historical status-only paid invoices retain their paid summary and can be
  explicitly reversed. Their legacy `INVOICE_PAYMENT` journal entries are reversed
  before new allocation-based receipts are recorded.
- New receipt journal entries use `PAYMENT_ALLOCATION` and an allocation UUID as
  their source. This supports independently dated partial receipts without
  duplicating the legacy invoice-level entry.
- Repeating a full mark-paid request cannot create another receipt. PostgreSQL
  race tests exercise two independent sessions for full and partial payments.
- The existing policy allowing operational records in a fresh administration
  without a chart is retained. If an invoice already has a ledger entry and a
  necessary account becomes unavailable, the entire payment rolls back with 409.
- Receipt upload cancellation leaves a durable document in the inbox. It does
  not falsely claim to have extracted fields through OCR. Supported image types
  are JPEG, PNG and WebP; unsupported formats are rejected with a clear error.
- No database migration or automatic rewrite of historical records is required.

## Validation

- `npm test`: 122 tests pass.
- `npm run lint` and `npm run build` (including TypeScript): pass.
- Full local backend run: 988 tests pass; the four pre-existing PostgreSQL
  migration cases are skipped without a disposable PostgreSQL URL.
- Targeted current regression run: 16 tests pass. Two new PostgreSQL concurrency
  cases are skipped locally; CI supplies the database URL for these and the
  migration tests.
- Existing shared JavaScript chunk-size build warnings remain.

Active regression coverage is in `backend/tests/test_project_integrity_repairs.py`,
`backend/tests/test_payment_concurrency.py`, the updated invoice lifecycle test,
and the frontend contract, receipt form, billing catalog and VAT history tests.
The historical evidence module in this directory belongs to the original audit,
not to the active regression suite.
