# Background Sync Implementation

This document describes the optional Background Sync feature for the Smart Accounting Platform PWA.

## Overview

Background Sync allows the app to queue actions when offline and automatically synchronize them when the user comes back online. This improves the user experience by making the app feel more responsive and reliable.

## Feature Flag

Background sync is **disabled by default** and must be explicitly enabled:

```bash
# In .env or environment variables
VITE_PWA_BG_SYNC=true
```

## Security Restrictions

**CRITICAL**: Background sync is LIMITED to safe, non-financial draft operations only.

### ✅ Allowed Operations

- Creating draft expense entries
- Creating draft time entries

### ❌ Disallowed Operations (Security)

- Submitting any transactions
- Processing payments
- Deleting records
- VAT submissions
- Invoice generation or submission
- Bank transaction processing
- Any financial operations

These restrictions ensure that:
1. No financial data is automatically submitted without user review
2. Tenant isolation is maintained
3. No unauthorized modifications occur while offline

## How It Works

### 1. Offline Detection

When the user tries to perform an allowed action while offline:

```typescript
import { addToSyncQueue, isAllowedForSync, isBgSyncEnabled } from '@/lib/syncQueue'

// Check if offline
if (!navigator.onLine && isBgSyncEnabled()) {
  // Check if this operation is allowed
  if (isAllowedForSync('draft_expense', url)) {
    // Queue the request
    await addToSyncQueue({
      type: 'draft_expense',
      payload: expenseData,
      url: '/api/v1/expenses/draft',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    
    // Show user feedback
    toast.info('Wordt gesynchroniseerd zodra je online bent')
  }
}
```

### 2. Queue Storage

Queued items are stored in IndexedDB (not localStorage):
- Database: `smart-accounting-sync`
- Object Store: `sync-queue`
- Persistent across sessions
- Survives page reloads

### 3. Sync Trigger

When the user comes back online:
1. Service worker registers a `sync` event
2. Retrieves all queued items from IndexedDB
3. Processes them **sequentially** (not parallel)
4. Handles success, conflict, or error for each item

### 4. Conflict Handling

If a queued item conflicts with server state:
- **Stop processing** remaining items
- Show notification to user
- User must resolve manually

This prevents cascading data corruption.

## API Usage

### Check if Background Sync is Enabled

```typescript
import { isBgSyncEnabled } from '@/lib/syncQueue'

if (isBgSyncEnabled()) {
  // Background sync is available
}
```

### Add Item to Queue

```typescript
import { addToSyncQueue } from '@/lib/syncQueue'

const id = await addToSyncQueue({
  type: 'draft_expense',
  payload: { description: 'Test', amount: 100 },
  url: '/api/v1/expenses/draft',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token',
  },
})
```

### Get Queue Status

```typescript
import { getSyncQueue } from '@/lib/syncQueue'

const queuedItems = await getSyncQueue()
console.log(`${queuedItems.length} items waiting to sync`)
```

### Clear Queue

```typescript
import { clearSyncQueue } from '@/lib/syncQueue'

await clearSyncQueue()
```

## User Experience

### When Offline

1. User creates a draft expense
2. App detects offline state
3. Shows message: **"Wordt gesynchroniseerd zodra je online bent"**
4. Data is queued in IndexedDB
5. UI shows draft with sync indicator

### When Coming Online

1. Service worker detects online state
2. Automatically starts sync process
3. Processes queued items one by one
4. On success: removes from queue silently
5. On conflict: stops and shows notification
6. On error: retries up to 3 times

### Sync Status Indicator (Optional)

Show sync status in the UI:

```typescript
import { getSyncQueue } from '@/lib/syncQueue'
import { useEffect, useState } from 'react'

const [pendingSync, setPendingSync] = useState(0)

useEffect(() => {
  const checkQueue = async () => {
    const queue = await getSyncQueue()
    setPendingSync(queue.length)
  }
  
  checkQueue()
  window.addEventListener('online', checkQueue)
  window.addEventListener('offline', checkQueue)
  
  return () => {
    window.removeEventListener('online', checkQueue)
    window.removeEventListener('offline', checkQueue)
  }
}, [])

// In UI
{pendingSync > 0 && (
  <Badge variant="secondary">
    {pendingSync} wachtend op sync
  </Badge>
)}
```

## Limitations

