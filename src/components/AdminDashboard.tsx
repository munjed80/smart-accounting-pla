import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AdminLayout, AdminSection } from '@/components/AdminLayout'
import { toast } from 'sonner'

export const AdminDashboard = () => {
  const getSectionFromPath = (): AdminSection => {
    const [, , rawSection] = window.location.pathname.split('/')
    const section = rawSection as AdminSection | undefined
    const allowedSections: AdminSection[] = ['users', 'companies', 'subscriptions', 'revenue', 'logs']
    return section && allowedSections.includes(section) ? section : 'users'
  }

  const [section, setSection] = useState<AdminSection>(getSectionFromPath)
  const [query, setQuery] = useState('')

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

  return (
    <AdminLayout activeSection={section} onSectionChange={handleSectionChange}>
      {(section === 'companies' || section === 'users' || section === 'subscriptions') ? (
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoeken..." />
      ) : null}

      {section === 'users' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {overviewQuery.isLoading ? <p>Laden...</p> : null}
          {overviewQuery.isError ? <p>Overzicht kon niet geladen worden.</p> : null}
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
      ) : null}

      {section === 'companies' || section === 'subscriptions' ? (
        <div className="space-y-2">
          {companiesQuery.isLoading ? <p>Laden...</p> : null}
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
          <CardContent className="text-sm text-muted-foreground">
            Logging endpoint is not exposed yet. Connect this panel to the backend audit stream when available.
          </CardContent>
        </Card>
      ) : null}

      {section === 'users' ? (
        <div className="space-y-2">
          {usersQuery.isLoading ? <p>Laden...</p> : null}
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

    </AdminLayout>
  )
}
