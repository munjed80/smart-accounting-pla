# Accountant Section Full Audit (behavior-first)

Date: 2026-02-11  
Scope: Frontend accountant flows, backend accountant APIs, accountant↔ZZP linking/permissions, and dossier navigation behavior.

## Executive conclusion

The Accountant section is **partially production-capable**, but not robust enough to be competitively stronger than SnelStart yet. The main gaps are:

1. **Navigation-state mismatches** in dossier routing.
2. **Inconsistent source-of-truth usage** (localStorage vs backend) for operational history.
3. **Assignment status filtering inconsistencies** across accountant endpoints (risk of showing inaccessible clients).
4. **Scope enforcement inconsistencies** between modules.
5. **Performance and UX reliability issues** (N+1 querying patterns and incomplete empty/error handling standardization).

---

## Root-cause investigation: “Open dossier” loads with no visible data

### Observed technical cause

The dossier container is rendered with `opacity-0` and relies on animation classes to become visible:

- `className="... opacity-0 animate-in fade-in duration-500"` in `ClientDossierPage`.

If the animation utility chain does not run in a user environment (render timing, CSS loading issue, or animation behavior differences), content can remain invisible while the page is technically mounted.

### Why this explains the symptom

- The page still fetches data, handles errors, and renders tabs/header logic.
- Yet the top-level visible container can be stuck transparent.

### Action required

- Replace `opacity-0 animate-in ...` on critical page containers with a **safe default visible state** (e.g., no forced `opacity-0`, or class toggling only after animation-ready state).
- Apply same fix pattern to other pages using the same class combination.

---

## Functional completeness check (Accountant workflow)

## ✅ Implemented and working at base level

- Accountant clients list with active/pending links and invite flow exists.
- Dossier structure exists with tabs (issues/bookkeeping/periods/decisions/audit).
- Access-control checks for assignment and approval status are present.
- Scope model exists and is surfaced in UI.

## ⚠️ Not fully complete or robust

1. **Route parser does not include all dossier tabs**
   - Parser accepts only `issues|periods|decisions`, while dossier UI exposes `bookkeeping` and `audit` tabs.
   - This breaks URL-tab consistency and deep-link reliability.

2. **Action history page is local-only persistence**
   - "Acties" page is powered by localStorage hook instead of server-backed operation history.
   - History can disappear across devices/sessions and is not auditable as enterprise-grade bookkeeping workflow.

3. **Upcoming deadlines are placeholder in overview endpoint**
   - The overview response hardcodes `upcoming_deadlines=[]`, so feature appears incomplete at API level.

---

## Data relations between Accountant and ZZP (correctness audit)

## ✅ Good foundations

- Access guard checks both direct administration membership and assignment-based consent flow.
- Pending/revoked statuses are blocked with explicit permission codes.

## ⚠️ Broken/inconsistent relation handling

1. **Dashboard client aggregation includes assignment-based administrations without ACTIVE-status filter**
   - Result: clients can appear in dashboard lists while still pending/revoked, creating click-through failures and trust issues.

2. **Legacy assigned-clients endpoint includes all assignments (status-unfiltered)**
   - Can expose revoked/pending relations in lists that should represent actionable clients.

3. **Different surfaces use different client sources (context links vs dashboard aggregations)**
   - Increases mismatch risk between selectable clients and actually accessible clients.

---

## Navigation & action behavior audit

1. **Open dossier pathing is mostly correct from consent-workflow client list**
   - Uses `administration_id` in navigation.

2. **Tab URL synchronization is incomplete**
   - Switching to tabs not recognized by parser can snap back to default `issues` behavior.

3. **Client selection state relies on localStorage side-channel (`selectedClientId`)**
   - Context + localStorage dual-state pattern can drift and produce inconsistent behavior after refreshes or multi-tab usage.

---

## Backend/permission robustness audit

1. **Permission scopes model exists but enforcement is not uniformly applied in all accountant endpoints**
   - Some modules enforce `required_scope`; others rely only on assignment and role.
   - This creates inconsistent least-privilege behavior.

2. **N+1 query pattern in client link list endpoints**
   - Per-assignment issue-count queries do not scale for larger firms.

3. **Insufficient alignment between operational history API and UI usage**
   - Backend supports bulk operation history APIs, but primary actions history UI does not consume this as system-of-record.

---

## Production-readiness task list (must implement/fix)

## P0 — Must fix before production

1. **Fix dossier invisibility risk**
   - Remove forced `opacity-0` from critical container defaults.
   - Add regression test/assertion for visible dossier root after navigation.

2. **Unify assignment status filtering across all accountant client-listing endpoints**
   - Only ACTIVE should appear in actionable dashboards/work queues.
   - Pending/revoked should be explicit in dedicated consent views only.

3. **Fix dossier route parser to support all real tabs**
   - Add `bookkeeping` and `audit` to route typing/parser.
   - Add deep-link tests for all tabs.

4. **Switch Actions history to backend-backed source of truth**
   - Consume bulk-operation history API.
   - Keep local cache only as optional UX acceleration layer.

## P1 — High priority robustness

5. **Standardize scope enforcement across accountant endpoints**
   - Define scope matrix per endpoint family (issues, reports, bookkeeping, periods, VAT, client data).
   - Enforce with shared dependency layer.

6. **Eliminate client-source drift**
   - Use one canonical client-access feed for shell/client switcher/dossier navigation.
   - Ensure every UI list item is guaranteed actionable or clearly marked non-actionable.

7. **Optimize query strategy for links/dashboard**
   - Replace per-row issue-count queries with grouped aggregates.

## P2 — Competitive improvements vs SnelStart

8. **Complete upcoming-deadlines pipeline in overview endpoint**
   - Provide real computed deadlines and urgency status.

9. **Cross-device auditability**
   - Ensure every accountant action appears in server audit trails and user-visible timelines.

10. **Workflow consistency polish**
   - Unified empty states, consistent error copy, deterministic fallback behavior when client context is stale.

---

## Suggested acceptance criteria

- Dossier is always visible immediately after route navigation in all supported browsers/environments.
- No pending/revoked client appears as actionable in dashboard/review flows.
- Deep links for all dossier tabs resolve correctly and preserve selected tab.
- Actions history persists across logout/login/device and matches backend operation logs.
- Scope restrictions are consistently enforced and test-covered.
