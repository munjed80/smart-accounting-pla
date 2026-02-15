import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { accountantApi, MandateItem, MandateSearchItem, getErrorMessage } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'
import { useActiveClient } from '@/lib/ActiveClientContext'

const statusBadgeClass: Record<MandateItem['status'], string> = {
  pending: 'bg-amber-500/20 text-amber-700 border-amber-500/40',
  approved: 'bg-green-500/20 text-green-700 border-green-500/40',
  rejected: 'bg-red-500/20 text-red-700 border-red-500/40',
  revoked: 'bg-muted text-muted-foreground border-muted',
}

export function AccountantClientsPage() {
  const { setActiveClient } = useActiveClient()
  const [mandates, setMandates] = useState<MandateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MandateSearchItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selected, setSelected] = useState<MandateSearchItem | null>(null)

  const loadMandates = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await accountantApi.getMandates()
      setMandates(response.mandates)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMandates()
  }, [])

  const searchClients = async () => {
    if (query.trim().length < 2) return
    try {
      setSearchLoading(true)
      const response = await accountantApi.searchMandateClients(query.trim())
      setSearchResults(response.results)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setSearchLoading(false)
    }
  }

  const requestAccess = async () => {
    if (!selected) {
      toast.error('Selecteer eerst een klantbedrijf.')
      return
    }

    try {
      const result = await accountantApi.createMandate(selected.client_company_id)
      toast.success(result.message)
      setSelected(null)
      setSearchResults([])
      setQuery('')
      await loadMandates()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  const revokeMandate = async (id: string) => {
    try {
      const result = await accountantApi.revokeMandate(id)
      toast.success(result.message)
      await loadMandates()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  const openDossier = (mandate: MandateItem) => {
    setActiveClient({
      id: mandate.client_user_id,
      name: mandate.client_company_name,
      email: '',
      administrationId: mandate.client_company_id,
      administrationName: mandate.client_company_name,
    })
    navigateTo(`/accountant/clients/${mandate.client_company_id}/invoices`)
  }

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Machtigingen</h1>
        <p className="text-muted-foreground">Vraag toegang aan en beheer machtigingen per klantbedrijf.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Toegang aanvragen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="company-search">Zoek klantbedrijf</Label>
          <div className="flex gap-2">
            <Input
              id="company-search"
              placeholder="Bijv. Jansen Consultancy"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button onClick={searchClients} disabled={searchLoading || query.trim().length < 2}>
              {searchLoading ? 'Zoeken...' : 'Zoeken'}
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="border rounded-md divide-y">
              {searchResults.map((item) => (
                <button
                  key={item.client_company_id}
                  className={`w-full text-left px-3 py-2 hover:bg-muted ${selected?.client_company_id === item.client_company_id ? 'bg-muted' : ''}`}
                  onClick={() => setSelected(item)}
                >
                  <div className="font-medium">{item.company_name}</div>
                  <div className="text-xs text-muted-foreground">Eigenaar: {item.owner_name} ({item.owner_email})</div>
                </button>
              ))}
            </div>
          )}
          <Button onClick={requestAccess} disabled={!selected}>Toegang aanvragen</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overzicht machtigingen</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : error ? (
            <div className="text-destructive">{error}</div>
          ) : mandates.length === 0 ? (
            <div className="text-muted-foreground">Nog geen machtigingen gevonden.</div>
          ) : (
            <div className="space-y-2">
              {mandates.map((mandate) => (
                <div key={mandate.id} className="border rounded-md p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{mandate.client_company_name}</div>
                    <div className="text-xs text-muted-foreground">Aangemaakt: {new Date(mandate.created_at).toLocaleString('nl-NL')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusBadgeClass[mandate.status]}>{mandate.status}</Badge>
                    {mandate.status === 'approved' && (
                      <Button size="sm" onClick={() => openDossier(mandate)}>Open dossier</Button>
                    )}
                    {mandate.status !== 'revoked' && (
                      <Button size="sm" variant="outline" onClick={() => revokeMandate(mandate.id)}>Intrekken</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AccountantClientsPage
