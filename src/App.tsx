import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { LoginPage } from '@/components/LoginPage'
import { VerifyEmailPage } from '@/components/VerifyEmailPage'
import { ForgotPasswordPage } from '@/components/ForgotPasswordPage'
import { ResetPasswordPage } from '@/components/ResetPasswordPage'
import { OnboardingPage } from '@/components/OnboardingPage'
import { SmartDashboard } from '@/components/SmartDashboard'
import { AccountantDashboard } from '@/components/AccountantDashboard'
import { AccountantHomePage } from '@/components/AccountantHomePage'
import { IntelligentUploadPortal } from '@/components/IntelligentUploadPortal'
import { SmartTransactionList } from '@/components/SmartTransactionList'
import { SettingsPage } from '@/components/SettingsPage'
import { SupportPage } from '@/components/SupportPage'
import { AppShell } from '@/components/AppShell'
import { administrationApi } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { Database } from '@phosphor-icons/react'

// URL-based routing with path support
type Route = 
  | { type: 'login' }
  | { type: 'forgot-password' }
  | { type: 'verify-email'; token: string }
  | { type: 'reset-password'; token: string }
  | { type: 'onboarding' }
  | { type: 'app'; path: string }

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
  
  // Return app route with current path for navigation
  return { type: 'app', path: path || '/' }
}

// Map URL paths to tab values
const pathToTab = (path: string, isAccountant: boolean): string => {
  // Normalize path
  const normalizedPath = path.toLowerCase().replace(/\/$/, '') || '/'
  
  switch (normalizedPath) {
    case '/dashboard':
      return 'dashboard'
    case '/transactions':
      return 'transactions'
    case '/accountant/review':
    case '/accountant':
    case '/workqueue':
      return 'workqueue'
    case '/clients':
      return 'clients'
    case '/ai-upload':
    case '/upload':
      return 'upload'
    case '/settings':
      return 'settings'
    case '/support':
      return 'support'
    case '/':
    default:
      // Default based on role
      return isAccountant ? 'workqueue' : 'dashboard'
  }
}

// Map tab values to URL paths
const tabToPath = (tab: string, isAccountant: boolean): string => {
  switch (tab) {
    case 'dashboard':
      return '/dashboard'
    case 'transactions':
      return '/transactions'
    case 'workqueue':
      return isAccountant ? '/accountant/review' : '/dashboard'
    case 'clients':
      return '/clients'
    case 'upload':
      return '/ai-upload'
    case 'settings':
      return '/settings'
    case 'support':
      return '/support'
    default:
      return isAccountant ? '/accountant/review' : '/dashboard'
  }
}

const AppContent = () => {
  const { user, isAuthenticated, isLoading } = useAuth()
  const isAccountant = user?.role === 'accountant' || user?.role === 'admin'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'workqueue' | 'transactions' | 'upload' | 'settings' | 'support'>('dashboard')
  const [route, setRoute] = useState<Route>(getRouteFromURL)
  
  // Onboarding state - tracks if user needs onboarding (no administrations)
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null)
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(false)
  
  // Track if we've set the initial tab based on role (to avoid resetting on every render)
  const [hasSetInitialTab, setHasSetInitialTab] = useState(false)

  // Listen for URL changes and sync with tab
  useEffect(() => {
    const handlePopState = () => {
      const newRoute = getRouteFromURL()
      setRoute(newRoute)
      
      // Update active tab based on URL path
      if (newRoute.type === 'app' && user) {
        const newTab = pathToTab(newRoute.path, isAccountant)
        setActiveTab(newTab as typeof activeTab)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [user, isAccountant])
  
  // Update active tab when user role becomes available (after login) or route changes
  useEffect(() => {
    if (user && isAuthenticated) {
      const userIsAccountant = user.role === 'accountant' || user.role === 'admin'
      
      if (!hasSetInitialTab) {
        // Set initial tab based on URL path or default to role-appropriate tab
        if (route.type === 'app') {
          const tabFromPath = pathToTab(route.path, userIsAccountant)
          setActiveTab(tabFromPath as typeof activeTab)
        } else {
          const defaultTab = userIsAccountant ? 'workqueue' : 'dashboard'
          setActiveTab(defaultTab)
        }
        setHasSetInitialTab(true)
      } else if (route.type === 'app') {
        // Sync tab with route when URL changes
        const tabFromPath = pathToTab(route.path, userIsAccountant)
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
    const path = tabToPath(tab, isAccountant)
    navigateTo(path)
  }
  
  // Check if user needs onboarding (first login - no administrations)
  // Only run once when user authenticates, not on every route change
  useEffect(() => {
    const checkOnboarding = async () => {
      if (!isAuthenticated || !user) {
        setNeedsOnboarding(null)
        return
      }
      
      // Skip if already checked
      if (needsOnboarding !== null) {
        return
      }
      
      setIsCheckingOnboarding(true)
      try {
        const administrations = await administrationApi.list()
        // User needs onboarding if they have no administrations
        const needsSetup = administrations.length === 0
        setNeedsOnboarding(needsSetup)
        
        // Auto-redirect to onboarding if needed
        if (needsSetup) {
          navigateTo('/onboarding')
        }
      } catch (error) {
        console.error('Failed to check administrations:', error)
        // Don't block user if check fails, let them proceed
        setNeedsOnboarding(false)
      } finally {
        setIsCheckingOnboarding(false)
      }
    }
    
    checkOnboarding()
  }, [isAuthenticated, user, needsOnboarding])

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

  if (isLoading || isCheckingOnboarding) {
    // Only show loading screen if user is authenticated (loading app content)
    // Don't show loading for login/auth operations as it unmounts the LoginPage and loses error state
    if (isAuthenticated) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center">
          <div className="text-center">
            <Database size={64} className="mx-auto mb-4 text-primary animate-pulse" weight="duotone" />
            <p className="text-muted-foreground">Loading session...</p>
          </div>
        </div>
      )
    }
    // For unauthenticated users during login, let the LoginPage show with its own loading state
  }

  if (!isAuthenticated) {
    return (
      <LoginPage 
        onSuccess={() => {
          // Navigate to home - the useEffect will set the correct tab based on the user's role
          navigateTo('/')
        }}
        onForgotPassword={() => navigateTo('/forgot-password')}
      />
    )
  }
  
  // Show onboarding if user needs it (first login, no administrations)
  if (route.type === 'onboarding' || needsOnboarding === true) {
    return (
      <OnboardingPage
        userRole={user?.role as 'zzp' | 'accountant' | 'admin'}
        userName={user?.full_name || 'there'}
        onComplete={() => {
          setNeedsOnboarding(false)
          navigateTo('/')
        }}
      />
    )
  }

  // Render the content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'workqueue':
        // Redirect ZZP users to dashboard if they try to access accountant-only pages
        return isAccountant ? <AccountantHomePage /> : <SmartDashboard />
      case 'clients':
        return isAccountant ? <AccountantDashboard /> : <SmartDashboard />
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
      default:
        return <SmartDashboard />
    }
  }

  return (
    <AppShell 
      activeTab={activeTab} 
      onTabChange={handleTabChange}
    >
      {renderTabContent()}
    </AppShell>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
