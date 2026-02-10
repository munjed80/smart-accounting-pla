# ZZP Invoices UX + Actions - Manual Test Steps

## Overview
This document outlines the manual test steps for verifying the ZZP invoices UX improvements and action fixes.

## Prerequisites
- At least one customer created in the system
- Access to both desktop and mobile browsers
- Test on iOS Safari for mobile-specific features

## Test Scenarios

### 1. Status Workflow Tests

#### 1.1 Draft Invoice → Send
**Steps:**
1. Create a new draft invoice
2. Open the invoice's 3-dot menu (⋮)
3. Verify "Verzenden" (Send) option is visible
4. Click "Verzenden"
5. Verify toast notification appears: "Factuur verzonden"
6. Verify invoice status changes to "Verzonden" (Sent)
7. Verify UI updates immediately without page refresh

**Expected:**
- Draft invoices show "Verzenden" action
- Status changes from draft → sent
- Toast notification confirms action
- UI updates immediately

#### 1.2 Sent Invoice → Mark as Paid
**Steps:**
1. Find or create a sent invoice
2. Open the invoice's 3-dot menu (⋮)
3. Verify "Markeer als betaald" option is visible
4. Verify "Verzenden" option is NOT visible (already sent)
5. Click "Markeer als betaald"
6. Verify toast notification: "Factuur gemarkeerd als betaald"
7. Verify invoice status changes to "Betaald" (Paid)

**Expected:**
- Sent/overdue invoices show "Markeer als betaald"
- Status changes to paid
- Toast notification confirms action
- UI updates immediately

#### 1.3 Paid Invoice → Mark as Unpaid
**Steps:**
1. Find a paid invoice
2. Open the invoice's 3-dot menu (⋮)
3. Verify "Markeer als onbetaald" option is visible
4. Verify "Markeer als betaald" is NOT visible (already paid)
5. Click "Markeer als onbetaald"
6. Verify toast notification: "Factuur gemarkeerd als onbetaald"
7. Verify invoice status reverts to "Verzonden" (Sent)

**Expected:**
- Paid invoices show "Markeer als onbetaald"
- Status changes from paid → sent
- Toast notification confirms action
- UI updates immediately

#### 1.4 Status Actions Visibility
**Steps:**
1. Check 3-dot menu for different invoice statuses:
   - **Draft**: Should show "Verzenden" and "Verwijderen" (Delete)
   - **Sent**: Should show "Markeer als betaald"
   - **Paid**: Should show "Markeer als onbetaald"
   - **Cancelled**: Should show NO status actions
   - **Overdue**: Should show "Markeer als betaald"

**Expected:**
- Status actions appear only for appropriate statuses
- No status actions for cancelled invoices
- Consistent behavior in both card and table views

### 2. Share/Copy Link Tests

#### 2.1 Copy Invoice Link
**Steps:**
1. Open any invoice's 3-dot menu (⋮)
2. Verify menu item shows "Kopieer factuurlink" (not "Kopieer link")
3. Click "Kopieer factuurlink"
4. Verify toast: "Factuurlink gekopieerd naar klembord"
5. Paste the copied link
6. Verify it's a PDF URL in format: `{origin}/api/v1/zzp/invoices/{id}/pdf`
7. Open the link in a browser
8. Verify PDF downloads or opens

**Expected:**
- Link is the direct PDF endpoint, not a page route
- PDF can be accessed via the link
- Customer-usable link (not /zzp/invoices?view=id)

#### 2.2 Share Invoice
**Steps:**
1. Open any invoice's 3-dot menu (⋮)
2. Click "Delen" (Share)
3. If on mobile with Web Share API:
   - Verify native share sheet appears
   - Verify share contains PDF URL
   - Share to a test app/contact
4. If on desktop without Web Share API:
   - Verify fallback copies link to clipboard
   - Verify toast: "Factuurlink gekopieerd naar klembord"
5. Verify shared/copied link is PDF URL

**Expected:**
- Share uses PDF URL, not page route
- Web Share API works on mobile
- Clipboard fallback works on desktop
- Toast notifications appear correctly

### 3. PDF Download Tests

#### 3.1 Desktop PDF Download
**Browser:** Chrome, Firefox, Edge on desktop

**Steps:**
1. Open invoice 3-dot menu (⋮)
2. Click "PDF downloaden"
3. Verify toast: "PDF wordt gedownload..."
4. Verify PDF downloads to default download folder
5. Verify toast: "PDF gedownload"
6. Open downloaded PDF
7. Verify PDF contains correct invoice data

**Expected:**
- Download uses anchor element with download attribute
- PDF downloads to Downloads folder
- Filename format: `{invoice_number}.pdf`
- Toast notifications work correctly

