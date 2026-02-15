import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { CalendarBlank, Clock, CurrencyEur, PencilSimple, Plus, Receipt, TrashSimple, WarningCircle } from '@phosphor-icons/react'
import { WorkSession, zzpApi, ZZPCustomer, ZZPTimeEntry, ZZPTimeEntryCreate } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { toast } from 'sonner'
import { navigateTo } from '@/lib/navigation'
import {
  formatDurationHHMMSS,
  getInvoicePeriodRange,
  InvoicePeriodMode,
  minutesToHours,
  toLocalISODate,
  totalMinutesForEntries,
} from '@/lib/timeTracking'

const NO_CUSTOMER = '__none__'

type EntryFormState = {
  entry_date: string
  hours: string
  description: string
  customer_id: string
  project_name: string
  hourly_rate: string
}

const INVOICE_MODE_STORAGE_KEY = 'uren_invoice_mode'

const parseHours = (value: ZZPTimeEntry['hours']): number => Number(value || 0)

const parseDecimalInput = (value: string): number => {
  const normalized = value.replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

const getInitialInvoiceMode = (): InvoicePeriodMode => {
  const savedMode = localStorage.getItem(INVOICE_MODE_STORAGE_KEY)
  if (savedMode === 'daily' || savedMode === 'weekly' || savedMode === 'monthly' || savedMode === 'custom') {
    return savedMode
  }
  return 'weekly'
}

const groupByDay = (entries: ZZPTimeEntry[]) => {
  return entries.reduce<Record<string, ZZPTimeEntry[]>>((acc, entry) => {
    const key = entry.entry_date
    if (!acc[key]) acc[key] = []
    acc[key].push(entry)
    return acc
  }, {})
}

const defaultFormState = (): EntryFormState => ({
  entry_date: toLocalISODate(new Date()),
  hours: '1',
  description: '',
  customer_id: '',
  project_name: '',
  hourly_rate: '',
})

export const ZZPTimeTrackingPage = () => {
  const [invoiceMode, setInvoiceMode] = useState<InvoicePeriodMode>(() => getInitialInvoiceMode())
  const initialPeriod = useMemo(
    () => getInvoicePeriodRange(invoiceMode, new Date()) ?? getInvoicePeriodRange('weekly', new Date()),
    [invoiceMode],
  )

  const [customers, setCustomers] = useState<ZZPCustomer[]>([])
  const [openEntries, setOpenEntries] = useState<ZZPTimeEntry[]>([])
  const [invoicedEntries, setInvoicedEntries] = useState<ZZPTimeEntry[]>([])
  const [invoiceNumberMap, setInvoiceNumberMap] = useState<Record<string, string>>({})

  const [loading, setLoading] = useState(true)
  const [invoicing, setInvoicing] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [periodStart, setPeriodStart] = useState<string>(initialPeriod?.start || '')
  const [periodEnd, setPeriodEnd] = useState<string>(initialPeriod?.end || '')
  const [hourlyRate, setHourlyRate] = useState<string>('')

  const [invoicedFilterCustomerId, setInvoicedFilterCustomerId] = useState<string>('')
  const [invoicedFilterStart, setInvoicedFilterStart] = useState<string>('')
  const [invoicedFilterEnd, setInvoicedFilterEnd] = useState<string>('')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ZZPTimeEntry | null>(null)
  const [formState, setFormState] = useState<EntryFormState>(defaultFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [formValidationErrors, setFormValidationErrors] = useState<string[]>([])
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [isClockActionLoading, setIsClockActionLoading] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers])

  const fetchInvoiceNumbers = useCallback(async (entries: ZZPTimeEntry[]) => {
    const invoiceIds = Array.from(new Set(entries.map((entry) => entry.invoice_id).filter(Boolean))) as string[]
    if (invoiceIds.length === 0) {
      setInvoiceNumberMap({})
      return
    }

    const results = await Promise.allSettled(
      invoiceIds.map(async (invoiceId) => {
        const invoice = await zzpApi.invoices.get(invoiceId)
        return [invoiceId, invoice.invoice_number] as const
      }),
    )

    const map: Record<string, string> = {}
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        map[result.value[0]] = result.value[1]
      }
    })
    setInvoiceNumberMap(map)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const [customerRes, openRes, invoicedRes, activeSessionRes] = await Promise.all([
        zzpApi.customers.list(),
        zzpApi.timeEntries.listOpen(),
        zzpApi.timeEntries.listInvoiced(),
        zzpApi.workSessions.getActive(),
      ])

      setCustomers(customerRes.customers)
      setOpenEntries(openRes)
      setInvoicedEntries(invoicedRes)
      setActiveSession(activeSessionRes)
      await fetchInvoiceNumbers(invoicedRes)

      try {
        const profile = await zzpApi.profile.get()
        if (profile?.default_hourly_rate && !hourlyRate) {
          setHourlyRate(String(profile.default_hourly_rate))
        }
      } catch {
        // profile default is optional for this workflow
      }
    } catch (error) {
      const message = parseApiError(error)
      setPageError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [fetchInvoiceNumbers, hourlyRate])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    localStorage.setItem(INVOICE_MODE_STORAGE_KEY, invoiceMode)
  }, [invoiceMode])

  useEffect(() => {
    const period = getInvoicePeriodRange(invoiceMode)
    if (!period) return
    setPeriodStart(period.start)
    setPeriodEnd(period.end)
  }, [invoiceMode])

  useEffect(() => {
    if (!activeSession?.started_at) {
      setElapsedSeconds(0)
      return
    }

    const updateElapsed = () => {
      const startedAt = new Date(activeSession.started_at).getTime()
      const now = Date.now()
      setElapsedSeconds(Math.max(0, Math.floor((now - startedAt) / 1000)))
    }

    updateElapsed()
    const intervalId = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(intervalId)
  }, [activeSession])

  const filteredOpenEntries = useMemo(() => {
    return openEntries.filter((entry) => {
      if (selectedCustomerId && entry.customer_id !== selectedCustomerId) return false
      if (periodStart && entry.entry_date < periodStart) return false
      if (periodEnd && entry.entry_date > periodEnd) return false
      return true
    })
  }, [openEntries, selectedCustomerId, periodStart, periodEnd])

  const filteredInvoicedEntries = useMemo(() => {
    return invoicedEntries.filter((entry) => {
      if (invoicedFilterCustomerId && entry.customer_id !== invoicedFilterCustomerId) return false
      if (invoicedFilterStart && entry.entry_date < invoicedFilterStart) return false
      if (invoicedFilterEnd && entry.entry_date > invoicedFilterEnd) return false
      return true
    })
  }, [invoicedEntries, invoicedFilterCustomerId, invoicedFilterStart, invoicedFilterEnd])

  const groupedOpenEntries = useMemo(() => groupByDay(filteredOpenEntries), [filteredOpenEntries])

  const totalOpenMinutes = useMemo(() => totalMinutesForEntries(filteredOpenEntries), [filteredOpenEntries])
  const totalOpenHours = useMemo(() => minutesToHours(totalOpenMinutes), [totalOpenMinutes])

  const totalOpenAmount = useMemo(() => totalOpenHours * Number(hourlyRate || 0), [totalOpenHours, hourlyRate])

  const weeklyOpenMinutes = useMemo(() => totalMinutesForEntries(openEntries), [openEntries])
  const weeklyOpenHours = useMemo(() => minutesToHours(weeklyOpenMinutes), [weeklyOpenMinutes])

  const handleClockIn = async () => {
    setIsClockActionLoading(true)
    try {
      const session = await zzpApi.workSessions.start()
      setActiveSession(session)
      toast.success('Inchecken gestart')
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setIsClockActionLoading(false)
    }
  }

  const handleClockOut = async () => {
    setIsClockActionLoading(true)
    try {
      const response = await zzpApi.workSessions.stop()
      setActiveSession(null)
      setOpenEntries((prev) => [response.time_entry, ...prev])
      toast.success('Uitgecheckt en uren toegevoegd')
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setIsClockActionLoading(false)
    }
  }

  const openForm = (entry?: ZZPTimeEntry) => {
    setFormError(null)
    setFormValidationErrors([])
    if (entry) {
      setEditingEntry(entry)
      setFormState({
        entry_date: entry.entry_date,
        hours: String(entry.hours),
        description: entry.description,
        customer_id: entry.customer_id || '',
        project_name: entry.project_name || '',
        hourly_rate: entry.hourly_rate ? String(entry.hourly_rate) : '',
      })
    } else {
      setEditingEntry(null)
      setFormState(defaultFormState())
    }
    setIsFormOpen(true)
  }

  const saveEntry = async () => {
    const parsedHours = parseDecimalInput(formState.hours)
    const parsedHourlyRate = formState.hourly_rate ? parseDecimalInput(formState.hourly_rate) : undefined
    const description = formState.description.trim()
    const selectedCustomerId = formState.customer_id || null

    if (!formState.entry_date) {
      setFormError('Datum is verplicht.')
      setFormValidationErrors([])
      return
    }

    if (!description) {
      setFormError('Omschrijving is verplicht.')
      setFormValidationErrors([])
      return
    }

    if (!Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      setFormError('Uren moeten groter zijn dan 0 en maximaal 24.')
      setFormValidationErrors([])
      return
    }

    if (parsedHourlyRate !== undefined && (!Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0)) {
      setFormError('Uurtarief moet 0 of hoger zijn.')
      setFormValidationErrors([])
      return
    }

    if (selectedCustomerId && !customers.some((customer) => customer.id === selectedCustomerId)) {
      setFormError('Geselecteerde klant is niet meer beschikbaar. Kies opnieuw.')
      setFormValidationErrors([])
      return
    }

    setFormError(null)
    setFormValidationErrors([])
    setIsSavingEntry(true)
    try {
      const payload: ZZPTimeEntryCreate = {
        entry_date: formState.entry_date,
        hours: parsedHours,
        description,
        customer_id: selectedCustomerId || undefined,
        project_name: formState.project_name || undefined,
        hourly_rate: parsedHourlyRate,
        billable: true,
      }

      if (editingEntry) {
        const response = await zzpApi.timeEntries.update(editingEntry.id, {
          ...payload,
          customer_id: selectedCustomerId,
        })
        console.info('[Uren] Update response', { status: response.status, entryId: editingEntry.id })
        if (response.status !== 200 && response.status !== 204) {
          throw new Error(`TIME_ENTRY_UPDATE_FAILED_STATUS_${response.status}`)
        }
        toast.success('Uren bijgewerkt')
      } else {
        await zzpApi.timeEntries.create(payload)
        toast.success('Uren toegevoegd')
      }

      setIsFormOpen(false)
      await fetchData()
    } catch (error) {
      const message = parseApiError(error)
      const rawError = error as { response?: { data?: { detail?: unknown }; status?: number } }
      const detail = rawError?.response?.data?.detail
      if (Array.isArray(detail)) {
        const validationMessages = detail.map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const location = Array.isArray((item as { loc?: unknown[] }).loc)
              ? (item as { loc?: unknown[] }).loc?.join('.')
              : null
            const detailMessage = (item as { msg?: string }).msg || 'Ongeldige invoer'
            return location ? `${location}: ${detailMessage}` : detailMessage
          }
          return 'Ongeldige invoer'
        })
        setFormValidationErrors(validationMessages)
        setFormError('Controleer de invoer en probeer opnieuw.')
      } else {
        setFormValidationErrors([])
      }
      if (String(message).includes('TIME_ENTRY_INVOICED') || String(message).includes('Gefactureerde')) {
        toast.error('Deze uren zijn al gefactureerd en kunnen niet worden aangepast.')
      } else {
        setFormError(String(message))
        toast.error(message)
      }
    } finally {
      setIsSavingEntry(false)
    }
  }


  const handleDeleteEntry = async (entry: ZZPTimeEntry) => {
    const confirmed = window.confirm('Weet je zeker dat je deze open uren wilt verwijderen?')
    if (!confirmed) return

    try {
      await zzpApi.timeEntries.delete(entry.id)
      toast.success('Uren verwijderd')
      await fetchData()
    } catch (error) {
      toast.error(parseApiError(error))
    }
  }

  const handleInvoiceWeek = async () => {
    if (!selectedCustomerId || totalOpenHours <= 0) return
    setInvoicing(true)
    try {
      const response = await zzpApi.timeEntries.invoiceWeek({
        customer_id: selectedCustomerId,
        period_start: periodStart,
        period_end: periodEnd,
        hourly_rate: hourlyRate ? Number(hourlyRate) : undefined,
      })
      toast.success('Factuur aangemaakt')
      await fetchData()
      navigateTo(`/zzp/invoices/${response.invoice_id}`)
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setInvoicing(false)
    }
  }

  if (pageError && !loading) {
    return (
      <div className="space-y-4 pb-24">
        <Alert className="border-destructive/40 bg-destructive/5">
          <WarningCircle size={18} weight="fill" />
          <AlertDescription className="space-y-3">
            <p>Er ging iets mis bij het laden van Uren: {pageError}</p>
            <Button onClick={() => void fetchData()} variant="outline">Opnieuw proberen</Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt size={20} />
            Facturatie deze week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Facturatie modus</Label>
              <Select value={invoiceMode} onValueChange={(value) => setInvoiceMode(value as InvoicePeriodMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies modus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Dagelijks</SelectItem>
                  <SelectItem value="weekly">Wekelijks</SelectItem>
                  <SelectItem value="monthly">Maandelijks</SelectItem>
                  <SelectItem value="custom">Aangepaste periode</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Klant</Label>
              <Select value={selectedCustomerId || NO_CUSTOMER} onValueChange={(value) => setSelectedCustomerId(value === NO_CUSTOMER ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer klant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOMER}>Geen selectie</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Periode start</Label>
              <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Periode eind</Label>
              <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Uurtarief (€)</Label>
              <Input type="number" min="0" step="0.01" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} placeholder="Bijv. 95" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Totaal uren (open)</p>
              <p className="text-2xl font-semibold">{totalOpenHours.toFixed(2)}u</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Uurtarief</p>
              <p className="text-2xl font-semibold">€ {Number(hourlyRate || 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Bedrag preview</p>
              <p className="text-2xl font-semibold">€ {totalOpenAmount.toFixed(2)}</p>
            </div>
          </div>

          <Button disabled={!selectedCustomerId || totalOpenHours === 0 || invoicing} onClick={() => void handleInvoiceWeek()}>
            {invoicing ? 'Factuur maken...' : 'Maak factuur'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock size={20} />OnClock</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Actieve sessie:
            <Badge variant={activeSession ? 'default' : 'secondary'} className={activeSession ? 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40' : ''}>
              {activeSession ? 'ja' : 'nee'}
            </Badge>
          </div>
          {activeSession ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={isClockActionLoading}
                onClick={() => void handleClockOut()}
              >
                {isClockActionLoading ? 'Uitchecken...' : 'Uitchecken'}
              </Button>
              <p className="text-sm">Lopende tijd: <span className="font-semibold">{formatDurationHHMMSS(elapsedSeconds)}</span></p>
            </div>
          ) : (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isClockActionLoading}
              onClick={() => void handleClockIn()}
            >
              {isClockActionLoading ? 'Inchecken...' : 'Inchecken'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Clock size={20} />Open uren</CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">Week totaal: {weeklyOpenHours.toFixed(2)}u</Badge>
            <Button onClick={() => openForm()} size="sm"><Plus size={16} className="mr-2" />Uren toevoegen</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : Object.keys(groupedOpenEntries).length === 0 ? (
            <p className="text-muted-foreground">Geen open uren in deze selectie.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedOpenEntries).sort(([a], [b]) => (a < b ? 1 : -1)).map(([day, dayEntries]) => {
                const dayTotal = dayEntries.reduce((sum, entry) => sum + parseHours(entry.hours), 0)
                return (
                  <div key={day} className="rounded-xl border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarBlank size={16} />
                        <p className="font-medium">{new Date(`${day}T00:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                      </div>
                      <Badge>{dayTotal.toFixed(2)}u</Badge>
                    </div>
                    <div className="space-y-2">
                      {dayEntries.map((entry) => (
                        <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{entry.description}</p>
                            <p className="text-sm text-muted-foreground">
                              {(entry.customer_id && customerMap[entry.customer_id]) || 'Geen klant'}
                              {entry.project_name ? ` • ${entry.project_name}` : ''}
                              {entry.hourly_rate ? ` • €${Number(entry.hourly_rate).toFixed(2)}/u` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="font-semibold">{parseHours(entry.hours).toFixed(2)}u</p>
                            <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openForm(entry)}>
                              <PencilSimple size={14} className="mr-1 text-emerald-500" />Bewerken
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void handleDeleteEntry(entry)}>
                              <TrashSimple size={14} className="mr-1 text-red-500" />Verwijderen
                            </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CurrencyEur size={20} />Gefactureerde uren</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={invoicedFilterCustomerId || NO_CUSTOMER} onValueChange={(value) => setInvoicedFilterCustomerId(value === NO_CUSTOMER ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter op klant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CUSTOMER}>Alle klanten</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={invoicedFilterStart} onChange={(event) => setInvoicedFilterStart(event.target.value)} />
            <Input type="date" value={invoicedFilterEnd} onChange={(event) => setInvoicedFilterEnd(event.target.value)} />
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : filteredInvoicedEntries.length === 0 ? (
            <p className="text-muted-foreground">Geen gefactureerde uren gevonden.</p>
          ) : (
            <div className="space-y-2">
              {filteredInvoicedEntries.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 bg-muted/20">
                  <div>
                    <p className="font-medium">{entry.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(`${entry.entry_date}T00:00:00`).toLocaleDateString('nl-NL')} • {parseHours(entry.hours).toFixed(2)}u
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">Factuur</p>
                    {entry.invoice_id ? (
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={() => navigateTo(`/zzp/invoices/${entry.invoice_id}`)}
                      >
                        {invoiceNumberMap[entry.invoice_id] || `#${entry.invoice_id.slice(0, 8)}`}
                      </button>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Open uren bewerken' : 'Uren toevoegen'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {formError && (
              <Alert className="border-destructive/40 bg-destructive/5">
                <WarningCircle size={16} weight="fill" />
                <AlertDescription>
                  <p>{formError}</p>
                  {formValidationErrors.length > 0 && (
                    <ul className="mt-2 list-disc pl-4">
                      {formValidationErrors.map((validationError) => (
                        <li key={validationError}>{validationError}</li>
                      ))}
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={formState.entry_date} onChange={(event) => setFormState((prev) => ({ ...prev, entry_date: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Uren</Label>
              <Input type="number" min="0.25" step="0.25" value={formState.hours} onChange={(event) => setFormState((prev) => ({ ...prev, hours: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Omschrijving</Label>
              <Textarea value={formState.description} onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Klant</Label>
              <Select value={formState.customer_id || NO_CUSTOMER} onValueChange={(value) => setFormState((prev) => ({ ...prev, customer_id: value === NO_CUSTOMER ? '' : value }))}>
                <SelectTrigger><SelectValue placeholder="Kies klant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOMER}>Geen klant</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Input value={formState.project_name} onChange={(event) => setFormState((prev) => ({ ...prev, project_name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Uurtarief (€)</Label>
              <Input type="number" min="0" step="0.01" value={formState.hourly_rate} onChange={(event) => setFormState((prev) => ({ ...prev, hourly_rate: event.target.value }))} />
            </div>
            <div className="flex justify-end">
              <Button disabled={isSavingEntry} onClick={() => void saveEntry()}>
                {isSavingEntry ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ZZPTimeTrackingPage
