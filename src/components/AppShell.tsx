import { ReactNode, useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { navigateTo } from '@/lib/navigation'
import { getApiBaseUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  UsersThree,
  Stack,
  CaretLeft,
  Gear,
  Headset,
  User,
  WarningCircle,
  ArrowsLeftRight,
  MagnifyingGlass,
  Bell,
} from '@phosphor-icons/react'
import { t } from '@/i18n'

// Menu item configuration with role-based access
interface MenuItem {
  label: string
  tabValue: string
  icon: ReactNode
  rolesAllowed: Array<'zzp' | 'accountant' | 'admin'>
  section?: 'main' | 'secondary'
}

// Define menu items for both roles
const menuItems: MenuItem[] = [
  // Accountant-only main items (shown at top for accountants)
  {
    label: t('sidebar.accountantOverview'),
    tabValue: 'workqueue',
    icon: <Stack size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
  },
  {
    label: t('sidebar.accountantClients'),
    tabValue: 'clients',
    icon: <UsersThree size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
  },
  {
    label: t('sidebar.reviewQueue'),
    tabValue: 'reviewqueue',
    icon: <MagnifyingGlass size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
  },
  {
    label: t('sidebar.reminders'),
    tabValue: 'reminders',
    icon: <Bell size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
  },
  // ZZP main items (Dashboard first for ZZP users)
  {
    label: t('sidebar.dashboard'),
    tabValue: 'dashboard',
    icon: <House size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  {
    label: t('sidebar.smartTransactions'),
    tabValue: 'transactions',
    icon: <Brain size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  {
    label: t('sidebar.aiUpload'),
    tabValue: 'upload',
    icon: <Sparkle size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // Secondary items (Settings & Support for all roles)
  {
    label: t('sidebar.settings'),
    tabValue: 'settings',
    icon: <Gear size={20} weight="duotone" />,
    rolesAllowed: ['zzp', 'accountant', 'admin'],
    section: 'secondary',
  },
  {
    label: t('sidebar.support'),
    tabValue: 'support',
    icon: <Headset size={20} weight="duotone" />,
    rolesAllowed: ['zzp', 'accountant', 'admin'],
    section: 'secondary',
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
  
  // Selected client state (for accountants) - stored in localStorage
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null)
  
  // Sync selected client from localStorage
  useEffect(() => {
    if (isAccountant) {
      const storedId = localStorage.getItem('selectedClientId')
      const storedName = localStorage.getItem('selectedClientName')
      setSelectedClientId(storedId)
      setSelectedClientName(storedName)
      
      // Listen for storage changes (when another tab updates it)
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'selectedClientId') {
          setSelectedClientId(e.newValue)
        }
        if (e.key === 'selectedClientName') {
          setSelectedClientName(e.newValue)
        }
      }
      
      window.addEventListener('storage', handleStorageChange)
      return () => window.removeEventListener('storage', handleStorageChange)
    }
  }, [isAccountant])
  
  // Determine the home tab based on user role
  const homeTab = isAccountant ? 'workqueue' : 'dashboard'
  const homeLabel = isAccountant ? t('sidebar.backToWorkQueue') : t('sidebar.backToDashboard')

  // Filter menu items based on user role
  const visibleMenuItems = menuItems.filter(item => 
    user?.role && item.rolesAllowed.includes(user.role as 'zzp' | 'accountant' | 'admin')
  )

  // Handle logout: use centralized logout from AuthContext and redirect
  const handleLogout = () => {
    logout()
    // Clear selected client on logout
    localStorage.removeItem('selectedClientId')
    localStorage.removeItem('selectedClientName')
    navigateTo('/login')
  }

  // Handle menu item click
  const handleMenuClick = (item: MenuItem) => {
    if (item.tabValue && onTabChange) {
      onTabChange(item.tabValue)
    }
    // Close mobile menu after navigation
    setSidebarOpen(false)
  }

  // Navigate back to home (Work Queue for accountants, Dashboard for ZZP)
  const handleBackToHome = () => {
    if (onTabChange) {
      onTabChange(homeTab)
    }
    setSidebarOpen(false)
  }
  
  // Handle changing client (go to clients page)
  const handleChangeClient = () => {
    if (onTabChange) {
      onTabChange('clients')
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
            {t('brand.name')}
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
          {user?.role === 'zzp' ? t('roles.zzp') : user?.role === 'accountant' ? t('roles.accountant') : user?.role}
        </Badge>
      </div>

      {/* Navigation Menu - Main Items */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Main navigation">
        <ul className="space-y-1" role="menu">
          {visibleMenuItems.filter(item => item.section !== 'secondary').map((item) => {
            const isActive = item.tabValue && activeTab === item.tabValue
            return (
              <li key={item.label} role="none">
                <button
                  role="menuitem"
                  onClick={() => handleMenuClick(item)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm
                    transition-colors duration-150
                    ${isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-secondary text-foreground'
                    }
                  `}
                  style={{ minHeight: '44px' }} // iOS tap target minimum
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
        
        {/* Secondary Navigation - Settings & Support */}
        <Separator className="my-3" />
        <ul className="space-y-1" role="menu">
          {visibleMenuItems.filter(item => item.section === 'secondary').map((item) => {
            const isActive = item.tabValue && activeTab === item.tabValue
            return (
              <li key={item.label} role="none">
                <button
                  role="menuitem"
                  onClick={() => handleMenuClick(item)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm
                    transition-colors duration-150
                    ${isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-secondary text-foreground'
                    }
                  `}
                  style={{ minHeight: '44px' }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Back to Home Link - only render if onTabChange is available */}
      {onTabChange && (
        <div className="p-2 border-t border-border">
          <button
            onClick={handleBackToHome}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            style={{ minHeight: '44px' }}
          >
            <CaretLeft size={18} />
            <span>{homeLabel}</span>
          </button>
        </div>
      )}

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
          {t('common.logout')}
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
                  {t('brand.name')}
                </h1>
              </div>
            </div>
            
            {/* Center: Client Switcher (for accountants only) */}
            {isAccountant && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/50 border border-border">
                <User size={16} className="text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('clientSwitcher.activeClient')}:</span>
                  {selectedClientName ? (
                    <span className="text-sm font-medium">{selectedClientName}</span>
                  ) : (
                    <span className="text-sm text-amber-600">{t('clientSwitcher.noClientSelected')}</span>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs"
                  onClick={handleChangeClient}
                >
                  <ArrowsLeftRight size={14} className="mr-1" />
                  {t('clientSwitcher.change')}
                </Button>
              </div>
            )}

            {/* Right: Role Badge + Logout */}
            <div className="flex items-center gap-2 sm:gap-4">
              <Badge variant="outline" className="capitalize text-xs sm:text-sm">
                {user?.role === 'zzp' ? t('roles.zzp') : user?.role === 'accountant' ? t('roles.accountant') : user?.role}
              </Badge>
              <Button 
                onClick={handleLogout} 
                variant="ghost" 
                size="sm"
                className="hidden sm:flex"
              >
                <SignOut size={18} className="mr-2" />
                {t('common.logout')}
              </Button>
              {/* Mobile Logout - Icon only */}
              <Button 
                onClick={handleLogout} 
                variant="ghost" 
                size="icon"
                className="sm:hidden"
                aria-label={t('common.logout')}
              >
                <SignOut size={20} />
              </Button>
            </div>
          </div>
          
          {/* Mobile Client Switcher (below header on mobile for accountants) */}
          {isAccountant && (
            <div className="md:hidden flex items-center justify-between py-2 border-t border-border/50">
              <div className="flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('clientSwitcher.activeClient')}:</span>
                {selectedClientName ? (
                  <span className="text-xs font-medium">{selectedClientName}</span>
                ) : (
                  <span className="text-xs text-amber-600">{t('clientSwitcher.noClientSelected')}</span>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={handleChangeClient}
              >
                {t('clientSwitcher.change')}
              </Button>
            </div>
          )}
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
            <SheetTitle>{t('sidebar.navigationMenu')}</SheetTitle>
            <SheetDescription>{t('sidebar.navigateApp')}</SheetDescription>
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
