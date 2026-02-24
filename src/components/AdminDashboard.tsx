import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, formatApiErrorForDisplay, ContactMessageListItem, ContactMessageDetail } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { AdminLayout, AdminSection } from '@/components/AdminLayout'
import { toast } from 'sonner'
import { WarningCircle, ArrowClockwise } from '@phosphor-icons/react'

export const AdminDashboard = () => {
  const getSectionFromPath = (): AdminSection => {
    const [, , rawSection] = window.location.pathname.split('/')
    const section = rawSection as AdminSection | undefined
    const allowedSections: AdminSection[] = ['users', 'companies', 'subscriptions', 'revenue', 'logs', 'messages']
    return section && allowedSections.includes(section) ? section : 'users'
  }

  const [section, setSection] = useState<AdminSection>(getSectionFromPath)
  const [query, setQuery] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<ContactMessageDetail | null>(null)
  const [messagesStatusFilter, setMessagesStatusFilter] = useState<string>('')
  const [messagesQuery, setMessagesQuery] = useState('')
  const queryClient = useQueryClient()

  const overviewQuery = useQuery({
    queryKey: ['admin-overview'],
    queryFn: adminApi.getOverview,
  })

  const companiesQuery = useQuery({
    queryKey: ['admin-companies', query],
    queryFn: () => adminApi.getAdministrations({ query }),
    enabled: section === 'companies' || section === 'subscriptions',
  })

  const usersQuery = useQuery({
    queryKey: ['admin-users', query],
    queryFn: () => adminApi.getUsers({ query }),
    enabled: section === 'users',
  })

  const logsQuery = useQuery({
    queryKey: ['admin-system-logs'],
    queryFn: () => adminApi.getSystemLogs(50),
    enabled: section === 'logs',
  })

  const contactMessagesQuery = useQuery({
    queryKey: ['admin-contact-messages', messagesStatusFilter, messagesQuery],
    queryFn: () => adminApi.listContactMessages({
      page: 1,
      page_size: 50,
      status: messagesStatusFilter || undefined,
      q: messagesQuery || undefined,
    }),
    enabled: section === 'messages',
  })

  const updateMessageMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status?: string; internal_note?: string } }) =>
      adminApi.updateContactMessage(id, payload),
    onSuccess: (updated) => {
      setSelectedMessage(updated)
      void queryClient.invalidateQueries({ queryKey: ['admin-contact-messages'] })
    },
    onError: () => {
      toast.error('Actie mislukt, probeer opnieuw')
    },
  })

  const handleOpenMessage = async (item: ContactMessageListItem) => {
    try {
      const detail = await adminApi.getContactMessage(item.id)
      setSelectedMessage(detail)
      void queryClient.invalidateQueries({ queryKey: ['admin-contact-messages'] })
    } catch {
      toast.error('Bericht kon niet geladen worden')
    }
  }

  const STATUS_LABEL: Record<string, string> = {
    NEW: 'Nieuw',
    READ: 'Gelezen',
    RESOLVED: 'Opgelost',
  }

  const STATUS_BADGE_CLASS: Record<string, string> = {
    NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    READ: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  }

  const handleSectionChange = (nextSection: AdminSection) => {
    setSection(nextSection)
    navigateTo(nextSection === 'users' ? '/admin' : `/admin/${nextSection}`)
  }

  const handleToggleUser = async (userId: string, isActive: boolean) => {
    try {
      await adminApi.updateUserStatus(userId, !isActive)
      await usersQuery.refetch()
      toast.success('Gebruikersstatus bijgewerkt')
    } catch {
      toast.error('Actie mislukt, probeer opnieuw')
    }
  }

  const handleImpersonate = async (userId: string) => {
    if (!window.confirm('Weet je zeker dat je wilt impersoneren?')) return
    try {
      const token = await adminApi.impersonate(userId)
      localStorage.setItem('access_token', token.access_token)
      toast.success('Impersonatie token ingesteld')
      window.location.reload()
    } catch {
      toast.error('Impersonatie mislukt')
    }
  }


  const renderErrorDescription = (error: unknown, fallback: string) => {
    const parsed = formatApiErrorForDisplay(error)
    return (
      <>
        <p className="mb-3">{parsed.message || fallback}</p>
        {parsed.detail ? <p className="mb-3 text-xs text-muted-foreground">{parsed.detail}</p> : null}
      </>
    )
  }

  return (
    <AdminLayout activeSection={section} onSectionChange={handleSectionChange}>
      {/* Search input with proper spacing */}
      {(section === 'companies' || section === 'users' || section === 'subscriptions') ? (
        <div className="mb-4">
          <Input 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            placeholder="Zoeken..." 
            className="max-w-md"
          />
        </div>
      ) : null}

      {section === 'users' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {overviewQuery.isLoading ? <p className="text-muted-foreground">Laden...</p> : null}
            {overviewQuery.isError ? (
              <div className="col-span-full">
                <Alert variant="destructive">
                  <WarningCircle size={20} weight="duotone" />
                  <AlertTitle>Overzicht kon niet geladen worden</AlertTitle>
                  <AlertDescription>
                    {renderErrorDescription(overviewQuery.error, 'Er is een fout opgetreden bij het laden van het systeemoverzicht.')}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => void overviewQuery.refetch()}
                      className="gap-2"
                    >
                      <ArrowClockwise size={16} />
                      Opnieuw proberen
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
            {overviewQuery.data ? (
              <>
                <Card><CardHeader><CardTitle>Gebruikers</CardTitle></CardHeader><CardContent>{overviewQuery.data.users_count}</CardContent></Card>
                <Card><CardHeader><CardTitle>Administraties</CardTitle></CardHeader><CardContent>{overviewQuery.data.administrations_count}</CardContent></Card>
                <Card><CardHeader><CardTitle>Actieve subscripties</CardTitle></CardHeader><CardContent>{overviewQuery.data.active_subscriptions_count}</CardContent></Card>
                <Card><CardHeader><CardTitle>MRR</CardTitle></CardHeader><CardContent>€ {overviewQuery.data.mrr_estimate.toFixed(2)}</CardContent></Card>
                <Card><CardHeader><CardTitle>Facturen 30d</CardTitle></CardHeader><CardContent>{overviewQuery.data.invoices_last_30_days}</CardContent></Card>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {section === 'companies' || section === 'subscriptions' ? (
        <div className="space-y-2">
          {companiesQuery.isLoading ? <p className="text-muted-foreground">Laden...</p> : null}
          {companiesQuery.isError ? (
            <Alert variant="destructive">
              <WarningCircle size={20} weight="duotone" />
              <AlertTitle>Bedrijven konden niet geladen worden</AlertTitle>
              <AlertDescription>
                {renderErrorDescription(companiesQuery.error, 'Er is een fout opgetreden bij het laden van de bedrijvenlijst.')}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => void companiesQuery.refetch()}
                  className="gap-2"
                >
                  <ArrowClockwise size={16} />
                  Opnieuw proberen
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {companiesQuery.data?.administrations.map((company) => (
            <Card key={company.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{company.name}</p>
                  <p className="text-sm text-muted-foreground">{company.owner_email || 'Geen eigenaar'} · {company.plan || 'Geen plan'} · {company.subscription_status || 'onbekend'}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const status = window.prompt('Nieuwe status (trial/active/past_due/canceled):', company.subscription_status || 'active')
                    if (!status) return
                    try {
                      await adminApi.updateAdministrationSubscription(company.id, { status })
                      await companiesQuery.refetch()
                      toast.success('Abonnement bijgewerkt')
                    } catch {
                      toast.error('Bijwerken mislukt')
                    }
                  }}
                >
                  Wijzig
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {section === 'subscriptions' ? (
        <div className="text-sm text-muted-foreground">Subscriptions overview from company records. Subscription editing is available in the companies list.</div>
      ) : null}

      {section === 'revenue' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardHeader><CardTitle>Monthly Recurring Revenue</CardTitle></CardHeader>
            <CardContent>{overviewQuery.data ? `€ ${overviewQuery.data.mrr_estimate.toFixed(2)}` : 'Laden...'}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Invoices (last 30 days)</CardTitle></CardHeader>
            <CardContent>{overviewQuery.data ? overviewQuery.data.invoices_last_30_days : 'Laden...'}</CardContent>
          </Card>
        </div>
      ) : null}

      {section === 'logs' ? (
        <Card>
          <CardHeader><CardTitle>System logs</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            {logsQuery.isLoading ? <p>Laden...</p> : null}
            {logsQuery.isError ? (
              <Alert variant="destructive">
                <WarningCircle size={20} weight="duotone" />
                <AlertTitle>System logs konden niet geladen worden</AlertTitle>
                <AlertDescription>
                  {renderErrorDescription(logsQuery.error, 'Er is een fout opgetreden bij het laden van de systeemlogs.')}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void logsQuery.refetch()}
                    className="gap-2"
                  >
                    <ArrowClockwise size={16} />
                    Opnieuw proberen
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {logsQuery.data?.logs.length ? logsQuery.data.logs.map((log) => (
              <div key={log.id} className="rounded-md border p-3">
                <p className="font-medium">{log.action}</p>
                <p className="text-xs text-muted-foreground">{log.target_type} · {log.target_id}</p>
                <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
              </div>
            )) : null}
            {logsQuery.data && logsQuery.data.logs.length === 0 ? <p>Geen logs gevonden.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {section === 'users' ? (
        <div className="space-y-2">
          {usersQuery.isLoading ? <p className="text-muted-foreground">Laden...</p> : null}
          {usersQuery.isError ? (
            <Alert variant="destructive">
              <WarningCircle size={20} weight="duotone" />
              <AlertTitle>Gebruikers konden niet geladen worden</AlertTitle>
              <AlertDescription>
                {renderErrorDescription(usersQuery.error, 'Er is een fout opgetreden bij het laden van de gebruikerslijst.')}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => void usersQuery.refetch()}
                  className="gap-2"
                >
                  <ArrowClockwise size={16} />
                  Opnieuw proberen
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {usersQuery.data?.users.map((u) => (
            <Card key={u.id}>
              <CardContent className="pt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{u.full_name} ({u.role})</p>
                  <p className="text-sm text-muted-foreground">{u.email} · memberships: {u.administration_membership_count}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handleToggleUser(u.id, u.is_active)}>
                    {u.is_active ? 'Suspend' : 'Activate'}
                  </Button>
                  <Button variant="outline" onClick={() => handleImpersonate(u.id)}>
                    Impersonate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {section === 'messages' ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Input
              value={messagesQuery}
              onChange={(e) => setMessagesQuery(e.target.value)}
              placeholder="Zoeken in berichten..."
              className="max-w-xs"
            />
            <select
              value={messagesStatusFilter}
              onChange={(e) => setMessagesStatusFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Alle statussen</option>
              <option value="NEW">Nieuw</option>
              <option value="READ">Gelezen</option>
              <option value="RESOLVED">Opgelost</option>
            </select>
          </div>

          {/* List */}
          {contactMessagesQuery.isLoading ? <p className="text-muted-foreground">Laden...</p> : null}
          {contactMessagesQuery.isError ? (
            <Alert variant="destructive">
              <WarningCircle size={20} weight="duotone" />
              <AlertTitle>Berichten konden niet geladen worden</AlertTitle>
              <AlertDescription>
                {renderErrorDescription(contactMessagesQuery.error, 'Er is een fout opgetreden bij het laden van de berichten.')}
                <Button variant="outline" size="sm" onClick={() => void contactMessagesQuery.refetch()} className="gap-2">
                  <ArrowClockwise size={16} />
                  Opnieuw proberen
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {contactMessagesQuery.data && contactMessagesQuery.data.items.length === 0 ? (
            <p className="text-muted-foreground">Geen berichten gevonden.</p>
          ) : null}
          {contactMessagesQuery.data?.items.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => void handleOpenMessage(item)}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[item.status] ?? ''}`}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                      <span className="font-semibold text-sm truncate">{item.email}</span>
                      {item.subject ? <span className="text-sm text-muted-foreground truncate">· {item.subject}</span> : null}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{item.message_snippet}</p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {new Date(item.created_at).toLocaleDateString('nl-NL')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Detail panel */}
          {selectedMessage ? (
            <Card className="border-primary/30 mt-4">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    {selectedMessage.subject ?? 'Bericht'} — {selectedMessage.email}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedMessage(null)}>✕</Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[selectedMessage.status] ?? ''}`}>
                    {STATUS_LABEL[selectedMessage.status] ?? selectedMessage.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(selectedMessage.created_at).toLocaleString('nl-NL')}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedMessage.name ? (
                  <p className="text-sm"><span className="font-medium">Naam:</span> {selectedMessage.name}</p>
                ) : null}
                {selectedMessage.page_url ? (
                  <p className="text-sm text-muted-foreground"><span className="font-medium">Pagina:</span> {selectedMessage.page_url}</p>
                ) : null}
                {selectedMessage.user_agent ? (
                  <p className="text-xs text-muted-foreground truncate"><span className="font-medium">Browser:</span> {selectedMessage.user_agent}</p>
                ) : null}
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-sm whitespace-pre-wrap">{selectedMessage.message}</p>
                </div>
                {selectedMessage.internal_note ? (
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 p-3">
                    <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">Interne notitie</p>
                    <p className="text-sm">{selectedMessage.internal_note}</p>
                  </div>
                ) : null}
                <div className="flex gap-2 flex-wrap pt-2">
                  {selectedMessage.status !== 'READ' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateMessageMutation.isPending}
                      onClick={() => updateMessageMutation.mutate({ id: selectedMessage.id, payload: { status: 'READ' } })}
                    >
                      Markeer als gelezen
                    </Button>
                  ) : null}
                  {selectedMessage.status !== 'RESOLVED' ? (
                    <Button
                      size="sm"
                      disabled={updateMessageMutation.isPending}
                      onClick={() => updateMessageMutation.mutate({ id: selectedMessage.id, payload: { status: 'RESOLVED' } })}
                    >
                      Markeer als opgelost
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

    </AdminLayout>
  )
}
