import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { zzpApi, ZZPCommitment, ZZPCommitmentCreate, ZZPCommitmentSuggestion, ZZPExpense } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'
import { CommitmentExpenseDialog } from '@/components/CommitmentExpenseDialog'
import { createDemoCommitments } from '@/lib/commitments'
import { PaywallModal } from '@/components/PaywallModal'
import { PaymentRequiredError } from '@/lib/errors'
import { AlertCircle, ArrowClockwise } from '@phosphor-icons/react'

const eur = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const todayStr = () => new Date().toISOString().slice(0, 10)
const isExpired = (item: ZZPCommitment) => item.status === 'ended' || item.end_date_status === 'ended'
const isPaused = (item: ZZPCommitment) => item.status === 'paused'
const errorWithStatus = (error: unknown) => axios.isAxiosError(error) && error.response?.status ? `${error.response.status}: ${parseApiError(error)}` : parseApiError(error)

const defaultForm = (): ZZPCommitmentCreate => ({ type: 'subscription', name: '', amount_cents: 0, recurring_frequency: 'monthly', start_date: todayStr(), auto_renew: true, btw_rate: 21, status: 'active' })

export const ZZPSubscriptionsPage = () => {
  const [items, setItems] = useState<ZZPCommitment[]>([])
  const [suggestions, setSuggestions] = useState<ZZPCommitmentSuggestion[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedExpenseCommitment, setSelectedExpenseCommitment] = useState<ZZPCommitment | null>(null)
  const [isCreatingExpense, setIsCreatingExpense] = useState(false)
  const [expenses, setExpenses] = useState<ZZPExpense[]>([])
  const [form, setForm] = useState<ZZPCommitmentCreate>(defaultForm())
  
  // Error handling state
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isBetaMode, setIsBetaMode] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [paywallFeature, setPaywallFeature] = useState<{ code: string; nameNL: string }>({ code: '', nameNL: '' })

  const load = async () => {
    // Prevent duplicate requests if already loading or retrying
    if (isLoading || isRetrying) return
    
    setIsLoading(true)
    setLoadError(null)
    setIsBetaMode(false)
    
    try {
      // DEBUG: Log API calls (dev-only)
      if (import.meta.env.DEV) {
        console.log('[ZZPSubscriptionsPage] Starting API calls...')
      }
      
      const [list, suggestionResp, expenseResp] = await Promise.all([
        zzpApi.commitments.list('subscription'), 
        zzpApi.commitments.suggestions(), 
        zzpApi.expenses.list()
      ])
      
      // DEBUG: Log successful responses (dev-only)
      if (import.meta.env.DEV) {
        console.log('[ZZPSubscriptionsPage] API responses:', {
          commitments: list.commitments.length,
          suggestions: suggestionResp.suggestions.length,
          expenses: expenseResp.expenses.length
        })
      }
      
      setItems(list.commitments)
      setSuggestions(suggestionResp.suggestions)
      setExpenses(expenseResp.expenses)
    } catch (error) {
      // DEBUG: Log error details (dev-only)
      if (import.meta.env.DEV) {
        console.error('[ZZPSubscriptionsPage] Load error:', {
          error,
          isAxiosError: axios.isAxiosError(error),
          status: axios.isAxiosError(error) ? error.response?.status : 'N/A',
          statusText: axios.isAxiosError(error) ? error.response?.statusText : 'N/A',
          url: axios.isAxiosError(error) ? error.config?.url : 'N/A',
          responseData: axios.isAxiosError(error) ? error.response?.data : 'N/A'
        })
      }
      
      // Check if it's a payment required error (402)
      if (error instanceof PaymentRequiredError) {
        setPaywallFeature({ 
          code: error.feature || 'subscriptions', 
          nameNL: 'Abonnementen & Recurring Kosten' 
        })
        setPaywallOpen(true)
        return // Don't show error state, show paywall instead
      }
      
      // Handle different error types
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        
        // 404 = module not available, show beta/coming soon state
        if (status === 404) {
          setIsBetaMode(true)
          return // Don't show error state
        }
        
        // 401/403 = auth/permission issue
        if (status === 401 || status === 403) {
          const errorMsg = status === 401 
            ? 'Sessie verlopen. Log opnieuw in.' 
            : 'Geen toegang tot deze pagina. Controleer je rechten.'
          setLoadError(errorMsg)
          return
        }
        
        // Network errors (no response)
        if (!error.response) {
          setLoadError('Geen verbinding met de server. Controleer je internetverbinding.')
          return
        }
        
        // Other HTTP errors
        const errorMsg = errorWithStatus(error)
        setLoadError(errorMsg)
      } else {
        // Non-axios errors
        setLoadError(parseApiError(error))
      }
    } finally {
      setIsLoading(false)
      setIsRetrying(false)
    }
  }
  
  const retry = async () => {
    setIsRetrying(true)
    await load()
  }

  useEffect(() => { load() }, [])

  const yearlyCostCents = useMemo(() => form.recurring_frequency === 'yearly' ? form.amount_cents : form.amount_cents * 12, [form])
  const estimatedVatReclaimCents = useMemo(() => {
    if (!form.btw_rate || form.btw_rate <= 0) return 0
    return Math.round(yearlyCostCents * (form.btw_rate / 100) / (1 + form.btw_rate / 100))
  }, [form.btw_rate, yearlyCostCents])


  const expensesByCommitmentId = useMemo(() => expenses.reduce<Record<string, ZZPExpense[]>>((acc, expense) => {
    if (!expense.commitment_id) return acc
    acc[expense.commitment_id] = [...(acc[expense.commitment_id] || []), expense]
    return acc
  }, {}), [expenses])
  const isActive = (item: ZZPCommitment) => !isExpired(item)

  const save = async () => {
    if (!form.name || form.amount_cents <= 0 || !form.recurring_frequency) {
      toast.error('Vul naam, bedrag en frequentie in.')
      return
    }

    const hasDuplicate = items.some(item => item.id !== editingId && isActive(item) && item.name.trim().toLowerCase() === form.name.trim().toLowerCase() && item.amount_cents === form.amount_cents)
    if (hasDuplicate && !window.confirm('Er bestaat al een actief abonnement met dezelfde naam en bedrag. Toch opslaan?')) return

    try {
      if (editingId) await zzpApi.commitments.update(editingId, form)
      else await zzpApi.commitments.create(form)
      setForm(defaultForm())
      setEditingId(null)
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  const confirmCreateExpense = async (payload: { expense_date: string; amount_cents: number; vat_rate: number; description: string; notes?: string }) => {
    if (!selectedExpenseCommitment) return

    setIsCreatingExpense(true)
    try {
      const created = await zzpApi.commitments.createExpense(selectedExpenseCommitment.id, payload)
      setSelectedExpenseCommitment(null)
      toast.success('Uitgave aangemaakt', { action: { label: 'Open uitgave', onClick: () => navigateTo(`/zzp/expenses#expense-${created.expense_id}`) } })
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    } finally {
      setIsCreatingExpense(false)
    }
  }

  const addExamples = async () => {
    try {
      await createDemoCommitments(todayStr())
      toast.success('Voorbeelden toegevoegd')
      load()
    } catch (error) {
      toast.error(errorWithStatus(error))
    }
  }

  const editItem = (i: ZZPCommitment) => {
    setEditingId(i.id)
    setForm({ ...i, type: 'subscription', recurring_frequency: (i.recurring_frequency || 'monthly') as 'monthly' | 'yearly', start_date: i.start_date.slice(0, 10), end_date: i.end_date || undefined, renewal_date: i.renewal_date || undefined })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col gap-2 mb-6">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Abonnementen & Recurring Kosten
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Beheer je terugkerende kosten en abonnementen
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <div className="text-center space-y-3">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
              <p className="text-muted-foreground">Laden...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {!isLoading && loadError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Fout bij laden</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{loadError}</p>
              <Button 
                onClick={() => void retry()} 
                variant="outline" 
                size="sm"
                disabled={isRetrying}
              >
                <ArrowClockwise className={`mr-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Bezig...' : 'Opnieuw proberen'}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Beta Mode State - Show when feature is not available (404) */}
        {!isLoading && !loadError && isBetaMode && (
          <Card className="bg-card/80 backdrop-blur-sm border border-border/50 mb-6">
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <div className="max-w-md mx-auto space-y-4">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Badge variant="secondary" className="text-sm">Beta</Badge>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Abonnementen & Recurring Kosten</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Deze functie is binnenkort beschikbaar. We werken hard om deze module voor je klaar te maken.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Houd je terugkerende kosten voor nu bij in de uitgaven module, of kom later terug wanneer deze functie actief is.
                    </p>
                  </div>
                  <Button 
                    onClick={() => void retry()} 
                    variant="outline"
                    disabled={isRetrying}
                  >
                    <ArrowClockwise className={`mr-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                    {isRetrying ? 'Controleren...' : 'Opnieuw controleren'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content - Only show if not loading, no error, and not beta mode */}
        {!isLoading && !loadError && !isBetaMode && (
          <>
        {/* Form Card */}
        <Card className="bg-card/80 backdrop-blur-sm border border-border/50 mb-6">
          <CardHeader className="pb-4">
            <CardTitle>Nieuw abonnement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Input placeholder="Naam" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Input type="number" min="0" placeholder="Bedrag (EUR)" value={form.amount_cents ? form.amount_cents / 100 : ''} onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value || 0) * 100) })} />
              </div>
              <div className="space-y-2">
                <Select value={form.recurring_frequency} onValueChange={(v: 'monthly' | 'yearly') => setForm({ ...form, recurring_frequency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Maandelijks</SelectItem>
                    <SelectItem value="yearly">Jaarlijks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Input type="number" min="1" placeholder="Contractduur (maanden)" value={form.contract_term_months || ''} onChange={e => setForm({ ...form, contract_term_months: Number(e.target.value || 0) || undefined })} />
              </div>
              <div className="space-y-2">
                <Select value={String(form.btw_rate ?? 21)} onValueChange={(v) => setForm({ ...form, btw_rate: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="9">9%</SelectItem>
                    <SelectItem value="21">21%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Input type="number" min="0" placeholder="Opzegtermijn (dagen)" value={form.notice_period_days || ''} onChange={e => setForm({ ...form, notice_period_days: Number(e.target.value || 0) || undefined })} />
              </div>
              <div className="space-y-2">
                <Select value={form.auto_renew === false ? 'false' : 'true'} onValueChange={v => setForm({ ...form, auto_renew: v === 'true' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Automatisch verlengen</SelectItem>
                    <SelectItem value="false">Niet automatisch verlengen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Input type="date" placeholder="Verlengingsdatum" value={form.renewal_date || ''} onChange={e => setForm({ ...form, renewal_date: e.target.value || undefined })} />
              </div>
              <div className="space-y-2">
                <Select value={form.status || 'active'} onValueChange={(v: 'active' | 'paused' | 'ended') => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Actief</SelectItem>
                    <SelectItem value="paused">Gepauzeerd</SelectItem>
                    <SelectItem value="ended">Beëindigd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cost summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-border bg-secondary/30 p-4">
              <div>
                <p className="text-sm text-muted-foreground">Jaarlijkse kosten</p>
                <p className="text-lg font-semibold">{eur(yearlyCostCents)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Geschatte BTW-teruggave</p>
                <p className="text-lg font-semibold">{form.btw_rate && form.btw_rate > 0 ? eur(estimatedVatReclaimCents) : 'n.v.t.'}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <Button onClick={save} className="h-10 sm:h-11">
                {editingId ? 'Bijwerken' : 'Opslaan'}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={() => { setEditingId(null); setForm(defaultForm()) }} className="h-10 sm:h-11">
                  Annuleren
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* List Card */}
        <Card className="bg-card/80 backdrop-blur-sm border border-border/50 mb-6">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Abonnementen</CardTitle>
              </div>
              {items.length === 0 && (
                <Button variant="outline" onClick={addExamples} className="h-10 sm:h-11">
                  Voeg voorbeelden toe
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Nog geen abonnementen toegevoegd. Voeg je eerste abonnement toe om je terugkerende kosten bij te houden.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="sm:hidden space-y-3">
                  {items.map(i => (
                    <div id={`commitment-${i.id}`} key={i.id} className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-base">{i.name}</p>
                        {isPaused(i) ? <Badge variant="secondary">Gepauzeerd</Badge> : isExpired(i) ? <Badge variant="secondary">Beëindigd</Badge> : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Frequentie</p>
                          <p className="font-medium">{i.recurring_frequency}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Bedrag</p>
                          <p className="font-medium">{eur(i.amount_cents)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Volgende vervaldatum</p>
                          <p className="font-medium">{i.next_due_date || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Auto-renew</p>
                          <p className="font-medium">{i.auto_renew ? 'Ja' : 'Nee'}</p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>Opzegtermijn: {i.notice_period_days || 0} dagen</p>
                        <p>Laatste boeking: {i.last_booked_date || '-'}</p>
                        <p>Gekoppelde uitgaven: {(expensesByCommitmentId[i.id] || []).length}</p>
                        {(expensesByCommitmentId[i.id] || []).slice(0, 2).map(exp => (
                          <p key={exp.id}>• {exp.expense_date}: {eur(exp.amount_cents)}</p>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => editItem(i)} className="h-9">
                          Bewerk
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={isPaused(i) || isExpired(i)} 
                          onClick={() => setSelectedExpenseCommitment(i)}
                          className="h-9"
                        >
                          Maak uitgave aan
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={async () => { 
                            try { 
                              await zzpApi.commitments.delete(i.id); 
                              load() 
                            } catch (error) { 
                              toast.error(errorWithStatus(error)) 
                            } 
                          }}
                          className="h-9"
                        >
                          Verwijder
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table view */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Naam</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Frequentie</TableHead>
                        <TableHead>Volgende vervaldatum</TableHead>
                        <TableHead>Opzegtermijn</TableHead>
                        <TableHead>Auto-renew</TableHead>
                        <TableHead>Bedrag</TableHead>
                        <TableHead>Laatste boeking</TableHead>
                        <TableHead>Uitgaven</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(i => (
                        <TableRow id={`commitment-${i.id}`} key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell>{i.status}</TableCell>
                          <TableCell>{i.recurring_frequency}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {i.next_due_date || '-'} 
                              {isPaused(i) ? <Badge variant="secondary">Gepauzeerd</Badge> : isExpired(i) ? <Badge variant="secondary">Beëindigd</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{i.notice_period_days || 0} dgn</TableCell>
                          <TableCell>{i.auto_renew ? 'Ja' : 'Nee'}</TableCell>
                          <TableCell className="font-medium">{eur(i.amount_cents)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{i.last_booked_date || '-'}</TableCell>
                          <TableCell>{(expensesByCommitmentId[i.id] || []).length}</TableCell>
                          <TableCell>
                            <div className="flex gap-2 whitespace-nowrap">
                              <Button variant="outline" size="sm" onClick={() => editItem(i)}>
                                Bewerk
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                disabled={isPaused(i) || isExpired(i)} 
                                onClick={() => setSelectedExpenseCommitment(i)}
                              >
                                Maak uitgave aan
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm" 
                                onClick={async () => { 
                                  try { 
                                    await zzpApi.commitments.delete(i.id); 
                                    load() 
                                  } catch (error) { 
                                    toast.error(errorWithStatus(error)) 
                                  } 
                                }}
                              >
                                Verwijder
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Suggestions Card */}
        <Card className="bg-card/80 backdrop-blur-sm border border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Suggesties op basis van bankfeed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen suggesties gevonden.</p>
            ) : (
              suggestions.map(s => (
                <div key={s.bank_transaction_id} className="border border-border rounded-lg p-3 text-sm flex justify-between items-center">
                  <span className="font-medium">{s.description}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{eur(s.amount_cents)}</span>
                    <Badge variant="secondary">{(s.confidence * 100).toFixed(0)}%</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <CommitmentExpenseDialog 
          open={!!selectedExpenseCommitment} 
          commitment={selectedExpenseCommitment} 
          isSubmitting={isCreatingExpense} 
          onOpenChange={(open) => { if (!open) setSelectedExpenseCommitment(null) }} 
          onConfirm={confirmCreateExpense} 
        />
        
        {/* Close the conditional wrapper for main content */}
        </>
        )}

        {/* Paywall Modal */}
        <PaywallModal
          open={paywallOpen}
          onClose={() => {
            setPaywallOpen(false)
            // Retry loading after paywall is closed (user might have activated subscription)
            void load()
          }}
          feature={paywallFeature.code}
          featureNameNL={paywallFeature.nameNL}
        />
      </div>
    </div>
  )
}
