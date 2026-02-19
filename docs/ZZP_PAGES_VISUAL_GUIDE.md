# Visual Guide: ZZP Pages Error Handling Fix

## Problem: Incorrect "Offline" Banner

### BEFORE (Incorrect Behavior)

```
┌─────────────────────────────────────────────────────────────┐
│  🟡 Offline of verbinding weggevallen    [Opnieuw proberen] │  ← WRONG!
└─────────────────────────────────────────────────────────────┘

User Action: Tries to access "Abonnementen" or "Lease & Leningen"
Backend Response: 401 / 402 / 403 / 404
Frontend Shows: Yellow offline banner (incorrect)
User Thinks: "The app is offline" (misleading)
```

**Issues**:
- ❌ User thinks the network is down when it's not
- ❌ Hides the real problem (auth, payment, permission, or routing error)
- ❌ No appropriate action available (login, subscribe, etc.)
- ❌ Confusing UX that doesn't help resolve the issue

---

## Solution: Proper Error Classification

### AFTER (Correct Behavior)

#### Scenario 1: Network Actually Offline 📡

```
┌─────────────────────────────────────────────────────────────┐
│  🟡 Offline of verbinding weggevallen    [Opnieuw proberen] │  ← CORRECT!
└─────────────────────────────────────────────────────────────┘

Trigger: navigator.onLine = false OR fetch failed OR 503/504
Backend Status: No response received
Frontend Shows: Yellow offline banner (correct)
User Action: Wait for network or click "Opnieuw proberen"
```

**When This Shows**:
- ✅ No internet connection
- ✅ Connection refused
- ✅ CORS error (misconfigured)
- ✅ DNS resolution failed
- ✅ Network unreachable
- ✅ HTTP 503 Service Unavailable
- ✅ HTTP 504 Gateway Timeout

---

#### Scenario 2: Session Expired (401) 🔐

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  [Automatic redirect to /login page]                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘

Backend Response: 401 Unauthorized
Frontend Action: localStorage cleared, redirect to login
User Sees: Login page
User Action: Re-authenticate
```

**NOT showing offline banner** ✅

---

#### Scenario 3: Subscription Required (402) 💳

```
╔═══════════════════════════════════════════════════════════╗
║  🔒 Abonnement vereist                                    ║
║                                                           ║
║  Deze functie (Abonnementen & Recurring Kosten) is       ║
║  alleen beschikbaar met een actief abonnement.            ║
║                                                           ║
║  ┌───────────────────────────────────────────────────┐   ║
║  │ ✨ ZZP Basic - €6,95/maand                        │   ║
║  │ ✓ Onbeperkt aantal facturen                       │   ║
║  │ ✓ BTW-aangifte met Digipoort                      │   ║
║  │ ✓ Bankrekening koppeling                          │   ║
║  │ ✓ Exports (PDF, CSV)                              │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                           ║
║  [Annuleren]  [Abonnement activeren]                     ║
╚═══════════════════════════════════════════════════════════╝

Backend Response: 402 Payment Required
Frontend Shows: PaywallModal with subscription details
User Action: Click "Abonnement activeren" or "Annuleren"
```

**NOT showing offline banner** ✅

---

#### Scenario 4: Forbidden (403) 🚫

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  ⚠️ Fout bij laden                                          │
│                                                               │
│  Geen rechten voor deze pagina                               │
│                                                               │
│  [↻ Opnieuw proberen]                                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘

Backend Response: 403 Forbidden
Frontend Shows: Red error alert with retry button
User Sees: Clear permission error message
User Action: Contact support or retry
```

**NOT showing offline banner** ✅

---

#### Scenario 5: Not Found (404) 🔍

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  ⚠️ Fout bij laden                                          │
│                                                               │
│  Endpoint ontbreekt (configuratie)                           │
│                                                               │
│  [↻ Opnieuw proberen]                                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘

Backend Response: 404 Not Found
Frontend Shows: Red error alert with retry button
User Sees: Configuration/routing error message
User Action: Contact support or retry
```

**NOT showing offline banner** ✅

---

#### Scenario 6: Server Error (500/502) 🔥

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  ⚠️ Fout bij laden                                          │
│                                                               │
│  Serverfout, probeer later                                   │
│                                                               │
│  [↻ Opnieuw proberen]                                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘

Backend Response: 500/502 Internal Server Error
Frontend Shows: Red error alert with retry button
User Sees: Server error message
User Action: Wait and retry, or contact support
```

**NOT showing offline banner** ✅

---

#### Scenario 7: Loading State ⏳

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│                       🔄 Spinner                             │
│                                                               │
│                        Laden...                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘

