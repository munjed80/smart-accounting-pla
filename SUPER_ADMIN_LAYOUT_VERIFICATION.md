# Super Admin Layout Fix - Verification Checklist

Use this checklist to verify the Super Admin page improvements on different devices and scenarios.

## 📱 Mobile Testing (iPhone Safari)

### iPhone SE / 8 (375x667)
- [ ] Navigate to `/admin` page
- [ ] Verify header doesn't overlap content
- [ ] Check that safe-area-inset-top is respected (notch area)
- [ ] Tabs wrap to 2-3 rows cleanly
- [ ] All tab buttons are easy to tap (≥44px height)
- [ ] Search input has proper spacing below tabs
- [ ] Offline banner (if triggered) doesn't overlap tabs

### iPhone 12/13/14 (390x844)
- [ ] Navigate to `/admin` page
- [ ] Content starts below safe area (notch)
- [ ] Tabs wrap properly
- [ ] Touch targets are comfortable

### iPhone 14 Pro Max (430x932)
- [ ] Navigate to `/admin` page
- [ ] Layout scales appropriately
- [ ] No horizontal scrolling

## 📱 Mobile Testing (PWA Standalone)

### iOS PWA Mode
- [ ] Install app via "Add to Home Screen"
- [ ] Open app from home screen (standalone mode)
- [ ] Navigate to `/admin`
- [ ] Header positioning correct
- [ ] Safe area properly respected
- [ ] No overlap with system UI

### Android PWA Mode
- [ ] Install app via Chrome "Install App"
- [ ] Open app from home screen
- [ ] Navigate to `/admin`
- [ ] Header positioning correct
- [ ] No overlap with status bar

## 💻 Desktop Testing

### Large Screen (1920x1080)
- [ ] Navigate to `/admin` page
- [ ] Sidebar visible on left
- [ ] Content area has proper padding (pt-4)
- [ ] Tabs remain on single row
- [ ] Search input has max-width constraint

### Medium Screen (1024x768)
- [ ] Sidebar visible on left
- [ ] Content area responsive
- [ ] Tabs may wrap if needed

## 🌐 Browser Testing

### Chrome/Edge (Desktop & Mobile)
- [ ] Layout correct
- [ ] No console errors
- [ ] Tabs interactive

### Firefox (Desktop & Mobile)
- [ ] Layout correct
- [ ] No console errors
- [ ] Tabs interactive

### Safari (Desktop & iOS)
- [ ] Layout correct
- [ ] Safe area support working
- [ ] No console errors

## 🔴 Error State Testing

### Overview Query Error
1. [ ] Block network requests (DevTools → Network → Offline)
2. [ ] Navigate to `/admin` (Users overview section)
3. [ ] Verify error Alert component appears
4. [ ] Check icon (WarningCircle) is visible
5. [ ] Check title "Overzicht kon niet geladen worden"
6. [ ] Check explanation text is readable
7. [ ] Click "Opnieuw proberen" button
8. [ ] Verify button has icon (ArrowClockwise)
9. [ ] Re-enable network
10. [ ] Click "Opnieuw proberen" again
11. [ ] Verify data loads successfully

### Companies Query Error
1. [ ] Navigate to `/admin/companies`
2. [ ] Block network requests
3. [ ] Reload page or trigger search
4. [ ] Verify error Alert appears with retry button
5. [ ] Re-enable network and retry
6. [ ] Verify companies load

### Users Query Error
1. [ ] Navigate to `/admin` (Users section)
2. [ ] Block network requests
3. [ ] Reload page
4. [ ] Verify error Alert appears for user list
5. [ ] Re-enable network and retry
6. [ ] Verify users load

## 🌙 Dark Mode Testing

### Dark Theme
- [ ] Toggle dark mode (if available in app)
- [ ] Navigate to `/admin`
- [ ] Check Alert component contrast
- [ ] Check button visibility
- [ ] Check tab contrast (active vs inactive)
- [ ] Check error message readability

### Light Theme
- [ ] Toggle light mode
- [ ] Navigate to `/admin`
- [ ] Check Alert component contrast
- [ ] Check button visibility
- [ ] Check tab contrast

## 📡 Offline Banner Testing

### Offline Scenario
1. [ ] Go offline (airplane mode or network blocking)
2. [ ] Navigate to `/admin`
3. [ ] Verify OfflineBanner appears at top
4. [ ] Check banner doesn't overlap tabs
5. [ ] Check "Opnieuw proberen" button is visible
6. [ ] Content should be pushed down below banner
7. [ ] Re-enable network
8. [ ] Click "Opnieuw proberen" in banner
9. [ ] Banner should disappear

## 🎯 Tab Navigation Testing

### All Sections
- [ ] Navigate to Users overview (default)
- [ ] Click "Companies overview" tab
- [ ] Click "Subscriptions" tab
- [ ] Click "Revenue metrics" tab
- [ ] Click "System logs" tab
- [ ] Verify URL updates for each section
- [ ] Verify active tab styling is clear
- [ ] All tabs accessible on mobile

## 🔍 Search Testing

### Users Section
- [ ] Navigate to `/admin` (Users section)
- [ ] Search input visible below tabs
- [ ] Type in search field
- [ ] Verify filtering works (if implemented)
- [ ] Check spacing around input

### Companies Section
- [ ] Navigate to `/admin/companies`
- [ ] Search input visible below tabs
- [ ] Type in search field
- [ ] Check spacing around input

### Sections Without Search
- [ ] Navigate to Revenue metrics
- [ ] Verify no search input (as expected)
- [ ] Navigate to System logs
- [ ] Verify no search input (as expected)

## 🏗️ Build & Deploy Testing

### Local Build
- [ ] Run `npm run build`
- [ ] Verify build succeeds with no errors
- [ ] Check for TypeScript errors
- [ ] Check bundle size warnings (expected for this app)

### Lint
- [ ] Run `npm run lint` or `npx eslint src/components/AdminDashboard.tsx src/components/AdminLayout.tsx src/components/AppShell.tsx`
- [ ] Verify no linting errors

### TypeScript
- [ ] Run `tsc --noEmit`
- [ ] Verify no type errors

## ✅ Acceptance Criteria Verification

Final checklist against problem statement requirements:

- [ ] **No overlap**: Header, offline banner, tabs don't overlap on iPhone Safari/PWA
- [ ] **Proper top offset**: Content accounts for header + safe-area-inset-top + offline banner
- [ ] **Tab wrapping**: Tabs wrap cleanly on small screens with ≥44px touch targets
- [ ] **Search spacing**: Search input has consistent gap/padding with other pages
- [ ] **Actionable errors**: Error state includes title, explanation, and retry button
- [ ] **No page reload needed**: Retry button calls refetch(), not full reload
- [ ] **Layout-level fix**: Changes benefit all pages, not just Super Admin
- [ ] **Consistent UI**: Reuses existing Card, Button, Alert components
- [ ] **Dark theme**: Contrast remains consistent in dark mode
- [ ] **Build passes**: TypeScript, lint, build all pass

## 🐛 Known Issues / Limitations

Document any issues found during verification:

- [ ] Issue 1: _____________________
- [ ] Issue 2: _____________________
- [ ] Issue 3: _____________________

## 📝 Notes

Add any additional notes from testing:

---

**Verification Date:** _________________  
**Tested By:** _________________  
**Environment:** _________________  
**Status:** ⬜ Not Started | 🔄 In Progress | ✅ Passed | ❌ Failed
