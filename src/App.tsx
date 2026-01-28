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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { administrationApi } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { 
  SignOut, 
  House, 
  UploadSimple, 
  User,
  Database,
  Receipt,
  Sparkle,
  Brain,
  UsersThree,
  Stack
} from '@phosphor-icons/react'

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
  
  if (path === '/login') {
    return { type: 'login' }
  }
  
  if (path === '/onboarding') {
    return { type: 'onboarding' }
  }
  
  return { type: 'app' }
}

const AppContent = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const isAccountant = user?.role === 'accountant' || user?.role === 'admin'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'workqueue' | 'transactions' | 'upload'>(
    isAccountant ? 'workqueue' : 'dashboard'
  )
  const [route, setRoute] = useState<Route>(getRouteFromURL)
  
  // Onboarding state - tracks if user needs onboarding (no administrations)
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null)
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(false)

  // Listen for URL changes
  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteFromURL())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  
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
          navigateTo('/')
          setActiveTab(isAccountant ? 'workqueue' : 'dashboard')
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

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Database size={32} weight="duotone" className="text-primary" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Smart Accounting
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <User size={20} className="text-muted-foreground" />
                <div className="text-sm">
                  <p className="font-medium">{user?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <Badge variant="outline" className="capitalize">
                {user?.role}
              </Badge>
              <Button onClick={logout} variant="ghost" size="sm">
                <SignOut size={18} className="mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'dashboard' | 'clients' | 'workqueue' | 'transactions' | 'upload')} className="w-full">
        <div className="border-b border-border bg-secondary/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <TabsList className="bg-transparent border-none h-12">
              {/* Accountant-specific: Work Queue (New Master Dashboard) */}
              {isAccountant && (
                <TabsTrigger 
                  value="workqueue" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2"
                >
                  <Stack size={20} weight="duotone" />
                  Work Queue
                </TabsTrigger>
              )}
              {/* Accountant-specific: Client Overview (Original Dashboard) */}
              {isAccountant && (
                <TabsTrigger 
                  value="clients" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2"
                >
                  <UsersThree size={20} weight="duotone" />
                  Clients
                </TabsTrigger>
              )}
              <TabsTrigger 
                value="dashboard" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2"
              >
                <House size={20} />
                Dashboard
              </TabsTrigger>
              <TabsTrigger 
                value="transactions" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2"
              >
                <Brain size={20} weight="duotone" />
                Smart Transactions
              </TabsTrigger>
              <TabsTrigger 
                value="upload" 
                className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
              >
                <Sparkle size={20} weight="duotone" />
                AI Upload
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Accountant Work Queue (New Master Dashboard with Bulk Ops) */}
        {isAccountant && (
          <TabsContent value="workqueue" className="m-0">
            <AccountantHomePage />
          </TabsContent>
        )}

        {/* Accountant Client Dashboard (Original) */}
        {isAccountant && (
          <TabsContent value="clients" className="m-0">
            <AccountantDashboard />
          </TabsContent>
        )}

        <TabsContent value="dashboard" className="m-0">
          <SmartDashboard />
        </TabsContent>

        <TabsContent value="transactions" className="m-0">
          <SmartTransactionList />
        </TabsContent>

        <TabsContent value="upload" className="m-0">
          <IntelligentUploadPortal />
        </TabsContent>
      </Tabs>
    </div>
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