#### 3.2 iOS Safari PDF Download
**Browser:** Safari on iPhone/iPad

**Steps:**
1. Open invoice 3-dot menu (⋮)
2. Click "PDF downloaden"
3. Verify toast: "PDF wordt gedownload..."
4. Verify PDF opens in new tab (window.open)
5. Verify PDF viewer displays correctly
6. Verify NO "popup blocked" error
7. From PDF viewer, use iOS share/save options
8. Verify toast: "PDF gedownload"

**Expected:**
- PDF opens in new tab/window (iOS ignores download attribute)
- window.open used instead of anchor click
- PDF viewer works correctly
- No download attribute issues

#### 3.3 Mobile PDF Download (Android)
**Browser:** Chrome on Android

**Steps:**
1. Open invoice 3-dot menu (⋮)
2. Click "PDF downloaden"
3. Verify PDF downloads or opens based on browser settings
4. Verify toast notifications appear
5. Verify PDF is accessible

**Expected:**
- Download works using anchor element
- Falls back to window.open if blob fails
- Toast notifications work

#### 3.4 Popup Blocker Test
**Steps:**
1. Enable popup blocker in browser
2. Open invoice 3-dot menu (⋮)
3. Click "PDF downloaden" (on iOS or mobile)
4. If popup is blocked:
   - Verify toast: "Pop-up geblokkeerd. Sta pop-ups toe..."
5. Allow popups for the site
6. Retry PDF download
7. Verify PDF opens successfully

**Expected:**
- Popup blocker detection works
- Clear error message shown
- Retry works after allowing popups

### 4. UI Consistency Tests

#### 4.1 Card View (Mobile)
**Steps:**
1. View invoices on small screen (< 1024px width)
2. Verify invoices display as cards
3. For each invoice card:
   - Verify 3-dot menu shows all actions
   - Verify status badge/selector displays correctly
   - Verify all action handlers work

**Expected:**
- Cards show correctly on mobile
- All actions accessible
- Consistent with table view

#### 4.2 Table View (Desktop)
**Steps:**
1. View invoices on large screen (≥ 1024px width)
2. Verify invoices display in table
3. For each invoice row:
   - Verify 3-dot menu shows all actions
   - Verify status selector works (for non-draft)
   - Verify status badge shows (for draft)
   - Verify all action handlers work

**Expected:**
- Table displays correctly on desktop
- All actions accessible
- Consistent with card view

### 5. Edge Cases

#### 5.1 Network Error Handling
**Steps:**
1. Disconnect network
2. Try to send invoice
3. Verify error toast appears
4. Try to mark as paid
5. Verify error toast appears
6. Try to download PDF
7. Verify error toast appears
8. Reconnect network
9. Verify all actions work again

**Expected:**
- Error messages display clearly
- User understands what went wrong
- Actions work after reconnection

#### 5.2 Concurrent Status Updates
**Steps:**
1. Open same invoice in two tabs
2. In Tab 1: Send draft invoice
3. In Tab 2: Refresh page
4. Verify Tab 2 shows updated status
5. Try to send again in Tab 2
6. Verify no errors or duplicate actions

**Expected:**
- Status updates propagate correctly
- No race conditions
- Data consistency maintained

#### 5.3 Large Invoice Numbers
**Steps:**
1. Create invoice with long invoice number
2. Verify number displays correctly in:
   - Card view
   - Table view
   - 3-dot menu actions
   - PDF filename
3. Verify no layout issues

**Expected:**
- Long numbers truncate gracefully
- UI remains usable
- PDF filename valid

## Test Completion Checklist

- [ ] All status workflow tests pass
- [ ] Share/Copy link uses PDF URL
- [ ] Desktop PDF download works
- [ ] iOS Safari PDF download works
- [ ] Android PDF download works
- [ ] Popup blocker handling works
- [ ] Card view consistent with table view
- [ ] Error handling works correctly
- [ ] Toast notifications display properly
- [ ] No console errors during testing

## Known Issues/Limitations

1. **PDF link authentication**: The PDF URL endpoint requires authentication. Customers need to be logged in or URL needs to be signed/public (future enhancement).

2. **iOS Safari download attribute**: iOS Safari ignores the download attribute, so we use window.open to view PDF instead. Users can save from the PDF viewer.

3. **Popup blockers**: Some browsers block window.open calls. Users need to allow popups for the site.

## Success Criteria

✅ All status transitions work correctly with immediate UI updates
✅ Share/Copy provides customer-usable PDF link
✅ PDF download works on iOS Safari using window.open
✅ Proper error handling and user feedback
✅ Consistent UX across desktop and mobile
✅ No regression in existing functionality
