# Project integrity audit — 26 October 2026

> Remediation update: the findings below describe commit `9983fae` before repairs.
> The current repair branch addresses F01–F11; see [the repair notes](project-integrity-repairs.md)
> and the active regression tests. Historical probes assert the old defects and should
> only be run against that reviewed commit, not used as passing tests for this branch.

Repository: `munjed80/smart-accounting-pla` / ZZPers Hub.
Reviewed commit: `9983faec53b843de1face1adc52ed5f4b7cb7d12`, after homepage PR #462.

This is an audit, with no application fixes applied. It records eight reproduced
behaviors and three additional source-confirmed findings. No production service,
customer account or real payment was accessed. It is not an exhaustive security
certification or a legal/tax compliance assessment.

## Findings by priority

### F01 — Critical: another tenant's invoice can be marked unpaid

Sources: `backend/app/services/payment_service.py:280` and `:175`;
`backend/app/api/v1/zzp_payments.py:254`.

`mark_invoice_unpaid` selects allocations using only `invoice_id`. It neither
loads the invoice under `self.administration_id` nor scopes the allocations to
the authenticated administration. Its subsequent `update_invoice_payment_status`
also selects the invoice by ID without tenant filtering.

Reproduction: an authenticated ZZP user with an active trial and administration
A requests the actual mark-unpaid endpoint for a paid invoice in unrelated
administration B. The API returns HTTP 204; B's allocations are deleted, its paid
amount becomes zero and its invoice status changes to `sent`. All records in the
probe are generated test fixtures. Knowing an invoice UUID is required; guessing
UUIDs was not tested or assumed.

Fix: enforce tenant ownership before any reads/mutations, scope every payment and
invoice query, and add negative cross-tenant tests for all payment operations.

### F02 — High: both invoice payment buttons use unregistered API paths

Sources: `src/lib/api/zzp.ts:1124`, `:1131`;
`backend/app/api/v1/zzp_payments.py:211`, `:254`;
`backend/app/main.py:346`.

The frontend calls `/zzp/payments/invoices/{id}/mark-paid` and `mark-unpaid`.
The router is mounted directly under `/zzp`, and its actual action paths begin
`/zzp/invoices/{id}/...`. Both frontend action URLs returned HTTP 404 in an
ASGI integration test with a valid user, subscription and invoice.

Secure F01/F03/F04 before connecting these buttons to the actual payment service.
Then add a frontend/backend contract check for both actions.

### F03 — High: payment actions bypass locked accounting periods

Sources: `backend/app/api/v1/zzp_payments.py:211` and
`backend/app/services/payment_service.py:217`.

Payment routes/services do not call the shared open-period guard. The probe
created a `LOCKED` period covering both invoice and payment dates; mark-paid
still returned HTTP 200 and changed the invoice to paid. The separate generic
invoice status route does enforce this guard, so behavior depends on the entry
point used.

Fix: apply the same period policy to every payment creation, reversal and partial
payment path in a shared transactional service.

### F04 — High: a paid invoice may have no payment journal entry

Sources: `backend/app/services/payment_service.py:175`;
`backend/app/services/zzp_integrity.py:51`;
`backend/app/services/ledger_service.py:73`.

PaymentService updates operational payment rows and invoice fields without posting
the receipt to the ledger. The generic status route uses another implementation
that calls `sync_invoice`, producing two competing payment workflows.

Reproduction: configure bank/receivable/VAT/revenue accounts, post a sent invoice
and confirm its invoice journal entry exists. Call the actual mark-paid endpoint.
The response is HTTP 200, but there are zero `INVOICE_PAYMENT` journal entries.
Receivables and bank balances can disagree with invoice payment state.

Fix: one source of truth for allocations, status, period checks and journal
postings/reversals, committed atomically; include partial-payment behavior and
idempotency in the regression suite.

### F05 — High: a duplicate VAT route shadows pagination and scope checking

Sources: `backend/app/api/v1/vat.py:796` and `:1322`.

Two GET handlers register the exact same method/path:
`/api/v1/accountant/clients/{client_id}/vat/submissions`.

The first registered handler executes at runtime. It has no page/page_size
parameters and does not request the `reports` scope. The later, shadowed handler
has pagination and `required_scope="reports"`. Generated OpenAPI describes the
later handler, while runtime routing uses the first. This was confirmed by
inspecting the actual registered routes and generated OpenAPI. The missing
scope argument is source-confirmed; a PostgreSQL restricted-scope HTTP scenario
was not run in this audit.

Fix: retain one canonical handler with explicit permissions and pagination;
preserve intended legacy query compatibility and normalize BTW/VAT terminology.
Reject duplicate method/path registrations in a route-inventory test.

### F06 — Medium: quotes and invoices calculate different amounts for the same work

Sources: `backend/app/api/v1/zzp_quotes.py:305`, `:467`, `:640`;
`backend/app/api/v1/_zzp_invoices_helpers.py:99`.

Quotes truncate quantity/price and VAT calculations with `int(...)`; invoices use
Decimal half-up rounding. Through the real create endpoints, the same line
(1.5 units at 101 cents, VAT 21%) produced:

