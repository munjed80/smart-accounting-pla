/**
 * ZZP E-commerce Sales Review Page – Phase 2
 *
 * Review workspace for imported Shopify/WooCommerce orders and refunds.
 * Pro-plan gated. Lets the user review, approve, and post records.
 */
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  salesReviewApi,
  integrationsApi,
  type EcommerceMappingResponse,
  type MappingReviewStatus,
} from '@/lib/api'
import { useEntitlements } from '@/hooks/useEntitlements'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ShoppingCart,
  CheckCircle,
  Clock,
  ArrowsClockwise,
  Warning,
  Eye,
  Check,
  X,
  CopySimple,
  ArrowCounterClockwise,
  LockSimple,
  Sparkle,
  Storefront,
  Receipt,
  Funnel,
  CaretDown,
  CaretRight,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { navigateTo } from '@/lib/navigation'

// ============================================================================
// Status styling
// ============================================================================

const STATUS_CONFIG: Record<MappingReviewStatus, { label: string; color: string; icon: React.ReactNode }> = {
  new: { label: 'Nieuw', color: 'bg-blue-100 text-blue-800', icon: <Clock size={14} /> },
  needs_review: { label: 'Controle nodig', color: 'bg-yellow-100 text-yellow-800', icon: <Eye size={14} /> },
  mapped: { label: 'Gemapped', color: 'bg-purple-100 text-purple-800', icon: <Receipt size={14} /> },
  approved: { label: 'Goedgekeurd', color: 'bg-green-100 text-green-800', icon: <Check size={14} /> },
  posted: { label: 'Geboekt', color: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle size={14} /> },
  skipped: { label: 'Overgeslagen', color: 'bg-gray-100 text-gray-600', icon: <X size={14} /> },
  duplicate: { label: 'Duplicaat', color: 'bg-orange-100 text-orange-800', icon: <CopySimple size={14} /> },
  error: { label: 'Fout', color: 'bg-red-100 text-red-800', icon: <Warning size={14} /> },
}

const VAT_STATUS_LABELS: Record<string, string> = {
  auto: 'Automatisch',
  manual: 'Handmatig',
  unknown: 'Onbekend',
  needs_review: 'Controle nodig',
}