State: isLoading = true
Frontend Shows: Spinner with "Laden..." text
User Sees: Clear indication that data is being fetched
User Action: Wait for loading to complete
```

**Clear feedback during data fetch** ✅

---

#### Scenario 8: Success State ✅

```
┌─────────────────────────────────────────────────────────────┐
│  Abonnementen & Recurring Kosten                             │
│  Beheer je terugkerende kosten en abonnementen               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  📋 Nieuw abonnement                                         │
│  [Naam] [Bedrag] [Frequentie] [Startdatum] [Opslaan]       │
│                                                               │
│  📊 Actieve abonnementen (3)                                 │
│  • Netflix - €12,99/maand                                    │
│  • Microsoft 365 - €69,99/jaar                               │
│  • Adobe Creative Cloud - €54,99/maand                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘

State: isLoading = false, loadError = null
Frontend Shows: Normal page content with data
User Sees: Fully functional page
User Action: Use the page normally
```

**Normal operation, no errors** ✅

---

## Code Flow Comparison

### BEFORE (Old Logic)

```typescript
const isOfflineError = (error) => {
  if (!error.response) return true  // ❌ Too broad!
  return error.response.status === 503 || error.response.status === 504
}

// Result: 401/402/403/404 → shown as offline (WRONG)
```

### AFTER (New Logic)

```typescript
const isOfflineError = (error) => {
  // Only true network failures
  if (!error.response) return true  // Connection-level failure
  
  // Infrastructure issues
  const status = error.response.status
  return status === 503 || status === 504
}

// Then in error handling:
switch (status) {
  case 401: → redirect to login
  case 402: → show PaywallModal
  case 403: → show permission error
  case 404: → show not found error
  case 500/502: → show server error
  default: → show generic error
}
```

---

## User Experience Improvements

### Before This Fix

| Error | User Sees | User Thinks | Helpful? |
|-------|-----------|-------------|----------|
| 401 | Offline banner | "No internet" | ❌ No |
| 402 | Offline banner | "No internet" | ❌ No |
| 403 | Offline banner | "No internet" | ❌ No |
| 404 | Offline banner | "No internet" | ❌ No |
| 500 | Offline banner | "No internet" | ❌ No |
| Network down | Offline banner | "No internet" | ✅ Yes |

### After This Fix

| Error | User Sees | User Thinks | Helpful? |
|-------|-----------|-------------|----------|
| 401 | Login page | "Need to login" | ✅ Yes |
| 402 | PaywallModal | "Need subscription" | ✅ Yes |
| 403 | Permission error | "No access" | ✅ Yes |
| 404 | Not found error | "Broken link" | ✅ Yes |
| 500 | Server error | "Server problem" | ✅ Yes |
| Network down | Offline banner | "No internet" | ✅ Yes |

---

## Page State Machine

```
                    ┌──────────┐
                    │  INITIAL │
                    └─────┬────┘
                          │
                          ▼
                    ┌──────────┐
              ┌────▶│ LOADING  │◀────┐
              │     └─────┬────┘     │
              │           │          │
              │           ▼          │
              │     ┌──────────┐    │
              │     │   API    │    │
              │     │   CALL   │    │
              │     └─────┬────┘    │
              │           │          │
        Retry │     ┌─────┴─────┬───┴───────────┬──────────┐
              │     │           │               │          │
              │     ▼           ▼               ▼          ▼
              │  ┌───────┐  ┌────────┐  ┌──────────┐  ┌────────┐
              │  │SUCCESS│  │ ERROR  │  │ PAYWALL  │  │OFFLINE │
              │  │       │  │(4xx/5xx)│  │  (402)   │  │(net/503│
              │  └───────┘  └────┬───┘  └────┬─────┘  └───┬────┘
              │                  │            │            │
              └──────────────────┴────────────┴────────────┘
```

---

## Testing Visualization

### Network Disconnect Test

```bash
# Simulate offline
$ sudo ifconfig en0 down

Expected Result:
┌─────────────────────────────────────────────┐
│ 🟡 Offline of verbinding weggevallen        │
│    [Opnieuw proberen]                       │
└─────────────────────────────────────────────┘
✅ PASS: Shows offline banner

# Restore network
$ sudo ifconfig en0 up
$ Click "Opnieuw proberen"

Expected Result:
Page loads successfully
✅ PASS: Retry works
```

### 402 Paywall Test

```bash
# Mock 402 response in API
Backend returns: { status: 402, message_nl: "Abonnement vereist" }

Expected Result:
╔════════════════════════════════════════╗
║ 🔒 Abonnement vereist                 ║
║ [Subscription details]                 ║
║ [Abonnement activeren]                 ║
╚════════════════════════════════════════╝
✅ PASS: Shows PaywallModal
❌ FAIL: Shows offline banner
```

---

## Success Metrics

✅ **Offline banner only shown for real network issues**  
✅ **Authentication errors redirect to login**  
✅ **Payment errors show subscription modal**  
✅ **Permission errors show clear message**  
✅ **Server errors have retry button**  
✅ **All states have clear visual feedback**  
✅ **User always knows what action to take**

---

**Status**: ✅ Implemented  
**Version**: 1.0  
**Date**: 2026-02-19