| Document | Net cents | VAT cents | Total cents |
| --- | ---: | ---: | ---: |
| Quote | 151 | 31 | 182 |
| Invoice | 152 | 32 | 184 |

Conversion copies quote totals and lines directly, preserving the old rule,
while invoice editing/creation uses the new rule. A shared money calculation
policy is required across create, edit, convert, import and preview operations.

### F07 — Medium: expense VAT calculations truncate instead of rounding

Sources: `backend/app/api/v1/zzp_expenses.py:72`,
`zzp_commitments.py:542`, `zzp_import.py:691`.

The calculation is duplicated and truncates fractional cents. An inclusive
1,000-cent expense at 21% yields stored VAT of 173 cents, versus 174 under the
project's half-up cent rounding policy. This is a consistency/arithmetic finding,
not an independent determination of tax treatment for every document.

Fix: define and reuse an explicit cent-rounding policy and test boundary values
across manual expenses, commitments, imports and document conversion.

### F08 — Medium: receipt scanning reports an attached photo without saving it

Sources: `backend/app/api/v1/zzp_expenses.py:429`, `:453`;
`src/components/ZZPExpensesPage.tsx:307`, `:842`.

The endpoint reads the bytes, discards them and returns a manual-entry form with
notes saying a photo was attached. It returns no storage reference/attachment
URL. The frontend retains the extracted form fields, not the uploaded File, and
its save payload has no attachment URL. Manual entry itself is legitimate; losing
the evidence while reporting success is the defect.

The probe also supplied non-image bytes labeled `image/png`; the endpoint accepted
them and returned HTTP 200. MIME-prefix checking does not validate image content.

Fix: validate real content and size, persist evidence under tenant ownership,
return a durable document reference, and preserve it through form save/reload.

### F09 — Medium: advertised and checkout prices disagree (source-confirmed)

Sources: `src/pages/PrijzenPage.tsx:46`,
`src/components/marketing/FaqSection.tsx:49`,
`backend/app/services/mollie_subscription_service.py:39`.

Public copy advertises EUR 4.99/month. The default Starter activation metadata
uses EUR 4.95/month. No live Mollie checkout was performed. Consolidate product
pricing and terms into one authoritative catalog consumed by public pages and
checkout, after confirming the intended commercial amount.

### F10 — Medium: shared marketing footer confirms a newsletter subscription without saving it

Source: `src/components/marketing/Footer.tsx:12`.

The submit handler only toggles React state and clears the email field. It makes
no request and stores no registration, yet renders a successful signup message.
This shared footer remains on other public pages. Connect it to a real validated
subscription workflow, or remove the inactive signup.

### F11 — Low: administration lookup is copied into 17 independent functions

Sources: `backend/app/api/v1/zzp_*.py` and `_zzp_invoices_helpers.py`.

AST inspection found 17 separately defined administration-resolver functions.
They repeatedly implement membership lookup, active-administration filtering,
ordering and missing-administration errors. The duplication is confirmed; it is
not evidence that these lookups currently cross tenant boundaries.

Extract one tested resolver and use an explicit policy for which administration
is selected. This reduces the chance that future authorization fixes reach only
some modules.

## Verification

- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript. Existing shared JS chunk-size
  warnings remain; no new performance score was inferred.
- `npm test`: 115 passed in 22 files.
- Existing backend suite: first run 950 passed, 22 failed, 4 skipped. The 22
  failures were caused by this environment's unsupported `socks5h` proxy URL in
  HTTPX 0.27 constructors, including mocked Mollie tests. Re-running those failed
  tests with proxy environment variables removed passed all 22. Thus all 972
  non-skipped existing tests passed across the run and targeted re-run.
- Four PostgreSQL migration cases were skipped because no disposable PostgreSQL
  URL was configured. SQLite fixtures were used for the audit's HTTP/database
  probes; PostgreSQL concurrency and migrations were not validated here.
- Eight additional audit probes reproduced F01–F08. **These assertions confirm
  current defective behavior; passing them does not mean the defects are fixed.**
- F09–F11 are direct source/AST findings, not live-service tests.

## Reproduction evidence

The temporary probe module is preserved at
`docs/reviews/evidence/project-integrity-probes.py`, outside the regular test
suite so future CI does not affirm known defective behavior. To reproduce using
an isolated test environment with backend dependencies installed, copy it to
`backend/tests/_audit_probe_test.py`, run pytest on that file with `PYTHONPATH=backend`
and `ENV=development`, then delete the temporary test copy. All API requests use
ASGI and fixture data. No actual payment provider is called.

## Repair sequence

1. Tenant isolation in payment services and permission enforcement in VAT routes.
2. One atomic payment workflow with locked-period protection, ledger synchronization,
   partial payments and safe retry behavior; then correct the UI action URLs.
3. Shared monetary calculations across quotes, invoices and expense paths.
4. Durable receipt attachments and truthful user feedback.
5. Pricing catalog, functional public forms and shared administration lookup.

Security/payment changes need real integration regression coverage rather than
only pure helper tests. No production deployment, commit or pull request was
performed as part of this audit.