function formatCents(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

// ============================================================================
// Main component
// ============================================================================

export const ZZPSalesReviewPage = () => {
  const queryClient = useQueryClient()
  const { entitlements, isLoading: entLoading } = useEntitlements()

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [providerFilter, setProviderFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const perPage = 25

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Detail dialog
  const [detailMapping, setDetailMapping] = useState<EcommerceMappingResponse | null>(null)
  const [vatOverride, setVatOverride] = useState<string>('')

  // Access check
  const canUse = entitlements?.can_use_pro_features ?? false

  // Queries
  const summaryQuery = useQuery({
    queryKey: ['sales-review-summary'],
    queryFn: () => salesReviewApi.getSummary(),
    enabled: canUse,
  })

  const mappingsQuery = useQuery({
    queryKey: ['sales-review-mappings', page, statusFilter, typeFilter, providerFilter],
    queryFn: () =>
      salesReviewApi.listMappings({
        page,
        per_page: perPage,
        review_status: statusFilter || undefined,
        record_type: typeFilter || undefined,
        provider: providerFilter || undefined,
      }),
    enabled: canUse,
  })

  const connectionsQuery = useQuery({
    queryKey: ['ecommerce-connections'],
    queryFn: () => integrationsApi.listConnections(),
    enabled: canUse,
  })

  // Mutations
  const generateMutation = useMutation({
    mutationFn: () => salesReviewApi.generateMappings(),
    onSuccess: (data) => {
      toast.success(`${data.created} nieuwe mappings gegenereerd (${data.skipped_existing} al bestaand)`)
      queryClient.invalidateQueries({ queryKey: ['sales-review-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['sales-review-summary'] })
    },
    onError: () => toast.error('Fout bij genereren van mappings'),
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action, data }: { id: string; action: string; data?: { notes?: string; vat_rate?: number; accounting_date?: string } }) =>
      salesReviewApi.mappingAction(id, action, data),
    onSuccess: (data) => {
      const statusLabel = STATUS_CONFIG[data.review_status]?.label || data.review_status
      toast.success(`Record bijgewerkt: ${statusLabel}`)
      queryClient.invalidateQueries({ queryKey: ['sales-review-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['sales-review-summary'] })
      setDetailMapping(data)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Actie mislukt')
    },
  })

  const bulkActionMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: string }) =>
      salesReviewApi.bulkAction(ids, action),
    onSuccess: (data) => {
      toast.success(`${data.processed} records verwerkt, ${data.skipped} overgeslagen`)
      setSelected(new Set())
      queryClient.invalidateQueries({ queryKey: ['sales-review-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['sales-review-summary'] })
    },
    onError: () => toast.error('Bulk actie mislukt'),
  })

  const handleAction = useCallback((id: string, action: string, data?: { vat_rate?: number }) => {
    actionMutation.mutate({ id, action, data })
  }, [actionMutation])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const mappings = mappingsQuery.data?.mappings ?? []
    if (selected.size === mappings.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(mappings.map((m) => m.id)))
    }
  }

  // ============================================================================
  // Pro-plan gate
  // ============================================================================
  if (entLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ArrowsClockwise size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!canUse) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-4">
        <LockSimple size={48} className="mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold">{t('salesReview.proRequired')}</h2>
        <p className="text-muted-foreground">
          {t('integrations.proRequiredDescription')}
        </p>
        <Button onClick={() => navigateTo('/settings')}>
          <Sparkle size={16} className="mr-1" /> Upgrade naar Pro
        </Button>
      </div>
    )
  }

  const mappings = mappingsQuery.data?.mappings ?? []
  const totalMappings = mappingsQuery.data?.total ?? 0
  const statusCounts = summaryQuery.data?.status_counts ?? {}
  const totalPages = Math.ceil(totalMappings / perPage)
  const hasConnections = (connectionsQuery.data?.connections?.length ?? 0) > 0

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt size={28} />
            {t('salesReview.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('salesReview.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateTo('/zzp/integraties')}
          >
            <Storefront size={16} className="mr-1" />
            Integraties
          </Button>
          <Button
            size="sm"
            disabled={generateMutation.isPending || !hasConnections}
            onClick={() => generateMutation.mutate()}
          >
            <ArrowsClockwise size={16} className={`mr-1 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            {generateMutation.isPending ? t('salesReview.generating') : t('salesReview.generateMappings')}
          </Button>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {(Object.keys(STATUS_CONFIG) as MappingReviewStatus[]).map((key) => {
          const cfg = STATUS_CONFIG[key]
          const count = statusCounts[key] ?? 0
          const isActive = statusFilter === key
          return (
            <button
              key={key}
              onClick={() => { setStatusFilter(isActive ? '' : key); setPage(1) }}
              className={`rounded-lg border p-2 text-center transition-colors text-xs
                ${isActive ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/40'}`}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                {cfg.icon}
                <span className="font-medium">{cfg.label}</span>
              </div>
              <div className="text-lg font-bold">{count}</div>
            </button>
          )
        })}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="text-sm border rounded-md px-2 py-1.5"
        >
          <option value="">{t('salesReview.allTypes')}</option>
          <option value="order">{t('salesReview.recordTypeOrder')}</option>
          <option value="refund">{t('salesReview.recordTypeRefund')}</option>
        </select>

        <select
          value={providerFilter}
          onChange={(e) => { setProviderFilter(e.target.value); setPage(1) }}
          className="text-sm border rounded-md px-2 py-1.5"
        >
          <option value="">{t('salesReview.allProviders')}</option>
          <option value="shopify">Shopify</option>
          <option value="woocommerce">WooCommerce</option>
        </select>

        {/* Bulk actions when items selected */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">
              {selected.size} {t('salesReview.selected')}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkActionMutation.mutate({ ids: Array.from(selected), action: 'approve' })}
              disabled={bulkActionMutation.isPending}
            >
              <Check size={14} className="mr-1" />
              {t('salesReview.bulkApprove')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => bulkActionMutation.mutate({ ids: Array.from(selected), action: 'skip' })}
              disabled={bulkActionMutation.isPending}
            >
              <X size={14} className="mr-1" />
              {t('salesReview.bulkSkip')}
            </Button>
          </div>
        )}
      </div>

      {/* VAT notice */}
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 border">
        ℹ️ {t('salesReview.vatNotice')}
      </div>

      {/* Table */}
      {mappingsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <ArrowsClockwise size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : mappings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <ShoppingCart size={48} className="mx-auto opacity-50" />
          <p>{t('salesReview.noMappings')}</p>
          {hasConnections && (
            <Button size="sm" onClick={() => generateMutation.mutate()}>
              {t('salesReview.generateMappings')}
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === mappings.length && mappings.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-2 text-left">{t('salesReview.status')}</th>
                <th className="p-2 text-left">{t('salesReview.recordType')}</th>
                <th className="p-2 text-left">{t('salesReview.orderNumber')}</th>
                <th className="p-2 text-left">{t('salesReview.customer')}</th>
                <th className="p-2 text-left">{t('salesReview.provider')}</th>
                <th className="p-2 text-right">{t('salesReview.netAmount')}</th>
                <th className="p-2 text-right">{t('salesReview.tax')}</th>
                <th className="p-2 text-left">{t('salesReview.vatRate')}</th>
                <th className="p-2 text-left">{t('salesReview.vatStatus')}</th>
                <th className="p-2 text-left">{t('salesReview.date')}</th>
                <th className="p-2 text-center">Acties</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => {
                const statusCfg = STATUS_CONFIG[m.review_status] || STATUS_CONFIG.new
                return (
                  <tr key={m.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                      />
                    </td>
                    <td className="p-2">
                      <Badge className={`${statusCfg.color} text-xs gap-1`}>
                        {statusCfg.icon}
                        {statusCfg.label}
                      </Badge>
                    </td>
                    <td className="p-2 capitalize">
                      {m.record_type === 'order' ? t('salesReview.recordTypeOrder') : t('salesReview.recordTypeRefund')}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {m.external_order_number || m.external_ref || '—'}
                    </td>
                    <td className="p-2 max-w-[150px] truncate">
                      {m.customer_name || m.customer_email || '—'}
                    </td>
                    <td className="p-2 capitalize">{m.provider}</td>
                    <td className="p-2 text-right font-mono">
                      {formatCents(m.net_amount_cents, m.currency)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {formatCents(m.vat_amount_cents, m.currency)}
                    </td>
                    <td className="p-2">
                      {m.vat_rate != null ? `${m.vat_rate}%` : '—'}
                    </td>
                    <td className="p-2">
                      <span className={`text-xs ${m.vat_status === 'needs_review' ? 'text-yellow-700 font-medium' : m.vat_status === 'unknown' ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {VAT_STATUS_LABELS[m.vat_status] || m.vat_status}
                      </span>
                    </td>
                    <td className="p-2 text-xs">
                      {formatDate(m.accounting_date || m.ordered_at)}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          title="Details bekijken"
                          onClick={() => setDetailMapping(m)}
                        >
                          <Eye size={14} />
                        </Button>
                        {(m.review_status === 'new' || m.review_status === 'needs_review' || m.review_status === 'mapped') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-green-700"
                            title={t('salesReview.actionApprove')}
                            onClick={() => handleAction(m.id, 'approve')}
                            disabled={actionMutation.isPending}
                          >
                            <Check size={14} />
                          </Button>
                        )}
                        {m.review_status === 'approved' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-emerald-700"
                            title={t('salesReview.actionPost')}
                            onClick={() => handleAction(m.id, 'post')}
                            disabled={actionMutation.isPending}
                          >
                            <CheckCircle size={14} />
                          </Button>
                        )}
                        {(m.review_status === 'new' || m.review_status === 'needs_review') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-gray-500"
                            title={t('salesReview.actionSkip')}
                            onClick={() => handleAction(m.id, 'skip')}
                            disabled={actionMutation.isPending}
                          >
                            <X size={14} />
                          </Button>
                        )}
                        {(m.review_status === 'skipped' || m.review_status === 'duplicate' || m.review_status === 'error') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-blue-600"
                            title={t('salesReview.actionReset')}
                            onClick={() => handleAction(m.id, 'reset')}
                            disabled={actionMutation.isPending}
                          >
                            <ArrowCounterClockwise size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {totalMappings} {t('salesReview.totalRecords')}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Vorige
            </Button>
            <span>
              Pagina {page} van {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailMapping} onOpenChange={(open) => !open && setDetailMapping(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailMapping?.record_type === 'order' ? (
                <ShoppingCart size={20} />
              ) : (
                <Receipt size={20} />
              )}
              {detailMapping?.record_type === 'order' ? 'Bestelling' : 'Restitutie'}{' '}
              {detailMapping?.external_order_number || detailMapping?.external_ref}
            </DialogTitle>
            <DialogDescription>
              {detailMapping?.provider} · {formatDate(detailMapping?.accounting_date || detailMapping?.ordered_at || null)}
            </DialogDescription>
          </DialogHeader>

          {detailMapping && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Status:</span>
                <Badge className={`${STATUS_CONFIG[detailMapping.review_status]?.color} text-xs gap-1`}>
                  {STATUS_CONFIG[detailMapping.review_status]?.icon}
                  {STATUS_CONFIG[detailMapping.review_status]?.label}
                </Badge>
              </div>

              {/* Customer */}
              {detailMapping.customer_name && (
                <div className="text-sm">
                  <span className="font-medium">Klant:</span> {detailMapping.customer_name}
                  {detailMapping.customer_email && (
                    <span className="text-muted-foreground ml-1">({detailMapping.customer_email})</span>
                  )}
                </div>
              )}

              {/* Amounts grid */}
              <div className="grid grid-cols-2 gap-2 text-sm border rounded-md p-3">
                <div>Omzet:</div>
                <div className="text-right font-mono">{formatCents(detailMapping.revenue_cents)}</div>
                <div>BTW:</div>
                <div className="text-right font-mono">{formatCents(detailMapping.vat_amount_cents)}</div>
                <div>Verzending:</div>
                <div className="text-right font-mono">{formatCents(detailMapping.shipping_cents)}</div>
                <div>Korting:</div>
                <div className="text-right font-mono">-{formatCents(detailMapping.discount_cents)}</div>
                {detailMapping.refund_cents > 0 && (
                  <>
                    <div>Restitutie:</div>
                    <div className="text-right font-mono text-red-600">-{formatCents(detailMapping.refund_cents)}</div>
                  </>
                )}
                <div className="font-semibold border-t pt-1">Nettobedrag:</div>
                <div className="text-right font-mono font-semibold border-t pt-1">{formatCents(detailMapping.net_amount_cents)}</div>
              </div>

              {/* VAT info */}
              <div className="text-sm border rounded-md p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="font-medium">BTW-tarief:</span>
                  <span>{detailMapping.vat_rate != null ? `${detailMapping.vat_rate}%` : 'Onbekend'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">BTW-status:</span>
                  <span className={`${detailMapping.vat_status === 'needs_review' ? 'text-yellow-700 font-medium' : detailMapping.vat_status === 'unknown' ? 'text-red-600' : ''}`}>
                    {VAT_STATUS_LABELS[detailMapping.vat_status] || detailMapping.vat_status}
                  </span>
                </div>
                {(detailMapping.vat_status === 'needs_review' || detailMapping.vat_status === 'unknown') && (
                  <div className="pt-2">
                    <label className="text-xs text-muted-foreground block mb-1">
                      {t('salesReview.vatManualOverride')}
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="21"
                        className="w-24 h-8 text-sm"
                        value={vatOverride}
                        onChange={(e) => setVatOverride(e.target.value)}
                      />
                      <span className="text-xs">%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Audit info */}
              {(detailMapping.approved_at || detailMapping.posted_at) && (
                <div className="text-xs text-muted-foreground border rounded-md p-3 space-y-1">
                  {detailMapping.reviewed_at && (
                    <div>Beoordeeld: {formatDate(detailMapping.reviewed_at)}</div>
                  )}
                  {detailMapping.approved_at && (
                    <div>Goedgekeurd: {formatDate(detailMapping.approved_at)}</div>
                  )}
                  {detailMapping.posted_at && (
                    <div>Geboekt: {formatDate(detailMapping.posted_at)}</div>
                  )}
                </div>
              )}

              {/* Notes */}
              {detailMapping.notes && (
                <div className="text-sm">
                  <span className="font-medium">Notities:</span> {detailMapping.notes}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {detailMapping && (
              <>
                {(detailMapping.review_status === 'new' || detailMapping.review_status === 'needs_review' || detailMapping.review_status === 'mapped') && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        const data: { vat_rate?: number } = {}
                        if (vatOverride) data.vat_rate = parseFloat(vatOverride)
                        handleAction(detailMapping.id, 'approve', data)
                      }}
                      disabled={actionMutation.isPending}
                    >
                      <Check size={14} className="mr-1" />
                      {t('salesReview.actionApprove')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(detailMapping.id, 'skip')}
                      disabled={actionMutation.isPending}
                    >
                      <X size={14} className="mr-1" />
                      {t('salesReview.actionSkip')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAction(detailMapping.id, 'mark_duplicate')}
                      disabled={actionMutation.isPending}
                    >
                      <CopySimple size={14} className="mr-1" />
                      {t('salesReview.actionMarkDuplicate')}
                    </Button>
                  </>
                )}
                {detailMapping.review_status === 'approved' && (
                  <Button
                    size="sm"
                    onClick={() => handleAction(detailMapping.id, 'post')}
                    disabled={actionMutation.isPending}
                  >
                    <CheckCircle size={14} className="mr-1" />
                    {t('salesReview.actionPost')}
                  </Button>
                )}
                {(detailMapping.review_status === 'skipped' || detailMapping.review_status === 'duplicate' || detailMapping.review_status === 'error' || detailMapping.review_status === 'approved') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(detailMapping.id, 'reset')}
                    disabled={actionMutation.isPending}
                  >
                    <ArrowCounterClockwise size={14} className="mr-1" />
                    {t('salesReview.actionReset')}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
