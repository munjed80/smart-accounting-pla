import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { NetworkError, ServerError } from '@/lib/errors'
import { ActiveClientProvider } from '@/lib/ActiveClientContext'
import { LoginPage } from '@/components/LoginPage'
import { VerifyEmailPage } from '@/components/VerifyEmailPage'
import { ForgotPasswordPage } from '@/components/ForgotPasswordPage'
import { ResetPasswordPage } from '@/components/ResetPasswordPage'
import { OnboardingPage } from '@/components/OnboardingPage'
import { AccountantOnboardingPage } from '@/components/AccountantOnboardingPage'
import { LandingPage } from '@/pages/LandingPage'
import { SmartDashboard } from '@/components/SmartDashboard'
import { AccountantHomePage } from '@/components/AccountantHomePage'
import { AccountantReviewQueuePage } from '@/components/AccountantReviewQueuePage'
import { AccountantRemindersPage } from '@/components/AccountantRemindersPage'
import { AccountantActionsPage } from '@/components/AccountantActionsPage'
import { AccountantClientsPage } from '@/components/AccountantClientsPage'
import { AccountantNotFoundPage } from '@/components/AccountantNotFoundPage'
import { CrediteurenPage } from '@/components/CrediteurenPage'
import { ProfitLossPage } from '@/components/ProfitLossPage'
import { GrootboekPage } from '@/components/GrootboekPage'
import { ZZPAccountantLinksPage } from '@/components/ZZPAccountantLinksPage'
import { ZZPCustomersPage } from '@/components/ZZPCustomersPage'
import { ZZPInvoicesPage } from '@/components/ZZPInvoicesPage'
import { ZZPExpensesPage } from '@/components/ZZPExpensesPage'
import { ZZPTimeTrackingPage } from '@/components/ZZPTimeTrackingPage'
import { ZZPAgendaPage } from '@/components/ZZPAgendaPage'
import { ZZPCommitmentsOverviewPage } from '@/components/ZZPCommitmentsOverviewPage'
import { ZZPLeaseLoansPage } from '@/components/ZZPLeaseLoansPage'
import { ZZPSubscriptionsPage } from '@/components/ZZPSubscriptionsPage'
import { ClientDossierPage } from '@/components/ClientDossierPage'
import { BulkOperationsHistoryPage } from '@/components/BulkOperationsHistoryPage'
import { BankReconciliationPage } from '@/components/BankReconciliationPage'
import { IntelligentUploadPortal } from '@/components/IntelligentUploadPortal'
import { SmartTransactionList } from '@/components/SmartTransactionList'
import { SettingsPage } from '@/components/SettingsPage'
import { SupportPage } from '@/components/SupportPage'
import { AdminDashboard } from '@/components/AdminDashboard'
import { AppShell } from '@/components/AppShell'
import { DashboardErrorBoundary } from '@/components/DashboardErrorBoundary'
import { PWAUpdatePrompt } from '@/components/PWAUpdatePrompt'
import { administrationApi, accountantClientApi } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { pathToTab, tabToPath } from '@/lib/routing'
import { cleanupOverlayPortals } from '@/hooks/useCloseOverlayOnRouteChange'
import { Database } from '@phosphor-icons/react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

// Delay for Radix UI to complete cleanup before our global cleanup runs
// Increased to 200ms to handle slower devices and ensure animations complete
const GLOBAL_CLEANUP_DELAY_MS = 200

const BOOT_TIMEOUT_MS = 15000

type BootStage = 'auth' | 'onboarding-check' | 'ready' | 'error'

interface BootErrorState {
  message: string
  detail?: string
}

const BootDiagnosticsBanner = ({ stage, isLoading, isCheckingOnboarding }: { stage: BootStage; isLoading: boolean; isCheckingOnboarding: boolean }) => {
  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-2 left-2 z-[120] rounded-md border bg-background/95 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">Boot diagnostics</p>
      <p>stage: {stage}</p>
      <p>authLoading: {String(isLoading)}</p>
      <p>onboardingLoading: {String(isCheckingOnboarding)}</p>
    </div>
  )
}

