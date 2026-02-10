# QA Checklist for ZZP + Accountant Bugfixes

## A. Customer Save Button

### Desktop Testing
- [ ] Navigate to /zzp/customers
- [ ] Click "Nieuwe klant" button
- [ ] Fill in customer name and email
- [ ] Click "Klant opslaan" 
- [ ] Verify customer is saved and appears in list
- [ ] Verify success toast appears
- [ ] Verify modal closes after save

### Error Handling
- [ ] Try to save with empty name field
- [ ] Verify error message appears
- [ ] Verify modal stays open
- [ ] Fill in name and save successfully
- [ ] Try invalid email format
- [ ] Verify email validation error
- [ ] Try invalid KVK/BTW number
- [ ] Verify validation errors

### Edit Flow
- [ ] Click edit on existing customer
- [ ] Modify customer data
- [ ] Click "Klant opslaan"
- [ ] Verify changes are saved
- [ ] Verify modal closes

---

## B. Accountant Dossier Empty

### Desktop Testing
- [ ] Login as accountant user
- [ ] Navigate to /accountant/clients
- [ ] Click on a client to open dossier
- [ ] Verify client name appears in header
- [ ] Verify "Actieve klant" badge is shown
- [ ] Verify Issues tab loads data
- [ ] Verify Periods tab loads data
- [ ] Verify no empty/blank screens

### Data Loading
- [ ] Check browser console for API errors
- [ ] Verify X-Selected-Client-Id header is sent in requests
- [ ] Check localStorage for selectedClientId value
- [ ] Switch between different clients
- [ ] Verify data updates for each client

### Permission Checks
- [ ] Try accessing client without consent
- [ ] Verify proper error message
- [ ] Verify RBAC enforcement

---

## C. ZZP Dashboard Disappearing

### Desktop Testing
- [ ] Login as ZZP user with existing administration
- [ ] Navigate to /dashboard
- [ ] Verify dashboard loads and stays visible
- [ ] Check for no flash/flicker
- [ ] Verify stats cards appear
- [ ] Verify action items load

### First-Time User (No Administrations)
- [ ] Login as new ZZP user with no administrations
- [ ] Verify loading screen appears
- [ ] Verify redirect to /onboarding
- [ ] Verify NO flash of dashboard before redirect
- [ ] Complete onboarding
- [ ] Verify redirect to /dashboard
- [ ] Verify dashboard stays visible

### Browser Refresh
- [ ] On dashboard, press F5 to refresh
- [ ] Verify dashboard stays visible
- [ ] Verify no flash or redirect

---

## D. Settings Page Enhancements

### Desktop Testing - Password Change
- [ ] Navigate to /settings
- [ ] Scroll to "Wachtwoord wijzigen" section
- [ ] Fill in current password
- [ ] Fill in new password
- [ ] Fill in confirm password (matching)
- [ ] Click "Wachtwoord wijzigen"
- [ ] Verify success toast (currently mock)
- [ ] Verify form clears

### Password Validation
- [ ] Try mismatched passwords
- [ ] Verify error: "Nieuwe wachtwoorden komen niet overeen"
- [ ] Try password < 8 characters
- [ ] Verify error: "Wachtwoord moet minimaal 8 tekens bevatten"
- [ ] Try empty fields
- [ ] Verify error: "Vul alle velden in"

### Desktop Testing - Data Export
- [ ] Navigate to /settings
- [ ] Scroll to "Data export & backup" section
- [ ] Click "Exporteer als JSON"
- [ ] Verify file downloads
- [ ] Open JSON file and verify data structure
- [ ] Check for: user, administrations, businessProfile, customers, invoices, expenses, timeEntries
- [ ] Click "Exporteer als CSV"
- [ ] Verify CSV file downloads
- [ ] Open CSV and verify customer data

### Mobile Testing - All Features
- [ ] Open settings on mobile viewport (375px width)
- [ ] Verify password section is visible
- [ ] Verify export section is visible
- [ ] Verify responsive layout (no horizontal scroll)
- [ ] Verify buttons are touchable (not too small)
- [ ] Test password change on mobile
- [ ] Test export on mobile

