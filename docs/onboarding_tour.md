# Onboarding Tour

A lightweight, optional first-login guided tour for ZZP users that walks them through 3 essential setup steps.

## Overview

After a ZZP user registers and logs in for the **first time only**, a non-blocking guided tour starts automatically. The tour highlights key UI elements with a spotlight cutout and shows a tooltip card with step text, a step indicator, and action buttons.

The tour is **completely optional** – users can skip, dismiss, or opt out at any time. It never prevents normal app usage.

---

## Screenshots (placeholders)

| Step 1 – Settings | Step 2 – New Customer | Step 3 – New Invoice |
|---|---|---|
| *(screenshot placeholder)* | *(screenshot placeholder)* | *(screenshot placeholder)* |

---

## Steps

| # | Route | Target element | Tooltip (NL) | Advances on |
|---|---|---|---|---|
| 1 | `/settings` | `[data-onboarding="settings-menu"]` | *Stap 1: Vul je bedrijfsgegevens in bij Instellingen en klik op Opslaan.* | `onboarding:settings_saved` |
| 2 | `/zzp/customers` | `[data-onboarding="new-customer-btn"]` | *Stap 2: Voeg je eerste klant toe via de knop "Nieuwe klant".* | `onboarding:customer_created` |
| 3 | `/zzp/invoices` | `[data-onboarding="new-invoice-btn"]` | *Top! Maak nu je eerste factuur via de knop "Nieuwe factuur".* | `onboarding:invoice_created` |

---

## Architecture

### Files

| File | Role |
|---|---|
| `src/hooks/useOnboardingTour.ts` | State machine + localStorage persistence |
| `src/components/OnboardingTour.tsx` | Overlay + spotlight + tooltip UI |
| `src/test/OnboardingTour.test.tsx` | Unit tests (hook + component) |

### State machine

```
initial load
  └─ role=zzp AND not completed/skipped/neverShow? → active=true, step=0
       ├─ window event (advanceOn) → step++  (or completed if last step)
       ├─ nextStep() → step++
       ├─ skip()     → active=false, skipped=true
       └─ neverShow() → active=false, neverShow=true
```

### Persistence

State is stored in `localStorage` keyed by user ID:

```
onboarding_tour_{userId}  →  JSON({ active, step, completed, skipped, completedAt, skippedAt, neverShow })
```

Server-side persistence can be added later by replacing the `loadState`/`saveState` functions in `useOnboardingTour.ts`.

### Event emitters

Three `CustomEvent`s are dispatched on `window` after key user actions:

| Event | Dispatched in |
|---|---|
| `onboarding:settings_saved` | `SettingsPage.tsx` → `handleSaveBusinessProfile` |
| `onboarding:customer_created` | `ZZPCustomersPage.tsx` → `handleSaveCustomer` |
| `onboarding:invoice_created` | `ZZPInvoicesPage.tsx` → `handleSaveInvoice` |

### Re-running the tour

A small **"?"** icon button (`TourHelpButton`) is displayed in the top-right header area for ZZP users. Clicking it calls `startTour()`, which resets the state and re-enables the tour from step 1.

---

## Trigger conditions

| Condition | Behaviour |
|---|---|
| New ZZP user (no persisted state) | Tour starts automatically |
| `completed=true` | Tour does NOT restart |
| `skipped=true` | Tour does NOT restart (but "?" button can restart manually) |
| `neverShow=true` | Tour is permanently dismissed |
| Role ≠ ZZP | Tour is never shown |

---

## Manual test checklist

### Pre-conditions
- [ ] Clear `localStorage` (DevTools → Application → Local Storage → delete `onboarding_tour_*` keys)
- [ ] Log in as a ZZP user

### Step 1 – Settings
- [ ] Tour overlay appears on the dashboard after login
- [ ] Step indicator shows **1/3**
- [ ] Settings menu item is highlighted (spotlight cutout)
- [ ] Tooltip text: *"Stap 1: Vul je bedrijfsgegevens in bij Instellingen en klik op Opslaan."*
- [ ] Clicking **Volgende** advances to step 2
- [ ] Filling in company name and clicking **Opslaan** in Settings auto-advances to step 2

### Step 2 – New Customer
- [ ] Step indicator shows **2/3**
- [ ] "Nieuwe klant" button is highlighted
- [ ] Tooltip text: *"Stap 2: Voeg je eerste klant toe via de knop "Nieuwe klant"."*
- [ ] Creating a customer (filling form + save) auto-advances to step 3

### Step 3 – New Invoice
- [ ] Step indicator shows **3/3**
- [ ] "Nieuwe factuur" button is highlighted
- [ ] Tooltip text: *"Top! Maak nu je eerste factuur via de knop "Nieuwe factuur"."*
- [ ] Creating an invoice marks the tour as completed (tour overlay disappears)

### Skip / dismiss behaviour
- [ ] Clicking **Later** hides the tour and sets `skipped=true` in localStorage
- [ ] Refreshing the page does NOT restart the tour (skipped state persists)
- [ ] Clicking **Niet meer tonen** sets `neverShow=true` – tour never restarts
- [ ] Clicking **×** close button behaves the same as "Later"

### Re-run the tour
- [ ] The **"?"** icon is visible in the header (ZZP users only)
- [ ] Clicking **"?"** restarts the tour from step 1 even if previously skipped
- [ ] The **"?"** icon is NOT visible for Accountant or Super Admin users

### Mobile (iOS Safari / PWA)
- [ ] Overlay renders correctly on small screens (no overflow issues)
- [ ] Tooltip is positioned within viewport bounds
- [ ] All tap targets are at least 44 × 44 px

---

## Unit tests

Run with:

```bash
npm test -- src/test/OnboardingTour.test.tsx
```

22 tests covering:
- Auto-start for new ZZP users
- No-start for non-ZZP roles
- No-start when already completed / skipped / neverShow
- `nextStep`, `skip`, `neverShow`, `complete` state transitions
- `startTour` resets state
- localStorage persistence
- Window event auto-advance
- UI: renders tooltip, correct step indicator, button callbacks
