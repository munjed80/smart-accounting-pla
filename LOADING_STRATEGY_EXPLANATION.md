# Loading Strategy Implementation - Brief Explanation

## Where the Delay Logic Lives

### Primary Location
**File:** `/src/hooks/useDelayedLoading.ts`

This is a custom React hook that implements the 300ms delay logic. It accepts three parameters:

```typescript
useDelayedLoading(
  isLoading: boolean,      // The actual loading state from API
  delay: number = 300,     // Delay in ms before showing skeleton
  hasData: boolean = false // Whether cached data exists
)
```

### Usage in Components
The hook is imported and used in **38+ components** across the application:

```typescript
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

const [isLoading, setIsLoading] = useState(true)
const [stats, setStats] = useState<TransactionStats | null>(null)

// Create delayed loading state
const showLoading = useDelayedLoading(isLoading, 300, !!stats)

// Use in JSX
{showLoading ? <Skeleton /> : <Content />}
```

---

## How Skeleton Visibility is Controlled

### The Hook Mechanism

The `useDelayedLoading` hook uses React's `useEffect` and `setTimeout` to control visibility:

1. **Immediate Skip (Cached Data):**
   ```typescript
   if (hasData) {
     setShowLoading(false)
     return
   }
   ```
   If data exists, immediately return `false` - no skeleton shown.

2. **Not Loading:**
   ```typescript
   if (!isLoading) {
     setShowLoading(false)
     return
   }
   ```
   If not loading, hide skeleton immediately.

3. **Loading with Delay:**
   ```typescript
   const timer = setTimeout(() => {
     if (isLoading) {
       setShowLoading(true)
     }
   }, delay)
   
   return () => clearTimeout(timer)
   ```
   Start a timer. If still loading after 300ms, show skeleton. If loading completes before timer, cancel it.

### Visual Flow

```
API Call Starts (isLoading = true)
         ↓
   Start 300ms Timer
         ↓
    ← Wait 300ms →
         ↓
   Still loading? → YES → showLoading = true → Skeleton visible
         ↓
   Still loading? → NO → Timer cancelled → No skeleton
```

### Conditional Rendering

Every component uses this pattern:

```typescript
{showLoading ? (
  // Show skeleton
  <Skeleton className="h-10 w-24" />
) : (
  // Show actual content with fade-in
  <div style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
    {actualContent}
  </div>
)}
```

---

## How Cached Data Skips Loading UI

### The Third Parameter: `hasData`

The hook's third parameter controls cache-aware behavior:

```typescript
const showLoading = useDelayedLoading(
  isLoading,
  300,
  !!data  // ← This is the cache check
)
```

### Cache Check Logic

**When `hasData = true`:**
```typescript
useEffect(() => {
  // If we have cached data, never show loading UI
  if (hasData) {
    setShowLoading(false)
    return  // Exit early, no timer set
  }
  // ... rest of logic
}, [isLoading, delay, hasData])
```

The hook **immediately returns `false`** without starting any timer. This means the skeleton will never appear, even if a background refresh is in progress.

### Example Scenarios

#### Example 1: Dashboard Stats

```typescript
const [stats, setStats] = useState<TransactionStats | null>(null)
const [isLoading, setIsLoading] = useState(true)

const showLoading = useDelayedLoading(isLoading, 300, !!stats)
```

**First Visit:**
- `stats = null` → `!!stats = false` → `hasData = false`
- Timer starts, may show skeleton after 300ms

**Revisit (stats in memory):**
- `stats = { ... }` → `!!stats = true` → `hasData = true`
- Hook immediately returns `false`, no skeleton ever shown
- Background refresh happens silently
- New data updates smoothly

#### Example 2: Invoice List

```typescript
const [invoices, setInvoices] = useState<Invoice[]>([])
const [isLoading, setIsLoading] = useState(true)

const showLoading = useDelayedLoading(isLoading, 300, invoices.length > 0)
```

**First Visit:**
- `invoices = []` → `invoices.length > 0 = false` → `hasData = false`
- Timer starts, may show skeleton

**Revisit (invoices loaded):**
- `invoices = [invoice1, invoice2, ...]` → `invoices.length > 0 = true` → `hasData = true`
- No skeleton, even during refresh

### Visual Flow with Cache

```
User Revisits Page
       ↓
Data exists in state (stats !== null)
       ↓
API refresh starts (isLoading = true)
       ↓
useDelayedLoading(true, 300, true)
       ↓
hasData = true → immediately return false
       ↓
showLoading = false
       ↓
Existing data shown (no skeleton)
       ↓
API completes in background
       ↓
New data replaces old
       ↓
Smooth content update (no visual interruption)
```

---

## Summary

### Delay Logic Location
- **Hook:** `/src/hooks/useDelayedLoading.ts`
- **Usage:** 38+ component files import and use this hook
- **Mechanism:** `setTimeout` with 300ms delay, automatic cleanup

### Skeleton Visibility Control
- **State:** `showLoading` boolean from hook
- **Rendering:** `{showLoading ? <Skeleton /> : <Content />}`
- **Timing:** Shows only after 300ms if still loading
- **Transitions:** 200ms opacity fade for smooth appearance

### Cached Data Skip
- **Parameter:** Third parameter to hook (`hasData`)
- **Check:** `!!data` or `data.length > 0` or similar
- **Behavior:** When `true`, hook immediately returns `false`
- **Result:** No skeleton on revisit, silent background refresh

This creates a professional, modern loading experience comparable to Stripe, Linear, and other financial SaaS platforms.
