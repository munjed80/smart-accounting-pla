# PDF Download Fix - Test Plan

## Test Execution Checklist

### Pre-Deployment Verification

- [x] ✅ Build passes: `npm run build`
- [x] ✅ Linting passes: `npm run lint`
- [x] ✅ CodeQL security scan: 0 vulnerabilities
- [x] ✅ Code review: All feedback addressed
- [ ] Unit tests (if applicable)
- [ ] Backend API tests (if applicable)

---

## Desktop Testing

### Chrome (Windows/Mac/Linux)

#### Test Case 1: PDF Download
**Steps:**
1. Navigate to ZZP Invoices page
2. Open browser DevTools Console (F12)
3. Click 3-dots menu on any invoice
4. Click "PDF downloaden"

**Expected Results:**
- ✅ Console shows: `[PDF Download] Starting download for invoice: <id>`
- ✅ Console shows: `[PDF Download] Fetching PDF blob from API...`
- ✅ Console shows: `[PDF Download] Blob received, size: <bytes> bytes`
- ✅ Console shows: `[PDF Download] Created blob URL: blob:...`
- ✅ Console shows: `[PDF Download] Creating anchor element for download...`
- ✅ Console shows: `[PDF Download] Download initiated successfully`
- ✅ PDF file downloads to Downloads folder
- ✅ Filename is correct: `INV-YYYY-XXXX.pdf`
- ✅ Success toast shows: "PDF gedownload"
- ✅ No errors in console

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

#### Test Case 2: PDF Share
**Steps:**
1. Open browser DevTools Console (F12)
2. Click 3-dots menu on any invoice
3. Click "Delen"

**Expected Results (Desktop):**
- ✅ Console shows: `[PDF Share] Starting share for invoice: <id>`
- ✅ Console shows: `[PDF Share] Fetching PDF blob from API...`
- ✅ Console shows: `[PDF Share] Blob received, size: <bytes> bytes`
- **IF** Web Share API available (unlikely on desktop Chrome):
  - Shows native share dialog
- **ELSE** (most likely):
  - Console shows: `[PDF Share] Web Share API not available, copying link to clipboard...`
  - Success toast shows: "Factuurlink gekopieerd"
  - Link is copied to clipboard
  - Link format: `https://api.../api/v1/zzp/invoices/<id>/pdf`

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

#### Test Case 3: Copy Invoice Link
**Steps:**
1. Open browser DevTools Console (F12)
2. Click 3-dots menu on any invoice
3. Click "Kopieer factuurlink"

**Expected Results:**
- ✅ Console shows: `[PDF Copy Link] Copying link for invoice: <id>`
- ✅ Console shows: `[PDF Copy Link] URL to copy: https://api.../api/v1/zzp/invoices/<id>/pdf`
- ✅ Console shows: `[PDF Copy Link] Link copied successfully`
- ✅ Success toast shows: "Factuurlink gekopieerd"
- ✅ Link is copied to clipboard
- ✅ No errors in console

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

### Firefox (Windows/Mac/Linux)

Repeat all 3 test cases from Chrome section.

**Notes:**
- Firefox may have different Web Share API support
- Console logging should be identical
- Download behavior should be identical

