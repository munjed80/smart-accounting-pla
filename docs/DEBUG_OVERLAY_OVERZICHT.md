# Debug Report: Dark Overlay on Overzicht Page

## Problem Description
The Overzicht (Dashboard) page briefly renders correctly, then after ~1 second, a full-screen dark/grey overlay covers the entire page. The overlay has no content, just a semi-transparent black background.

## Investigation Findings

### 1. Overlay Source Identification

**Radix UI Overlay Components** use the following styling:
- **Class**: `fixed inset-0 z-50 bg-black/50`
- **Effect**: Full-screen semi-transparent black overlay (50% opacity)
- **Z-Index**: 50 (high layer, covers most content)

**Components that render this overlay:**

#### A. Sheet Component (`/src/components/ui/sheet.tsx`)
- Line 37: `SheetOverlay` renders with `bg-black/50`
- Usage in `AppShell.tsx` (lines 621-633):
  ```tsx
  <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
    <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 overflow-hidden">
      {/* Mobile navigation */}
    </SheetContent>
  </Sheet>
  ```
- State: `const [sidebarOpen, setSidebarOpen] = useState(false)` (line 261)
- **Verdict**: Sidebar defaults to closed, shouldn't be the issue UNLESS something is setting it to `true` after mount

#### B. Dialog Component (`/src/components/ui/dialog.tsx`)
- Line 39: `DialogOverlay` renders with `bg-black/50`
- **Verdict**: No auto-opening dialogs found in SmartDashboard

#### C. Drawer Component (`/src/components/ui/drawer.tsx`)
- Line 38: `DrawerOverlay` renders with `bg-black/50`
- **Verdict**: No drawer usage found in SmartDashboard

### 2. SmartDashboard Analysis

**Component Structure:**
- Main wrapper: `<div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">`
- Background gradient: `<div className="absolute inset-0 bg-[radial-gradient(...)]" />` (decorative, not blocking)
- Content wrapper: `<div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 opacity-0 animate-in fade-in duration-500">`

**Animation:**
- Uses `opacity-0 animate-in fade-in duration-500` on line 240
- This makes content fade in over 500ms, NOT hide it after 1 second
- **Verdict**: Animation timing doesn't match the "after 1 second" symptom

### 3. Timing Analysis

**Relevant timeouts/delays found:**
- `useDelayedLoading` hook: 300ms delay (for skeleton UI)
- SmartDashboard animation: 500ms fade-in duration
- No 1-second (1000ms) delays found in SmartDashboard or AIInsightsPanel

### 4. Active Client Context

**ActiveClientContext** (`/src/lib/ActiveClientContext.tsx`):
- Manages accountant's active client selection
- Shows toast messages when client is selected
- Does NOT render any overlay UI
- **Verdict**: Not the overlay source

## Root Cause Hypothesis

### Most Likely Cause: **Sheet/Dialog State Bug**

The overlay timing "after 1 second" suggests:
1. Component mounts with overlay closed
2. Some async operation completes ~1 second later
3. State change inadvertently opens a Sheet/Dialog
4. Overlay appears and gets stuck

### Candidates to Investigate:

1. **AppShell Sheet** - Check for:
   - Event listeners that call `setSidebarOpen(true)` 
   - useEffect hooks that modify `sidebarOpen` state
   - Window resize handlers
   - Route change handlers

2. **Hidden Dialog/Sheet** - Search for:
   - Dialogs mounted but not visible in code
   - Conditional rendering that breaks
   - Portal elements rendering outside intended scope

3. **CSS/Layout Issue** - Check for:
   - Fixed elements with wrong positioning
   - Z-index stacking issues
   - Body scroll lock (`overflow: hidden`) lingering

## Protective Fixes Implemented

### 1. Route Change Protection Hook
**File**: `/src/hooks/useCloseOverlayOnRouteChange.ts`
- Listens for `popstate` events (browser back/forward)
- Listens for custom `navigate` events (programmatic navigation)
- Calls cleanup function to close overlays on route changes