### 1. Draft-Only Operations

Only draft creation is supported. Submissions and financial operations are explicitly forbidden.

### 2. Sequential Processing

Items are processed one at a time to:
- Detect conflicts early
- Maintain data integrity
- Avoid race conditions

### 3. Retry Limit

Each item is retried up to **3 times**. After that:
- Item is removed from queue
- User is notified
- Manual intervention required

### 4. No Automatic Reordering

If item 2 fails due to conflict, items 3+ are **not** processed. User must resolve the conflict first.

### 5. Token Expiration

If the auth token expires while offline:
- Sync will fail on reconnection
- User must re-authenticate
- Queue is preserved for next sync

## Testing

### Manual Testing

1. **Enable feature flag**:
   ```bash
   VITE_PWA_BG_SYNC=true npm run dev
   ```

2. **Go offline**:
   - Chrome DevTools → Network → Offline checkbox

3. **Create draft expense**:
   - Should show "Wordt gesynchroniseerd zodra je online bent"

4. **Check queue**:
   - Open DevTools → Application → IndexedDB → smart-accounting-sync
   - Verify item is queued

5. **Go online**:
   - Uncheck Offline in DevTools
   - Wait 1-2 seconds
   - Verify item is synced (removed from IndexedDB)

### Automated Testing

```typescript
import { addToSyncQueue, getSyncQueue, clearSyncQueue } from '@/lib/syncQueue'

describe('Background Sync Queue', () => {
  beforeEach(async () => {
    await clearSyncQueue()
  })

  it('should add item to queue', async () => {
    const id = await addToSyncQueue({
      type: 'draft_expense',
      payload: { test: true },
      url: '/api/test',
      method: 'POST',
      headers: {},
    })
    
    expect(id).toBeTruthy()
    
    const queue = await getSyncQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe(id)
  })

  it('should reject disallowed operations', () => {
    expect(isAllowedForSync('payment', '/api/payments')).toBe(false)
    expect(isAllowedForSync('draft_expense', '/api/vat/submit')).toBe(false)
  })
})
```

## Security Considerations

### Data Validation

Before queuing:
1. Validate data format
2. Check allowed operation type
3. Verify URL pattern
4. Ensure tenant context

### Conflict Resolution

On conflict (HTTP 409):
1. **Stop processing** immediately
2. Do NOT automatically merge
3. Require user review
4. Preserve queue state

### No Sensitive Data

Do NOT queue:
- Payment information
- Bank credentials
- VAT submissions
- Signed documents

## Monitoring

### Queue Size

Monitor queue size in production:
- Alert if queue > 50 items per user
- Indicates sync issues or offline abuse

### Sync Success Rate

Track sync outcomes:
- Success rate should be > 95%
- High conflict rate indicates UX issues

### Retry Patterns

Monitor retry counts:
- High retry count indicates network issues
- Consistent failures may indicate bugs

## Troubleshooting

### Queue Items Not Syncing

**Check**:
1. Feature flag enabled (`VITE_PWA_BG_SYNC=true`)
2. Service worker active and registered
3. Browser console for sync errors
4. Network tab for failed requests

### Sync Conflicts

**Resolution**:
1. User reviews conflicting item
2. User chooses: keep server version or local version
3. Manual sync or discard local changes

### Queue Growing Indefinitely

**Causes**:
- Token expiration
- Server errors (500)
- Network configuration issues

**Fix**:
1. Check auth token validity
2. Verify server health
3. Clear queue if corrupted: `clearSyncQueue()`

## Future Enhancements

Potential improvements (not implemented):

1. **Conflict Resolution UI**: Visual interface for resolving conflicts
2. **Selective Sync**: Allow user to choose which items to sync
3. **Priority Queue**: High-priority items sync first
4. **Batch Sync**: Send multiple items in one request
5. **Sync Analytics**: Dashboard showing sync statistics

## Disabling Background Sync

To disable background sync:

1. Remove or set feature flag to false:
   ```bash
   # In .env
   VITE_PWA_BG_SYNC=false
   ```

2. Clear existing queue:
   ```typescript
   import { clearSyncQueue } from '@/lib/syncQueue'
   await clearSyncQueue()
   ```

3. Rebuild application

---

**Last Updated**: 2026-02-17  
**Version**: 1.0  
**Status**: Optional Feature (Disabled by Default)
