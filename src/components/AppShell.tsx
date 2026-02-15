import { ReactNode, useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { useCloseOverlayOnRouteChange } from '@/hooks/useCloseOverlayOnRouteChange'
import { usePreventBodyScrollLock } from '@/hooks/usePreventBodyScrollLock'
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
  ClipboardText,
  Handshake,
  Bank,
  Storefront,
  ChartLineUp,
  Books,
  FileText,
  Receipt,
  Users,
  Clock,
  CalendarBlank,
  ListChecks,
  CurrencyEur,
} from '@phosphor-icons/react'
import { t } from '@/i18n'

// Menu item configuration with role-based access
interface MenuItem {
  label: string
  tabValue: string
  icon: ReactNode
  rolesAllowed: Array<'zzp' | 'accountant' | 'admin' | 'super_admin'>
  section?: 'main' | 'secondary'
  // Accounting concept grouping for accountants (5 core concepts)
  accountingSection?: 'activa' | 'debiteuren' | 'crediteuren' | 'grootboek' | 'winstverlies'
  // Hidden from menu but code remains
  hidden?: boolean
}

// Define menu items for both roles
const menuItems: MenuItem[] = [
  // === ACTIVA (Assets) ===
  {
    label: t('sidebar.bankActiva'),
    tabValue: 'bank',
    icon: <Bank size={20} weight="duotone" />,
    rolesAllowed: ['accountant'],
    section: 'main',
    accountingSection: 'activa',
  },
  
  // === DEBITEUREN (Receivables/Customers) ===
  {
    label: t('sidebar.klantenDebiteuren'),
    tabValue: 'clients',
    icon: <UsersThree size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
    accountingSection: 'debiteuren',
  },
  
  // === CREDITEUREN (Payables/Suppliers) ===
  {
    label: t('sidebar.leveranciersCrediteuren'),
    tabValue: 'crediteuren',
    icon: <Storefront size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
    accountingSection: 'crediteuren',
  },
  
  // === GROOTBOEK (General Ledger) ===
  {
    label: t('sidebar.werklijstGrootboek'),
    tabValue: 'workqueue',
    icon: <Stack size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
    accountingSection: 'grootboek',
  },
  {
    label: t('sidebar.beoordelenGrootboek'),
    tabValue: 'reviewqueue',
    icon: <MagnifyingGlass size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
    accountingSection: 'grootboek',
  },
  {
    label: 'Rekeningschema',
    tabValue: 'grootboek',
    icon: <Books size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
    accountingSection: 'grootboek',
  },
  
  // === WINST & VERLIES (Profit & Loss) ===
  {
    label: t('sidebar.overzichtWinstVerlies'),
    tabValue: 'profitloss',
    icon: <ChartLineUp size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'main',
    accountingSection: 'winstverlies',
  },
  
  // === Secondary items (not part of 5 concepts) ===
  {
    label: t('sidebar.reminders'),
    tabValue: 'reminders',
    icon: <Bell size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'secondary',
  },
  {
    label: t('sidebar.actionLog'),
    tabValue: 'acties',
    icon: <ClipboardText size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'secondary',
  },
  // === ZZP MVP Navigation (Dutch-first, minimal) ===
  // Reordered menu items for better UX
  // 1. Overzicht (Dashboard/Overview)
  {
    label: t('sidebar.overzicht'),
    tabValue: 'dashboard',
    icon: <House size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // 2. Klanten (Customers)
  {
    label: t('sidebar.klanten'),
    tabValue: 'customers',
    icon: <Users size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // 3. Facturen (Invoices)
  {
    label: t('sidebar.facturen'),
    tabValue: 'invoices',
    icon: <FileText size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // 4. Uitgaven (Expenses)
  {
    label: t('sidebar.uitgaven'),
    tabValue: 'expenses',
    icon: <Receipt size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // 5. Uren (Time Tracking)
  {
    label: t('sidebar.uren'),
    tabValue: 'time',
    icon: <Clock size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // 6. Agenda
  {
    label: t('sidebar.agenda'),
    tabValue: 'agenda',
    icon: <CalendarBlank size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },

  {
    label: 'Verplichtingen Overzicht',
    tabValue: 'obligations-overview',
    icon: <List size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  {
    label: 'Lease & Leningen',
    tabValue: 'lease-loans',
    icon: <CurrencyEur size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  {
    label: 'Abonnementen',
    tabValue: 'subscriptions',
    icon: <ArrowsLeftRight size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // 7. Boekhouder (Links/consent page)
  {
    label: t('sidebar.boekhouder'),
    tabValue: 'boekhouder',
    icon: <Handshake size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // 8. Documenten (AI Upload + document status list)
  {
    label: t('sidebar.documenten'),
    tabValue: 'upload',
    icon: <FileText size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },
  // 9. Boekingen (Transactions list + stats)
  {
    label: t('sidebar.boekingen'),
    tabValue: 'transactions',
    icon: <ListChecks size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'main',
  },

  {
    label: 'Systeembeheer',
    tabValue: 'admin',
    icon: <Database size={20} weight="duotone" />,
    rolesAllowed: ['super_admin'],
    section: 'main',
  },
  // === ZZP Secondary items ===
  // Settings
  {
    label: t('sidebar.settings'),
    tabValue: 'settings',
    icon: <Gear size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'secondary',
  },
  // Hidden: Support (removed from ZZP sidebar for cleaner MVP UX - route still accessible via direct URL /support)
  {
    label: t('sidebar.support'),
    tabValue: 'support',
    icon: <Headset size={20} weight="duotone" />,
    rolesAllowed: ['zzp'],
    section: 'secondary',
    hidden: true,
  },
  // === Accountant Secondary items ===
  {
    label: t('sidebar.settings'),
    tabValue: 'settings',
    icon: <Gear size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
    section: 'secondary',
  },
  {
    label: t('sidebar.support'),
    tabValue: 'support',
    icon: <Headset size={20} weight="duotone" />,
    rolesAllowed: ['accountant', 'admin'],
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
  const { activeClient, pendingCount } = useActiveClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDev = import.meta.env.DEV

  const isAccountant = user?.role === 'accountant' || user?.role === 'admin'
  const isSuperAdmin = user?.role === 'super_admin'
  
  // Protection: Close sidebar on route changes
  useCloseOverlayOnRouteChange(() => setSidebarOpen(false))
  
  // Protection: Prevent body scroll lock from getting stuck
  usePreventBodyScrollLock()
  
  // Protection: Close sidebar on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [sidebarOpen])
  
  // Determine the home tab based on user role
  const homeTab = isSuperAdmin ? 'admin' : isAccountant ? 'workqueue' : 'dashboard'
  const homeLabel = isSuperAdmin ? 'Terug naar Systeembeheer' : isAccountant ? t('sidebar.backToWorkQueue') : t('sidebar.backToOverzicht')

  // Filter menu items based on user role and hidden flag
  const visibleMenuItems = menuItems.filter(item => 
    user?.role && 
    item.rolesAllowed.includes(user.role as 'zzp' | 'accountant' | 'admin' | 'super_admin') &&
    !item.hidden
  )
  
  // Group items by accounting section for accountants
  const accountingSections: Array<{ key: string; label: string; items: MenuItem[] }> = isAccountant ? [
    { 
      key: 'activa', 
      label: t('sidebar.sectionActiva'), 
      items: visibleMenuItems.filter(i => i.accountingSection === 'activa' && i.section !== 'secondary') 
    },
    { 
      key: 'debiteuren', 
      label: t('sidebar.sectionDebiteuren'), 
      items: visibleMenuItems.filter(i => i.accountingSection === 'debiteuren' && i.section !== 'secondary') 
    },
    { 
      key: 'crediteuren', 
      label: t('sidebar.sectionCrediteuren'), 
      items: visibleMenuItems.filter(i => i.accountingSection === 'crediteuren' && i.section !== 'secondary') 
    },
    { 
      key: 'grootboek', 
      label: t('sidebar.sectionGrootboek'), 
      items: visibleMenuItems.filter(i => i.accountingSection === 'grootboek' && i.section !== 'secondary') 
    },
    { 
      key: 'winstverlies', 
      label: t('sidebar.sectionWinstVerlies'), 
      items: visibleMenuItems.filter(i => i.accountingSection === 'winstverlies' && i.section !== 'secondary') 
    },
  ].filter(section => section.items.length > 0) : []

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
    // Close mobile menu BEFORE navigation
    setSidebarOpen(false)
    
    // Trigger navigation
    if (item.tabValue && onTabChange) {
      onTabChange(item.tabValue)
    }
  }

  // Navigate back to home (Work Queue for accountants, Dashboard for ZZP)
  const handleBackToHome = () => {
    // Close mobile menu BEFORE navigation
    setSidebarOpen(false)
    
    if (onTabChange) {
      onTabChange(homeTab)
    }
  }
  
  // Handle changing client (go to clients page)
  const handleChangeClient = () => {
    // Close mobile menu BEFORE navigation
    setSidebarOpen(false)
    
    if (onTabChange) {
      onTabChange('clients')
    }
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
        {/* Accountant: Show grouped sections by accounting concept */}
        {isAccountant && accountingSections.length > 0 ? (
          <div className="space-y-4">
            {accountingSections.map((section) => (
              <div key={section.key}>
                {/* Section Header */}
                <h3 className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.label}
                </h3>
                <ul className="space-y-1" role="menu">
                  {section.items.map((item) => {
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
              </div>
            ))}
          </div>
        ) : (
          /* ZZP users: Show flat list without sections */
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
        )}
        
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
                  {activeClient ? (
                    <span className="text-sm font-medium">{activeClient.name || activeClient.email}</span>
                  ) : (
                    <span className="text-sm text-amber-600">{t('clientSwitcher.noClientSelected')}</span>
                  )}
                  {pendingCount > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                      {pendingCount}
                    </Badge>
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
                {activeClient ? (
                  <span className="text-xs font-medium">{activeClient.name || activeClient.email}</span>
                ) : (
                  <span className="text-xs text-amber-600">{t('clientSwitcher.noClientSelected')}</span>
                )}
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                    {pendingCount}
                  </Badge>
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
