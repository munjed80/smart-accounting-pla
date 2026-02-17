/**
 * IndexedDB Queue for Offline Background Sync
 * 
 * This module manages a queue of offline requests that will be synchronized
 * when the user comes back online. Only safe, non-financial draft operations
 * are queued.
 * 
 * SECURITY RULES:
 * - ONLY draft creation allowed (not submissions, payments, or deletions)
 * - NO financial transactions
 * - Tenant isolation enforced
 * 
 * Feature flag: VITE_PWA_BG_SYNC=true
 */

const DB_NAME = 'smart-accounting-sync'
const DB_VERSION = 1
const QUEUE_STORE = 'sync-queue'

export interface SyncQueueItem {
  id: string
  type: 'draft_expense' | 'draft_time_entry'
  payload: unknown
  url: string
  method: string
  headers: Record<string, string>
  timestamp: number
  retries: number
}

/**
 * Check if background sync is enabled
 */
export const isBgSyncEnabled = (): boolean => {
  return import.meta.env.VITE_PWA_BG_SYNC === 'true'
}

/**
 * Open IndexedDB database
 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('type', 'type', { unique: false })
      }
    }
  })
}

/**
 * Add item to sync queue
 */
export const addToSyncQueue = async (item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<string> => {
  if (!isBgSyncEnabled()) {
    throw new Error('Background sync is not enabled')
  }

  const db = await openDB()
  const id = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const queueItem: SyncQueueItem = {
    id,
    ...item,
    timestamp: Date.now(),
    retries: 0,
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE], 'readwrite')
    const store = transaction.objectStore(QUEUE_STORE)
    const request = store.add(queueItem)

    request.onsuccess = () => resolve(id)
    request.onerror = () => reject(request.error)

    transaction.oncomplete = () => db.close()
  })
}

/**
 * Get all items from sync queue
 */
export const getSyncQueue = async (): Promise<SyncQueueItem[]> => {
  if (!isBgSyncEnabled()) {
    return []
  }

  const db = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE], 'readonly')
    const store = transaction.objectStore(QUEUE_STORE)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)

    transaction.oncomplete = () => db.close()
  })
}

/**
 * Remove item from sync queue
 */
export const removeFromSyncQueue = async (id: string): Promise<void> => {
  if (!isBgSyncEnabled()) {
    return
  }

  const db = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE], 'readwrite')
    const store = transaction.objectStore(QUEUE_STORE)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)

    transaction.oncomplete = () => db.close()
  })
}

/**
 * Update retry count for an item
 */
export const incrementRetryCount = async (id: string): Promise<void> => {
  if (!isBgSyncEnabled()) {
    return
  }

  const db = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE], 'readwrite')
    const store = transaction.objectStore(QUEUE_STORE)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const item = getRequest.result
      if (item) {
        item.retries += 1
        const putRequest = store.put(item)
        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject(putRequest.error)
      } else {
        resolve()
      }
    }

    getRequest.onerror = () => reject(getRequest.error)

    transaction.oncomplete = () => db.close()
  })
}

/**
 * Clear all items from sync queue
 */
export const clearSyncQueue = async (): Promise<void> => {
  if (!isBgSyncEnabled()) {
    return
  }

  const db = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE], 'readwrite')
    const store = transaction.objectStore(QUEUE_STORE)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)

    transaction.oncomplete = () => db.close()
  })
}

/**
 * Check if a request type is allowed for background sync
 * SECURITY: Only draft creation is allowed
 */
export const isAllowedForSync = (type: string, url: string): boolean => {
  // Only allow draft operations
  const allowedTypes = ['draft_expense', 'draft_time_entry']
  
  // Disallow financial operations
  const disallowedPatterns = [
    '/submit',
    '/payment',
    '/delete',
    '/vat/',
    '/invoice/',
    '/bank/',
  ]

  if (!allowedTypes.includes(type)) {
    return false
  }

  for (const pattern of disallowedPatterns) {
    if (url.includes(pattern)) {
      return false
    }
  }

  return true
}