**Actual Results:**
- Test Case 1 (Download): [ ] PASS / [ ] FAIL
- Test Case 2 (Share): [ ] PASS / [ ] FAIL
- Test Case 3 (Copy Link): [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

### Safari (Mac)

Repeat all 3 test cases from Chrome section.

**Notes:**
- Safari on Mac may have Web Share API support
- Console logging should be identical
- Download behavior should be identical

**Actual Results:**
- Test Case 1 (Download): [ ] PASS / [ ] FAIL
- Test Case 2 (Share): [ ] PASS / [ ] FAIL
- Test Case 3 (Copy Link): [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

## Mobile Testing

### iOS Safari (iPhone/iPad)

#### Setup
1. Connect iPhone/iPad to Mac via USB cable
2. Enable Web Inspector on iPhone: Settings → Safari → Advanced → Web Inspector
3. On Mac: Safari → Develop → [Your iPhone] → Select page
4. Navigate to ZZP Invoices page on iPhone
5. Keep Mac Safari DevTools open for console logs

---

#### Test Case 4: PDF Download (iOS)
**Steps:**
1. On iPhone: Tap 3-dots menu on any invoice
2. Tap "PDF downloaden"
3. Check Mac console for logs

**Expected Results:**
- ✅ Console shows: `[PDF Download] Starting download for invoice: <id>`
- ✅ Console shows: `[PDF Download] Fetching PDF blob from API...`
- ✅ Console shows: `[PDF Download] Blob received, size: <bytes> bytes`
- ✅ Console shows: `[PDF Download] Created blob URL: blob:...`
- ✅ Console shows: `[PDF Download] iOS detected, opening PDF in new tab...`
- ✅ Console shows: `[PDF Download] Download initiated successfully`
- ✅ **PDF opens in new Safari tab** (iOS ignores download attribute)
- ✅ Success toast shows: "PDF gedownload"
- ✅ In PDF viewer, user can tap Share → "Save to Files" to save PDF
- ✅ **NO 401 errors** in console
- ✅ **NO popup blocked errors**

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

#### Test Case 5: PDF Share (iOS)
**Steps:**
1. On iPhone: Tap 3-dots menu on any invoice
2. Tap "Delen"
3. Check Mac console for logs

**Expected Results:**
- ✅ Console shows: `[PDF Share] Starting share for invoice: <id>`
- ✅ Console shows: `[PDF Share] Fetching PDF blob from API...`
- ✅ Console shows: `[PDF Share] Blob received, size: <bytes> bytes`
- ✅ Console shows: `[PDF Share] Sharing PDF file via Web Share API...`
- ✅ **Native iOS share sheet appears**
- ✅ Share sheet shows: "Factuur INV-YYYY-XXXX.pdf" (actual PDF file)
- ✅ Can share to: Messages, Mail, WhatsApp, AirDrop, etc.
- ✅ If user completes share: Console shows `[PDF Share] File shared successfully`
- ✅ If user cancels: No error (AbortError is caught)
- ✅ **NOT** just sharing a URL - should show PDF file icon/preview

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

#### Test Case 6: Copy Invoice Link (iOS)
**Steps:**
1. On iPhone: Tap 3-dots menu on any invoice
2. Tap "Kopieer factuurlink"

**Expected Results:**
- ✅ Console shows: `[PDF Copy Link] Copying link for invoice: <id>`
- ✅ Console shows: `[PDF Copy Link] Link copied successfully`
- ✅ Success toast shows: "Factuurlink gekopieerd"
- ✅ Link is copied to clipboard (can paste in Notes app to verify)

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

#### Test Case 7: PWA Mode (iOS)
**Steps:**
1. On iPhone: Safari → Share → "Add to Home Screen"
2. Open app from home screen (standalone PWA mode)
3. Repeat Test Cases 4, 5, 6

**Expected Results:**
- ✅ All behaviors identical to browser mode
- ✅ No popup blocking issues (direct user gesture)
- ✅ Web Share API works in PWA mode
- ✅ PDF opens in new tab in PWA mode

**Actual Results:**
- Test Case 4 (Download): [ ] PASS / [ ] FAIL
- Test Case 5 (Share): [ ] PASS / [ ] FAIL
- Test Case 6 (Copy Link): [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

### Android Chrome (Phone/Tablet)

#### Setup
1. Connect Android device to computer via USB cable
2. Enable USB debugging on Android: Settings → Developer Options → USB Debugging
3. On computer: Chrome → `chrome://inspect` → Select device
4. Navigate to ZZP Invoices page on Android
5. Keep computer Chrome DevTools open for console logs

---

#### Test Case 8: PDF Download (Android)
**Steps:**
1. On Android: Tap 3-dots menu on any invoice
2. Tap "PDF downloaden"
3. Check computer console for logs

**Expected Results:**
- ✅ Console shows: `[PDF Download] Starting download for invoice: <id>`
- ✅ Console shows: `[PDF Download] Fetching PDF blob from API...`
- ✅ Console shows: `[PDF Download] Blob received, size: <bytes> bytes`
- ✅ Console shows: `[PDF Download] Created blob URL: blob:...`
- ✅ Console shows: `[PDF Download] Creating anchor element for download...`
- ✅ Console shows: `[PDF Download] Download initiated successfully`
- ✅ **PDF downloads to Android Downloads folder**
- ✅ Success toast shows: "PDF gedownload"
- ✅ Can open PDF from Downloads notification or Files app
- ✅ **NO 401 errors** in console

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

#### Test Case 9: PDF Share (Android)
**Steps:**
1. On Android: Tap 3-dots menu on any invoice
2. Tap "Delen"
3. Check computer console for logs

**Expected Results:**
- ✅ Console shows: `[PDF Share] Starting share for invoice: <id>`
- ✅ Console shows: `[PDF Share] Fetching PDF blob from API...`
- ✅ Console shows: `[PDF Share] Blob received, size: <bytes> bytes`
- ✅ Console shows: `[PDF Share] Sharing PDF file via Web Share API...`
- ✅ **Native Android share sheet appears**
- ✅ Share sheet shows: "Factuur INV-YYYY-XXXX.pdf" (actual PDF file)
- ✅ Can share to: WhatsApp, Gmail, Drive, Bluetooth, etc.
- ✅ If user completes share: Console shows `[PDF Share] File shared successfully`
- ✅ If user cancels: No error (AbortError is caught)
- ✅ **NOT** just sharing a URL - should show PDF file

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

#### Test Case 10: Copy Invoice Link (Android)
**Steps:**
1. On Android: Tap 3-dots menu on any invoice
2. Tap "Kopieer factuurlink"

**Expected Results:**
- ✅ Console shows: `[PDF Copy Link] Copying link for invoice: <id>`
- ✅ Console shows: `[PDF Copy Link] Link copied successfully`
- ✅ Success toast shows: "Factuurlink gekopieerd"
- ✅ Link is copied to clipboard

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

#### Test Case 11: PWA Mode (Android)
**Steps:**
1. On Android: Chrome → Menu → "Install app" or "Add to Home screen"
2. Open app from home screen (standalone PWA mode)
3. Repeat Test Cases 8, 9, 10

**Expected Results:**
- ✅ All behaviors identical to browser mode
- ✅ No popup blocking issues
- ✅ Web Share API works in PWA mode
- ✅ Downloads work in PWA mode

**Actual Results:**
- Test Case 8 (Download): [ ] PASS / [ ] FAIL
- Test Case 9 (Share): [ ] PASS / [ ] FAIL
- Test Case 10 (Copy Link): [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

## Error Scenarios

### Test Case 12: Popup Blocker
**Steps:**
1. Enable popup blocker in browser (usually enabled by default)
2. On iOS Safari: Tap "PDF downloaden"

**Expected Results:**
- ✅ Error toast shows: "Pop-up geblokkeerd. Sta pop-ups toe om de factuur te openen."
- ✅ Console shows: `[PDF Download] Popup blocked by browser`
- ✅ User is informed and knows what to do

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

### Test Case 13: Network Error
**Steps:**
1. Open browser DevTools → Network tab
2. Enable "Offline" mode
3. Click "PDF downloaden"

**Expected Results:**
- ✅ Error toast shows: "Kon PDF niet downloaden: <error message>"
- ✅ Console shows: `[PDF Download] Failed to download PDF: <error>`
- ✅ User is informed about the network error

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

### Test Case 14: Backend Error (500)
**Steps:**
1. (Requires backend access) Mock backend to return 500 error for PDF endpoint
2. Click "PDF downloaden"

**Expected Results:**
- ✅ Error toast shows: "Kon PDF niet downloaden: <backend error message>"
- ✅ Console shows: `[PDF Download] Failed to download PDF: <error>`
- ✅ Detailed error message from backend is shown to user

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

### Test Case 15: Empty PDF Blob
**Steps:**
1. (Requires backend access) Mock backend to return empty PDF blob
2. Click "PDF downloaden"

**Expected Results:**
- ✅ Error toast shows: "Kon PDF niet downloaden: Empty PDF blob received..."
- ✅ Console shows: `[PDF Download] Failed to download PDF: Empty PDF blob...`
- ✅ User is informed about the invalid response

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

## Regression Testing

### Test Case 16: Desktop No Regression
**Steps:**
1. Test on Chrome, Firefox, Safari (desktop)
2. Verify all invoice operations still work:
   - View invoice details
   - Edit invoice
   - Delete invoice
   - Mark as paid/unpaid
   - Send via email
   - Change status

**Expected Results:**
- ✅ All operations work as before
- ✅ No new errors in console
- ✅ No UI glitches or layout issues

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

## Performance Testing

### Test Case 17: Large PDF Download
**Steps:**
1. Create invoice with many line items (10+)
2. Generate large PDF
3. Download on mobile with slow 3G connection

**Expected Results:**
- ✅ Download still works (may take longer)
- ✅ Loading indicator shows during download
- ✅ Blob URL is not revoked too early (60s delay on mobile)
- ✅ No timeout errors

**Actual Results:**
- [ ] PASS / [ ] FAIL
- Notes: _______________________________________

---

## Browser Compatibility Matrix

| Browser | Version | Download | Share | Copy Link | PWA | Status |
|---------|---------|----------|-------|-----------|-----|--------|
| Chrome (Desktop) | 120+ | [ ] | [ ] | [ ] | N/A | [ ] PASS / [ ] FAIL |
| Firefox (Desktop) | 120+ | [ ] | [ ] | [ ] | N/A | [ ] PASS / [ ] FAIL |
| Safari (Desktop) | 17+ | [ ] | [ ] | [ ] | N/A | [ ] PASS / [ ] FAIL |
| iOS Safari | 16+ | [ ] | [ ] | [ ] | [ ] | [ ] PASS / [ ] FAIL |
| iOS Safari | 17+ | [ ] | [ ] | [ ] | [ ] | [ ] PASS / [ ] FAIL |
| Android Chrome | 120+ | [ ] | [ ] | [ ] | [ ] | [ ] PASS / [ ] FAIL |

---

## Sign-Off

**Tested By:** _______________________  
**Date:** _______________________  
**Overall Status:** [ ] PASS / [ ] FAIL

**Critical Issues Found:**
- [ ] None
- [ ] Minor issues (list below)
- [ ] Major issues - DO NOT DEPLOY

**Issues:**
1. _______________________________________
2. _______________________________________
3. _______________________________________

**Deployment Recommendation:**
- [ ] ✅ Ready for production
- [ ] ⚠️ Ready with known issues (documented above)
- [ ] ❌ Not ready - fix issues first

---

## Post-Deployment Verification

After deployment to production:

1. [ ] Verify PDF download works on production iOS Safari
2. [ ] Verify PDF share works on production iOS Safari
3. [ ] Verify PDF download works on production Android Chrome
4. [ ] Verify PDF share works on production Android Chrome
5. [ ] Monitor error logs for PDF-related errors
6. [ ] Check analytics for PDF download success rate
7. [ ] Gather user feedback on mobile PDF experience

**Production Verification Date:** _______________________  
**Production Status:** [ ] VERIFIED / [ ] ISSUES FOUND

---

## Known Limitations (Documented)

1. **Copy Link** functionality copies authenticated API URL:
   - **Limitation**: Link requires login to access
   - **Use Case**: Internal team sharing only
   - **Workaround**: Use "Delen" (Share) for external sharing
   - **Impact**: Low - documented in UI

2. **iOS Safari download attribute ignored**:
   - **Limitation**: iOS doesn't support HTML5 download attribute
   - **Workaround**: PDF opens in new tab; user can Share → Save to Files
   - **Impact**: Extra step but works reliably
   - **Status**: This is an iOS Safari limitation, not a bug

3. **Web Share API file sharing** not available on all browsers:
   - **Supported**: iOS 15.4+, Android Chrome 89+, macOS Safari 15.4+
   - **Fallback**: URL sharing or clipboard copy
   - **Impact**: Older devices share URL instead of file
   - **Status**: Progressive enhancement - graceful degradation

---

## Appendix: Console Log Examples

### Successful PDF Download (Desktop)
```
[PDF Download] Starting download for invoice: 550e8400-e29b-41d4-a716-446655440000 filename: INV-2024-0042.pdf
[PDF Download] Fetching PDF blob from API...
[PDF Download] Blob received, size: 45678 bytes
[PDF Download] Created blob URL: blob:http://localhost:5173/abc123-def456
[PDF Download] Creating anchor element for download...
[PDF Download] Anchor removed from DOM
[PDF Download] Download initiated successfully
[PDF Download] Revoking blob URL after delay
```

### Successful PDF Download (iOS)
```
[PDF Download] Starting download for invoice: 550e8400-e29b-41d4-a716-446655440000 filename: INV-2024-0042.pdf
[PDF Download] Fetching PDF blob from API...
[PDF Download] Blob received, size: 45678 bytes
[PDF Download] Created blob URL: blob:http://localhost:5173/abc123-def456
[PDF Download] iOS detected, opening PDF in new tab...
[PDF Download] Download initiated successfully
[PDF Download] Revoking blob URL after iOS delay
```

### Successful PDF Share (iOS/Android)
```
[PDF Share] Starting share for invoice: 550e8400-e29b-41d4-a716-446655440000 filename: INV-2024-0042.pdf
[PDF Share] Fetching PDF blob from API...
[PDF Share] Blob received, size: 45678 bytes
[PDF Share] Sharing PDF file via Web Share API...
[PDF Share] File shared successfully
```

### Failed Download (Network Error)
```
[PDF Download] Starting download for invoice: 550e8400-e29b-41d4-a716-446655440000 filename: INV-2024-0042.pdf
[PDF Download] Fetching PDF blob from API...
[PDF Download] Failed to download PDF: AxiosError: Network Error
```

### Failed Download (Popup Blocked)
```
[PDF Download] Starting download for invoice: 550e8400-e29b-41d4-a716-446655440000 filename: INV-2024-0042.pdf
[PDF Download] Fetching PDF blob from API...
[PDF Download] Blob received, size: 45678 bytes
[PDF Download] Created blob URL: blob:http://localhost:5173/abc123-def456
[PDF Download] iOS detected, opening PDF in new tab...
[PDF Download] Popup blocked by browser
```
