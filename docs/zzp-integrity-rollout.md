# ZZP integrity rollout

This change protects future mutations. It does not rewrite historical accounting entries or infer the owner of financial data stored in a shared browser.

## Deployment

1. Back up the PostgreSQL database and verify restoration before applying revision `060_zzp_commitment_integrity` (`alembic upgrade head`). The migration normalizes commitment enum labels, adds quarterly frequency and three nullable columns, and adds a per-administration import-key index. It preserves existing commitment rows.
2. Deploy backend and frontend together. The new UI uses server commitments, document pagination, invoice-number lookup, and paginated list statistics. Deploying only the frontend against the old backend is unsupported.
3. Verify a test administration: draft → sent → paid → unpaid; edit/delete a test expense; retry converting the same receipt; check a locked period rejects changes; create/edit/end each commitment type; switch accounts and reload. Use a configured test email provider when checking invoice delivery. An unconfigured provider now returns 503 and leaves draft status unchanged.
4. In each browser that contains legacy commitments, the owner reviews and selects records and confirms the current business before import. The browser originals remain available. Repeating an import returns the existing server record for that administration and source key. Never automatically assign records from the old global localStorage keys to a signed-in user.

## Review existing data before relying on historical reports

Run the following read-only queries with an authorized operator, scoped to the relevant administration. They intentionally return identifiers and amounts without customer names or receipt contents. Review findings with the accountant. Do not delete journal history or reopen a closed period as an automatic cleanup step.

```sql
-- Receipts converted more than once by earlier versions.
SELECT administration_id, document_id, COUNT(*) AS expense_count
FROM zzp_expenses
WHERE document_id IS NOT NULL
GROUP BY administration_id, document_id HAVING COUNT(*) > 1;

-- Payment dates cannot be recovered reliably from updated_at.
SELECT administration_id, id, total_cents
FROM zzp_invoices WHERE status = 'paid' AND paid_at IS NULL;

-- Duplicate live automatic postings.
SELECT administration_id, source_type, source_id, COUNT(*)
FROM journal_entries
WHERE posted AND reversed_by_id IS NULL
  AND source_type IN ('EXPENSE', 'INVOICE', 'INVOICE_PAYMENT')
GROUP BY administration_id, source_type, source_id HAVING COUNT(*) > 1;

-- Missing sources, draft/cancelled invoice postings, or changed gross amounts.
WITH sources AS (
  SELECT administration_id, id, 'EXPENSE' AS kind,
         amount_cents AS expected_cents, TRUE AS should_post
  FROM zzp_expenses
  UNION ALL
  SELECT administration_id, id, 'INVOICE', total_cents,
         status NOT IN ('draft', 'cancelled') FROM zzp_invoices
  UNION ALL
  SELECT administration_id, id, 'INVOICE_PAYMENT',
         COALESCE(NULLIF(amount_paid_cents, 0), total_cents), status = 'paid'
  FROM zzp_invoices
)
SELECT j.administration_id, j.id, j.source_type, j.source_id,
       j.total_debit * 100 AS posted_cents, s.expected_cents
FROM journal_entries j
LEFT JOIN sources s ON s.administration_id = j.administration_id
  AND s.id = j.source_id AND s.kind = j.source_type
WHERE j.posted AND j.reversed_by_id IS NULL
  AND j.source_type IN ('EXPENSE', 'INVOICE', 'INVOICE_PAYMENT')
  AND (s.id IS NULL OR NOT s.should_post OR j.total_debit * 100 <> s.expected_cents);
```

Missing payment dates are excluded from payment-date dashboard and cashflow totals until reviewed. Do not substitute `updated_at`: edits change it. A fresh administration without a complete chart can still save operational records; posting failures for missing accounts are logged. Existing posted records reject changes that would otherwise leave the ledger inconsistent.

Expense corrections append linked reversal and replacement entries. Reports include originals and reversals so net balances remain correct. Document deletion is blocked while an expense references it. Locked/finalized source and destination periods reject mutations.

## Validation and limits

The normal backend suite runs on SQLite; PostgreSQL migration tests run against an isolated schema when `ZZP_MIGRATION_TEST_DATABASE_URL` is set (CI provides PostgreSQL 16). This exercises both historical lowercase and metadata-generated uppercase enum labels. It does not replace a staging backup/restore rehearsal on the production database version.

Frontend tests cover account cache isolation, stale logout responses, dashboard outages, explicit legacy ownership confirmation and routes. Automated component tests and a production build do not constitute a signed-in browser acceptance test on production.

Primary invoice/customer/quote/expense lists and the document inbox request 50 rows at a time with server filtering and full-result totals. Invoiced time is paginated; open time is bounded by the selected period to preserve invoice-generation totals. Lightweight form lookups and compatibility API callers can still request complete collections. The existing production build still emits a large-chunk advisory; these data-loading fixes do not claim a complete bundle-size redesign.
