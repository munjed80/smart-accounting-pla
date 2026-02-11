# Project Review & Action Plan (SnelStart Alternative)

## Goal
Strengthen this platform into a practical, trusted, and clearly differentiated alternative to SnelStart for Dutch ZZP users and accountants.

## What is already strong
- Modern stack and modular architecture (React + FastAPI + worker + Redis + PostgreSQL).
- Broad accountant and ZZP scope already present (bank reconciliation, invoices, time tracking, customer records).
- Existing product strategy artifacts comparing the platform vs SnelStart and identifying gaps.
- Test coverage exists for frontend and backend domains, with route/openapi and domain-specific tests.

## Key findings from this review

### 1) Testing and developer reliability gap
- Backend tests depend on `httpx` through `conftest.py`, but it was missing from pinned backend dependencies.
- This creates avoidable onboarding friction and CI/local test failures.

**Action taken now:** `httpx` was added to `backend/requirements.txt`.

### 2) Product-market fit: strongest near-term gaps to close first
Based on current project docs and code structure, the best ROI sequence for winning from SnelStart remains:
1. Robust bank ingestion + matching UX (reduce manual bookkeeping minutes/day)
2. Payment reminders and overdue automation (immediate value perception)
3. Quotes + quote-to-invoice conversion (critical ZZP workflow)
4. BTW filing workflow completion (from view/export to assisted submission)

### 3) Experience gaps that affect trust (critical for accounting software)
- Missing visible reliability indicators in-app (queue health, import health, worker backlog, retry count).
- Limited explicit auditability UX for "why AI suggested this booking" on everyday screens.
- Need clearer operational docs for production hardening and support runbooks in one place.

## Recommended implementation roadmap

## Phase A (0-4 weeks): Reliability and conversion blockers
- Add CI gate for both frontend and backend test runs on every PR.
- Add a backend "smoke test" command and document it in README + deployment checklist.
- Add import diagnostics panel for bank import failures (row-level error reasons + reprocess path).
- Add first reminder automation flow for invoices (template + schedule + action log).

## Phase B (4-8 weeks): SnelStart parity essentials
- Deliver quote workflow end-to-end (create, send, accept/reject, convert to invoice).
- Add recurring invoices scheduler with preview and dry-run mode.
- Add VAT quarter cockpit with explicit checks and drill-down before filing/export.
- Add customer portal payment links (starting with one provider integration).

## Phase C (8-12 weeks): Differentiation
- Add AI-explainability panels on transaction suggestions (matched keywords, confidence, fallback reason).
- Add "Action needed" inbox across ZZP + accountant personas.
- Add mobile-first capture (PWA camera capture, offline queue, sync status).

## Suggested KPIs to track weekly
- Time-to-booking median (upload/import to posted transaction).
- % bank lines auto-matched without manual edits.
- Reminder-to-payment conversion rate within 7 days.
- Quarter-close completion time per client.
- Support tickets per 100 active users (product trust proxy).

## Suggested technical updates
- Add `httpx` to backend test dependency set (done in this patch).
- Consider splitting backend dependencies into runtime + dev/test requirements for cleaner deploy images.
- Add a simple Makefile or npm script wrapper for full-stack checks (`lint`, `frontend test`, `backend test`).
- Add CI matrix for Python and Node versions that mirror production.

## Suggested product updates for next release notes
- "Faster bookkeeping through improved bank matching and smarter reminders"
- "Clearer reconciliation audit trail for accountants"
- "Operational transparency: better status and error diagnostics"

## Risk notes
- Direct Belastingdienst filing and PSD2 integrations carry compliance and operational complexity; start with stable import + validation layers first.
- Financial-domain trust is won through correctness and traceability before AI novelty.

## Final recommendation
Position this platform as:
**"The most practical AI-assisted bookkeeping workflow for Dutch ZZP + accountant collaboration"**
rather than as a broad "all-in-one" from day one.

This focus improves adoption speed, retention, and referral potential while parity features are completed.
