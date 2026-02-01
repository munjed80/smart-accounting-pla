/**
 * PriorityClientsPanel - "Top prioriteit klanten" Component
 * 
 * Shows a ranked list of clients by urgency (Risk Score) for accountants.
 * Allows 1-click dossier opening and client selection.
 * 
 * Risk Score formula (0-100):
 * - +30 if red_issue_count > 0
 * - +20 if documents_needing_review_count > 0
 * - +20 if days_to_vat_deadline <= 7
 * - +10 if document_backlog exists (backlog_age_max_days !== null)
 * - +5 if last_activity_days > 14 (inactivity)
 * Clamped to 0-100.
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Users,
  Eye,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react'
import { ClientStatusCard } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'

// Risk levels
type RiskLevel = 'rood' | 'geel' | 'ok'

interface ClientWithRisk extends ClientStatusCard {
  riskScore: number
  riskLevel: RiskLevel
}

interface PriorityClientsPanelProps {
  clients: ClientStatusCard[]
  isLoading?: boolean
}

/**
 * Calculate risk score for a client (deterministic formula)
 */
export function calculateRiskScore(client: ClientStatusCard): number {
  let score = 0
  
  // +30 if red_issue_count > 0
  if (client.red_issue_count > 0) {
    score += 30
  }
  
  // +20 if documents_needing_review_count > 0
  if (client.documents_needing_review_count > 0) {
    score += 20
  }
  
  // +20 if days_to_vat_deadline <= 7
  if (client.days_to_vat_deadline !== null && client.days_to_vat_deadline <= 7) {
    score += 20
  }
  
  // +10 if document_backlog exists (backlog_age_max_days !== null means backlog exists)
  if (client.backlog_age_max_days !== null && client.backlog_age_max_days > 0) {
    score += 10
  }
  
  // +5 if last_activity_days > 14 (inactivity)
  if (client.last_activity_at) {
    const lastActivity = new Date(client.last_activity_at)
    const daysSinceActivity = Math.floor(
      (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceActivity > 14) {
      score += 5
    }
  }
  
  // Clamp to 0-100
  return Math.min(100, Math.max(0, score))
}

/**
 * Get risk level label based on score
 */
function getRiskLevel(score: number): RiskLevel {
  if (score >= 70) return 'rood'
  if (score >= 40) return 'geel'
  return 'ok'
}

/**
 * Risk Badge component
 */
const RiskBadge = ({ score, level }: { score: number; level: RiskLevel }) => {
  const config: Record<RiskLevel, { label: string; className: string }> = {
    rood: {
      label: t('priorityClients.riskRed'),
      className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800',
    },
    geel: {
      label: t('priorityClients.riskYellow'),
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    },
    ok: {
      label: t('priorityClients.riskOk'),
      className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-300 dark:border-green-800',
    },
  }
  
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config[level].className}`}>
      {config[level].label} ({score})
    </Badge>
  )
}

/**
 * Filter chip component
 */
const FilterChip = ({ 
  label, 
  active, 
  onClick 
}: { 
  label: string
  active: boolean
  onClick: () => void 
}) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
      active
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted text-muted-foreground hover:bg-muted/80'
    }`}
  >
    {label}
  </button>
)

/**
 * Client row component
 */
