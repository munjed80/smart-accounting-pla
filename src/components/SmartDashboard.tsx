import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  FilePlus2,
  Receipt,
  RefreshCw,
  Upload,
  Wallet,
  AlertCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { zzpApi, administrationApi, getErrorMessage } from '@/lib/api'
import { NoAdministrationsEmptyState } from '@/components/EmptyState'
import { OverviewLink } from '@/components/dashboard/OverviewLink'
import {
  ActivityChart,
  formatMoney,
  monthLabel,
} from '@/components/dashboard/ActivityChart'
import { ReceiptDetails } from '@/components/dashboard/ReceiptDetails'
import { t } from '@/i18n'
import '@/styles/zzp-dashboard.css'

const currencyOrUnknown = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? formatMoney(value) : '—'
const quickActions = [
  {
    label: 'Nieuwe factuur',
    icon: FilePlus2,
    href: '/zzp/invoices?action=new',
    primary: true,
  },
  {
    label: 'Uitgave toevoegen',
    icon: Receipt,
    href: '/zzp/expenses?action=new',
  },
  {
    label: 'Bonnetje uploaden',
    icon: Upload,
    href: '/zzp/documents?action=upload',
  },
  { label: 'Uren registreren', icon: Clock3, href: '/zzp/time?action=new' },
]

function SectionError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  return (
    <div className="ov-error" role="alert">
      <AlertCircle size={19} />
      <div>
        <strong>Dit onderdeel kon niet worden bijgewerkt.</strong>
        <p>{getErrorMessage(error)}</p>
        <button onClick={onRetry}>
          {t('common.retry')} <RefreshCw size={13} />
        </button>
      </div>
    </div>
  )
}
function LoadingCards() {
  return (
    <div
      className="ov-metrics"
      aria-label="Financieel overzicht laden"
      role="status"
    >
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="ov-metric ov-skeleton">
          <span />
          <strong />
          <small />
        </div>
      ))}
    </div>
  )
}

