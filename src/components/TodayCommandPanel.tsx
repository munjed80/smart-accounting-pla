/**
 * TodayCommandPanel - "Vandaag – Overzicht" Component
 * 
 * Accountant Command Layer: Shows what to do TODAY and WHY at a glance.
 * Located at the TOP of the accountant dashboard for instant visibility.
 * 
 * Features:
 * - Vandaag Taken: Max 5 prioritized action items with icons and links
 * - Prioriteit Indicator: "Nu doen", "Vandaag", "Kan wachten"
 * - Vandaag Resultaat: Session-based action counter
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  WarningCircle,
  MagnifyingGlass,
  Calendar,
  Stack,
  ArrowRight,
  CheckCircle,
} from '@phosphor-icons/react'
import { DashboardSummary, ClientStatusCard } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'

// Business logic thresholds for task prioritization
// VAT deadlines within this many days are considered urgent ("Nu doen")
const VAT_URGENT_DAYS = 5
// VAT deadlines within this many days are considered upcoming ("Vandaag")
const VAT_UPCOMING_DAYS = 14
// Document backlog above this threshold is marked as urgent
const BACKLOG_URGENT_THRESHOLD = 20

// Priority levels for tasks
type Priority = 'nu_doen' | 'vandaag' | 'kan_wachten'

interface TodayTask {
  id: string
  icon: React.ElementType
  iconColor: 'red' | 'yellow' | 'green'
  text: string
  priority: Priority
  link: string
  count: number
}

interface TodayCommandPanelProps {
  summary: DashboardSummary | null
  clients: ClientStatusCard[]
  isLoading?: boolean
}

// Session storage key for completed actions
const COMPLETED_ACTIONS_KEY = 'todayCompletedActions'
const COMPLETED_DATE_KEY = 'todayCompletedDate'

// Get today's date string for session tracking
const getTodayDateString = () => new Date().toISOString().split('T')[0]

// Get completed actions from session storage (resets daily)
const getCompletedActions = (): number => {
  const storedDate = sessionStorage.getItem(COMPLETED_DATE_KEY)
  const today = getTodayDateString()
  
  if (storedDate !== today) {
    // Reset for new day
    sessionStorage.setItem(COMPLETED_DATE_KEY, today)
    sessionStorage.setItem(COMPLETED_ACTIONS_KEY, '0')
    return 0
  }
  
  return parseInt(sessionStorage.getItem(COMPLETED_ACTIONS_KEY) || '0', 10)
}

// Increment completed actions (call this when user completes an action)
export const incrementCompletedActions = (): void => {
  const current = getCompletedActions()
  sessionStorage.setItem(COMPLETED_ACTIONS_KEY, String(current + 1))
  
  // Dispatch custom event so the panel can update
  window.dispatchEvent(new CustomEvent('todayActionCompleted'))
}

// Priority label component
const PriorityLabel = ({ priority }: { priority: Priority }) => {
  const config = {
    nu_doen: { text: 'Nu doen', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
    vandaag: { text: 'Vandaag', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
    kan_wachten: { text: 'Kan wachten', className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  }
  
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config[priority].className}`}>
      {config[priority].text}
    </Badge>
  )
}

// Task item component
const TaskItem = ({ task, onClick }: { task: TodayTask; onClick: () => void }) => {
  const Icon = task.icon
  const colorClasses = {
    red: 'text-red-600 dark:text-red-400 bg-red-500/10',
    yellow: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    green: 'text-green-600 dark:text-green-400 bg-green-500/10',
  }
  
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
    >
      <div className={`p-2 rounded-lg ${colorClasses[task.iconColor]} flex-shrink-0`}>
        <Icon size={18} weight="fill" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {task.text}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <PriorityLabel priority={task.priority} />
        <ArrowRight 
          size={16} 
          className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" 
        />
      </div>
    </button>
  )
}

export const TodayCommandPanel = ({ summary, clients, isLoading }: TodayCommandPanelProps) => {
  const [completedActions, setCompletedActions] = useState(getCompletedActions)
  
  // Listen for action completion events
  useEffect(() => {
    const handleActionCompleted = () => {
      setCompletedActions(getCompletedActions())
    }
    
    window.addEventListener('todayActionCompleted', handleActionCompleted)
    return () => window.removeEventListener('todayActionCompleted', handleActionCompleted)
  }, [])
  
  // Derive tasks from summary and clients data
  const tasks = useMemo((): TodayTask[] => {
    if (!summary) return []
    
    const allTasks: TodayTask[] = []
    
    // 1. Red issues - highest priority
    if (summary.clients_with_red_issues > 0) {
      allTasks.push({
        id: 'red_issues',
        icon: WarningCircle,
        iconColor: 'red',
        text: summary.clients_with_red_issues === 1
          ? '1 klant met rode issues'
          : `${summary.clients_with_red_issues} klanten met rode issues`,
        priority: 'nu_doen',
        link: '/accountant?tab=red_issues',
        count: summary.clients_with_red_issues,
      })
    }
    
    // 2. VAT deadlines within urgent threshold - critical
    const urgentVatClients = clients.filter(c => 
      c.days_to_vat_deadline !== null && c.days_to_vat_deadline <= VAT_URGENT_DAYS
    ).length
    
    if (urgentVatClients > 0) {
      allTasks.push({
        id: 'vat_urgent',
        icon: Calendar,
        iconColor: 'red',
        text: urgentVatClients === 1
          ? `1 klant met BTW-deadline binnen ${VAT_URGENT_DAYS} dagen`
          : `${urgentVatClients} klanten met BTW-deadline binnen ${VAT_URGENT_DAYS} dagen`,
        priority: 'nu_doen',
        link: '/accountant?tab=vat_due',
        count: urgentVatClients,
      })
    }
    
    // 3. Documents needing review - medium priority
    if (summary.clients_in_review > 0) {
      const totalDocs = clients.reduce((sum, c) => sum + c.documents_needing_review_count, 0)
      allTasks.push({
        id: 'review',
        icon: MagnifyingGlass,
        iconColor: 'yellow',
        text: totalDocs === 1
          ? '1 document wacht op beoordeling'
          : `${totalDocs} documenten wachten op beoordeling`,
        priority: 'vandaag',
        link: '/accountant?tab=needs_review',
        count: totalDocs,
      })
    }
    
    // 4. VAT deadlines within upcoming threshold - today priority
    const upcomingVatClients = clients.filter(c => 
      c.days_to_vat_deadline !== null && 
      c.days_to_vat_deadline > VAT_URGENT_DAYS && 
      c.days_to_vat_deadline <= VAT_UPCOMING_DAYS
    ).length
    
    if (upcomingVatClients > 0) {
      allTasks.push({
        id: 'vat_upcoming',
        icon: Calendar,
        iconColor: 'yellow',
        text: upcomingVatClients === 1
          ? '1 klant met BTW-deadline binnen 2 weken'
          : `${upcomingVatClients} klanten met BTW-deadline binnen 2 weken`,
        priority: 'vandaag',
        link: '/accountant?tab=vat_due',
        count: upcomingVatClients,
      })
    }
    
    // 5. Document backlog - can wait if not urgent
    if (summary.document_backlog_total > 0 && allTasks.length < 5) {
      allTasks.push({
        id: 'backlog',
        icon: Stack,
        iconColor: summary.document_backlog_total > BACKLOG_URGENT_THRESHOLD ? 'yellow' : 'green',
        text: summary.document_backlog_total === 1
          ? '1 document in achterstand'
          : `${summary.document_backlog_total} documenten in achterstand`,
        priority: summary.document_backlog_total > BACKLOG_URGENT_THRESHOLD ? 'vandaag' : 'kan_wachten',
        link: '/accountant?tab=all',
        count: summary.document_backlog_total,
      })
    }
    
    // Return max 5 tasks, sorted by priority
    const priorityOrder: Record<Priority, number> = {
      nu_doen: 0,
      vandaag: 1,
      kan_wachten: 2,
    }
    
    return allTasks
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 5)
  }, [summary, clients])
  
  // Handle task click - navigate and increment action counter
  const handleTaskClick = (task: TodayTask) => {
    incrementCompletedActions()
    
    // Parse tab from link and set active tab
    // Since our links are always relative paths like '/accountant?tab=xxx',
    // we can safely parse them with URL constructor
    let tab: string | null = null
    try {
      const url = new URL(task.link, window.location.origin)
      tab = url.searchParams.get('tab')
    } catch {
      // If URL parsing fails, try to extract tab parameter manually
      const tabMatch = task.link.match(/[?&]tab=([^&]+)/)
      tab = tabMatch ? tabMatch[1] : null
    }
    
    if (tab) {
      // Store the tab in sessionStorage for the page to pick up
      sessionStorage.setItem('accountantActiveTab', tab)
    }
    
    navigateTo('/accountant')
    
    // Dispatch event to notify tab change
    window.dispatchEvent(new CustomEvent('accountantTabChange', { detail: { tab } }))
  }
  
  // Show skeleton while loading
  if (isLoading) {
    return (
      <Card className="mb-6 bg-gradient-to-r from-primary/5 via-background to-primary/5 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Vandaag – Overzicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
  
  // If no tasks, show positive message
  if (tasks.length === 0) {
    return (
      <Card className="mb-6 bg-gradient-to-r from-green-500/5 via-background to-green-500/5 border-green-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle size={20} className="text-green-600" weight="fill" />
            Vandaag – Overzicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-muted-foreground">
              Alles is op orde. Geen urgente taken vandaag.
            </p>
          </div>
          {/* Footer */}
          <div className="pt-3 mt-3 border-t border-border/50 text-center">
            <p className="text-xs text-muted-foreground">
              Vandaag afgerond: {completedActions} {completedActions === 1 ? 'actie' : 'acties'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card className="mb-6 bg-gradient-to-r from-primary/5 via-background to-primary/5 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Vandaag – Overzicht</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Task list */}
        <div className="space-y-1">
          {tasks.map((task) => (
            <TaskItem 
              key={task.id} 
              task={task} 
              onClick={() => handleTaskClick(task)} 
            />
          ))}
        </div>
        
        {/* Footer with completed actions counter */}
        <div className="pt-3 mt-3 border-t border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            Vandaag afgerond: {completedActions} {completedActions === 1 ? 'actie' : 'acties'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
