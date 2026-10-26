# ZZP overview

The overview uses registered business data and provides links to inspect the records behind its figures. It is not a live bank balance.

## Metric contracts

| Figure | Source and scope | Inspect |
| --- | --- | --- |
| Received this month | Completed payments by payment date, including partial and unallocated amounts; each payment counted once. Excludes future dates and reversed/pending/failed payments. | Paginated receipts for the selected month, with links to allocated invoices. |
| Legacy receipts | Paid invoices without a completed allocated payment; uses `paid_at`, falling back to `issue_date` for undated history. | Same receipt list, with invoice link. |
| Expenses this month | Recorded gross expense amounts, first day of the current month through today. | Current-month expenses. |
| Still to receive | Positive `max(total_cents - amount_paid_cents, 0)` for sent/overdue invoices across all dates. | `invoices?status=open` with matching remaining-balance totals. |
| Overdue | Subset of still-to-receive: overdue status or due date before today. | `invoices?status=overdue`. |
| Billed per month | Non-draft, non-cancelled gross invoices grouped by issue date. | Invoice list filtered to that month. |
| Received per month | Same receipt source as the cash card, grouped by payment date. | Receipt list filtered to that month. |
| Weekly hours | Logged hours from Monday through today; future entries excluded. | Time tracking. |
| VAT estimate | Shared calculation with the existing self-service BTW overview. Signed net amount distinguishes payable VAT from a refund. | BTW overview. |

All backend queries resolve the user's primary active administration; the frontend keys financial caches by user and administration and rejects a conflicting administration in the response. Totals are calculated before receipt pagination. Monthly summaries include zero-activity months.

## VAT policy and compatibility

This change aligns the dashboard with the existing self-service `kasstelsel` overview; it does not introduce a new tax-accounting policy. That overview currently recognizes VAT on fully paid invoices and recorded expense VAT. Partial receipts are included in cash figures, but are not newly introduced into the existing VAT calculation. The interface labels VAT as an estimate and directs the user to review open invoices and partial payments before preparing a return.

The legacy unsigned `vat_payable_cents` field and invoice-cohort `paid_total` fields remain available to existing consumers. The new chart uses the separate `received_total` field and reports missing receipt data as an error rather than displaying a false zero.

## Interaction and loading behavior

- Four quick actions open the existing invoice, expense, time, or document upload flow. One-shot URL actions survive filter normalization and are consumed only by the destination page.
- The shell mounts its page once, using responsive CSS instead of duplicate desktop/mobile page trees.
- One attention queue contains unique, severity-ordered items. Zero-VAT expenses are not automatically treated as incorrect. Unbilled hours exclude future entries.
- Summary and activity requests fail independently. Previously fetched figures stay visible with a warning if a summary refresh fails. Loading and unavailable data are distinct from an empty administration.
- The monthly chart supports keyboard selection, exact amounts in a native table, and month-specific drilldowns. Styling supports mobile, dark mode, and reduced motion without an additional charting dependency.

## Verification

Run `npm run build`, `npm run lint`, `npm test`, `npm run test:styles`, `bash scripts/backend-smoke.sh`, and `pytest backend/tests -q` in the documented frontend/backend environments.

Added coverage reconciles partial receipts, invoice balances, monthly dates, legacy fallback, tenant isolation, duplicate allocations, reversed/future payments, pagination totals, signed VAT, and attention items. Browser coverage uses the production shell, providers, and pages with stubbed HTTP data to exercise all four quick actions on desktop and mobile, along with chart navigation, receipt details, dark mode, and isolated failures.