// URL-based routing with path support
type Route = 
  | { type: 'login' }
  | { type: 'forgot-password' }
  | { type: 'verify-email'; token: string }
  | { type: 'reset-password'; token: string }
  | { type: 'onboarding' }
  | { type: 'accountant-onboarding' }
  | { type: 'app'; path: string }
  | { type: 'client-dossier'; clientId: string; tab: 'invoices' | 'expenses' | 'hours' | 'vat' | 'issues' | 'bookkeeping' | 'periods' | 'decisions' | 'audit' | 'commitments' }
  | { type: 'bulk-operations-history' }
  | { type: 'bank-reconciliation' }

// Parse client dossier route
const parseClientDossierRoute = (path: string): { clientId: string; tab: 'invoices' | 'expenses' | 'hours' | 'vat' | 'issues' | 'bookkeeping' | 'periods' | 'decisions' | 'audit' | 'commitments' } | null => {
  // Match /accountant/clients/:clientId or /accountant/clients/:clientId/:tab
  const match = path.match(/^\/accountant\/clients\/([^/]+)(?:\/([^/]+))?$/)
  if (match) {
    const clientId = match[1]
    const tabParam = match[2] || 'invoices'
    const validTabs = ['invoices', 'expenses', 'hours', 'vat', 'issues', 'bookkeeping', 'periods', 'decisions', 'audit', 'commitments']
    const tab = validTabs.includes(tabParam) ? tabParam as 'invoices' | 'expenses' | 'hours' | 'vat' | 'issues' | 'bookkeeping' | 'periods' | 'decisions' | 'audit' | 'commitments' : 'invoices'
    return { clientId, tab }
  }
  return null
}

const getRouteFromURL = (): Route => {
  const path = window.location.pathname
  const params = new URLSearchParams(window.location.search)
  
  if (path === '/verify-email' || path.startsWith('/verify-email')) {
    const token = params.get('token') || ''
    return { type: 'verify-email', token }
  }
  
  if (path === '/reset-password' || path.startsWith('/reset-password')) {
    const token = params.get('token') || ''
    return { type: 'reset-password', token }
  }
  
  if (path === '/forgot-password') {
    return { type: 'forgot-password' }
  }
  
  if (path === '/login' || path === '/auth') {
    return { type: 'login' }
  }
  
  if (path === '/onboarding') {
    return { type: 'onboarding' }
  }
  
  if (path === '/accountant/onboarding') {
    return { type: 'accountant-onboarding' }
  }
  
  // Check for bulk operations history route
  if (path === '/accountant/bulk-operations') {
    return { type: 'bulk-operations-history' }
  }
  
  // Check for bank reconciliation route
  if (path === '/accountant/bank') {
    return { type: 'bank-reconciliation' }
  }
  
  // Check for client dossier routes: /accountant/clients/:clientId[/:tab]
  const clientDossierRoute = parseClientDossierRoute(path)
  if (clientDossierRoute) {
    return { type: 'client-dossier', ...clientDossierRoute }
  }
  
  // Return app route with current path for navigation
  return { type: 'app', path: path || '/' }
}

const isAdminRoutePath = (path: string): boolean => path === '/admin' || path.startsWith('/admin/')

const ForbiddenAdminAccess = () => (
  <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center p-4">
    <div className="max-w-lg w-full rounded-lg border bg-card p-6 space-y-3">
      <h2 className="text-lg font-semibold">403 - Geen toegang</h2>
      <p className="text-sm text-muted-foreground">Alleen super administrators hebben toegang tot het admin dashboard.</p>
      <Button onClick={() => navigateTo('/dashboard')}>Terug naar dashboard</Button>
    </div>
  </div>
)

