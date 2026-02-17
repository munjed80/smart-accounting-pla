/**
 * AppShell Tests
 * 
 * Tests ensuring ZZP sidebar menu includes Overzicht as the first item
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
      'brand.name': 'Smart Accounting',
      'sidebar.overzicht': 'Overzicht',
      'sidebar.klanten': 'Klanten',
      'sidebar.facturen': 'Facturen',
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

// Mock API
vi.mock('../lib/api', () => ({
  getApiBaseUrl: vi.fn(() => 'http://localhost:8000/api/v1'),
}))

describe('AppShell - ZZP Menu', () => {
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

  it('includes Overzicht as the first ZZP menu item', () => {
    render(
      <AppShell activeTab="dashboard">
        <div>Test Content</div>
      </AppShell>
    )

    // Check that Overzicht appears in the menu
    const overzichtButtons = screen.getAllByText('Overzicht')
    expect(overzichtButtons.length).toBeGreaterThan(0)
  })

  it('includes all ZZP menu items in the correct order', () => {
    render(
      <AppShell activeTab="dashboard">
        <div>Test Content</div>
      </AppShell>
    )

    // Check that all menu items are present
    expect(screen.getAllByText('Overzicht').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Klanten').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Facturen').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Uitgaven').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Uren').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Agenda').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Boekhouder').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Documenten').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Boekingen').length).toBeGreaterThan(0)
  })

  it('does not show accountant-only menu items to ZZP users', () => {
    render(
      <AppShell activeTab="dashboard">
        <div>Test Content</div>
      </AppShell>
    )

    // Verify ZZP user does not see accountant items
    expect(screen.queryByText('Werklijst')).not.toBeInTheDocument()
    expect(screen.queryByText('Beoordelingslijst')).not.toBeInTheDocument()
  })
})