### 2. Body Scroll Lock Protection Hook
**File**: `/src/hooks/usePreventBodyScrollLock.ts`
- Checks for stuck body scroll lock (`overflow: hidden`)
- Automatically releases scroll lock if no overlays are open
- Runs on mount and route changes
- Prevents scroll lock from persisting after overlay closes

### 3. AppShell Protection
**File**: `/src/components/AppShell.tsx`
- **Route change protection**: Added `useCloseOverlayOnRouteChange(() => setSidebarOpen(false))`
- **Scroll lock protection**: Added `usePreventBodyScrollLock()` to release stuck scroll locks
- **Escape key handler**: Added `useEffect` to close sidebar when Escape key is pressed
- These protections ensure the mobile Sheet overlay cannot get stuck open

### Benefits:
- ✅ Sheet closes automatically on navigation
- ✅ Escape key closes overlay (better UX)
- ✅ Prevents stuck overlay state during routing
- ✅ Automatically releases stuck body scroll lock
- ✅ Radix UI handles normal scroll lock cleanup, we handle edge cases
- ✅ Console warnings for debugging when locks are released

## Next Steps

1. ✅ Document overlay elements and their sources
2. ✅ Search for state changes that could trigger overlay after 1 second
3. ✅ Check for useEffect hooks with timing logic in AppShell
4. ✅ Verify no dialogs are being rendered with `open={true}` unintentionally
5. ✅ Add safeguards (route change handler, escape key)
6. ⬜ **USER ACTION**: Use DevTools to identify exact overlay (see Investigation Guide below)
7. ⬜ Implement specific fix based on findings
8. ⬜ Test on initial load, refresh, and mobile viewport

## Investigation Guide for Identifying the Overlay

If the overlay still appears after the protective fixes, use these steps to identify it:

### Step 1: Reproduce and Inspect
1. Navigate to the Overzicht page (`/dashboard` or `/`)
2. Wait for the overlay to appear (~1 second)
3. Open DevTools (F12) → Elements tab
4. Click the element picker icon (top-left of DevTools)
5. Click on the dark overlay

### Step 2: Identify the Element
Look for these attributes on the selected element:
- **Classes**: Should include `fixed inset-0 z-50 bg-black/50`
- **Data attributes**:
  - `data-slot="sheet-overlay"` → Sheet (mobile sidebar)
  - `data-slot="dialog-overlay"` → Dialog
  - `data-slot="alert-dialog-overlay"` → AlertDialog  
  - `data-state="open"` → Currently open
  - `data-state="closed"` → Should be closed (bug if visible)

### Step 3: Find Parent Component
1. In DevTools, navigate up the DOM tree from the overlay
2. Look for parent elements with `data-slot` or `data-radix-*` attributes
3. Note the component type (Sheet, Dialog, AlertDialog, Drawer)

### Step 4: Check React State
1. Install React DevTools browser extension
2. Select the overlay element
3. Navigate up to the Sheet/Dialog component
4. Check the `open` or `isOpen` prop value
5. Find which component is setting this state

### Expected Results

**If it's the AppShell Sheet:**
- `data-slot="sheet-overlay"`
- Parent: `<Sheet>` component in `AppShell.tsx`
- State: `sidebarOpen` should be `false`
- **Already fixed**: Route change and Escape handlers added

**If it's a different component:**
- Document the `data-slot` value
- Document the parent component name
- Document the state variable name
- Report these findings for targeted fix

## Technical Details

**Overlay CSS:**
```css
.fixed.inset-0.z-50.bg-black\/50 {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  background-color: rgb(0 0 0 / 0.5);
}
```

**Animation Classes:**
- `data-[state=open]:animate-in` - Triggers animation when open
- `data-[state=open]:fade-in-0` - Fades in from 0 opacity
- `data-[state=closed]:animate-out` - Triggers animation when closing
- `data-[state=closed]:fade-out-0` - Fades out to 0 opacity

## Status
🔍 **IN PROGRESS** - Root cause not yet identified. Need to investigate state management and timing.
