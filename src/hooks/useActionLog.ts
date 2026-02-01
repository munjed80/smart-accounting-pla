/**
 * useActionLog - Persistent Action Log Store
 * 
 * Stores bulk operation history in localStorage for the "Acties" page.
 * Each entry contains:
 * - id: unique identifier
 * - action_type: type of bulk operation
 * - timestamp: when the action was executed
 * - selected_count: number of clients selected
 * - result_counts: success/failed/skipped counts
 * - client_results: minimal per-client result summary
 * 
 * Data is persisted in localStorage and kept for 30 days max.
 */

import { useState, useEffect, useCallback } from 'react'
import { BulkOperationResponse, BulkOperationResultItem } from '@/lib/api'

// localStorage key
const ACTION_LOG_KEY = 'accountant_action_log'

// Max entries to keep
const MAX_ENTRIES = 100

// Max age in milliseconds (30 days)
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// Action types
export type ActionType = 
  | 'recalculate'
  | 'ack_yellow'
  | 'generate_vat'
  | 'send_reminders'
  | 'lock_period'

// Client result summary (minimal)
export interface ClientResultSummary {
  client_id: string
  client_name: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  error_message: string | null
}

// Action log entry
export interface ActionLogEntry {
  id: string
  action_type: ActionType
  timestamp: string
  selected_count: number
  result_counts: {
    success: number
    failed: number
    skipped: number
  }
  client_results: ClientResultSummary[]
  // Optional: period info for VAT operations
  vat_period?: {
    year: number
    quarter: number
  }
  // Optional: reminder info
  reminder_info?: {
    type: string
    title: string
  }
}

/**
 * Load action log from localStorage
 */
const loadActionLog = (): ActionLogEntry[] => {
  try {
    const stored = localStorage.getItem(ACTION_LOG_KEY)
    if (stored) {
      const entries: ActionLogEntry[] = JSON.parse(stored)
      // Filter out stale entries (> 30 days old)
      const cutoff = Date.now() - MAX_AGE_MS
      return entries.filter(entry => {
        const entryTime = new Date(entry.timestamp).getTime()
        return entryTime > cutoff
      })
    }
  } catch {
    console.warn('Failed to load action log from localStorage')
  }
  return []
}

/**
 * Save action log to localStorage
 */
const saveActionLog = (entries: ActionLogEntry[]) => {
  try {
    // Keep only the most recent MAX_ENTRIES
    const trimmed = entries.slice(0, MAX_ENTRIES)
    localStorage.setItem(ACTION_LOG_KEY, JSON.stringify(trimmed))
  } catch {
    console.warn('Failed to save action log to localStorage')
  }
}

/**
 * Convert BulkOperationResponse to ActionLogEntry
 */
export const createActionLogEntry = (
  response: BulkOperationResponse,
  actionType: ActionType,
  selectedCount: number,
  options?: {
    vatPeriod?: { year: number; quarter: number }
    reminderInfo?: { type: string; title: string }
  }
): ActionLogEntry => {
  // Map results to minimal summary
  const clientResults: ClientResultSummary[] = response.results.map((r: BulkOperationResultItem) => ({
    client_id: r.client_id,
    client_name: r.client_name,
    status: r.status,
    error_message: r.error_message,
  }))

  return {
    id: response.id || `local-${Date.now()}`,
    action_type: actionType,
    timestamp: new Date().toISOString(),
    selected_count: selectedCount,
    result_counts: {
      success: response.successful_clients,
      failed: response.failed_clients,
      skipped: response.total_clients - response.successful_clients - response.failed_clients,
    },
    client_results: clientResults,
    vat_period: options?.vatPeriod,
    reminder_info: options?.reminderInfo,
  }
}

export interface UseActionLogReturn {
  /** All action log entries (most recent first) */
  entries: ActionLogEntry[]
  /** Get the most recent N entries */
  getRecent: (count: number) => ActionLogEntry[]
  /** Add a new entry to the log */
  addEntry: (entry: ActionLogEntry) => void
  /** Add entry from a BulkOperationResponse */
  logBulkOperation: (
    response: BulkOperationResponse,
    actionType: ActionType,
    selectedCount: number,
    options?: {
      vatPeriod?: { year: number; quarter: number }
      reminderInfo?: { type: string; title: string }
    }
  ) => void
  /** Get entry by ID */
  getEntry: (id: string) => ActionLogEntry | undefined
  /** Clear all entries */
  clearLog: () => void
  /** Number of entries */
  count: number
}

/**
 * Custom hook for managing the action log
 */
export function useActionLog(): UseActionLogReturn {
  const [entries, setEntries] = useState<ActionLogEntry[]>(() => loadActionLog())

  // Save to localStorage when entries change
  useEffect(() => {
    saveActionLog(entries)
  }, [entries])

  const getRecent = useCallback((count: number): ActionLogEntry[] => {
    return entries.slice(0, count)
  }, [entries])

  const addEntry = useCallback((entry: ActionLogEntry) => {
    setEntries(prev => [entry, ...prev].slice(0, MAX_ENTRIES))
  }, [])

  const logBulkOperation = useCallback((
    response: BulkOperationResponse,
    actionType: ActionType,
    selectedCount: number,
    options?: {
      vatPeriod?: { year: number; quarter: number }
      reminderInfo?: { type: string; title: string }
    }
  ) => {
    const entry = createActionLogEntry(response, actionType, selectedCount, options)
    addEntry(entry)
  }, [addEntry])

  const getEntry = useCallback((id: string): ActionLogEntry | undefined => {
    return entries.find(e => e.id === id)
  }, [entries])

  const clearLog = useCallback(() => {
    setEntries([])
    localStorage.removeItem(ACTION_LOG_KEY)
  }, [])

  return {
    entries,
    getRecent,
    addEntry,
    logBulkOperation,
    getEntry,
    clearLog,
    count: entries.length,
  }
}

export default useActionLog