export const SmartDashboard = () => {
  const { user } = useAuth()
  const isZzp = user?.role === 'zzp'
  const [allActions, setAllActions] = useState(false)
  const [receiptMonth, setReceiptMonth] = useState<{
    userId: string
    month: string
  } | null>(null)
  const admins = useQuery({
    queryKey: ['administrations', user?.id],
    queryFn: () => administrationApi.list(),
    enabled: !!user?.id && isZzp,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })
  const activeAdmin = admins.data
    ?.filter((admin) => admin.is_active !== false)
    .slice()
    .sort(
      (a, b) =>
        String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
        a.id.localeCompare(b.id),
    )[0]
  const enabled = isZzp && !!user?.id && !!activeAdmin
  const summary = useQuery({
    queryKey: ['zzp-dashboard', user?.id, activeAdmin?.id],
    enabled,
    refetchOnMount: 'always',
    staleTime: 30000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await zzpApi.dashboard.get()
      if (
        response.administration_id &&
        response.administration_id !== activeAdmin?.id
      )
        throw new Error('Je administratie is gewijzigd. Vernieuw de pagina.')
      return response
    },
  })
  const activity = useQuery({
    queryKey: [
      'zzp-monthly-invoices',
      user?.id,
      activeAdmin?.id,
      'last_6_months',
    ],
    enabled,
    refetchOnMount: 'always',
    staleTime: 30000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await zzpApi.dashboard.monthlyInvoices('last_6_months')
      if (
        response.administration_id &&
        response.administration_id !== activeAdmin?.id
      )
        throw new Error('Je administratie is gewijzigd. Vernieuw de pagina.')
      if (
        response.months.some(
          (month) => typeof month.received_total !== 'number',
        )
      )
        throw new Error(
          'Ontvangsten per maand zijn niet beschikbaar. Probeer het opnieuw.',
        )
      return response
    },
  })
  const data = summary.data
  const date =
    data?.generated_at && !Number.isNaN(Date.parse(data.generated_at))
      ? new Date(data.generated_at)
      : new Date()
  const currentMonth =
    data?.notes?.this_month_range?.slice(0, 7) ||
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: '2-digit',
    }).format(date)
  const openReceipts = (month: string) => {
    if (user?.id) setReceiptMonth({ userId: user.id, month })
  }
  const refresh = () => {
    if (admins.isError || !activeAdmin) {
      void admins.refetch()
      return
    }
    void summary.refetch()
    void activity.refetch()
  }
  const actions = [...(data?.actions || [])]
    .filter(
      (item, index, items) =>
        items.findIndex((other) => other.id === item.id) === index,
    )
    .sort(
      (a, b) =>
        (({ error: 0, warning: 1, info: 2 })[a.severity] ?? 2) -
        ({ error: 0, warning: 1, info: 2 }[b.severity] ?? 2),
    )
  const displayedActions = allActions ? actions : actions.slice(0, 5)
  const netVat = data?.btw?.net_vat_cents ?? data?.btw?.vat_payable_cents
  const busy = admins.isFetching || summary.isFetching || activity.isFetching
  const monthText = monthLabel(currentMonth)

  return (
    <div className="zzp-overview">
      <div className="ov-container">
        <header className="ov-header">
          <div>
            <p className="ov-eyebrow">
              JOUW WERKPLEK{' '}
              {activeAdmin?.name && <span> / {activeAdmin.name}</span>}
            </p>
            <h1>Overzicht</h1>
            <p>
              Welkom terug
              {user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}. Dit
              speelt er in je administratie.
            </p>
          </div>
          <div className="ov-update">
            {data?.generated_at && (
              <span>
                Bijgewerkt om{' '}
                {new Intl.DateTimeFormat('nl-NL', {
                  timeZone: 'Europe/Amsterdam',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(date)}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={busy || !isZzp}
              aria-label="Overzicht vernieuwen"
            >
              <RefreshCw size={15} className={busy ? 'ov-spinning' : ''} />{' '}
              Vernieuwen
            </button>
          </div>
        </header>
        {isZzp && (
          <nav className="ov-quick-actions" aria-label="Snel aan de slag">
            {quickActions.map((action) => (
              <OverviewLink
                href={action.href}
                key={action.label}
                className={action.primary ? 'ov-action-primary' : ''}
              >
                <action.icon size={18} />
                <span>{action.label}</span>
                <ArrowUpRight size={15} />
              </OverviewLink>
            ))}
          </nav>
        )}
        {!isZzp ? (
          <section className="ov-panel ov-empty">
            <h2>Open je werkruimte</h2>
            <OverviewLink
              href={user?.role === 'super_admin' ? '/admin' : '/accountant'}
            >
              Naar je overzicht <ArrowRight size={16} />
            </OverviewLink>
          </section>
        ) : admins.isError ? (
          <SectionError
            error={admins.error}
            onRetry={() => void admins.refetch()}
          />
        ) : admins.isLoading ? (
          <LoadingCards />
        ) : !activeAdmin ? (
          <NoAdministrationsEmptyState
            userRole="zzp"
            onCreateAdministration={() => window.location.assign('/onboarding')}
          />
        ) : (
          <>
            <div className="ov-financial-label">
              <h2>Je geldzaken</h2>
              <span>Bedragen inclusief btw · {monthText}</span>
            </div>
            {summary.isError && (
              <SectionError
                error={summary.error}
                onRetry={() => void summary.refetch()}
              />
            )}
            {summary.isLoading ? (
              <LoadingCards />
            ) : (
              data && (
                <>
                  <div className="ov-metrics">
                    <button
                      className="ov-metric ov-metric-income"
                      onClick={() => openReceipts(currentMonth)}
                    >
                      <span>
                        <ArrowDownLeft size={16} /> Ontvangen deze maand{' '}
                        <ArrowUpRight size={13} />
                      </span>
                      <strong>
                        {currencyOrUnknown(
                          data.invoices?.paid_this_month_cents,
                        )}
                      </strong>
                      <small>
                        Geregistreerde betalingen, ook deelbetalingen
                      </small>
                    </button>
                    <OverviewLink className="ov-metric" href="/zzp/expenses">
                      <span>
                        <Receipt size={16} /> Uitgaven deze maand{' '}
                        <ArrowUpRight size={13} />
                      </span>
                      <strong>
                        {currencyOrUnknown(
                          data.expenses?.this_month_total_cents,
                        )}
                      </strong>
                      <small>
                        {data.expenses?.this_month_count ?? '—'} uitgaven
                        vastgelegd
                      </small>
                    </OverviewLink>
                    <OverviewLink
                      className="ov-metric"
                      href="/zzp/invoices?status=open"
                    >
                      <span>
                        <Wallet size={16} /> Nog te ontvangen{' '}
                        <ArrowUpRight size={13} />
                      </span>
                      <strong>
                        {currencyOrUnknown(data.invoices?.open_total_cents)}
                      </strong>
                      <small>
                        {data.invoices?.open_count ?? '—'} openstaande facturen
                        · alle perioden
                      </small>
                    </OverviewLink>
                    <OverviewLink
                      className={`ov-metric ${(data.invoices?.overdue_count || 0) > 0 ? 'ov-metric-overdue' : ''}`}
                      href="/zzp/invoices?status=overdue"
                    >
                      <span>
                        <Clock3 size={16} /> Daarvan te laat{' '}
                        <ArrowUpRight size={13} />
                      </span>
                      <strong>
                        {currencyOrUnknown(data.invoices?.overdue_total_cents)}
                      </strong>
                      <small>Onderdeel van het openstaande bedrag</small>
                    </OverviewLink>
                  </div>
                  <p className="ov-money-note">
                    Ontvangsten zijn gebaseerd op je registraties. Terugbetalingen
                    staan apart bij de creditnota’s. Dit is geen live banksaldo.
                    {summary.isError &&
                      ' Je ziet de laatst opgehaalde bedragen.'}
                  </p>
                </>
              )
            )}
            <div className="ov-main-grid">
              <section
                className="ov-panel ov-attention"
                aria-labelledby="ov-attention-title"
              >
                <div className="ov-panel-heading">
                  <div>
                    <p className="ov-eyebrow">JE VOLGENDE STAP</p>
                    <h2 id="ov-attention-title">Dit vraagt aandacht</h2>
                  </div>
                  {data && <span className="ov-count">{actions.length}</span>}
                </div>
                {summary.isLoading ? (
                  <p role="status" className="ov-empty">
                    Aandachtspunten laden…
                  </p>
                ) : !data ? (
                  <p className="ov-empty">
                    Aandachtspunten zijn tijdelijk niet beschikbaar.
                  </p>
                ) : actions.length ? (
                  <>
                    <ul className="ov-task-list">
                      {displayedActions.map((action) => (
                        <li
                          key={action.id}
                          className={`ov-task-${action.severity}`}
                        >
                          <OverviewLink href={action.route || '/settings'}>
                            <span className="ov-task-dot" aria-hidden="true" />
                            <span className="ov-task-copy">
                              <strong>{action.title}</strong>
                              <small>{action.description}</small>
                              {typeof action.amount_cents === 'number' &&
                                action.amount_cents > 0 && (
                                  <span className="ov-task-amount">
                                    {formatMoney(action.amount_cents)}
                                  </span>
                                )}
                            </span>
                            {action.count ? (
                              <span className="ov-task-count">
                                {action.count}
                              </span>
                            ) : null}
                            <ArrowUpRight size={16} />
                          </OverviewLink>
                        </li>
                      ))}
                    </ul>
                    {actions.length > 5 && (
                      <button
                        className="ov-expand"
                        aria-expanded={allActions}
                        onClick={() => setAllActions(!allActions)}
                      >
                        {allActions
                          ? 'Minder tonen'
                          : `Alle ${actions.length} aandachtspunten`}
                        <ChevronDown size={15} />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="ov-clear">
                    <span>
                      <Check size={21} />
                    </span>
                    <h3>Je bent bij.</h3>
                    <p>
                      Er zijn op dit moment geen aandachtspunten in je
                      administratie.
                    </p>
                    <OverviewLink href="/zzp/invoices?action=new">
                      Je volgende factuur maken <ArrowRight size={15} />
                    </OverviewLink>
                  </div>
                )}
              </section>
              <aside className="ov-panel ov-vat" aria-labelledby="ov-vat-title">
                <div className="ov-panel-heading">
                  <div>
                    <p className="ov-eyebrow">
                      {data?.btw?.quarter || 'LOPEND KWARTAAL'}
                    </p>
                    <h2 id="ov-vat-title">Je btw-overzicht</h2>
                  </div>
                  <span className="ov-estimate">Schatting</span>
                </div>
                {summary.isLoading ? (
                  <p role="status" className="ov-empty">
                    Btw-overzicht laden…
                  </p>
                ) : data ? (
                  <>
                    <p className="ov-vat-label">
                      {typeof netVat === 'number' && netVat < 0
                        ? 'Terug te vragen'
                        : 'Te reserveren voor btw'}
                    </p>
                    <strong className="ov-vat-total">
                      {typeof netVat === 'number'
                        ? formatMoney(Math.abs(netVat))
                        : '—'}
                    </strong>
                    <dl>
                      <div>
                        <dt>Btw op verkoopbedragen</dt>
                        <dd>
                          {currencyOrUnknown(data.btw?.vat_collected_cents)}
                        </dd>
                      </div>
                      <div>
                        <dt>Voorbelasting op uitgaven</dt>
                        <dd>
                          − {currencyOrUnknown(data.btw?.vat_deductible_cents)}
                        </dd>
                      </div>
                    </dl>
                    <p className="ov-vat-note">
                      {data.btw?.policy_confirmed
                        ? `Volgens je BTW-overzicht (${data.btw.basis}). Controleer fiscale aandachtspunten voor je aangifte.`
                        : 'Het BTW-stelsel is nog niet bevestigd. Dit is een historische schatting; open het BTW-overzicht om je stelsel te controleren.'}
                    </p>
                    <OverviewLink
                      href="/zzp/belastinghulp/btw"
                      className="ov-text-link"
                    >
                      Naar het btw-overzicht <ArrowUpRight size={16} />
                    </OverviewLink>
                  </>
                ) : (
                  <p className="ov-empty">
                    Het btw-bedrag is tijdelijk niet beschikbaar.
                  </p>
                )}
              </aside>
            </div>
            <section
              className="ov-panel ov-activity"
              aria-labelledby="ov-activity-title"
            >
              <div className="ov-panel-heading">
                <div>
                  <p className="ov-eyebrow">DE AFGELOPEN ZES MAANDEN</p>
                  <h2 id="ov-activity-title">Je bedrijf in beweging</h2>
                </div>
                <span className="ov-chart-unit">Inclusief btw</span>
              </div>
              {activity.isError ? (
                <SectionError
                  error={activity.error}
                  onRetry={() => void activity.refetch()}
                />
              ) : activity.isLoading ? (
                <div className="ov-chart-loading" role="status">
                  Maandoverzicht laden…
                </div>
              ) : (
                activity.data && (
                  <ActivityChart
                    months={activity.data.months}
                    onReceipts={openReceipts}
                  />
                )
              )}
            </section>
            <section className="ov-hours">
              <div>
                <Clock3 size={19} />
                <div>
                  <strong>Je uren deze week</strong>
                  <span>Maandag tot en met vandaag</span>
                </div>
              </div>
              <p>
                <strong>{data?.time?.this_week_hours ?? '—'} u</strong>
                <span>
                  {data?.time?.this_week_billable_hours ?? '—'} u declarabel
                </span>
              </p>
              <OverviewLink href="/zzp/time">
                Uren bekijken <ArrowUpRight size={15} />
              </OverviewLink>
            </section>
          </>
        )}
        <footer className="ov-footer">
          <span>Een helder overzicht. Meer ruimte voor je werk.</span>
          <OverviewLink href="/help">
            Hulp nodig? <ArrowUpRight size={13} />
          </OverviewLink>
        </footer>
      </div>
      {isZzp && (
        <ReceiptDetails
          month={receiptMonth?.userId === user?.id ? receiptMonth.month : null}
          userId={user?.id}
          administrationId={activeAdmin?.id}
          onClose={() => setReceiptMonth(null)}
        />
      )}
    </div>
  )
}