---

## E. Receipt OCR for Expenses

### Desktop Testing - File Upload
- [ ] Navigate to /zzp/expenses
- [ ] Click "Bon scannen" button
- [ ] Verify file picker opens
- [ ] Select an image file (JPEG/PNG)
- [ ] Verify upload starts (scanning toast)
- [ ] Verify expense form opens with prefilled data
- [ ] Verify vendor, amount, date, category are populated
- [ ] Modify any fields if needed
- [ ] Click save
- [ ] Verify expense appears in list

### Mobile Testing - Camera Capture
- [ ] Open /zzp/expenses on mobile device (real device, not emulator)
- [ ] Click "Bon scannen" button
- [ ] Verify camera app launches
- [ ] Take photo of receipt
- [ ] Verify upload starts
- [ ] Verify form opens with prefilled data
- [ ] Verify all fields are editable
- [ ] Save expense
- [ ] Verify expense in list

### Error Handling
- [ ] Try uploading non-image file
- [ ] Verify error message
- [ ] Try uploading very large image (>10MB)
- [ ] Verify appropriate handling
- [ ] Test with poor quality image
- [ ] Verify OCR still returns data (with lower confidence)

### OCR Accuracy (when enhanced)
- [ ] Upload receipt with clear text
- [ ] Verify vendor name extraction
- [ ] Verify amount extraction (with VAT)
- [ ] Verify date extraction
- [ ] Verify category suggestion
- [ ] Check confidence score

---

## General Testing

### Cross-Browser
- [ ] Test all fixes in Chrome
- [ ] Test all fixes in Firefox
- [ ] Test all fixes in Safari
- [ ] Test all fixes in Edge

### Responsive Design
- [ ] Test on mobile (375px)
- [ ] Test on tablet (768px)
- [ ] Test on desktop (1920px)
- [ ] Verify no layout breaks

### Performance
- [ ] Check Network tab for failed requests
- [ ] Check Console for errors
- [ ] Verify page load time < 3s
- [ ] Verify no memory leaks

### Accessibility
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Verify ARIA labels where needed
- [ ] Check color contrast ratios

---

## Security Validation

### Authentication
- [ ] Verify all endpoints require authentication
- [ ] Verify JWT token is sent in headers
- [ ] Verify unauthorized access is blocked

### Authorization
- [ ] Verify ZZP users can only access their data
- [ ] Verify accountants can only access consented clients
- [ ] Verify role-based access control (RBAC)

### Input Validation
- [ ] Test SQL injection attempts
- [ ] Test XSS attempts
- [ ] Test file upload exploits
- [ ] Verify server-side validation

---

## Backend Testing

### API Endpoints
- [ ] POST /api/v1/zzp/customers (create)
- [ ] PUT /api/v1/zzp/customers/:id (update)
- [ ] GET /api/v1/accountant/clients/:id/overview
- [ ] POST /api/v1/zzp/expenses/scan
- [ ] POST /api/v1/auth/change-password (TODO: implement)

### Error Responses
- [ ] Verify 400 for invalid input
- [ ] Verify 401 for unauthorized
- [ ] Verify 403 for forbidden
- [ ] Verify 404 for not found
- [ ] Verify 500 for server errors

---

## Post-Deployment

### Monitoring
- [ ] Check error logs for issues
- [ ] Monitor API response times
- [ ] Track user feedback
- [ ] Monitor OCR usage/costs

### Documentation
- [ ] Update user guide
- [ ] Update API documentation
- [ ] Update deployment notes
- [ ] Document known limitations

---

## Known Limitations

1. **Password Change**: Backend endpoint not yet implemented - currently mocked in frontend
2. **OCR Accuracy**: Currently returns mock data - needs integration with real OCR service (pytesseract, Google Vision, etc.)
3. **CSV Export**: Only exports customers - could be enhanced to export all entities
4. **File Size Limits**: No explicit limits set - should add validation for max file size
