# Production-Readiness Audit Report

**Date:** 2026-04-08  
**Scope:** Placeholder features, mock flows, dead-end UI controls

---

## 1. Completed Items (fully fixed)

| Area | What was wrong | Fix |
|------|---------------|-----|
| **Password change** | Frontend simulated a 1-second delay and showed "success" without calling any backend | Added real `POST /auth/change-password` endpoint; frontend now calls it |
| **BookingProposalModal** | Default account IDs labeled "placeholder" | Clarified as standard defaults that are editable before posting |

## 2. Safely Disabled Items

| Area | What was wrong | Fix |
|------|---------------|-----|
| **Push notifications (backend)** | `POST /subscribe`, `POST /unsubscribe` returned fake success; `/vapid-public-key` returned a placeholder key | All endpoints now return `501 Not Implemented` with clear messages |
| **Push notifications (frontend)** | Feature-flagged behind `VITE_PWA_PUSH` env var | No change needed — already gated; backend 501 prevents silent failures |
| **OCR receipt scanning (backend)** | Returned mock vendor/amount/date data as if OCR succeeded | Now returns `501 Not Implemented` with Dutch-language message |
| **OCR receipt scanning (frontend)** | "Scan Receipt" button triggered a file picker and called the mock API | Button is now permanently disabled with a tooltip explaining unavailability |
| **Notification preferences save** | Simulated a 500ms delay then showed success toast | Now shows honest "not available yet" info toast |
| **AccountantWorkQueue quick actions** | 5 buttons (Recalculate, View Issues, VAT Draft, Send Reminder, Start Finalize) only did `console.log` | Now show a "not available yet" toast and close the drawer |
| **WorkQueueSection bulk actions** | "Mark as Reviewed" and "Request Info" used `Promise.resolve()` then showed success toast | Now show honest "not available yet" toast |
| **Observability health check** | Background tasks component reported `healthy` despite no task queue being configured | Now reports `not_configured` |

## 3. Already Safe (no change needed)

| Area | Why it's safe |
|------|--------------|
| **Digipoort connector** | Factory defaults to `PackageOnlyConnector` (no network calls). `DigipoortConnector` only activates when `DIGIPOORT_ENABLED=true` and returns DRAFT status. Production mode in `digipoort_service.py` raises `NotImplementedError`. |
| **Bank PSD2 adapter** | Only a mock adapter exists, but it's explicitly named `MockPSD2Adapter` and is not exposed through user-facing flows that suggest real bank connectivity |
| **Asset reclassification** | Raises `ActionExecutionError` with a clear message asking users to create the asset manually |
| **Manage Subscription button** | Already shows "coming soon" toast — honest behavior |
| **ZZP Subscriptions page** | Uses localStorage (functional, just not synced to backend) — no misleading behavior |
| **Rate limiting** | In-memory only — adequate for single-instance deployment |

## 4. Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| **No real OCR** | Low | Button is disabled; users can still add expenses manually |
| **No push notifications** | Low | Feature-flagged; backend returns 501 if accidentally reached |
| **Digipoort production mode** | Medium | Raises `NotImplementedError` if `DIGIPOORT_SANDBOX_MODE` is false — ensure env vars are set correctly in production |
| **No real bank integration** | Medium | Only mock adapter exists; real PSD2 adapter needs a provider (e.g., Tink, Salt Edge) |
| **Signing service uses simplified C14N** | Low | Works for testing and sandbox; may need `lxml`-based canonicalization for production Digipoort |
| **ICP payload generation** | Low | Basic structure only; needs full ICP reporting logic when required |
| **In-memory rate limiting** | Low | Works for single-instance; needs Redis for multi-instance deployment |

## 5. Recommended Next Steps

1. **Push notifications:** Add a `push_subscriptions` database table, implement VAPID key management, and wire up the `pywebpush` library.
2. **OCR integration:** Integrate with Google Cloud Vision or pytesseract, then re-enable the scan button.
3. **Digipoort production:** Implement the SOAP HTTP POST with mTLS authentication before enabling production mode.
4. **Bank PSD2:** Integrate a real PSD2 provider and create a proper adapter implementation.
5. **Notification preferences:** Add a backend endpoint to persist notification settings.
6. **Work queue bulk actions:** Add backend endpoints for bulk mark-as-reviewed and request-info operations.
7. **Accountant quick actions:** Implement backend endpoints for recalculate, VAT draft, send reminder, and finalize flows.
