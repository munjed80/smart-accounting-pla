# ZZP Pages Fix — Root Cause, Fix, and Manual Test Steps

## 1. Subscription Banner Removed from Dashboard (Overzicht)

### Root Cause
`SmartDashboard.tsx` rendered `<SubscriptionBanner />` directly in the dashboard header, causing subscription prompts/trial banners to appear on the main overview page.

### Fix
Removed the `<SubscriptionBanner />` component and its import from `SmartDashboard.tsx`. Subscription management is now exclusively in **Instellingen → Abonnement**.

---

## 2. Settings → Abonnement Enhancements

### Changes
- Added **Activate** button for `TRIALING` status (when no subscription is scheduled yet), calling `subscriptionApi.activateSubscription()`.
- Status description for `TRIALING` now includes the actual `trial_end_at` date (e.g. "Proefperiode actief — 12 dagen (eindigt 01-03-2026)").
- Status description for `ACTIVE` now includes `next_payment_date` (e.g. "ZZP Basic abonnement — €6,95/maand · volgende betaling 01-03-2026").
- After any action (Activate / Cancel / Reactivate), `refetchSubscription()` is called immediately to update the UI.

### Action Matrix
| Status | cancel_at_period_end | Action shown |
|--------|---------------------|--------------|
| TRIALING | false | **Abonnement activeren** |
| ACTIVE | false | **Opzeggen** |
| ACTIVE | true | **Annulering intrekken** |
| CANCELED | — | **Heractiveren** |
| EXPIRED | — | **Heractiveren** |
| PAST_DUE | — | **Heractiveren** |

Accountants never see this section (`!isAccountantBypass && user?.role === 'zzp'`).

---

## 3. "Lease & Leningen" and "Abonnementen & Recurring Kosten" — Network Error Fix

### Root Cause
Both `ZZPLeaseLoansPage.tsx` and `ZZPSubscriptionsPage.tsx` had this pattern:

```ts
const [isLoading, setIsLoading] = useState(true)  // starts TRUE

const load = async () => {
  if (isLoading || isRetrying) return  // EARLY EXIT on first call!
  setIsLoading(true)
  // ... fetch data
}

useEffect(() => { load() }, [])  // calls load(), but isLoading=true → exits immediately
```

Because `isLoading` was initialised to `true`, the guard `if (isLoading || isRetrying) return` prevented the very first API call from ever executing. The pages showed the loading spinner indefinitely (or showed stale/empty state), and users reported it as a connectivity error.

### Error Mapping Applied
| HTTP status | Handling |
|-------------|----------|
| 401 | Sets `ErrorMessages.SESSION_EXPIRED` — not labelled as network |
| 402 | Opens `PaywallModal` — not shown as network/offline |
| 403 | Sets `ErrorMessages.NO_ACCESS` |
| 404 | Sets `isBetaMode=true` (module not yet deployed) |
| No response (timeout/network) | Sets `ErrorMessages.NO_CONNECTION` |
| Other 4xx/5xx | Shows HTTP status + message |

### Fix
Changed `useState(true)` → `useState(false)` in both components, and removed the broken guard from `load()` so the initial fetch always runs. The `retry()` helper was also updated to clear error state before re-calling `load()`.

---

## Manual Test Steps

### Prerequisites
- Login as a ZZP user (role = `zzp`)
- Backend running with at least one administration linked

### Test 1 — No subscription banner on Dashboard
1. Navigate to **Overzicht** (dashboard)
2. Confirm: **No** blue/orange trial banner or subscription prompt is visible in the header area
3. The KPI cards (open invoices, expenses, hours, BTW) render normally

### Test 2 — Subscription control in Settings
1. Navigate to **Instellingen** → scroll to **Abonnement** card
2. During trial: badge shows "Proefperiode", days remaining + trial end date visible, button "Abonnement activeren" present
3. Click **Abonnement activeren** → spinner, then success toast, badge updates to "Actief" or "Gepland"
4. When ACTIVE: badge "Actief", next_payment_date displayed, button "Opzeggen" present
5. Click **Opzeggen** → confirm dialog → success toast, badge shows "Lopend tot periode-einde"
6. Button changes to **Annulering intrekken** → click → badge reverts to "Actief"
7. Login as accountant: **no Abonnement card** visible

### Test 3 — Lease & Leningen loads correctly
1. Navigate to **Financieel → Lease & Leningen**
2. Page shows spinner briefly, then either:
   - Empty state with "Voeg je eerste lease/lening toe" (no data)
   - Table/cards with existing items
3. Confirm: no "Network Error / Offline" message

### Test 4 — Abonnementen & Recurring Kosten loads correctly
1. Navigate to **Financieel → Abonnementen & Recurring Kosten**
2. Page shows spinner briefly, then either:
   - Empty state or form with existing subscriptions
3. Confirm: no "Network Error / Offline" message

### Test 5 — Error handling
1. Disable network (DevTools → Network → Offline)
2. Navigate to Lease & Leningen
3. Confirm: "Geen verbinding met de server. Controleer je internetverbinding." displayed (not generic "Network Error")
4. Re-enable network, click "Opnieuw proberen" → data loads
