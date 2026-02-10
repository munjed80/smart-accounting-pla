# Manual Test Steps for ZZP Invoices UX Fixes

## Overview
This document outlines the manual testing steps for the ZZP invoice UX improvements, including status workflow, Share/Copy functionality, and iOS Safari PDF download fixes.

## Prerequisites
- Access to the ZZP Invoices page (`/zzp/invoices`)
- At least one draft invoice
- At least one sent invoice
- At least one paid invoice
- Test on multiple devices/browsers (Desktop Chrome, Desktop Safari, iOS Safari, Android Chrome)

## Test Cases

### 1. Status Workflow - Draft to Sent

**Objective**: Verify that draft invoices can be marked as sent using the new "Markeer als verzonden" action.

**Steps**:
1. Navigate to ZZP Invoices page
2. Find a draft invoice (indicated by "Concept" badge)
3. Click the 3-dot menu (⋮) on the invoice card
4. Verify "Markeer als verzonden" option is present in the menu
5. Click "Markeer als verzonden"

**Expected Results**:
- Toast notification appears: "Factuur gemarkeerd als verzonden"
- Invoice status badge changes from "Concept" to "Verzonden"
- Invoice list refreshes automatically
- The "Markeer als verzonden" option should no longer appear in the menu
- "Markeer als betaald" option should now appear

**Test in both views**: Card view (mobile) and Table view (desktop)

---

### 2. Status Workflow - Sent to Paid

**Objective**: Verify that sent invoices can be marked as paid.

**Steps**:
1. Navigate to ZZP Invoices page
2. Find a sent invoice (status "Verzonden")
3. Click the 3-dot menu (⋮) on the invoice
4. Verify "Markeer als betaald" option is present
5. Click "Markeer als betaald"

**Expected Results**:
- Toast notification: "Factuur gemarkeerd als betaald"
- Invoice status changes to "Betaald"
- Invoice list refreshes
- "Markeer als onbetaald" option should now appear in the menu

---

### 3. Status Workflow - Paid to Sent (Unpaid)

**Objective**: Verify that paid invoices can be reverted to sent status.

**Steps**:
1. Navigate to ZZP Invoices page
2. Find a paid invoice (status "Betaald")
3. Click the 3-dot menu (⋮) on the invoice
4. Verify "Markeer als onbetaald" option is present
5. Click "Markeer als onbetaald"

**Expected Results**:
- Toast notification: "Factuur gemarkeerd als onbetaald"
- Invoice status changes back to "Verzonden"
- Invoice list refreshes
- "Markeer als betaald" option should reappear in the menu

---

### 4. Share/Copy Functionality - Copy Link

**Objective**: Verify that Copy Link now uses the PDF download URL instead of the page route.

**Steps**:
1. Navigate to ZZP Invoices page
2. Select any invoice
3. Click the 3-dot menu (⋮)
4. Click "Kopieer factuurlink"
5. Open a new browser tab
6. Paste the URL from clipboard into the address bar
7. Press Enter

**Expected Results**:
- Toast notification: "Factuurlink gekopieerd naar klembord"
- Copied URL should be in format: `{API_BASE_URL}/zzp/invoices/{invoice_id}/pdf`
- When URL is accessed, PDF should start downloading or display in browser
- URL should NOT be a page route like `/zzp/invoices/{id}`

---

### 5. Share/Copy Functionality - Web Share API (Mobile)

**Objective**: Verify that Share option works on mobile devices.

**Steps**:
1. Open the app on a mobile device (iOS or Android)
2. Navigate to ZZP Invoices page
3. Select any invoice
4. Click the 3-dot menu (⋮)
5. Click "Delen"

**Expected Results**:
- Native share sheet appears (on supported browsers)
- Share sheet shows invoice title: "Factuur {invoice_number}"
- URL being shared is the PDF download URL
- User can share via various apps (WhatsApp, Email, etc.)
- If share is cancelled, no error toast appears
- On desktop browsers without Web Share API, link is copied to clipboard with success toast

---

### 6. PDF Download - Desktop Browsers (Chrome, Firefox, Safari)

**Objective**: Verify PDF download works correctly on desktop browsers.

**Steps**:
1. Navigate to ZZP Invoices page
2. Select any invoice
3. Click the 3-dot menu (⋮)
4. Click "PDF downloaden"

**Expected Results**:
- Toast notification appears: "PDF wordt gedownload..."
- PDF file downloads to default Downloads folder
- File name format: `{invoice_number}.pdf` (e.g., `FAC-2024-001.pdf`)
- Success toast appears: "PDF gedownload"
- If download fails, error toast appears with appropriate message

---

### 7. PDF Download - iOS Safari (Critical Test)

**Objective**: Verify that PDF download/view works on iOS Safari without using the download attribute.

