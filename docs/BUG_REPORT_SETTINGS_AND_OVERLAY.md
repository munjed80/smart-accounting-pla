# Bug Report: Settings Page and Runtime Error Overlay

**Date**: 2026-02-11  
**Reporter**: GitHub Copilot Developer Agent  
**Status**: Investigation in Progress

## Executive Summary

Investigation of two related issues:
1. `/settings` (Instellingen) page is broken
2. Multiple pages flash a Spark runtime error overlay before rendering

## Phase A: Investigation

### 1. Reproduction Steps

#### Testing /settings Page:
1. Start frontend dev server: `npm run dev` (runs on http://localhost:5000)
2. Navigate to http://localhost:5000 (shows login page)
3. Attempt to navigate directly to http://localhost:5000/settings (requires authentication)
4. Navigate between pages quickly after login
5. Hard refresh on /settings
6. Test mobile viewport behavior

#### Observed Behavior:
- **Backend Connection**: Backend API at http://localhost:8000 is not running (ERR_CONNECTION_REFUSED)
- **Login Page**: Loads successfully with proper error handling for missing backend
- **Settings Page Access**: Requires authentication, cannot test without backend running

### 2. Code Analysis Findings

#### SettingsPage Component (`src/components/SettingsPage.tsx`)

**Potential Issues Identified:**

1. **Unused Variable (Line 345)**:
   ```typescript
   const primaryAdmin = administrations[0]
   ```
   - **Issue**: Variable declared but never used (dead code)
   - **Risk**: If `administrations` array is empty, `administrations[0]` returns `undefined`
   - **Impact**: Currently harmless (unused), but indicates incomplete implementation
   
2. **Data Loading Dependencies**:
   - Component loads 3 data sources in parallel:
     a. Administrations list (required for all users)
     b. Business profile (ZZP users only)
     c. Backend version info (non-blocking)
   
3. **Error Handling**:
   - Administrations API call wrapped in try-catch ✅
   - Business profile API handles 404 gracefully ✅
   - Backend version fetch is non-blocking ✅
   - BUT: `loadError` state is set but never displayed to user ❌

4. **Loading State Management**:
   - Uses `useDelayedLoading` hook to prevent skeleton flash ✅
   - Separate loading states for profile and admin data ✅
   - But no empty state UI when `administrations.length === 0` ❌

### 3. Error Overlay Source Investigation

#### Search Results:
- **Literal String**: "The object can not be found here" does NOT exist in codebase
- **Implication**: Error message likely comes from:
  a. Spark runtime (@github/spark package)
  b. Browser/Vite dev overlay
  c. Dynamic error message constructed at runtime

#### Error Boundary Analysis:

**Main Error Boundary** (`src/main.tsx`):
```typescript
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <App />
</ErrorBoundary>
```
- Uses `react-error-boundary` package
- Fallback: `ErrorFallback.tsx`
- **DEV MODE BEHAVIOR**: Re-throws error to show Vite/browser overlay
- **PROD MODE**: Shows custom error UI

**Dashboard Error Boundary** (`src/components/DashboardErrorBoundary.tsx`):
- Wraps each tab/page content in App.tsx (line 605-607)
- Catches component crashes within dashboard pages
- Shows friendly "Er ging iets mis" UI
- Logs errors with page name context

**Critical Finding**:
```typescript
// ErrorFallback.tsx, line 9
if (import.meta.env.DEV) throw error;
```
**This re-throws errors in dev mode, causing the Spark/Vite overlay to appear!**

### 4. Settings Page Focused Audit

#### What Objects Are Loaded:
1. **`administrations`** - List of user's administrations
   - API: `/api/v1/administrations`
   - Used for: Company info display
   - Error handling: Catches error, sets `loadError` (but never shown)
   
2. **`businessProfile`** - ZZP user business profile
   - API: `/api/v1/zzp/profile`
   - Used for: Business profile editing form
   - Error handling: 404 handled gracefully (profile doesn't exist yet)
   
3. **`backendVersion`** - Backend version info
   - API: `/api/v1/ops/version`
   - Used for: Diagnostics footer
   - Error handling: Non-blocking, sets error message

#### Dependencies:
- ✅ Does NOT depend on `activeAdministrationId`
- ✅ Does NOT depend on `selectedClientId` 
- ✅ Does NOT require route params
- ⚠️ DOES require `user` from AuthContext
- ⚠️ DOES require successful API calls (but has error handling)

#### Missing Error States:
1. **`loadError` is set but never displayed**:
   ```typescript
   const [loadError, setLoadError] = useState<string | null>(null)
   ```
   - Set on line 115: `setLoadError('Failed to load company information')`
   - **Never rendered in JSX** ❌

2. **No empty state for `administrations.length === 0`**:
   - Component assumes at least one administration exists
   - For new users or accountants, array might be empty
   - Should show friendly "No administrations found" UI

3. **Business profile errors are silently ignored**:
   - 404 is expected (no profile yet) ✅
   - Other errors are logged but not shown to user ⚠️

### 5. Root Cause Analysis

#### Settings Page Issues:

**Problem 1**: Load errors are hidden
- **Root Cause**: `loadError` state exists but is not rendered
- **Impact**: Users see blank/skeleton forever if API fails
- **File**: `src/components/SettingsPage.tsx`, line 115, 64
- **Fix**: Display error alert when `loadError !== null`

**Problem 2**: Dead code confusion
- **Root Cause**: `primaryAdmin` variable unused
- **Impact**: Code confusion, potential future bugs
- **File**: `src/components/SettingsPage.tsx`, line 345
- **Fix**: Remove unused variable

**Problem 3**: No empty state handling
- **Root Cause**: Component doesn't handle `administrations.length === 0`
- **Impact**: Poor UX for users without administrations
- **File**: `src/components/SettingsPage.tsx`
- **Fix**: Add empty state UI with CTA

#### Runtime Error Overlay Issues:

**Problem 1**: ErrorFallback re-throws in DEV mode
- **Root Cause**: `if (import.meta.env.DEV) throw error` in ErrorFallback.tsx (line 9)
- **Impact**: ANY error caught by top-level ErrorBoundary shows Vite/Spark overlay
- **File**: `src/ErrorFallback.tsx`, line 9
- **Fix**: Only re-throw critical errors, show inline fallback for recoverable errors

**Problem 2**: Navigation errors not categorized
- **Root Cause**: All errors treated equally, no error types
- **Impact**: 404s, network errors, and fatal errors all show same overlay
- **File**: Error handling throughout app
- **Fix**: Create typed error classes (NotFoundError, NetworkError, etc.)

### 6. Exact Files/Lines Involved

| File | Lines | Issue | Severity |
|------|-------|-------|----------|
| `src/components/SettingsPage.tsx` | 345 | Unused variable `primaryAdmin` | Low |
| `src/components/SettingsPage.tsx` | 64, 115 | `loadError` state never displayed | **High** |
| `src/components/SettingsPage.tsx` | 347-938 | No empty state for `administrations.length === 0` | Medium |
| `src/ErrorFallback.tsx` | 9 | Re-throws all errors in DEV mode | **High** |
| `src/App.tsx` | 605-607 | Good: DashboardErrorBoundary wraps content | Info |

## Phase B: Fix Plan (To Be Implemented)

### 1. Fix Settings Page

#### Change 1: Display Load Errors
- **File**: `src/components/SettingsPage.tsx`
- **Location**: After header, before profile section (around line 363)
- **Code**:
  ```tsx
  {loadError && (
    <Alert variant="destructive" className="mb-6">
      <AlertDescription>{loadError}</AlertDescription>
    </Alert>
  )}
  ```

#### Change 2: Remove Dead Code
- **File**: `src/components/SettingsPage.tsx`
- **Line**: 345
- **Action**: Delete `const primaryAdmin = administrations[0]`

#### Change 3: Add Empty State
- **File**: `src/components/SettingsPage.tsx`
- **Location**: In profile section, after `showLoading` check
- **Code**:
  ```tsx
  {!showLoading && administrations.length === 0 && (
    <Alert>
      <Info size={16} />
      <AlertDescription>
        Geen administraties gevonden. Neem contact op met support.
      </AlertDescription>
    </Alert>
  )}
  ```

### 2. Fix Runtime Error Overlay Flash

#### Change 1: Refine ErrorFallback DEV Mode Behavior
- **File**: `src/ErrorFallback.tsx`
- **Line**: 9
- **Current**: `if (import.meta.env.DEV) throw error;`
- **Proposed**: Show inline error in DEV mode instead of re-throwing
- **Rationale**: Prevents Vite overlay flash for recoverable errors

#### Change 2: Create Typed Errors
- **File**: New file `src/lib/errors.ts`
- **Content**:
  ```typescript
  export class NotFoundError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NotFoundError'
    }
  }
  
  export class NetworkError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NetworkError'
    }
  }
  
  export class UnauthorizedError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'UnauthorizedError'
    }
  }
  ```

#### Change 3: Handle 404s Gracefully in API Client
- **File**: `src/lib/api.ts`
- **Location**: Axios interceptors
- **Action**: Convert 404 responses to NotFoundError instead of generic error

### 3. Add Regression Guards

#### Option 1: Runtime Assertion
- **File**: `src/components/SettingsPage.tsx`
- **Location**: Top of component
- **Code**:
  ```typescript
  if (import.meta.env.DEV && !user) {
    console.warn('[Settings] Rendered without user context')
  }
  ```

#### Option 2: Integration Test (if test infrastructure exists)
- Test: Settings page renders without throwing
- Test: Navigation to /settings doesn't trigger error overlay
- Test: Empty administrations array shows empty state

## Next Steps

1. ✅ Complete investigation report (this file)
2. ⏳ Implement Phase B fixes
3. ⏳ Test fixes locally
4. ⏳ Run code review
5. ⏳ Run security scan (CodeQL)
6. ⏳ Final verification

## Additional Notes

- Backend is required for full testing (not running during investigation)
- Mobile viewport testing deferred until backend is available
- Hard refresh testing deferred until backend is available
- Quick navigation testing requires backend for realistic API interactions

## Evidence Collected

### Console Logs (from initial page load):
```
[API Config] VITE_API_URL: (not set)
[API Config] Final Base URL: http://localhost:8000/api/v1
[API Request] GET http://localhost:8000/api/v1/ops/health
[API Error] network error /ops/health Network Error
Failed to load resource: net::ERR_CONNECTION_REFUSED @ http://localhost:8000/api/v1/ops/health
```

### Screenshots:
- Login page with backend connection error: Available
- Settings page (authenticated): Not yet tested (requires backend)

---

**Investigation Status**: ✅ Complete  
**Ready for Phase B**: Yes  
**Estimated Fix Complexity**: Low (3-4 file changes, ~30 lines of code)
