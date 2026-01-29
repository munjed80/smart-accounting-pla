import { ReactNode, useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { navigateTo } from '@/lib/navigation'
import { getApiBaseUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { 
  Database, 
  SignOut, 
  House, 
  List, 
  Brain,
  Sparkle,
  Gear,
  Question,
  UsersThree,
  Stack,
  CaretLeft
} from '@phosphor-icons/react'

// Menu item configuration with role-based access
interface MenuItem {
  label: string
  path?: string
  tabValue?: string
  icon: ReactNode
  rolesAllowed: Array<'zzp' | 'accountant' | 'admin'>
}

// Define menu items for both roles
const menuItems: MenuItem[] = [
  {
    label: 'Work Queue',
    tabValue: 'workqueue',
    icon: <Stack size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
  },
  {
    label: 'Clients',
    tabValue: 'clients',
    icon: <UsersThree size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
  },
  {
    label: 'Dashboard',
    tabValue: 'dashboard',
    icon: <House size={20} weight="duotone" />,
    rolesAllowed: ['zzp', 'accountant', 'admin'],
  },
  {
    label: 'Smart Transactions',
    tabValue: 'transactions',
    icon: <Brain size={20} weight="duotone" />,
    rolesAllowed: ['zzp', 'accountant', 'admin'],
  },
  {
    label: 'AI Upload',
    tabValue: 'upload',
    icon: <Sparkle size={20} weight="duotone" />,
    rolesAllowed: ['zzp', 'accountant', 'admin'],
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: <Gear size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
  },
  {
    label: 'Support',
    path: '/support',
    icon: <Question size={20} weight="duotone" />,
    rolesAllowed: ['zzp', 'accountant', 'admin'],
  },
]

interface AppShellProps {
  children: ReactNode
  activeTab?: string
  onTabChange?: (tab: string) => void
}

export const AppShell = ({ children, activeTab, onTabChange }: AppShellProps) => {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDev = import.meta.env.DEV

  const isAccountant = user?.role === 'accountant' || user?.role === 'admin'

  // Filter menu items based on user role
  const visibleMenuItems = menuItems.filter(item => 
    user?.role && item.rolesAllowed.includes(user.role as 'zzp' | 'accountant' | 'admin')
  )

  // Handle logout: clear all auth tokens and redirect
  const handleLogout = () => {
    // Clear all possible storage locations
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('user')
    
    // Clear any cookies (best effort, httpOnly cookies must be cleared server-side)
    document.cookie.split(';').forEach(cookie => {
      const eqPos = cookie.indexOf('=')
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim()
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
    })
    
    // Call the auth context logout (which also clears state)
    logout()
    
    // Navigate to login page
    navigateTo('/login')
  }

  // Handle menu item click
  const handleMenuClick = (item: MenuItem) => {
    if (item.tabValue && onTabChange) {
      onTabChange(item.tabValue)
    } else if (item.path) {
      navigateTo(item.path)
    }
    // Close mobile menu after navigation
    setSidebarOpen(false)
  }

  // Navigate back to dashboard
  const handleBackToDashboard = () => {
    if (onTabChange) {
      onTabChange(isAccountant ? 'workqueue' : 'dashboard')
    }
    setSidebarOpen(false)
  }

  // Render sidebar/drawer content
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Database size={28} weight="duotone" className="text-primary" />
          <span className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Smart Accounting
          </span>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-border">
        <div className="text-sm">
          <p className="font-medium truncate">{user?.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <Badge variant="outline" className="mt-2 capitalize">
          {user?.role === 'zzp' ? 'ZZP' : user?.role}
        </Badge>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {visibleMenuItems.map((item) => (
            <li key={item.label}>
              <button
                onClick={() => handleMenuClick(item)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm
                  transition-colors duration-150
                  ${(item.tabValue && activeTab === item.tabValue) 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover:bg-secondary text-foreground'
                  }
                  touch-action-manipulation
                `}
                style={{ minHeight: '44px' }} // iOS tap target minimum
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Back to Dashboard Link */}
      <div className="p-2 border-t border-border">
        <button
          onClick={handleBackToDashboard}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          style={{ minHeight: '44px' }}
        >
          <CaretLeft size={18} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Dev Mode Debug Indicator */}
      {isDev && (
        <div className="p-3 mx-2 mb-2 rounded-md bg-secondary/50 border border-border text-xs">
          <p className="font-mono text-muted-foreground">
            <span className="font-semibold text-accent">DEV MODE</span>
          </p>
          <p className="font-mono text-muted-foreground truncate">
            Role: <span className="text-foreground">{user?.role}</span>
          </p>
          <p className="font-mono text-muted-foreground truncate" title={getApiBaseUrl()}>
            API: <span className="text-foreground">{getApiBaseUrl().replace('/api/v1', '')}</span>
          </p>
        </div>
      )}

      {/* Sidebar Footer - Logout */}
      <div className="p-4 border-t border-border">
        <Button 
          onClick={handleLogout} 
          variant="destructive" 
          className="w-full"
          size="default"
        >
          <SignOut size={18} className="mr-2" />
          Logout
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Top Header - Always visible */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Hamburger Menu + Brand */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="shrink-0"
                aria-label="Open navigation menu"
              >
                <List size={24} weight="bold" />
              </Button>
              
              <div className="flex items-center gap-2">
                <Database size={28} weight="duotone" className="text-primary hidden sm:block" />
                <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Smart Accounting
                </h1>
              </div>
            </div>

            {/* Right: Role Badge + Logout */}
            <div className="flex items-center gap-2 sm:gap-4">
              <Badge variant="outline" className="capitalize text-xs sm:text-sm">
                {user?.role === 'zzp' ? 'ZZP' : user?.role}
              </Badge>
              <Button 
                onClick={handleLogout} 
                variant="ghost" 
                size="sm"
                className="hidden sm:flex"
              >
                <SignOut size={18} className="mr-2" />
                Logout
              </Button>
              {/* Mobile Logout - Icon only */}
              <Button 
                onClick={handleLogout} 
                variant="ghost" 
                size="icon"
                className="sm:hidden"
                aria-label="Logout"
              >
                <SignOut size={20} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer / Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent 
          side="left" 
          className="w-[280px] sm:w-[320px] p-0 overflow-hidden"
          style={{ zIndex: 100 }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
            <SheetDescription>Navigate through the application</SheetDescription>
          </SheetHeader>
          {renderSidebarContent()}
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar - Show alongside content on larger screens */}
      <div className="hidden lg:flex">
        {/* Fixed Sidebar */}
        <aside 
          className="fixed left-0 top-16 bottom-0 w-64 border-r border-border bg-card/50 overflow-hidden"
          style={{ zIndex: 40 }}
        >
          {renderSidebarContent()}
        </aside>

        {/* Main Content Area with sidebar offset */}
        <main className="flex-1 ml-64">
          {children}
        </main>
      </div>

      {/* Mobile/Tablet Content - No sidebar offset */}
      <main className="lg:hidden">
        {children}
      </main>
    </div>
  )
}

export default AppShell