**Steps**:
1. Open the app on iOS Safari (iPhone or iPad)
2. Navigate to ZZP Invoices page
3. Select any invoice
4. Click the 3-dot menu (⋮)
5. Click "PDF downloaden"

**Expected Results**:
- Toast notification: "PDF wordt gedownload..."
- PDF opens in a new tab (iOS Safari ignores download attribute)
- PDF is displayed in the browser's PDF viewer
- User can use iOS share button to save PDF to Files or share
- Success toast appears: "PDF gedownload"
- If popup is blocked, warning toast appears: "Popup geblokkeerd. Sta pop-ups toe om de PDF te openen."
- Blob URL is properly cleaned up after 60 seconds (no memory leak)

---

### 8. PDF Download - Android Chrome

**Objective**: Verify PDF download works on Android Chrome.

**Steps**:
1. Open the app on Android Chrome
2. Navigate to ZZP Invoices page
3. Select any invoice
4. Click the 3-dot menu (⋮)
5. Click "PDF downloaden"

**Expected Results**:
- PDF downloads or opens based on browser settings
- File name is correct: `{invoice_number}.pdf`
- Success toast appears
- If there's an issue, fallback to window.open approach works

---

### 9. Status Actions Visibility

**Objective**: Verify that status actions are shown/hidden correctly based on invoice status.

**Steps**:
1. Check a draft invoice menu - should show:
   - ✅ "Markeer als verzonden"
   - ❌ NOT "Markeer als betaald"
   - ❌ NOT "Markeer als onbetaald"

2. Check a sent invoice menu - should show:
   - ✅ "Markeer als betaald"
   - ❌ NOT "Markeer als verzonden"
   - ❌ NOT "Markeer als onbetaald"

3. Check a paid invoice menu - should show:
   - ✅ "Markeer als onbetaald"
   - ❌ NOT "Markeer als verzonden"
   - ❌ NOT "Markeer als betaald"

4. Check a cancelled invoice menu - should show:
   - ❌ NOT "Markeer als verzonden"
   - ❌ NOT "Markeer als betaald"
   - ❌ NOT "Markeer als onbetaald"

---

### 10. Loading States

**Objective**: Verify loading indicators appear during async operations.

**Steps**:
1. Click "Markeer als verzonden" and observe
2. Click "PDF downloaden" and observe

**Expected Results**:
- Spinner icon appears next to the action being performed
- Button/menu item is disabled during operation
- Loading persists until operation completes
- Success/error toast appears after operation

---

## Browser/Device Compatibility Matrix

| Browser/Device | Status Workflow | Copy Link | Share | PDF Download |
|----------------|----------------|-----------|-------|--------------|
| Chrome Desktop | ✓ | ✓ | ✓ (clipboard) | ✓ |
| Firefox Desktop | ✓ | ✓ | ✓ (clipboard) | ✓ |
| Safari Desktop | ✓ | ✓ | ✓ (clipboard) | ✓ |
| iOS Safari | ✓ | ✓ | ✓ (native) | ✓ (new tab) |
| Android Chrome | ✓ | ✓ | ✓ (native) | ✓ |
| Edge Desktop | ✓ | ✓ | ✓ (clipboard) | ✓ |

---

## Known Issues / Expected Behavior

1. **iOS Safari PDF Download**: 
   - Opens in new tab instead of downloading (expected behavior)
   - Download attribute is ignored by iOS Safari
   - Users can use iOS share sheet to save the PDF

2. **Popup Blockers**:
   - If browser blocks popups, a warning toast will appear
   - User needs to allow popups for the site
   - Fallback to download via anchor element if popup fails

3. **Share API**:
   - Only available on HTTPS and localhost
   - Not supported in all browsers (fallback to clipboard copy)
   - User can cancel share dialog (no error toast)

---

## Regression Tests

Ensure the following existing functionality still works:

1. ✅ Creating new invoices
2. ✅ Editing draft invoices
3. ✅ Deleting draft invoices
4. ✅ Viewing invoice details
5. ✅ Status dropdown for non-draft invoices
6. ✅ Invoice search and filtering
7. ✅ Invoice statistics cards
8. ✅ Responsive design (mobile/desktop views)

---

## Test Report Template

```
Date: _______________
Tester: _______________
Device/Browser: _______________

Test Case | Status | Notes
----------|--------|-------
1. Draft to Sent | PASS/FAIL | 
2. Sent to Paid | PASS/FAIL | 
3. Paid to Sent | PASS/FAIL | 
4. Copy Link | PASS/FAIL | 
5. Share (Mobile) | PASS/FAIL | 
6. PDF Desktop | PASS/FAIL | 
7. PDF iOS Safari | PASS/FAIL | 
8. PDF Android | PASS/FAIL | 
9. Status Visibility | PASS/FAIL | 
10. Loading States | PASS/FAIL | 

Overall Result: PASS/FAIL
```