const ClientRow = ({ 
  client, 
  onOpenDossier, 
  onSelect 
}: { 
  client: ClientWithRisk
  onOpenDossier: () => void
  onSelect: () => void
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-border/40">
    {/* Client info */}
    <div className="flex-1 min-w-0">
      <p className="font-medium text-sm truncate">{client.name}</p>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <RiskBadge score={client.riskScore} level={client.riskLevel} />
        {/* Indicators */}
        {client.documents_needing_review_count > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('priorityClients.toReview')}: {client.documents_needing_review_count}
          </span>
        )}
        {client.days_to_vat_deadline !== null && (
          <span className={`text-xs ${client.days_to_vat_deadline <= 7 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
            {t('priorityClients.vatDays')}: {client.days_to_vat_deadline} {t('priorityClients.days')}
          </span>
        )}
      </div>
    </div>
    
    {/* Actions */}
    <div className="flex items-center gap-2 flex-shrink-0">
      <Button 
        variant="outline" 
        size="sm"
        onClick={onOpenDossier}
        className="text-xs"
      >
        <Eye size={14} className="mr-1" />
        {t('priorityClients.openDossier')}
      </Button>
      <Button 
        variant="ghost" 
        size="sm"
        onClick={onSelect}
        className="text-xs"
      >
        {t('priorityClients.select')}
      </Button>
    </div>
  </div>
)

export const PriorityClientsPanel = ({ clients, isLoading }: PriorityClientsPanelProps) => {
  // Filter state
  const [activeFilter, setActiveFilter] = useState<'alle' | RiskLevel>('alle')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Calculate risk scores and sort clients
  const clientsWithRisk = useMemo((): ClientWithRisk[] => {
    return clients.map(client => {
      const riskScore = calculateRiskScore(client)
      return {
        ...client,
        riskScore,
        riskLevel: getRiskLevel(riskScore),
      }
    }).sort((a, b) => b.riskScore - a.riskScore)
  }, [clients])
  
  // Apply filters
  const filteredClients = useMemo(() => {
    let result = clientsWithRisk
    
    // Filter by risk level
    if (activeFilter !== 'alle') {
      result = result.filter(c => c.riskLevel === activeFilter)
    }
    
    // Filter by search query (client-side)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(c => 
        c.name.toLowerCase().includes(query)
      )
    }
    
    // Limit to max 10
    return result.slice(0, 10)
  }, [clientsWithRisk, activeFilter, searchQuery])
  
  // Handle open dossier
  const handleOpenDossier = (client: ClientWithRisk) => {
    // Navigate to client issues page using client.id
    navigateTo(`/accountant/clients/${client.id}/issues`)
  }
  
  // Handle select client (store in localStorage for other components)
  const handleSelectClient = (client: ClientWithRisk) => {
    localStorage.setItem('selectedClientId', client.id)
    localStorage.setItem('selectedClientName', client.name)
    // Dispatch storage event for other components
    window.dispatchEvent(new StorageEvent('storage', { key: 'selectedClientId' }))
  }
  
  // Clear filters
  const handleClearFilters = () => {
    setActiveFilter('alle')
    setSearchQuery('')
  }
  
  // Show skeleton while loading
  if (isLoading) {
    return (
      <Card className="mb-6 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">{t('priorityClients.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
  
  // If no clients at all, show onboarding CTA
  if (clients.length === 0) {
    return (
      <Card className="mb-6 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">{t('priorityClients.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Users size={48} className="mx-auto mb-4 text-muted-foreground/50" />
            <p className="font-medium text-foreground">{t('priorityClients.noClients')}</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {t('priorityClients.noClientsDesc')}
            </p>
            <Button 
              variant="outline"
              onClick={() => navigateTo('/accountant/onboarding')}
            >
              {t('priorityClients.goToOnboarding')}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card className="mb-6 bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg font-semibold">{t('priorityClients.title')}</CardTitle>
          
          {/* Search */}
          <div className="relative w-full sm:w-48">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('priorityClients.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        
        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <FilterChip 
            label={t('filters.all')} 
            active={activeFilter === 'alle'} 
            onClick={() => setActiveFilter('alle')} 
          />
          <FilterChip 
            label={t('priorityClients.riskRed')} 
            active={activeFilter === 'rood'} 
            onClick={() => setActiveFilter('rood')} 
          />
          <FilterChip 
            label={t('priorityClients.riskYellow')} 
            active={activeFilter === 'geel'} 
            onClick={() => setActiveFilter('geel')} 
          />
          <FilterChip 
            label={t('priorityClients.riskOk')} 
            active={activeFilter === 'ok'} 
            onClick={() => setActiveFilter('ok')} 
          />
        </div>
      </CardHeader>
      
      <CardContent>
        {filteredClients.length > 0 ? (
          <div className="space-y-2">
            {filteredClients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                onOpenDossier={() => handleOpenDossier(client)}
                onSelect={() => handleSelectClient(client)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-3">{t('priorityClients.noResults')}</p>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleClearFilters}
            >
              <X size={14} className="mr-1" />
              {t('priorityClients.clearFilter')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
