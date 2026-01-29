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
import { AppShell } from '@/components/AppShell'
import { administrationApi } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { Database } from '@phosphor-icons/react'

// Simple URL-based routing
type Route = 
  | { type: 'login' }
  | { type: 'forgot-password' }
  | { type: 'verify-email'; token: string }
  | { type: 'reset-password'; token: string }
  | { type: 'onboarding' }
  | { type: 'app' }

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
  
  return { type: 'app' }
}

const AppContent = () => {
  const { user, isAuthenticated, isLoading } = useAuth()
  const isAccountant = user?.role === 'accountant' || user?.role === 'admin'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'workqueue' | 'transactions' | 'upload'>('dashboard')
  const [route, setRoute] = useState<Route>(getRouteFromURL)
  
  // Onboarding state - tracks if user needs onboarding (no administrations)
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null)
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(false)
  
  // Track if we've set the initial tab based on role (to avoid resetting on every render)
  const [hasSetInitialTab, setHasSetInitialTab] = useState(false)

  // Listen for URL changes
  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteFromURL())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  
  // Update active tab when user role becomes available (after login)
  useEffect(() => {
    if (user && isAuthenticated && !hasSetInitialTab) {
      // Set the correct initial tab based on the user's role
      const userIsAccountant = user.role === 'accountant' || user.role === 'admin'
      const defaultTab = userIsAccountant ? 'workqueue' : 'dashboard'
      setActiveTab(defaultTab)
      setHasSetInitialTab(true)
    }
    // Reset state when user logs out for clean state transition
    if (!isAuthenticated) {
      setHasSetInitialTab(false)
      setActiveTab('dashboard')
    }
  }, [user, isAuthenticated, hasSetInitialTab])
  
  // Check if user needs onboarding (first login - no administrations)
  useEffect(() => {
    const checkOnboarding = async () => {
      if (!isAuthenticated || !user) {
        setNeedsOnboarding(null)
        return
      }
      
      setIsCheckingOnboarding(true)
      try {
        const administrations = await administrationApi.list()
        // User needs onboarding if they have no administrations
        const needsSetup = administrations.length === 0
        setNeedsOnboarding(needsSetup)
        
        // Auto-redirect to onboarding if needed and not already there
        if (needsSetup && route.type === 'app') {
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
  }, [isAuthenticated, user, route])

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
        return isAccountant ? <AccountantHomePage /> : null
      case 'clients':
        return isAccountant ? <AccountantDashboard /> : null
      case 'dashboard':
        return <SmartDashboard />
      case 'transactions':
        return <SmartTransactionList />
      case 'upload':
        return <IntelligentUploadPortal />
      default:
        return <SmartDashboard />
    }
  }

  return (
    <AppShell 
      activeTab={activeTab} 
      onTabChange={(tab) => setActiveTab(tab as 'dashboard' | 'clients' | 'workqueue' | 'transactions' | 'upload')}
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
