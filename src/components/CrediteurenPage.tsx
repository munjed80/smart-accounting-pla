/**
 * CrediteurenPage - Suppliers/Payables Page (Crediteuren)
 * 
 * Working screen showing leveranciers (suppliers) with real data from
 * the /accountant/clients/{clientId}/reports/ap endpoint.
 * 
 * Features:
 * - Shows suppliers grouped by party name from AP open items
 * - Total amounts and invoice counts per supplier
 * - Search and sort functionality
 * - Dutch UI text with proper empty states
 * - Mobile-responsive design
 * 
 * Data source: ledgerApi.getAccountsPayable() - groups by party_name
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { RequireActiveClient } from '@/components/RequireActiveClient'
import { ApiErrorState, parseApiError, ApiErrorType } from '@/components/ApiErrorState'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { ledgerApi, OpenItemReport } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  Storefront,
  Sparkle,
  Bank,
  FileText,
  MagnifyingGlass,
  SortAscending,
  SortDescending,
  Warning,
  CurrencyEur,
  Invoice,
  CaretRight,
} from '@phosphor-icons/react'

interface CrediteurenPageProps {
  onNavigate?: (tab: string) => void
}

// Grouped supplier from AP items
interface SupplierSummary {
  partyId: string
  partyName: string
  partyCode: string | null
  totalOpen: number
  totalOriginal: number
  invoiceCount: number
  overdueAmount: number
  oldestDueDate: string | null
}

type SortField = 'name' | 'amount' | 'invoices' | 'overdue'
type SortOrder = 'asc' | 'desc'

export const CrediteurenPage = ({ onNavigate }: CrediteurenPageProps) => {
  const { activeClientId, activeClientName } = useActiveClient()
  const [apItems, setApItems] = useState<OpenItemReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [apiError, setApiError] = useState<{ type: ApiErrorType; message: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('amount')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [totals, setTotals] = useState({ totalOpen: 0, totalOriginal: 0, overdueAmount: 0 })

  // Load AP data
  useEffect(() => {
    const loadApData = async () => {
      if (!activeClientId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setApiError(null)

      try {
        const response = await ledgerApi.getAccountsPayable(activeClientId)
        setApItems(response.items)
        setTotals({
          totalOpen: response.total_open,
          totalOriginal: response.total_original,
          overdueAmount: response.overdue_amount,
        })
      } catch (err) {
        const parsedError = parseApiError(err)
        setApiError(parsedError)
      } finally {
        setIsLoading(false)
      }
    }

    loadApData()
  }, [activeClientId])

  useEffect(() => {
    const timer = setTimeout(() => setShowSkeleton(false), 300)
    return () => clearTimeout(timer)
  }, [])

  // Group AP items by supplier (party)
  const suppliers = useMemo((): SupplierSummary[] => {
    const grouped = new Map<string, SupplierSummary>()

    for (const item of apItems) {
      const key = item.party_id || item.party_name || 'unknown'
      const existing = grouped.get(key)

      if (existing) {
        existing.totalOpen += item.open_amount
        existing.totalOriginal += item.original_amount
        existing.invoiceCount += 1
        if (item.days_overdue > 0) {
          existing.overdueAmount += item.open_amount
        }
        // Track oldest due date
        if (item.due_date && (!existing.oldestDueDate || item.due_date < existing.oldestDueDate)) {
          existing.oldestDueDate = item.due_date
        }
      } else {
        grouped.set(key, {
          partyId: item.party_id,
          partyName: item.party_name || 'Onbekende leverancier',
          partyCode: item.party_code,
          totalOpen: item.open_amount,
          totalOriginal: item.original_amount,
          invoiceCount: 1,
          overdueAmount: item.days_overdue > 0 ? item.open_amount : 0,
          oldestDueDate: item.due_date,
        })
      }
    }

    return Array.from(grouped.values())
  }, [apItems])

  // Filter and sort suppliers
  const filteredSuppliers = useMemo(() => {
    let result = suppliers

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(s =>
        s.partyName.toLowerCase().includes(query) ||
        (s.partyCode && s.partyCode.toLowerCase().includes(query))
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.partyName.localeCompare(b.partyName)
          break
        case 'amount':
          comparison = a.totalOpen - b.totalOpen
          break
        case 'invoices':
          comparison = a.invoiceCount - b.invoiceCount
          break
        case 'overdue':
          comparison = a.overdueAmount - b.overdueAmount
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [suppliers, searchQuery, sortField, sortOrder])

  const handleGoToUpload = () => {
    if (onNavigate) {
      onNavigate('upload')
    } else {
      navigateTo('/ai-upload')
    }
  }

  const handleGoToBank = () => {
    if (onNavigate) {
      onNavigate('bank')
    } else {
      navigateTo('/accountant/bank')
    }
  }

  const handleGoToClients = () => {
    if (onNavigate) {
      onNavigate('clients')
    } else {
      navigateTo('/accountant/clients')
    }
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  // No active client selected - use RequireActiveClient component
  if (!activeClientId) {
    return (
      <RequireActiveClient
        headerIcon={<Storefront size={24} weight="duotone" className="text-primary" />}
        headerTitle={t('crediteuren.title')}
        headerSubtitle={t('crediteuren.subtitle')}
        onNavigate={onNavigate}
      />
    )
  }

  // API error occurred - use ApiErrorState component
  if (apiError && !isLoading) {
    return (
      <div className="container mx-auto py-6 px-4 sm:px-6 max-w-5xl">
        <Card className="bg-card/80 backdrop-blur-sm mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Storefront size={24} weight="duotone" className="text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{t('crediteuren.title')}</CardTitle>
                <CardDescription>{t('crediteuren.subtitle')}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <ApiErrorState
          type={apiError.type}
          message={apiError.message}
          onRetry={() => window.location.reload()}
          onNavigate={onNavigate}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 max-w-5xl">
      {/* Header */}
      <Card className="bg-card/80 backdrop-blur-sm mb-6">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Storefront size={24} weight="duotone" className="text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{t('crediteuren.title')}</CardTitle>
                <CardDescription>
                  {activeClientName ? `${activeClientName} – ` : ''}{t('crediteuren.subtitle')}
                </CardDescription>
              </div>
            </div>
            {/* Summary badges */}
            {!isLoading && suppliers.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-sm">
                  <Storefront size={14} className="mr-1" />
                  {suppliers.length} leverancier{suppliers.length !== 1 ? 's' : ''}
                </Badge>
                <Badge variant="outline" className="text-sm">
                  <CurrencyEur size={14} className="mr-1" />
                  {formatCurrency(totals.totalOpen)} openstaand
                </Badge>
                {totals.overdueAmount > 0 && (
                  <Badge variant="destructive" className="text-sm">
                    <Warning size={14} className="mr-1" />
                    {formatCurrency(totals.overdueAmount)} te laat
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Loading state */}
      {isLoading && showSkeleton && (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !apiError && suppliers.length === 0 && (
        <>
          <EmptyState
            title={t('crediteuren.noSuppliersYet')}
            description={t('crediteuren.noSuppliersDescription')}
            icon={<FileText size={64} weight="duotone" className="text-muted-foreground" />}
            tips={[
              t('crediteuren.tips.uploadInvoices'),
              t('crediteuren.tips.autoExtract'),
              t('crediteuren.tips.trackPayables'),
            ]}
          />
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Button onClick={handleGoToUpload} className="gap-2">
              <Sparkle size={18} />
              {t('crediteuren.goToUpload')}
            </Button>
            <Button variant="outline" onClick={handleGoToBank} className="gap-2">
              <Bank size={18} />
              {t('crediteuren.goToBank')}
            </Button>
          </div>
        </>
      )}

      {/* Suppliers list */}
      {!isLoading && !apiError && suppliers.length > 0 && (
        <>
          {/* Search and filters */}
          <Card className="mb-4">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Zoek leverancier..."
                    className="pl-9"
                  />
                </div>
                {/* Sort buttons */}
                <div className="flex gap-2">
                  <Button
                    variant={sortField === 'amount' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleSort('amount')}
                    className="gap-1"
                  >
                    {sortField === 'amount' && (sortOrder === 'desc' ? <SortDescending size={14} /> : <SortAscending size={14} />)}
                    Bedrag
                  </Button>
                  <Button
                    variant={sortField === 'name' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleSort('name')}
                    className="gap-1"
                  >
                    {sortField === 'name' && (sortOrder === 'desc' ? <SortDescending size={14} /> : <SortAscending size={14} />)}
                    Naam
                  </Button>
                  <Button
                    variant={sortField === 'overdue' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleSort('overdue')}
                    className="gap-1"
                  >
                    {sortField === 'overdue' && (sortOrder === 'desc' ? <SortDescending size={14} /> : <SortAscending size={14} />)}
                    Te laat
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results count */}
          <p className="text-sm text-muted-foreground mb-4">
            {filteredSuppliers.length} leverancier{filteredSuppliers.length !== 1 ? 's' : ''} gevonden
            {searchQuery && ` voor "${searchQuery}"`}
          </p>

          {/* Supplier cards */}
          <div className="space-y-3">
            {filteredSuppliers.map((supplier) => (
              <Card key={supplier.partyId} className="hover:bg-muted/50 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Storefront size={20} className="text-primary" weight="duotone" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{supplier.partyName}</h3>
                          {supplier.partyCode && (
                            <Badge variant="outline" className="text-xs">
                              {supplier.partyCode}
                            </Badge>
                          )}
                          {supplier.overdueAmount > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              <Warning size={12} className="mr-1" />
                              Te laat
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Invoice size={14} />
                            {supplier.invoiceCount} factuur{supplier.invoiceCount !== 1 ? 'en' : ''}
                          </span>
                          {supplier.overdueAmount > 0 && (
                            <span className="text-destructive">
                              {formatCurrency(supplier.overdueAmount)} te laat
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="font-mono font-semibold text-lg">
                          {formatCurrency(supplier.totalOpen)}
                        </p>
                        <p className="text-xs text-muted-foreground">openstaand</p>
                      </div>
                      <CaretRight size={20} className="text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* No search results */}
          {filteredSuppliers.length === 0 && searchQuery && (
            <Card className="bg-muted/50">
              <CardContent className="py-8 text-center">
                <MagnifyingGlass size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Geen leveranciers gevonden voor "{searchQuery}"
                </p>
                <Button variant="link" onClick={() => setSearchQuery('')}>
                  Zoekopdracht wissen
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default CrediteurenPage
