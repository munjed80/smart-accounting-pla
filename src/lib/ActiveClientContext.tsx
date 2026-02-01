/**
 * ActiveClientContext - Manages accountant's active client context
 * 
 * For accountants viewing multi-client data, this maintains:
 * - Currently selected "active client"
 * - List of ACTIVE client links
 * - Auto-selection logic (first ACTIVE client on login)
 * - localStorage persistence
 * 
 * This context ensures accountants always work within a specific client context
 * and cannot access data without an active client selected.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { accountantApi, ClientLink } from '@/lib/api'
import { toast } from 'sonner'

// localStorage key for active client
const ACTIVE_CLIENT_KEY = 'activeClient'

export interface ActiveClient {
  id: string  // client_user_id
  name: string
  email: string
  administrationId: string  // administration_id for API calls
  administrationName: string
}

interface ActiveClientContextType {
  /** Currently selected active client */
  activeClient: ActiveClient | null
  /** All available ACTIVE client links */
  activeClients: ClientLink[]
  /** All client links (PENDING + ACTIVE) */
  allLinks: ClientLink[]
  /** Count of pending approvals */
  pendingCount: number
  /** Whether data is loading */
  isLoading: boolean
  /** Select a client as active */
  setActiveClient: (client: ActiveClient | null) => void
  /** Refresh the client links list */
  refreshLinks: () => Promise<void>
  /** Check if user has any active clients */
  hasActiveClients: boolean
  /** Check if user has pending clients */
  hasPendingClients: boolean
}

const ActiveClientContext = createContext<ActiveClientContextType | undefined>(undefined)

export const useActiveClient = () => {
  const context = useContext(ActiveClientContext)
  if (!context) {
    throw new Error('useActiveClient must be used within ActiveClientProvider')
  }
  return context
}

interface ActiveClientProviderProps {
  children: ReactNode
}

/**
 * Load active client from localStorage
 */
const loadActiveClient = (): ActiveClient | null => {
  try {
    const stored = localStorage.getItem(ACTIVE_CLIENT_KEY)
    if (stored) {
      return JSON.parse(stored) as ActiveClient
    }
  } catch (error) {
    console.warn('Failed to load active client from localStorage:', error)
  }
  return null
}

/**
 * Save active client to localStorage
 */
const saveActiveClient = (client: ActiveClient | null) => {
  try {
    if (client) {
      localStorage.setItem(ACTIVE_CLIENT_KEY, JSON.stringify(client))
    } else {
      localStorage.removeItem(ACTIVE_CLIENT_KEY)
    }
  } catch (error) {
    console.warn('Failed to save active client to localStorage:', error)
  }
}

export const ActiveClientProvider = ({ children }: ActiveClientProviderProps) => {
  const { user, isAuthenticated } = useAuth()
  const [activeClient, setActiveClientState] = useState<ActiveClient | null>(loadActiveClient)
  const [allLinks, setAllLinks] = useState<ClientLink[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Determine if user is accountant
  const isAccountant = user?.role === 'accountant' || user?.role === 'admin'

  // Filter to only ACTIVE links
  const activeClients = useMemo(
    () => allLinks.filter(link => link.status === 'ACTIVE'),
    [allLinks]
  )

  // Count pending approvals
  const pendingCount = useMemo(
    () => allLinks.filter(link => link.status === 'PENDING').length,
    [allLinks]
  )

  const hasActiveClients = activeClients.length > 0
  const hasPendingClients = pendingCount > 0

  /**
   * Fetch client links from API
   */
  const refreshLinks = useCallback(async () => {
    if (!isAuthenticated || !isAccountant) {
      setAllLinks([])
      return
    }

    try {
      setIsLoading(true)
      const response = await accountantApi.getClientLinks()
      setAllLinks(response.links)

      // Use latest state for validation
      setActiveClientState(prevClient => {
        // Auto-select first ACTIVE client if none selected
        if (!prevClient && response.links.length > 0) {
          const firstActive = response.links.find(link => link.status === 'ACTIVE')
          if (firstActive) {
            const autoSelected: ActiveClient = {
              id: firstActive.client_user_id,
              name: firstActive.client_name,
              email: firstActive.client_email,
              administrationId: firstActive.administration_id,
              administrationName: firstActive.administration_name,
            }
            saveActiveClient(autoSelected)
            toast.success(`Actieve klant: ${autoSelected.name}`)
            return autoSelected
          }
        }

        // Validate current activeClient is still ACTIVE
        if (prevClient) {
          const currentLink = response.links.find(
            link => link.client_user_id === prevClient.id
          )
          if (!currentLink || currentLink.status !== 'ACTIVE') {
            // Current client is no longer active, clear selection
            saveActiveClient(null)
            toast.warning('Actieve klant is niet meer beschikbaar.')
            return null
          }
        }

        return prevClient
      })
    } catch (error) {
      console.error('Failed to fetch client links:', error)
      toast.error('Kon klantenlijst niet laden.')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, isAccountant])  // activeClient not in dependencies - using state updater

  /**
   * Set active client with localStorage persistence
   */
  const setActiveClient = useCallback((client: ActiveClient | null) => {
    setActiveClientState(client)
    saveActiveClient(client)
    
    if (client) {
      toast.success(`Actieve klant: ${client.name}`)
    }
  }, [])

  // Load client links when user logs in as accountant
  useEffect(() => {
    if (isAuthenticated && isAccountant) {
      refreshLinks()
    } else {
      // Clear state if not accountant
      setAllLinks([])
      setActiveClientState(null)
      saveActiveClient(null)
    }
  }, [isAuthenticated, isAccountant, refreshLinks])

  const value = useMemo<ActiveClientContextType>(
    () => ({
      activeClient,
      activeClients,
      allLinks,
      pendingCount,
      isLoading,
      setActiveClient,
      refreshLinks,
      hasActiveClients,
      hasPendingClients,
    }),
    [
      activeClient,
      activeClients,
      allLinks,
      pendingCount,
      isLoading,
      setActiveClient,
      refreshLinks,
      hasActiveClients,
      hasPendingClients,
    ]
  )

  return <ActiveClientContext.Provider value={value}>{children}</ActiveClientContext.Provider>
}
