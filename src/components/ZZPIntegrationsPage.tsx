/**
 * ZZP E-commerce Integrations Page
 *
 * Integration Hub for Shopify and WooCommerce.
 * Pro-plan gated: non-Pro users see a clear upgrade prompt.
 */
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  integrationsApi,
  salesReviewApi,
  subscriptionApi,
  type EcommerceConnectionResponse,
  type EcommerceOrderResponse,
  type EcommerceSyncLogResponse,
} from '@/lib/api'
import { useEntitlements } from '@/hooks/useEntitlements'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Storefront,
  ArrowsClockwise,
  PlugsConnected,
  Plug,
  ShoppingCart,
  Warning,
  CheckCircle,
  Clock,
  Trash,
  LockSimple,
  Sparkle,
  CaretRight,
  ArrowCounterClockwise,
  Receipt,
  Users,
  CurrencyEur,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { navigateTo } from '@/lib/navigation'

// ============================================================================
// Types
// ============================================================================

type ConnectDialogType = 'shopify' | 'woocommerce' | null
type DetailTab = 'orders' | 'sync-logs'

// ============================================================================
// Main component
// ============================================================================

export const ZZPIntegrationsPage = () => {
  const queryClient = useQueryClient()
  const { entitlements, subscription, isLoading: entLoading } = useEntitlements()

  // State
  const [connectDialog, setConnectDialog] = useState<ConnectDialogType>(null)
  const [selectedConnection, setSelectedConnection] = useState<EcommerceConnectionResponse | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('orders')
  const [disconnectTarget, setDisconnectTarget] = useState<EcommerceConnectionResponse | null>(null)

  // Determine access
  const canUseIntegrations = entitlements?.can_use_pro_features ?? false
  const isPro = subscription?.plan_code === 'zzp_pro' || subscription?.plan_code === 'pro'
  const inTrial = entitlements?.in_trial ?? false
  const hasAccess = canUseIntegrations && (inTrial || isPro)

  // Queries
  const { data: connectionsData, isLoading: connsLoading } = useQuery({
    queryKey: ['ecommerce-connections'],
    queryFn: integrationsApi.listConnections,
    enabled: hasAccess,
  })

  // Sales review summary — used to power workflow steps 3 & 4
  const { data: reviewSummary } = useQuery({
    queryKey: ['sales-review-summary'],
    queryFn: () => salesReviewApi.getSummary(),
    enabled: hasAccess,
    staleTime: 30_000,
  })

  const connections = connectionsData?.connections || []

  // Find active connections
  const shopifyConn = connections.find(c => c.provider === 'shopify')
  const wooConn = connections.find(c => c.provider === 'woocommerce')

  // Compute workflow step statuses from real data
  const workflowSteps = useMemo(() => {
    const counts = reviewSummary?.status_counts ?? {}
    const totalRecords = reviewSummary?.total ?? 0
    const hasConnected = connections.some(c => c.status === 'connected')
    const hasSynced = connections.some(c => c.last_sync_at)
    // Step 3: review/map — done when at least one record was approved or posted
    const reviewedCount = (counts.approved ?? 0) + (counts.posted ?? 0) + (counts.mapped ?? 0)
    const pendingReviewCount = (counts.new ?? 0) + (counts.needs_review ?? 0)
    const step3Done = reviewedCount > 0 && pendingReviewCount === 0
    const step3InProgress = reviewedCount > 0 && pendingReviewCount > 0
    // Step 4: boeken — done when at least one record is posted
    const postedCount = counts.posted ?? 0
    const approvedCount = counts.approved ?? 0
    const step4Done = postedCount > 0 && approvedCount === 0
    const step4InProgress = postedCount > 0 && approvedCount > 0

    return [
      {
        step: 1,
        label: t('integrations.workflowStep1'),
        desc: t('integrations.workflowStep1Desc'),
        status: hasConnected ? 'done' as const : 'pending' as const,
      },
      {
        step: 2,
        label: t('integrations.workflowStep2'),
        desc: hasSynced ? `${totalRecords} records` : t('integrations.workflowStep2Desc'),
        status: hasSynced ? 'done' as const : 'pending' as const,
      },
      {
        step: 3,
        label: t('integrations.workflowStep3'),
        desc: totalRecords > 0
          ? (pendingReviewCount > 0 ? `${pendingReviewCount} te beoordelen` : 'Alles beoordeeld')
          : t('integrations.workflowStep3Desc'),
        status: step3Done ? 'done' as const : step3InProgress ? 'in-progress' as const : 'pending' as const,
      },
      {
        step: 4,
        label: t('integrations.workflowStep4'),
        desc: postedCount > 0
          ? `${postedCount} geboekt`
          : (approvedCount > 0 ? `${approvedCount} klaar om te boeken` : t('integrations.workflowStep4Desc')),
        status: step4Done ? 'done' as const : step4InProgress ? 'in-progress' as const : 'pending' as const,
      },
    ]
  }, [connections, reviewSummary])

  // ============================================================================
  // Pro-plan gate: show upgrade prompt
  // ============================================================================

  if (!entLoading && !hasAccess) {
    return <ProUpgradePrompt />
  }

  return (
    <div className="space-y-6">
      {/* Header — mobile-friendly stacked layout */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{t('integrations.title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('integrations.description')}</p>
        </div>
        {connections.length > 0 && (
          <Button
            variant="default"
            size="sm"
            className="self-start sm:self-auto shrink-0"
            onClick={() => navigateTo('/zzp/verkoop-review')}
          >
            <Receipt size={16} className="mr-1.5" />
            {t('integrations.goToReview')}
          </Button>
        )}
      </div>

      {/* Workflow steps — visual guide connected to real data */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {workflowSteps.map(({ step, label, desc, status }) => (
          <div
            key={step}
            className={`rounded-lg border p-3 text-center transition-colors ${
              status === 'done' ? 'bg-green-50 border-green-200' :
              status === 'in-progress' ? 'bg-amber-50 border-amber-200' :
              'bg-muted/30 border-border'
            }`}
          >
            <div className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold mb-1.5 ${
              status === 'done' ? 'bg-green-600 text-white' :
              status === 'in-progress' ? 'bg-amber-500 text-white' :
              'bg-muted text-muted-foreground'
            }`}>
              {status === 'done' ? '✓' : step}
            </div>
            <div className="text-xs font-medium leading-tight">{label}</div>
            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">{desc}</div>
          </div>
        ))}
      </div>

      {/* Feature benefits — shown when no connections */}
      {connections.length === 0 && (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="shrink-0 rounded-lg bg-primary/10 p-3">
              <Storefront size={28} className="text-primary" weight="duotone" />
            </div>
            <div className="space-y-3 min-w-0">
              <div>
                <h3 className="font-semibold text-sm sm:text-base">{t('integrations.noConnectionsYet')}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('integrations.noConnectionsDesc')}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><ShoppingCart size={14} className="text-primary shrink-0" />{t('integrations.benefitOrders')}</span>
                <span className="flex items-center gap-1.5"><Users size={14} className="text-primary shrink-0" />{t('integrations.benefitCustomers')}</span>
                <span className="flex items-center gap-1.5"><CurrencyEur size={14} className="text-primary shrink-0" />{t('integrations.benefitRefunds')}</span>
                <span className="flex items-center gap-1.5"><Receipt size={14} className="text-primary shrink-0" />{t('integrations.benefitVat')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provider cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <ProviderCard
          provider="shopify"
          connection={shopifyConn}
          onConnect={() => setConnectDialog('shopify')}
          onSync={() => shopifyConn && handleSync(shopifyConn.id)}
          onDisconnect={() => shopifyConn && setDisconnectTarget(shopifyConn)}
          onViewDetails={() => shopifyConn && setSelectedConnection(shopifyConn)}
        />
        <ProviderCard
          provider="woocommerce"
          connection={wooConn}
          onConnect={() => setConnectDialog('woocommerce')}
          onSync={() => wooConn && handleSync(wooConn.id)}
          onDisconnect={() => wooConn && setDisconnectTarget(wooConn)}
          onViewDetails={() => wooConn && setSelectedConnection(wooConn)}
        />
      </div>

      {/* Next step CTA — shown when connected but never synced */}
      {connections.some(c => c.status === 'connected') && (
        <div className="rounded-lg border bg-blue-50 border-blue-200 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <CaretRight size={18} className="text-blue-700 shrink-0" />
              <div className="text-sm">
                <span className="font-medium text-blue-900">{t('integrations.nextStepLabel')} </span>
                <span className="text-blue-800">{t('integrations.nextStepDesc')}</span>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0 self-start sm:self-auto"
              onClick={() => navigateTo('/zzp/verkoop-review')}
            >
              <Receipt size={16} className="mr-1.5" />
              {t('integrations.goToReview')}
            </Button>
          </div>
        </div>
      )}

      {/* Connection dialog */}
      {connectDialog === 'shopify' && (
        <ShopifyConnectDialog
          open
          onClose={() => setConnectDialog(null)}
          onSuccess={() => {
            setConnectDialog(null)
            queryClient.invalidateQueries({ queryKey: ['ecommerce-connections'] })
          }}
        />
      )}
      {connectDialog === 'woocommerce' && (
        <WooCommerceConnectDialog
          open
          onClose={() => setConnectDialog(null)}
          onSuccess={() => {
            setConnectDialog(null)
            queryClient.invalidateQueries({ queryKey: ['ecommerce-connections'] })
          }}
        />
      )}

      {/* Disconnect confirm */}
      {disconnectTarget && (
        <DisconnectDialog
          connection={disconnectTarget}
          onClose={() => setDisconnectTarget(null)}
          onConfirm={async () => {
            try {
              await integrationsApi.disconnect(disconnectTarget.id)
              toast.success('Integratie ontkoppeld')
              queryClient.invalidateQueries({ queryKey: ['ecommerce-connections'] })
            } catch {
              toast.error('Ontkoppelen mislukt')
            }
            setDisconnectTarget(null)
          }}
        />
      )}

      {/* Detail panel */}
      {selectedConnection && (
        <ConnectionDetailPanel
          connection={selectedConnection}
          onClose={() => setSelectedConnection(null)}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
        />
      )}
    </div>
  )

  // Sync handler
  async function handleSync(connectionId: string) {
    try {
      toast.info('Synchronisatie gestart...')
      const result = await integrationsApi.triggerSync(connectionId)
      if (result.status === 'success') {
        toast.success(result.message, {
          description: `${result.orders_imported} nieuwe, ${result.orders_updated} bijgewerkt, ${result.customers_imported} klanten, ${result.refunds_imported} restitutie(s)`,
        })
      } else {
        toast.error(result.message, {
          description: result.error || undefined,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['ecommerce-connections'] })
    } catch (err: any) {
      toast.error('Synchronisatie mislukt', {
        description: err?.response?.data?.detail || 'Onbekende fout',
      })
    }
  }
}

// ============================================================================
// Pro upgrade prompt for non-Pro users
// ============================================================================

function ProUpgradePrompt() {
  const [activating, setActivating] = useState(false)

  const handleUpgrade = async () => {
    setActivating(true)
    try {
      const result = await subscriptionApi.activateSubscription('zzp_pro')
      if (result.checkout_url) {
        window.location.href = result.checkout_url
        return
      }
      toast.success('Abonnement geactiveerd')
    } catch (err: any) {
      toast.error('Activatie mislukt', {
        description: err?.response?.data?.detail?.message || 'Er is een fout opgetreden.',
      })
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
        <LockSimple className="h-8 w-8 text-purple-600" weight="fill" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold">{t('integrations.proRequired')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('integrations.proRequiredDescription')}
        </p>
      </div>
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-6 max-w-sm w-full">
        <div className="flex items-center gap-2 mb-3">
          <Sparkle className="h-5 w-5 text-purple-600" weight="fill" />
          <h3 className="font-semibold text-purple-900">Pro — €6,95/maand</h3>
        </div>
        <ul className="space-y-1.5 text-sm text-purple-800 text-left mb-4">
          <li className="flex items-center gap-2"><span className="text-purple-600">✓</span>Shopify & WooCommerce koppeling</li>
          <li className="flex items-center gap-2"><span className="text-purple-600">✓</span>Automatische orderimport</li>
          <li className="flex items-center gap-2"><span className="text-purple-600">✓</span>BTW-aangifte via Digipoort</li>
          <li className="flex items-center gap-2"><span className="text-purple-600">✓</span>Bankrekening koppeling & Exports</li>
        </ul>
        <Button
          className="w-full bg-purple-600 hover:bg-purple-700"
          onClick={handleUpgrade}
          disabled={activating}
        >
          {activating ? 'Bezig...' : 'Upgraden naar Pro'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Provider card
// ============================================================================

interface ProviderCardProps {
  provider: 'shopify' | 'woocommerce'
  connection?: EcommerceConnectionResponse
  onConnect: () => void
  onSync: () => void
  onDisconnect: () => void
  onViewDetails: () => void
}

const PROVIDER_META = {
  shopify: {
    name: 'Shopify',
    color: 'bg-green-50 border-green-200',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
    description: 'Koppel je Shopify-webshop en importeer bestellingen, klanten en restitutie.',
    features: ['Bestellingen', 'Klanten', 'Restitutie', 'BTW-berekening'],
  },
  woocommerce: {
    name: 'WooCommerce',
    color: 'bg-violet-50 border-violet-200',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-700',
    description: 'Koppel je WooCommerce-webshop en importeer bestellingen, klanten en restitutie.',
    features: ['Bestellingen', 'Klanten', 'Restitutie', 'BTW-berekening'],
  },
}

function ProviderCard({ provider, connection, onConnect, onSync, onDisconnect, onViewDetails }: ProviderCardProps) {
  const meta = PROVIDER_META[provider]
  const isConnected = connection?.status === 'connected'
  const hasError = connection?.status === 'error' || !!connection?.last_sync_error

  return (
    <div className={`rounded-lg border p-4 sm:p-5 space-y-3 sm:space-y-4 ${isConnected ? meta.color : 'bg-card border-border'}`}>
      {/* Provider header — stacked on mobile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`rounded-lg p-2 sm:p-2.5 shrink-0 ${meta.iconBg}`}>
            <ShoppingCart size={22} weight="duotone" className={meta.iconColor} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm sm:text-base">{meta.name}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2">{meta.description}</p>
          </div>
        </div>
        <div className="self-start sm:self-auto shrink-0">
          {isConnected ? (
            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-xs">
              <CheckCircle size={14} weight="fill" className="mr-1" />
              Verbonden
            </Badge>
          ) : connection?.status === 'disconnected' ? (
            <Badge variant="outline" className="text-muted-foreground text-xs">
              <Plug size={14} className="mr-1" />
              Ontkoppeld
            </Badge>
          ) : connection?.status === 'error' ? (
            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 text-xs">
              <Warning size={14} weight="fill" className="mr-1" />
              Fout
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-xs">Niet verbonden</Badge>
          )}
        </div>
      </div>

      {/* Feature chips — shown when not connected to show value */}
      {!isConnected && (
        <div className="flex flex-wrap gap-1.5">
          {meta.features.map((f) => (
            <span key={f} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Connection info — sync stats to show value */}
      {connection && isConnected && (
        <div className="text-xs space-y-1.5 text-muted-foreground">
          {connection.shop_name && <p>Winkel: <span className="font-medium text-foreground">{connection.shop_name}</span></p>}
          {connection.last_sync_at && (
            <p className="flex items-center gap-1">
              <Clock size={12} className="shrink-0" />
              <span className="truncate">
                Laatste sync: {new Date(connection.last_sync_at).toLocaleString('nl-NL')}
                {connection.last_sync_orders_count > 0 && ` · ${connection.last_sync_orders_count} orders`}
              </span>
            </p>
          )}
          {!connection.last_sync_at && (
            <p className="flex items-center gap-1 text-blue-600">
              <ArrowsClockwise size={12} className="shrink-0" />
              <span>{t('integrations.notSyncedYet')}</span>
            </p>
          )}
          {hasError && connection.last_sync_error && (
            <p className="text-red-600 flex items-center gap-1">
              <Warning size={12} weight="fill" className="shrink-0" />
              <span className="truncate">{connection.last_sync_error.slice(0, 100)}</span>
            </p>
          )}
        </div>
      )}

      {/* Actions — wrapping on mobile */}
      <div className="flex flex-wrap gap-2">
        {isConnected ? (
          <>
            <Button size="sm" variant="outline" onClick={onSync} className="text-xs sm:text-sm">
              <ArrowsClockwise size={16} className="mr-1 shrink-0" />
              Sync nu
            </Button>
            <Button size="sm" variant="outline" onClick={onViewDetails} className="text-xs sm:text-sm">
              <CaretRight size={16} className="mr-1 shrink-0" />
              Details
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground text-xs sm:text-sm" onClick={onDisconnect}>
              <Plug size={16} className="mr-1 shrink-0" />
              Ontkoppelen
            </Button>
          </>
        ) : connection?.status === 'disconnected' ? (
          <Button size="sm" onClick={onConnect} className="text-xs sm:text-sm">
            <ArrowCounterClockwise size={16} className="mr-1 shrink-0" />
            Opnieuw verbinden
          </Button>
        ) : (
          <Button size="sm" onClick={onConnect} className="text-xs sm:text-sm">
            <PlugsConnected size={16} className="mr-1 shrink-0" />
            Verbinden
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Shopify connect dialog
// ============================================================================

function ShopifyConnectDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [shopUrl, setShopUrl] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [shopName, setShopName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    if (!shopUrl.trim() || !accessToken.trim()) {
      toast.error('Vul alle velden in')
      return
    }
    setLoading(true)
    try {
      await integrationsApi.connectShopify({
        shop_url: shopUrl.trim(),
        access_token: accessToken.trim(),
        shop_name: shopName.trim() || undefined,
      })
      toast.success('Shopify succesvol verbonden!')
      onSuccess()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error('Verbinding mislukt', {
        description: typeof detail === 'string' ? detail : detail?.message || 'Controleer je gegevens.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Shopify verbinden</DialogTitle>
          <DialogDescription>
            Maak een custom app in je Shopify admin onder Instellingen → Apps → Apps ontwikkelen.
            Geef de app leesrechten voor bestellingen, klanten en retouren.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="shopify-url">Shopify winkel-URL</Label>
            <Input
              id="shopify-url"
              placeholder="mijnwinkel.myshopify.com"
              value={shopUrl}
              onChange={e => setShopUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shopify-token">Admin API Access Token</Label>
            <Input
              id="shopify-token"
              type="password"
              placeholder="shpat_..."
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shopify-name">Winkelnaam (optioneel)</Label>
            <Input
              id="shopify-name"
              placeholder="Mijn Shopify Winkel"
              value={shopName}
              onChange={e => setShopName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Annuleren</Button>
          <Button onClick={handleConnect} disabled={loading}>
            {loading ? 'Verbinden...' : 'Verbinden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// WooCommerce connect dialog
// ============================================================================

function WooCommerceConnectDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [shopUrl, setShopUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [shopName, setShopName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    if (!shopUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()) {
      toast.error('Vul alle velden in')
      return
    }
    setLoading(true)
    try {
      await integrationsApi.connectWooCommerce({
        shop_url: shopUrl.trim(),
        consumer_key: consumerKey.trim(),
        consumer_secret: consumerSecret.trim(),
        shop_name: shopName.trim() || undefined,
      })
      toast.success('WooCommerce succesvol verbonden!')
      onSuccess()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error('Verbinding mislukt', {
        description: typeof detail === 'string' ? detail : detail?.message || 'Controleer je gegevens.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>WooCommerce verbinden</DialogTitle>
          <DialogDescription>
            Maak REST API-sleutels aan in je WooCommerce admin onder Instellingen → Geavanceerd → REST API.
            Geef leesrechten.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="woo-url">WooCommerce winkel-URL</Label>
            <Input
              id="woo-url"
              placeholder="https://mijnwinkel.nl"
              value={shopUrl}
              onChange={e => setShopUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="woo-key">Consumer Key</Label>
            <Input
              id="woo-key"
              type="password"
              placeholder="ck_..."
              value={consumerKey}
              onChange={e => setConsumerKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="woo-secret">Consumer Secret</Label>
            <Input
              id="woo-secret"
              type="password"
              placeholder="cs_..."
              value={consumerSecret}
              onChange={e => setConsumerSecret(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="woo-name">Winkelnaam (optioneel)</Label>
            <Input
              id="woo-name"
              placeholder="Mijn WooCommerce Winkel"
              value={shopName}
              onChange={e => setShopName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Annuleren</Button>
          <Button onClick={handleConnect} disabled={loading}>
            {loading ? 'Verbinden...' : 'Verbinden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Disconnect confirm dialog
// ============================================================================

function DisconnectDialog({ connection, onClose, onConfirm }: { connection: EcommerceConnectionResponse; onClose: () => void; onConfirm: () => void }) {
  const providerName = connection.provider === 'shopify' ? 'Shopify' : 'WooCommerce'

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{providerName} ontkoppelen?</DialogTitle>
          <DialogDescription>
            Je geïmporteerde data blijft bewaard. Je kunt later opnieuw verbinden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button variant="destructive" onClick={onConfirm}>Ontkoppelen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Connection detail panel (orders + sync logs)
// ============================================================================

function ConnectionDetailPanel({
  connection,
  onClose,
  detailTab,
  setDetailTab,
}: {
  connection: EcommerceConnectionResponse
  onClose: () => void
  detailTab: DetailTab
  setDetailTab: (t: DetailTab) => void
}) {
  const providerName = connection.provider === 'shopify' ? 'Shopify' : 'WooCommerce'

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['ecommerce-orders', connection.id],
    queryFn: () => integrationsApi.listOrders(connection.id),
    enabled: detailTab === 'orders',
  })

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['ecommerce-sync-logs', connection.id],
    queryFn: () => integrationsApi.listSyncLogs(connection.id),
    enabled: detailTab === 'sync-logs',
  })

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold text-base sm:text-lg truncate">{providerName} — {connection.shop_name || connection.shop_url}</h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="self-start sm:self-auto shrink-0">Sluiten</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={detailTab === 'orders' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setDetailTab('orders')}
        >
          Bestellingen
        </Button>
        <Button
          variant={detailTab === 'sync-logs' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setDetailTab('sync-logs')}
        >
          Sync-geschiedenis
        </Button>
      </div>

      {/* Orders */}
      {detailTab === 'orders' && (
        <div>
          {ordersLoading ? (
            <p className="text-sm text-muted-foreground py-4">Laden...</p>
          ) : !ordersData?.orders?.length ? (
            <p className="text-sm text-muted-foreground py-4">Nog geen bestellingen geïmporteerd. Klik op &quot;Sync nu&quot; om te starten.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3">Bestelling</th>
                    <th className="pb-2 pr-3">Klant</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 pr-3 text-right">Bedrag</th>
                    <th className="pb-2 pr-3 text-right">BTW</th>
                    <th className="pb-2">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersData.orders.map(order => (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">#{order.external_order_number || order.external_order_id}</td>
                      <td className="py-2 pr-3 truncate max-w-[150px]">{order.customer_name || order.customer_email || '-'}</td>
                      <td className="py-2 pr-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">€{(order.total_amount_cents / 100).toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">€{(order.tax_cents / 100).toFixed(2)}</td>
                      <td className="py-2 text-muted-foreground">
                        {order.ordered_at ? new Date(order.ordered_at).toLocaleDateString('nl-NL') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                {ordersData.total} bestelling{ordersData.total !== 1 ? 'en' : ''} totaal
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sync logs */}
      {detailTab === 'sync-logs' && (
        <div>
          {logsLoading ? (
            <p className="text-sm text-muted-foreground py-4">Laden...</p>
          ) : !logsData?.logs?.length ? (
            <p className="text-sm text-muted-foreground py-4">Nog geen synchronisaties uitgevoerd.</p>
          ) : (
            <div className="space-y-2">
              {logsData.logs.map(log => (
                <div key={log.id} className="rounded border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SyncStatusBadge status={log.status} />
                      <span className="text-muted-foreground">{log.trigger}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.started_at).toLocaleString('nl-NL')}
                      {log.duration_ms != null && ` (${(log.duration_ms / 1000).toFixed(1)}s)`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {log.orders_imported > 0 && <span className="mr-3">+{log.orders_imported} nieuw</span>}
                    {log.orders_updated > 0 && <span className="mr-3">↻{log.orders_updated} bijgewerkt</span>}
                    {log.customers_imported > 0 && <span className="mr-3">+{log.customers_imported} klanten</span>}
                    {log.refunds_imported > 0 && <span className="mr-3">+{log.refunds_imported} restitutie(s)</span>}
                  </div>
                  {log.error_message && (
                    <p className="text-xs text-red-600">{log.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Small helpers
// ============================================================================

function OrderStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    open: 'bg-blue-100 text-blue-800',
    partially_paid: 'bg-yellow-100 text-yellow-800',
    refunded: 'bg-red-100 text-red-800',
    partially_refunded: 'bg-orange-100 text-orange-800',
    cancelled: 'bg-gray-100 text-gray-600',
    closed: 'bg-gray-100 text-gray-600',
  }
  const labels: Record<string, string> = {
    paid: 'Betaald',
    open: 'Open',
    partially_paid: 'Deels betaald',
    refunded: 'Gerestitueerd',
    partially_refunded: 'Deels gerestitueerd',
    cancelled: 'Geannuleerd',
    closed: 'Gesloten',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  )
}

function SyncStatusBadge({ status }: { status: string }) {
  if (status === 'success') return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-xs">Geslaagd</Badge>
  if (status === 'failed') return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 text-xs">Mislukt</Badge>
  if (status === 'running') return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 text-xs">Bezig...</Badge>
  if (status === 'partial') return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">Deels</Badge>
  return <Badge variant="outline" className="text-xs">{status}</Badge>
}