const AppContent = () => {
  const { user, isAuthenticated, isLoading, checkSession, logout } = useAuth()
  const isAccountant = user?.role === 'accountant' || user?.role === 'admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const isAccountantOnly = user?.role === 'accountant'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'workqueue' | 'reviewqueue' | 'reminders' | 'acties' | 'bank' | 'crediteuren' | 'profitloss' | 'grootboek' | 'transactions' | 'upload' | 'settings' | 'support' | 'boekhouder' | 'customers' | 'invoices' | 'expenses' | 'time' | 'agenda' | 'obligations-overview' | 'lease-loans' | 'subscriptions' | 'admin'>('dashboard')
  const [route, setRoute] = useState<Route>(getRouteFromURL)
  
  // Onboarding state - tracks if user needs onboarding (no administrations for ZZP, no clients for accountants)
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null)
  const [needsAccountantOnboarding, setNeedsAccountantOnboarding] = useState<boolean | null>(null)
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(false)
  const [bootStage, setBootStage] = useState<BootStage>('auth')
  const [bootError, setBootError] = useState<BootErrorState | null>(null)
  
  // Track if we've set the initial tab based on role (to avoid resetting on every render)
  const [hasSetInitialTab, setHasSetInitialTab] = useState(false)

  // Listen for URL changes and sync with tab
  useEffect(() => {
    const handlePopState = () => {
      const newRoute = getRouteFromURL()
      setRoute(newRoute)
      
      // Update active tab based on URL path
      if (newRoute.type === 'app' && user) {
        const newTab = pathToTab(newRoute.path, isAccountant, isSuperAdmin)
        setActiveTab(newTab as typeof activeTab)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [user, isAccountant, isSuperAdmin])
  
  // Global overlay cleanup on route changes
  // This provides a backstop cleanup in case individual components don't properly
  // clean up their overlays. Runs with a longer delay than component-level cleanup
  // to allow Radix UI and component cleanup to run first.
  useEffect(() => {
    const handleRouteChange = () => {
      // Clean up any lingering overlay portals after navigation
      setTimeout(() => {
        cleanupOverlayPortals()
      }, GLOBAL_CLEANUP_DELAY_MS)
    }
    
    window.addEventListener('popstate', handleRouteChange)
    window.addEventListener('app:route-change', handleRouteChange)
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
      window.removeEventListener('app:route-change', handleRouteChange)
    }
  }, [])
  
  // Update active tab when user role becomes available (after login) or route changes
  useEffect(() => {
    if (user && isAuthenticated) {
      const userIsAccountant = user.role === 'accountant' || user.role === 'admin'
      
      if (!hasSetInitialTab) {
        // Set initial tab based on URL path or default to role-appropriate tab
        if (route.type === 'app') {
          const tabFromPath = pathToTab(route.path, userIsAccountant, user.role === "super_admin")
          setActiveTab(tabFromPath as typeof activeTab)
        } else {
          const defaultTab = user.role === 'super_admin' ? 'admin' : userIsAccountant ? 'workqueue' : 'dashboard'
          setActiveTab(defaultTab)
        }
        setHasSetInitialTab(true)
      } else if (route.type === 'app') {
        // Sync tab with route when URL changes
        const tabFromPath = pathToTab(route.path, userIsAccountant, user.role === "super_admin")
        if (tabFromPath !== activeTab) {
          setActiveTab(tabFromPath as typeof activeTab)
        }
      }
    }
    // Reset state when user logs out for clean state transition
    if (!isAuthenticated) {
      setHasSetInitialTab(false)
      setActiveTab('dashboard')
    }
  }, [user, isAuthenticated, hasSetInitialTab, route, isAccountant])
  
  // Handle tab change - update URL
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as typeof activeTab)
    const path = tabToPath(tab, isAccountant, isSuperAdmin)
    navigateTo(path)
  }

  const retryBootstrap = () => {
    setBootError(null)
    setNeedsOnboarding(null)
    setNeedsAccountantOnboarding(null)
    setIsCheckingOnboarding(false)
    setBootStage('auth')
    void checkSession()
  }
  
  // Check if user needs onboarding (first login)
  // ZZP users: check for no administrations
  // Accountants: check for no assigned clients
  useEffect(() => {
    const checkOnboarding = async () => {
      if (!isAuthenticated || !user) {
        setNeedsOnboarding(null)
        setNeedsAccountantOnboarding(null)
        return
      }
      
      // Skip if already checked
      if (needsOnboarding !== null || needsAccountantOnboarding !== null) {
        return
      }
      
      setIsCheckingOnboarding(true)
      setBootStage('onboarding-check')
      try {
        const userIsAccountant = user.role === 'accountant' || user.role === 'admin'

        if (user.role === 'super_admin') {
          setNeedsOnboarding(false)
          setNeedsAccountantOnboarding(false)
          if (route.type === 'onboarding' || route.type === 'accountant-onboarding') {
            navigateTo('/admin')
          }
          setBootStage('ready')
        } else if (userIsAccountant) {
          // For accountants, check if they have any assigned clients
          const clientsResponse = await accountantClientApi.listClients()
          const needsSetup = clientsResponse.clients.length === 0
          setNeedsAccountantOnboarding(needsSetup)
          setNeedsOnboarding(false) // ZZP onboarding not needed
          
          // Auto-redirect to accountant onboarding if needed
          if (needsSetup) {
            navigateTo('/accountant/onboarding')
          }
          setBootStage('ready')
        } else {
          // For ZZP users, check if they have any administrations
          const administrations = await administrationApi.list()
          const needsSetup = administrations.length === 0
          setNeedsOnboarding(needsSetup)
          setNeedsAccountantOnboarding(false) // Accountant onboarding not needed
          
          // Auto-redirect to onboarding if needed
          if (needsSetup) {
            navigateTo('/onboarding')
          }
          setBootStage('ready')
        }
      } catch (error) {
        console.error('Failed to check onboarding status:', error)
        // Don't block user if check fails, let them proceed
        setNeedsOnboarding(false)
        setNeedsAccountantOnboarding(false)

        const defaultDetail = error instanceof Error ? error.message : 'Onbekende fout'
        if (error instanceof NetworkError || error instanceof ServerError) {
          setBootError({
            message: 'Backend is niet bereikbaar',
            detail: 'De server reageert niet of geeft een fout (5xx). Probeer opnieuw of log uit en opnieuw in.',
          })
        } else {
          setBootError({ message: 'Bootstrap controle mislukt', detail: defaultDetail })
        }

        setBootStage('error')
      } finally {
        setIsCheckingOnboarding(false)
      }
    }
    
    checkOnboarding()
  }, [isAuthenticated, user, needsOnboarding, needsAccountantOnboarding, route])


  useEffect(() => {
    if (isLoading) {
      setBootStage('auth')
      return
    }

    if (bootStage !== 'error') {
      setBootStage(isCheckingOnboarding ? 'onboarding-check' : 'ready')
    }
  }, [isLoading, isCheckingOnboarding, bootStage])

  useEffect(() => {
    if (!isAuthenticated) return

    const timer = window.setTimeout(() => {
      if (isLoading || isCheckingOnboarding || needsOnboarding === null || needsAccountantOnboarding === null) {
        setBootError({
          message: 'De app startte niet op tijd',
          detail: 'Initialisatie duurde te lang. Controleer netwerk/API-configuratie en probeer opnieuw.',
        })
        setBootStage('error')
      }
    }, BOOT_TIMEOUT_MS)

    return () => window.clearTimeout(timer)
  }, [isAuthenticated, isLoading, isCheckingOnboarding, needsOnboarding, needsAccountantOnboarding])

  // Handle special auth routes first (before checking authentication)
  if (route.type === 'verify-email') {
    return (
      <VerifyEmailPage 
        token={route.token} 
        onNavigateToLogin={() => navigateTo('/login')} 
      />
    )
  }

  if (route.type === 'reset-password') {
    return (
      <ResetPasswordPage 
        token={route.token} 
        onNavigateToLogin={() => navigateTo('/login')} 
      />
    )
  }

  if (route.type === 'forgot-password') {
    return (
      <ForgotPasswordPage 
        onNavigateToLogin={() => navigateTo('/login')} 
      />
    )
  }


  if (bootError && isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center p-4">
        <div className="max-w-lg w-full rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">{bootError.message}</h2>
          {bootError.detail && <p className="text-sm text-muted-foreground">{bootError.detail}</p>}
          <div className="flex gap-2">
            <Button onClick={retryBootstrap}>Opnieuw proberen</Button>
            <Button variant="outline" onClick={logout}>Uitloggen</Button>
          </div>
          <Alert>
            <AlertDescription>De UI blijft niet meer hangen op een permanente spinner. Gebruik de retry-knop om bootstrap opnieuw te starten.</AlertDescription>
          </Alert>
        </div>
        <BootDiagnosticsBanner stage={bootStage} isLoading={isLoading} isCheckingOnboarding={isCheckingOnboarding} />
      </div>
    )
  }

  if (isLoading || isCheckingOnboarding) {
    // Only show loading screen if user is authenticated (loading app content)
    // Don't show loading for login/auth operations as it unmounts the LoginPage and loses error state
    if (isAuthenticated) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center">
          <div className="text-center">
            <Database size={64} className="mx-auto mb-4 text-primary animate-pulse" weight="duotone" />
            <p className="text-muted-foreground">Laden...</p>
          </div>
          <BootDiagnosticsBanner stage={bootStage} isLoading={isLoading} isCheckingOnboarding={isCheckingOnboarding} />
        </div>
      )
    }
    // For unauthenticated users during login, let the LoginPage show with its own loading state
  }

  // Show loading while determining if onboarding is needed (prevents flash of dashboard before redirect)
  if (isAuthenticated && needsOnboarding === null && needsAccountantOnboarding === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center">
        <div className="text-center">
          <Database size={64} className="mx-auto mb-4 text-primary animate-pulse" weight="duotone" />
          <p className="text-muted-foreground">Laden...</p>
        </div>
        <BootDiagnosticsBanner stage={bootStage} isLoading={isLoading} isCheckingOnboarding={isCheckingOnboarding} />
      </div>
    )
  }

  if (!isAuthenticated) {
    // Show LandingPage for root path, LoginPage for explicit /login routes
    if (route.type === 'app' && route.path === '/') {
      return <LandingPage />
    }
    
    return (
      <LoginPage 
        onSuccess={(loggedInUser) => {
          // Navigate to the role-appropriate landing page - no "/" fallback
          const userIsAccountant = loggedInUser?.role === 'accountant' || loggedInUser?.role === 'admin'
          const landingPath = loggedInUser?.role === 'super_admin' ? '/admin' : userIsAccountant ? '/accountant' : '/dashboard'
          navigateTo(landingPath)
        }}
        onForgotPassword={() => navigateTo('/forgot-password')}
      />
    )
  }
  
  // Protect admin routes for non-super-admin users
  if (route.type === 'app' && isAdminRoutePath(route.path) && !isSuperAdmin) {
    return <ForbiddenAdminAccess />
  }

  // Super admins should never see onboarding flows
  if (isSuperAdmin && (route.type === 'onboarding' || route.type === 'accountant-onboarding')) {
    navigateTo('/admin')
    return null
  }

  // Show accountant-specific onboarding if needed (no assigned clients)
  if (route.type === 'accountant-onboarding' || needsAccountantOnboarding === true) {
    return (
      <AccountantOnboardingPage
        userName={user?.full_name || 'boekhouder'}
        onComplete={() => {
          setNeedsAccountantOnboarding(false)
          navigateTo('/accountant')
        }}
        onSkip={() => {
          setNeedsAccountantOnboarding(false)
          navigateTo('/accountant/clients')
        }}
      />
    )
  }
  
  // Show ZZP onboarding if user needs it (first login, no administrations)
  if (route.type === 'onboarding' || needsOnboarding === true) {
    return (
      <OnboardingPage
        userRole={user?.role as 'zzp' | 'accountant' | 'admin'}
        userName={user?.full_name || 'daar'}
        onComplete={() => {
          setNeedsOnboarding(false)
          // Navigate to role-appropriate landing page - no "/" fallback
          const userIsAccountant = user?.role === 'accountant' || user?.role === 'admin'
          const landingPath = isSuperAdmin ? '/admin' : userIsAccountant ? '/accountant' : '/dashboard'
          navigateTo(landingPath)
        }}
      />
    )
  }

  // Show client dossier page for accountants
  if (route.type === 'client-dossier' && (isAccountant || isSuperAdmin)) {
    return (
      <AppShell 
        activeTab="clients" 
        onTabChange={handleTabChange}
      >
        <ClientDossierPage 
          clientId={route.clientId} 
          initialTab={route.tab}
        />
      </AppShell>
    )
  }
  
  // Show bulk operations history page for accountants
  if (route.type === 'bulk-operations-history' && isAccountant) {
    return (
      <AppShell 
        activeTab="workqueue" 
        onTabChange={handleTabChange}
      >
        <BulkOperationsHistoryPage />
      </AppShell>
    )
  }

  // Show bank reconciliation page for accountants
  if (route.type === 'bank-reconciliation' && isAccountantOnly) {
    return (
      <AppShell 
        activeTab="bank" 
        onTabChange={handleTabChange}
      >
        <BankReconciliationPage />
      </AppShell>
    )
  }

  // Render the content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'workqueue':
        // Redirect ZZP users to dashboard if they try to access accountant-only pages
        return isAccountant ? <AccountantHomePage /> : <SmartDashboard />
      case 'clients':
        // Use the new AccountantClientsPage for accountants (consent workflow)
        return isAccountant ? <AccountantClientsPage /> : <SmartDashboard />
      case 'reviewqueue':
        return isAccountant ? <AccountantReviewQueuePage /> : <SmartDashboard />
      case 'reminders':
        return isAccountant ? <AccountantRemindersPage /> : <SmartDashboard />
      case 'acties':
        return isAccountant ? <AccountantActionsPage /> : <SmartDashboard />
      case 'bank':
        return isAccountantOnly ? <BankReconciliationPage /> : <SmartDashboard />
      case 'crediteuren':
        return isAccountant ? <CrediteurenPage onNavigate={handleTabChange} /> : <SmartDashboard />
      case 'profitloss':
        return isAccountant ? <ProfitLossPage onNavigate={handleTabChange} /> : <SmartDashboard />
      case 'grootboek':
        return isAccountant ? <GrootboekPage onNavigate={handleTabChange} /> : <SmartDashboard />
      case 'boekhouder':
        // ZZP-only page for managing accountant links
        return !isAccountant ? <ZZPAccountantLinksPage /> : <SmartDashboard />
      case 'customers':
        // ZZP-only page for managing customers
        return !isAccountant ? <ZZPCustomersPage /> : <SmartDashboard />
      case 'invoices':
        // ZZP-only page for managing invoices
        return !isAccountant ? <ZZPInvoicesPage /> : <SmartDashboard />
      case 'expenses':
        // ZZP-only page for expenses (coming soon)
        return !isAccountant ? <ZZPExpensesPage /> : <SmartDashboard />
      case 'time':
        // ZZP-only page for time tracking (coming soon)
        return !isAccountant ? <ZZPTimeTrackingPage /> : <SmartDashboard />
      case 'agenda':
        return !isAccountant ? <ZZPAgendaPage /> : <SmartDashboard />
      case 'obligations-overview':
        return !isAccountant ? <ZZPCommitmentsOverviewPage /> : <SmartDashboard />
      case 'lease-loans':
        return !isAccountant ? <ZZPLeaseLoansPage /> : <SmartDashboard />
      case 'subscriptions':
        return !isAccountant ? <ZZPSubscriptionsPage /> : <SmartDashboard />
      case 'dashboard':
        return <SmartDashboard />
      case 'transactions':
        return <SmartTransactionList />
      case 'upload':
        return <IntelligentUploadPortal />
      case 'settings':
        return <SettingsPage />
      case 'support':
        return <SupportPage />
      case 'admin':
        return isSuperAdmin ? <AdminDashboard /> : <SmartDashboard />
      default:
        return <SmartDashboard />
    }
  }

  // Get readable page name for error boundary logging
  const getPageName = (): string => {
    switch (activeTab) {
      case 'workqueue': return 'Werklijst'
      case 'clients': return 'Klanten (Accountant)'
      case 'reviewqueue': return 'Beoordelingslijst'
      case 'reminders': return 'Herinneringen'
      case 'acties': return 'Acties'
      case 'bank': return 'Bank'
      case 'crediteuren': return 'Crediteuren'
      case 'profitloss': return 'Winst & Verlies'
      case 'grootboek': return 'Grootboek'
      case 'boekhouder': return 'Boekhouder'
      case 'customers': return 'Klanten (ZZP)'
      case 'invoices': return 'Facturen'
      case 'expenses': return 'Uitgaven'
      case 'time': return 'Uren'
      case 'agenda': return 'Agenda'
      case 'obligations-overview': return 'Verplichtingen Overzicht'
      case 'lease-loans': return 'Lease & Leningen'
      case 'subscriptions': return 'Abonnementen'
      case 'dashboard': return 'Overzicht'
      case 'transactions': return 'Transacties'
      case 'upload': return 'Upload'
      case 'settings': return 'Instellingen'
      case 'support': return 'Ondersteuning'
      case 'admin': return 'Systeembeheer'
      default: return 'Overzicht'
    }
  }

  return (
    <>
      <AppShell 
        activeTab={activeTab} 
        onTabChange={handleTabChange}
      >
        <DashboardErrorBoundary pageName={getPageName()}>
          {renderTabContent()}
        </DashboardErrorBoundary>
      </AppShell>
      <BootDiagnosticsBanner stage={bootStage} isLoading={isLoading} isCheckingOnboarding={isCheckingOnboarding} />
    </>
  )
}

// Create a QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevent automatic refetches on window focus
      retry: 1,
      staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    },
  },
})

function App() {
  const isPwaEnabled = import.meta.env.PROD && import.meta.env.VITE_ENABLE_PWA === 'true'

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ActiveClientProvider>
          <AppContent />
          {isPwaEnabled ? <PWAUpdatePrompt /> : null}
        </ActiveClientProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
