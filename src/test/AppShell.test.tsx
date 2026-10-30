/**
 * AppShell Tests
 * 
 * Tests ensuring ZZP sidebar menu includes Overzicht as the first item
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { AppShell } from '../components/AppShell'
import * as AuthContext from '../lib/AuthContext'
import * as ActiveClientContext from '../lib/ActiveClientContext'

// Mock AuthContext
vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mock ActiveClientContext
vi.mock('../lib/ActiveClientContext', () => ({
  useActiveClient: vi.fn(),
}))

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'brand.name': 'ZZPers Hub',
      'sidebar.overzicht': 'Overzicht',
      'sidebar.klanten': 'Klanten',
      'sidebar.facturen': 'Facturen',
      'sidebar.offertes': 'Offertes',
      'sidebar.uitgaven': 'Uitgaven',
      'sidebar.uren': 'Uren',
      'sidebar.agenda': 'Agenda',
      'sidebar.boekhouder': 'Boekhouder',
      'sidebar.documenten': 'Documenten',
      'sidebar.boekingen': 'Boekingen',
      'sidebar.settings': 'Instellingen',
      'sidebar.support': 'Ondersteuning',
      'sidebar.backToOverzicht': 'Terug naar Overzicht',
      'sidebar.navigationMenu': 'Navigatiemenu',
      'sidebar.navigateApp': 'Navigeer door de applicatie',
      'roles.zzp': 'ZZP',
      'common.logout': 'Uitloggen',
    }
    return translations[key] || key
  },
}))

// Mock hooks
vi.mock('../hooks/useCloseOverlayOnRouteChange', () => ({
  useCloseOverlayOnRouteChange: vi.fn(),
}))

vi.mock('../hooks/usePreventBodyScrollLock', () => ({
  usePreventBodyScrollLock: vi.fn(),
}))

vi.mock('../hooks/useEntitlements', () => ({
  useEntitlements: vi.fn(() => ({
    entitlements: null,
    subscription: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    canUseFeature: () => false,
    isAccountantBypass: false,
    forcePaywall: false,
  })),
}))

// Mock API
vi.mock('../lib/api', () => ({
  getApiBaseUrl: vi.fn(() => 'http://localhost:8000/api/v1'),
  subscribeApiOfflineStatus: vi.fn(() => () => undefined),
  retryLastFailedApiRequest: vi.fn(async () => false),
  salesReviewApi: {
    getSummary: vi.fn(async () => ({ total: 0, status_counts: {} })),
  },
}))

describe('AppShell - ZZP Menu', () => {
  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock ZZP user
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: {
        id: 'zzp-user-id',
        email: 'zzp@example.com',
        full_name: 'ZZP User',
        role: 'zzp',
        is_email_verified: true,
      },
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      isLoading: false,
      isAuthenticated: true,
    } as any)
    
    vi.mocked(ActiveClientContext.useActiveClient).mockReturnValue({
      activeClient: null,
      pendingCount: 0,
      setActiveClient: vi.fn(),
      clearActiveClient: vi.fn(),
    } as any)
  })

  it('mounts the page and its effects once across responsive layouts', () => {
    const mounted = vi.fn()
    function Page() {
      React.useEffect(mounted, [])
      return <div>Single page instance</div>
    }
    render(<AppShell activeTab="dashboard"><Page /></AppShell>, { wrapper: createWrapper() })
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByText('Single page instance')).toHaveLength(1)
    expect(mounted).toHaveBeenCalledOnce()
  })

  it('includes Overzicht as the first ZZP menu item', () => {
    render(
      <AppShell activeTab="dashboard">
        <div>Test Content</div>
      </AppShell>,
      { wrapper: createWrapper() }
    )

    // Check that Overzicht appears in the menu
    const overzichtButtons = screen.getAllByText('Overzicht')
    expect(overzichtButtons.length).toBeGreaterThan(0)
  })

  it('shows seven daily destinations and keeps additional tools behind disclosure', () => {
    const onTabChange = vi.fn()
    render(<AppShell activeTab="dashboard" onTabChange={onTabChange}><div>Content</div></AppShell>, { wrapper: createWrapper() })
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Overzicht', 'Klanten', 'Facturen', 'Offertes', 'Uitgaven', 'Uren', 'Agenda',
    ])
    expect(within(navigation).queryByText('Boekhouder')).not.toBeInTheDocument()
    const more = within(navigation).getByRole('button', { name: 'Meer opties' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(within(navigation).getByRole('menuitem', { name: 'Boekhouder' }))
    expect(onTabChange).toHaveBeenCalledWith('boekhouder')
    expect(within(navigation).queryByText('Boekhouder')).not.toBeInTheDocument()
  })

  it('places settings next to logout outside the navigation', () => {
    const onTabChange = vi.fn()
    render(<AppShell activeTab="settings" onTabChange={onTabChange}><div>Content</div></AppShell>, { wrapper: createWrapper() })
    const settings = screen.getByRole('button', { name: 'Instellingen' })
    const footer = settings.parentElement!
    expect(within(footer).getByRole('button', { name: 'Uitloggen' })).toBeInTheDocument()
    expect(settings).toHaveAttribute('aria-current', 'page')
    fireEvent.click(settings)
    expect(onTabChange).toHaveBeenCalledWith('settings')
  })

  it('does not show accountant-only menu items to ZZP users', () => {
    render(
      <AppShell activeTab="dashboard">
        <div>Test Content</div>
      </AppShell>,
      { wrapper: createWrapper() }
    )

    // Verify ZZP user does not see accountant items
    expect(screen.queryByText('Werklijst')).not.toBeInTheDocument()
    expect(screen.queryByText('Beoordelingslijst')).not.toBeInTheDocument()
  })
})
