/**
 * useClientSelection - Shared Client Selection Store
 * 
 * Provides a persistent selection state for bulk operations:
 * - Stores selectedClientIds in localStorage (survives refresh)
 * - Supports multi-select from PriorityClientsPanel, main table, etc.
 * - Emits events for cross-component synchronization
 * 
 * Usage:
 * const { selectedIds, toggleSelect, selectAll, clearAll, isSelected, count } = useClientSelection()
 */

import { useState, useEffect, useCallback } from 'react'

// localStorage key
const SELECTION_KEY = 'accountant_selected_client_ids'

// Custom event name for cross-component sync
const SELECTION_CHANGED_EVENT = 'clientSelectionChanged'

// Stale selection age: 24 hours in milliseconds
const STALE_SELECTION_AGE_MS = 24 * 60 * 60 * 1000

interface SelectionData {
  ids: string[]
  updatedAt: number
}

/**
 * Load selection from localStorage
 */
const loadSelection = (): Set<string> => {
  try {
    const stored = localStorage.getItem(SELECTION_KEY)
    if (stored) {
      const data: SelectionData = JSON.parse(stored)
      // Check if data is stale (> 24 hours) and clear if so
      if (Date.now() - data.updatedAt > STALE_SELECTION_AGE_MS) {
        localStorage.removeItem(SELECTION_KEY)
        return new Set()
      }
      return new Set(data.ids)
    }
  } catch {
    console.warn('Failed to load client selection from localStorage')
  }
  return new Set()
}

/**
 * Save selection to localStorage
 */
const saveSelection = (ids: Set<string>) => {
  try {
    const data: SelectionData = {
      ids: Array.from(ids),
      updatedAt: Date.now(),
    }
    localStorage.setItem(SELECTION_KEY, JSON.stringify(data))
    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent(SELECTION_CHANGED_EVENT, { detail: { ids: data.ids } }))
  } catch {
    console.warn('Failed to save client selection to localStorage')
  }
}

export interface UseClientSelectionReturn {
  /** Currently selected client IDs */
  selectedIds: Set<string>
  /** Array of selected IDs (for easier iteration) */
  selectedIdsArray: string[]
  /** Number of selected clients */
  count: number
  /** Check if a specific client is selected */
  isSelected: (clientId: string) => boolean
  /** Toggle selection of a single client */
  toggleSelect: (clientId: string) => void
  /** Add a client to selection */
  addToSelection: (clientId: string) => void
  /** Remove a client from selection */
  removeFromSelection: (clientId: string) => void
  /** Select multiple clients at once */
  selectMany: (clientIds: string[]) => void
  /** Select all visible clients */
  selectAll: (clientIds: string[]) => void
  /** Deselect all clients */
  clearAll: () => void
  /** Replace selection with only the failed client IDs */
  selectOnlyFailed: (failedClientIds: string[]) => void
}

/**
 * Custom hook for managing client selection across components
 */
export function useClientSelection(): UseClientSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => loadSelection())

  // Listen for changes from other components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SELECTION_KEY && e.newValue) {
        try {
          const data: SelectionData = JSON.parse(e.newValue)
          setSelectedIds(new Set(data.ids))
        } catch {
          // Ignore parse errors
        }
      }
    }

    const handleCustomEvent = (e: CustomEvent<{ ids: string[] }>) => {
      setSelectedIds(new Set(e.detail.ids))
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(SELECTION_CHANGED_EVENT, handleCustomEvent as EventListener)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(SELECTION_CHANGED_EVENT, handleCustomEvent as EventListener)
    }
  }, [])

  const updateSelection = useCallback((newSet: Set<string>) => {
    setSelectedIds(newSet)
    saveSelection(newSet)
  }, [])

  const isSelected = useCallback((clientId: string) => {
    return selectedIds.has(clientId)
  }, [selectedIds])

  const toggleSelect = useCallback((clientId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(clientId)) {
        newSet.delete(clientId)
      } else {
        newSet.add(clientId)
      }
      saveSelection(newSet)
      return newSet
    })
  }, [])

  const addToSelection = useCallback((clientId: string) => {
    setSelectedIds(prev => {
      if (prev.has(clientId)) return prev
      const newSet = new Set(prev)
      newSet.add(clientId)
      saveSelection(newSet)
      return newSet
    })
  }, [])

  const removeFromSelection = useCallback((clientId: string) => {
    setSelectedIds(prev => {
      if (!prev.has(clientId)) return prev
      const newSet = new Set(prev)
      newSet.delete(clientId)
      saveSelection(newSet)
      return newSet
    })
  }, [])

  const selectMany = useCallback((clientIds: string[]) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      clientIds.forEach(id => newSet.add(id))
      saveSelection(newSet)
      return newSet
    })
  }, [])

  const selectAll = useCallback((clientIds: string[]) => {
    const newSet = new Set(clientIds)
    updateSelection(newSet)
  }, [updateSelection])

  const clearAll = useCallback(() => {
    updateSelection(new Set())
  }, [updateSelection])

  const selectOnlyFailed = useCallback((failedClientIds: string[]) => {
    const newSet = new Set(failedClientIds)
    updateSelection(newSet)
  }, [updateSelection])

  return {
    selectedIds,
    selectedIdsArray: Array.from(selectedIds),
    count: selectedIds.size,
    isSelected,
    toggleSelect,
    addToSelection,
    removeFromSelection,
    selectMany,
    selectAll,
    clearAll,
    selectOnlyFailed,
  }
}

export default useClientSelection
