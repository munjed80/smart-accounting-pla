import { useState } from 'react'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { LoginPage } from '@/components/LoginPage'
import { SmartDashboard } from '@/components/SmartDashboard'
import { AccountantDashboard } from '@/components/AccountantDashboard'
import { IntelligentUploadPortal } from '@/components/IntelligentUploadPortal'
import { SmartTransactionList } from '@/components/SmartTransactionList'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  SignOut, 
  House, 
  UploadSimple, 
  User,
  Database,
  Receipt,
  Sparkle,
  Brain,
  UsersThree
} from '@phosphor-icons/react'

const AppContent = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const isAccountant = user?.role === 'accountant' || user?.role === 'admin'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'transactions' | 'upload'>(
    isAccountant ? 'clients' : 'dashboard'
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center">
        <div className="text-center">
          <Database size={64} className="mx-auto mb-4 text-primary animate-pulse" weight="duotone" />
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage onSuccess={() => setActiveTab(isAccountant ? 'clients' : 'dashboard')} />
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'dashboard' | 'clients' | 'transactions' | 'upload')} className="w-full">
        <div className="border-b border-border bg-secondary/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <TabsList className="bg-transparent border-none h-12">
              {/* Accountant-specific: Client Overview (Master Dashboard) */}
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

        {/* Accountant Master Dashboard */}
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
