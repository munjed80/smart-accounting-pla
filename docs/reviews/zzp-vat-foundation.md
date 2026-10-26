# ZZP VAT foundation

This is the first implementation from the Dutch-market review. It corrects VAT recognition and makes the limits of preparation/export explicit. It does not implement credit notes, a certified filing connector, or a complete tax-return engine.

## Calculation contracts

One service (`zzp_vat_calculation.py`) supplies the ZZP dashboard totals, self-service quarterly details, invoice summaries, rate breakdowns, and reference exports. The accountant ledger-based VAT reporting remains separate; this preparation view does not replace ledger reconciliation or accountant adjustments.

- **Unconfirmed history:** preserves the previous paid-invoice estimate. It is labeled `unconfirmed`, requires review, and cannot export a reference file. The migration does not choose a tax basis or rewrite invoices, expenses, payments, or journal entries.
- **Confirmed factuurstelsel:** ordinary sent/overdue/paid sales invoices are recognized by issue date, excluding drafts/cancellations. Payment timing does not move their VAT between periods.
- **Confirmed kasstelsel:** completed, allocated receipts recognize VAT and net sales proportionally on payment dates, including partial payments across quarters. Each rate bucket uses cumulative Decimal half-up rounding; period deltas telescope to the original invoice amounts at full payment. Net and VAT buckets round independently, so intermediate partial amounts may differ from gross receipts by rounding cents. The cash card continues to show actual registered receipts, not this VAT allocation.
- **Legacy paid records:** native completed allocations take precedence over status-only fallback. Missing historical payment dates and missing/mismatched invoice lines require review; no historical values are invented.
- **Input VAT:** recorded expense VAT remains based on the expense's invoice date, independent of the sales basis. The user must verify receipt of the purchase invoice, business purpose, deductible proportion and fiscal exceptions; this feature does not infer deductibility from a photo.
- **Exceptions:** unallocated receipts, inconsistent allocations, unreconciled invoice lines, advance payments under invoice basis, late invoicing with a known delivery date, foreign sales, zero-rate classifications, unusual rates and invalid amounts block reference export and request review. This is deliberately not a generic automatic solution for KOR, exemptions, reverse charge, ICP, private use, refunds or credit notes.

The page uses `is_ready` to mean that no implemented preparation checks blocked the reference, not that the return is legally complete or submitted. UI wording is “Beschikbaar voor controle”. `submission_available` is always false on the ZZP overview.

## Basis confirmation and history

`PUT /zzp/btw-policy` records the administration, selected basis, quarter start, confirming user and timestamp. It requires explicit acknowledgement. One immutable policy applies from its effective date forward; earlier periods keep their unconfirmed historical estimate. Retrying an identical request is idempotent. Arbitrary changes of basis are rejected: a real transition needs an accountant-led opening/transition review that is outside this change.

Confirmation rejects future/non-quarter dates and overlapping finalized/locked periods or queued/submitted/received/accepted filing history. An administration lock serializes competing confirmations; the database also enforces one policy per administration. The creation is recorded by the audit hooks. The UI explains that confirming a basis is not a request to change tax treatment with the Belastingdienst.

## Reference export and production safety

The old self-service XML truncated cents and used a tax-authority namespace. The endpoint now emits `ZZPBTWReference`, `purpose="reference-only-not-a-tax-return"`, the basis, and `submitted="false"`. It preserves cents and labels the download as a reference. It must not be uploaded as a certified SBR return. Submission remains a separate manual/qualified-provider workflow.

Programmatic navigation opens the new page at the top, so entering the VAT flow does not leave its basis confirmation above an inherited scroll position. Native back/forward restoration is unchanged.

Invoice-creation CORS preflight now allows the existing `Idempotency-Key` header, so browser retries can use the invoice API across frontend/backend origins.

Production `queue_submission` rejects the unavailable live connector before signing, committing queue state or accepting sandbox results. Development sandbox tests remain available. This does not revoke or rewrite earlier submission records.

## Rollout

1. Back up the database and retained uploads using the established deployment process.
2. Apply Alembic revision `062_zzp_vat_policy` before starting the updated application.
3. Existing administrations see a clear unconfirmed state. Confirm only after checking the applicable basis, starting quarter and opening history with the accountant.
4. Verify a sent unpaid invoice, a two-quarter partial payment, the rate breakdown and dashboard against expected amounts. Review fiscal exceptions separately.
5. Credit-note/refund posting and transitions between bases remain separate follow-up work. Do not substitute deletion/cancellation of historical records for those workflows.

## Source references

Reviewed 26 October 2026:
- [Belastingdienst: factuurstelsel](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aangifte_doen_en_betalen/bereken_het_bedrag/hoe_berekent_u_het_btw_bedrag/factuurstelsel)
- [Belastingdienst: kasstelsel and input VAT](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aangifte_doen_en_betalen/bereken_het_bedrag/hoe_berekent_u_het_btw_bedrag/kasstelsel/kasstelsel)

## Validation

Backend coverage checks quarter recognition, partial and mixed-rate cumulative rounding, reversed/unallocated receipts, tenant boundaries, confirmation/idempotency/history, exceptions and reference precision. PostgreSQL CI applies the new migration and checks constraints. Component and real-browser checks cover explicit acknowledgement, rejection handling, historical policy display, both bases, mobile layout and reference downloads. Run the repository's build, lint, frontend tests, backend suite, smoke and Playwright style checks.
