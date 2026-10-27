# ZZP bank receipts and invoice allocation

## Branch recovery

PR #466 was merged into `feat/zzp-vat-foundation` after #465 had already merged
into `main`. Consequently `main` contained VAT confirmation but no credit notes.
This PR targets `main` and includes the exact credit-note batch, followed by the
bank fixes described here. Apply migrations 063 and 064 in order; environments
that already have 063 must only apply the remaining migrations. No merge or
production deployment is performed by this work.

## Supported operations

A posted positive EUR bank transaction can be matched in full to one sent/overdue
invoice, including a partly credited invoice. A smaller bank receipt can partially
settle a larger invoice. Allocate only the actual transaction amount and never
more than the remaining balance. Splitting one transaction across invoices,
overpayments, negative transactions and advance receipts are explicitly rejected
for accountant reconciliation. This batch repairs backend operations and the
shared SDK; it does not create a new ZZP bank workspace or connect a real bank.

Matching creates/reuses a native completed payment with the bank booking date and
an invoice allocation. Receipt cards and cash-basis VAT now see the same receipt.
Ledger entries are:

- BANK: debit bank 1100, credit suspense 9999, for the actual bank amount.
- PAYMENT_ALLOCATION: debit suspense 9999, credit receivables 1300.

This prevents debiting the bank once through the bank entry and again through an
invoice-payment entry. The original invoice must already have an active posting.
All required accounts must be active. Match, payment, allocation, status and journal
commit together; failed posting rolls everything back.

Unlink reverses the allocation journal, removes the current allocation link and
marks the match inactive with the time and acting user. The durable match retains
its allocation UUID as a historical reference; the old allocation row is removed.
The journal retains that UUID and its reversal link. The original bank posting
and completed payment remain, representing real cash received but unallocated.
Cash-basis reference export requires review until that receipt is allocated again.
Rematching reuses the payment, keeping receipt totals unchanged. A stale unlink
retry refers to its specific match and cannot unlink a newer match.

The bank routes use the same administration lock as payments and credits. A UUID
`Idempotency-Key` is required for matching. Reuse it for the identical request;
changed payloads return 409. Retrying an old inactive match returns its inactive
result instead of reapplying it. Unlink requires `match_id` in the query string;
obtain it from the transaction list, match response or history. The SDK supports
these parameters. Generic mark-unpaid rejects bank allocations so it cannot bypass
bank history. Unlinking after a credit/refund still requires accountant review.

Legacy match rows retain their amounts and become active with null payment links;
no receipt is invented or guessed. Their unlink operation requires manual review.
Inconsistent receipt caches also block new bank/native payment writes. Closing an
invoice's original period does not prevent a receipt in a later open period when
the original posting exists. The receipt/reversal period itself must be open.

## API and performance repairs

Account, CSV-import, transaction, suggestion, match and history response schemas
now match actual model fields and the shared TypeScript client. Previously several
responses required fields that their endpoint did not provide, causing validation
errors after work had already been committed. Match/unlink responses are validated
before commit. Transaction metadata uses a tenant-scoped joined query over the
current page instead of two queries per matched transaction. History is bounded
(default 50, maximum 200) and has a full filtered count. Invalid date filters return
422 through typed validation.

## Validation and rollout

API tests exercise actual endpoint responses, partial/full receipts, credit-aware
balances, idempotent retries, stale unlink retries, matching again, a failure after
receipt/allocation flush, tenant isolation, closed periods, legacy review, CSV
duplicates and cash VAT by bank booking date. They verify bank/suspense/receivable
balances and preserve gross cash after unlinking. PostgreSQL CI tests migration
constraints/downgrade and concurrent matching/unlink requests in separate sessions.

Review one real imported receipt against the journal after applying migration 064.
No production bank/tax service or customer notification is invoked by these tests.
Cash-basis credit/refund tax relief remains the accountant-review workflow from 063.
