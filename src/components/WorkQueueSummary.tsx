/**
 * Work Queue Summary Component
 * 
 * Displays an operational hub for accountants with:
 * - Document review cards
 * - Bank reconciliation cards
 * - VAT actions cards
 * - Reminders/overdue cards
 * - Integrity warnings cards
 * 
 * Mobile-first card design with expandable sections showing top 10 items.
 * Each item has deep links to exact pages.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  FileText,
  Bank,
  Warning,
  Receipt,
  CheckCircle,
  CaretDown,
  CaretRight,
  ArrowRight,
  CurrencyEur,
  Calendar,
  ShieldWarning,
  Gauge,
} from '@phosphor-icons/react'
import { accountantClientApi, WorkQueueSummaryResponse, getErrorMessage } from '@/lib/api'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { navigateTo } from '@/lib/navigation'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

interface WorkQueueSummaryProps {
  clientId: string
  clientName?: string
}

export const WorkQueueSummary = ({ clientId, clientName }: WorkQueueSummaryProps) => {
  const [summary, setSummary] = useState<WorkQueueSummaryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Expandable section state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    documents: false,
    bank: false,
    vat: false,
    reminders: false,
    warnings: false,
  })
  
  const showLoading = useDelayedLoading(isLoading, 300, !!summary)

  const fetchSummary = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await accountantClientApi.getWorkQueueSummary(clientId)
      setSummary(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const formatAmount = (amount: number | null) => {
    if (amount === null) return '—'
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    try {
      const dateObj = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
      return format(dateObj, 'dd MMM yyyy', { locale: nl })
    } catch {
      return String(dateStr)
    }
  }

  // Calculate total work items
  const totalWorkItems = summary 
    ? summary.document_review.count + 
      summary.bank_reconciliation.count + 
      summary.vat_actions.periods_needing_action_count +
      summary.reminders.count +
      summary.integrity_warnings.count
    : 0

  if (showLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="bg-destructive/10 border-destructive/40">
        <Warning className="h-5 w-5 text-destructive" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!summary) {
    return null
  }

  // Empty state - no work
  if (totalWorkItems === 0) {
    return (
      <div className="text-center py-16">
        <CheckCircle size={64} className="mx-auto mb-4 text-green-500" />
        <h3 className="text-xl font-semibold mb-2">Geen openstaande taken voor deze klant</h3>
        <p className="text-muted-foreground">Alles is up-to-date! 🎉</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Gauge size={28} />
            Werklijst
          </h2>
          {clientName && (
            <p className="text-muted-foreground">
              {totalWorkItems} openstaande {totalWorkItems === 1 ? 'taak' : 'taken'} voor {clientName}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchSummary} disabled={isLoading}>
          Vernieuwen
        </Button>
      </div>

      {/* Document Review Section */}
      <Card className={summary.document_review.count > 0 ? 'border-amber-500/40' : ''}>
        <Collapsible open={expandedSections.documents} onOpenChange={() => toggleSection('documents')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${summary.document_review.count > 0 ? 'bg-amber-500/10' : 'bg-muted'}`}>
                    <FileText size={24} className={summary.document_review.count > 0 ? 'text-amber-600' : 'text-muted-foreground'} />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Documenten Te Beoordelen
                      <Badge variant={summary.document_review.count > 0 ? 'default' : 'secondary'}>
                        {summary.document_review.count}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Geüploade documenten die beoordeling nodig hebben
                    </CardDescription>
                  </div>
                </div>
                {expandedSections.documents ? <CaretDown size={20} /> : <CaretRight size={20} />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {summary.document_review.top_items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Geen documenten te beoordelen
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.document_review.top_items.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigateTo(doc.link)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Receipt size={20} className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {doc.vendor_customer || 'Onbekende leverancier'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.type} • {formatDate(doc.date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatAmount(doc.amount)}</p>
                          <Badge variant="outline" className="text-xs mt-1">{doc.status}</Badge>
                        </div>
                      </div>
                      <ArrowRight size={16} className="ml-2 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Bank Reconciliation Section */}
      <Card className={summary.bank_reconciliation.count > 0 ? 'border-blue-500/40' : ''}>
        <Collapsible open={expandedSections.bank} onOpenChange={() => toggleSection('bank')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${summary.bank_reconciliation.count > 0 ? 'bg-blue-500/10' : 'bg-muted'}`}>
                    <Bank size={24} className={summary.bank_reconciliation.count > 0 ? 'text-blue-600' : 'text-muted-foreground'} />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Banktransacties Koppelen
                      <Badge variant={summary.bank_reconciliation.count > 0 ? 'default' : 'secondary'}>
                        {summary.bank_reconciliation.count}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Ongekoppelde transacties (laatste 30 dagen)
                    </CardDescription>
                  </div>
                </div>
                {expandedSections.bank ? <CaretDown size={20} /> : <CaretRight size={20} />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {summary.bank_reconciliation.top_items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Geen ongekoppelde transacties
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.bank_reconciliation.top_items.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigateTo(tx.link)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <CurrencyEur size={20} className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold text-sm ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatAmount(tx.amount)}
                          </p>
                          {tx.confidence_best_proposal && (
                            <p className="text-xs text-muted-foreground">
                              Match: {(tx.confidence_best_proposal * 100).toFixed(0)}%
                            </p>
                          )}
                        </div>
                      </div>
                      <ArrowRight size={16} className="ml-2 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* VAT Actions Section */}
      <Card className={summary.vat_actions.periods_needing_action_count > 0 ? 'border-purple-500/40' : ''}>
        <Collapsible open={expandedSections.vat} onOpenChange={() => toggleSection('vat')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${summary.vat_actions.periods_needing_action_count > 0 ? 'bg-purple-500/10' : 'bg-muted'}`}>
                    <Calendar size={24} className={summary.vat_actions.periods_needing_action_count > 0 ? 'text-purple-600' : 'text-muted-foreground'} />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      BTW Acties
                      <Badge variant={summary.vat_actions.periods_needing_action_count > 0 ? 'default' : 'secondary'}>
                        {summary.vat_actions.periods_needing_action_count}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {summary.vat_actions.current_period_status 
                        ? `Huidige periode: ${summary.vat_actions.current_period_status}`
                        : 'Geen actieve periode'}
                    </CardDescription>
                  </div>
                </div>
                {expandedSections.vat ? <CaretDown size={20} /> : <CaretRight size={20} />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {summary.vat_actions.periods_needing_action_count === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Geen BTW acties nodig
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {summary.vat_actions.periods_needing_action_count} periode(n) {summary.vat_actions.periods_needing_action_count === 1 ? 'heeft' : 'hebben'} actie nodig
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigateTo(summary.vat_actions.btw_link)}
                  >
                    <Calendar size={16} className="mr-2" />
                    Ga naar BTW-aangifte
                    <ArrowRight size={16} className="ml-auto" />
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Reminders/Overdue Section */}
      <Card className={summary.reminders.count > 0 ? 'border-orange-500/40' : ''}>
        <Collapsible open={expandedSections.reminders} onOpenChange={() => toggleSection('reminders')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${summary.reminders.count > 0 ? 'bg-orange-500/10' : 'bg-muted'}`}>
                    <Warning size={24} className={summary.reminders.count > 0 ? 'text-orange-600' : 'text-muted-foreground'} />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Achterstallige Facturen
                      <Badge variant={summary.reminders.count > 0 ? 'default' : 'secondary'}>
                        {summary.reminders.count}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Openstaande facturen na vervaldatum
                    </CardDescription>
                  </div>
                </div>
                {expandedSections.reminders ? <CaretDown size={20} /> : <CaretRight size={20} />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {summary.reminders.top_items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Geen achterstallige facturen
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.reminders.top_items.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigateTo(invoice.link)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Receipt size={20} className="text-orange-600" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{invoice.customer}</p>
                          <p className="text-xs text-muted-foreground">
                            Vervaldatum: {formatDate(invoice.due_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm text-orange-600">
                            {formatAmount(invoice.amount)}
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="ml-2 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Integrity Warnings Section */}
      <Card className={summary.integrity_warnings.count > 0 ? 'border-red-500/40' : ''}>
        <Collapsible open={expandedSections.warnings} onOpenChange={() => toggleSection('warnings')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${summary.integrity_warnings.count > 0 ? 'bg-red-500/10' : 'bg-muted'}`}>
                    <ShieldWarning size={24} className={summary.integrity_warnings.count > 0 ? 'text-red-600' : 'text-muted-foreground'} />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Integriteit Waarschuwingen
                      <Badge variant={summary.integrity_warnings.count > 0 ? 'destructive' : 'secondary'}>
                        {summary.integrity_warnings.count}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Actieve alerts en waarschuwingen
                    </CardDescription>
                  </div>
                </div>
                {expandedSections.warnings ? <CaretDown size={20} /> : <CaretRight size={20} />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {summary.integrity_warnings.top_items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Geen actieve waarschuwingen
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.integrity_warnings.top_items.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigateTo(alert.link)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <ShieldWarning size={20} className={
                          alert.severity === 'CRITICAL' ? 'text-red-600' :
                          alert.severity === 'WARNING' ? 'text-amber-600' :
                          'text-blue-600'
                        } />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{alert.message}</p>
                          <Badge variant="outline" className="text-xs mt-1">
                            {alert.severity}
                          </Badge>
                        </div>
                      </div>
                      <ArrowRight size={16} className="ml-2 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  )
}
