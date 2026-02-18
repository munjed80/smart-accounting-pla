/**
 * SettingsPage Tests
 * 
 * Tests ensuring Settings page handles errors and empty states properly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SettingsPage } from '../components/SettingsPage'
import * as api from '../lib/api'
import * as AuthContext from '../lib/AuthContext'
import * as useEntitlements from '../hooks/useEntitlements'
import * as usePushNotifications from '../hooks/usePushNotifications'

// Mock the API
vi.mock('../lib/api', () => ({
  administrationApi: {
    list: vi.fn(),
  },
  metaApi: {
    getVersion: vi.fn(),
  },
  zzpApi: {
    profile: {
      get: vi.fn(),
      upsert: vi.fn(),
    },
    customers: {
      list: vi.fn(),
    },
    invoices: {
      list: vi.fn(),
    },
    expenses: {
      list: vi.fn(),
    },
    time: {
      list: vi.fn(),
    },
  },
  subscriptionApi: {
    getMySubscription: vi.fn(),
    startTrial: vi.fn(),
    getEntitlements: vi.fn(),
    activateSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    reactivateSubscription: vi.fn(),
  },
  getApiBaseUrl: vi.fn(() => 'http://localhost:8000/api/v1'),
  getRawViteApiUrl: vi.fn(() => 'http://localhost:8000'),
  getWindowOrigin: vi.fn(() => 'http://localhost:5000'),
}))

// Mock AuthContext
vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'settings.title': 'Instellingen',
      'settings.subtitle': 'Beheer je profiel en voorkeuren',
      'settings.profileInfo': 'Profielinformatie',
      'settings.profileDescription': 'Je persoonlijke gegevens',
      'settings.noAdministrations': 'Geen administraties gevonden',
      'settings.businessProfile': 'Bedrijfsprofiel',
      'settings.businessProfileDescription': 'Je bedrijfsgegevens',
      'settings.companyInfo': 'Bedrijfsinformatie',
      'settings.companyName': 'Bedrijfsnaam',
      'settings.tradingName': 'Handelsnaam',
      'settings.tradingNamePlaceholder': 'Optioneel',
      'settings.addressStreet': 'Straat',
      'settings.addressPostalCode': 'Postcode',
      'settings.addressCity': 'Plaats',
      'settings.addressCountry': 'Land',
      'settings.kvkNumber': 'KVK nummer',
      'settings.btwNumber': 'BTW nummer',
      'auth.fullName': 'Volledige naam',
      'auth.email': 'E-mail',
      'roles.zzp': 'ZZP',
      'roles.accountant': 'Accountant',
      'settings.emailVerified': 'E-mail geverifieerd',
      'settings.contactSupport': 'Neem contact op met support',
    }
    return translations[key] || key
  },
}))

// Mock hooks
vi.mock('../hooks/useDelayedLoading', () => ({
  useDelayedLoading: vi.fn((isLoading: boolean) => isLoading),
}))

vi.mock('../hooks/useEntitlements', () => ({
  useEntitlements: vi.fn(),
}))

vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
  isPushEnabled: vi.fn(() => false),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('SettingsPage', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Default mock implementations
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'zzp',
        is_email_verified: true,
      },
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      isLoading: false,
      isAuthenticated: true,
    } as any)
    
    // Mock useEntitlements hook
    vi.mocked(useEntitlements.useEntitlements).mockReturnValue({
      entitlements: {
        is_paid: true,
        in_trial: false,
        can_use_pro_features: true,
        days_left_trial: 0,
        status: 'ACTIVE',
        plan_code: 'zzp_basic',
      },
      subscription: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      canUseFeature: vi.fn(() => true),
      isAccountantBypass: false,
    })
    
    // Mock usePushNotifications hook
    vi.mocked(usePushNotifications.usePushNotifications).mockReturnValue({
      isSupported: false,
      isSubscribed: false,
      isLoading: false,
      error: null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as any)
    
    vi.mocked(api.metaApi.getVersion).mockResolvedValue({
      version: '1.0.0',
      environment: 'test',
      git_sha: 'abc123def456',
      build_time: '2024-01-01T00:00:00Z',
      env_name: 'test',
    } as any)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('renders error alert when API fails', async () => {
    // Mock API failure
    vi.mocked(api.administrationApi.list).mockRejectedValue(new Error('Network error'))
    vi.mocked(api.zzpApi.profile.get).mockResolvedValue({} as any)

    render(<SettingsPage />)

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText('Failed to load company information')).toBeInTheDocument()
    })
  })

  it('renders empty state when no administrations exist', async () => {
    // Mock empty administrations array
    vi.mocked(api.administrationApi.list).mockResolvedValue([])
    vi.mocked(api.zzpApi.profile.get).mockResolvedValue({} as any)

    render(<SettingsPage />)

    // Wait for empty state to appear
    await waitFor(() => {
      expect(screen.getByText('Geen administraties gevonden')).toBeInTheDocument()
    })
  })

  it('does not crash when API returns error', async () => {
    // Mock API failure
    vi.mocked(api.administrationApi.list).mockRejectedValue(new Error('Server error'))
    vi.mocked(api.zzpApi.profile.get).mockRejectedValue(new Error('Profile error'))

    // Should render without throwing
    const { container } = render(<SettingsPage />)
    
    await waitFor(() => {
      // Page should be rendered (not blank/crashed)
      expect(container.querySelector('[class*="min-h-screen"]')).toBeInTheDocument()
    })
  })

  it('renders successfully with valid data', async () => {
    // Mock successful API calls
    vi.mocked(api.administrationApi.list).mockResolvedValue([
      {
        id: 'admin-1',
        name: 'Test Administration',
      },
    ] as any)
    vi.mocked(api.zzpApi.profile.get).mockResolvedValue({
      company_name: 'Test Company',
    } as any)

    render(<SettingsPage />)

    // Wait for content to load - just check that page header is there
    await waitFor(() => {
      expect(screen.getByText('Instellingen')).toBeInTheDocument()
    })
    
    // Check that the page rendered (not blank/crashed)
    expect(screen.getByText('Profielinformatie')).toBeInTheDocument()
  })
})
