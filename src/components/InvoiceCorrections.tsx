import { useState, useRef, useEffect, useCallback } from 'react'
import Decimal from 'decimal.js'
import { creditNotesApi, getErrorMessage } from '@/lib/api'
import type { CreditSummary } from '@/lib/api'
import { useAuth } from '@/lib/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ServerPagination } from '@/components/ServerPagination'
import { useServerPagination } from '@/hooks/useServerPagination'
import { saveInvoicePdf } from '@/lib/invoicePdf'

const money = (value: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(
    value / 100,
  )
const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(
    new Date(),
  )
export function InvoiceCorrections({
  invoiceId,
  onChanged,
}: {
  invoiceId: string
  onChanged?: () => Promise<void>
}) {
  const { user } = useAuth()
  const owner = `${user?.id}:${invoiceId}`
  const currentOwner = useRef(owner)
  currentOwner.current = owner
  const notesPage = useServerPagination(owner, 20)
  const refundsPage = useServerPagination(owner, 20)
  const version = useRef(0)
  const [stored, setStored] = useState<{
    owner: string
    value: CreditSummary
  } | null>(null)
  const data = stored?.owner === owner ? stored.value : null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [issueDate, setIssueDate] = useState(today)
  const [acknowledged, setAcknowledged] = useState(false)
  const [noteId, setNoteId] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundDate, setRefundDate] = useState(today)
  const [reference, setReference] = useState('')
  const [refundAcknowledged, setRefundAcknowledged] = useState(false)
  const creation = useRef({ key: crypto.randomUUID(), payload: '' })
  const refundCreation = useRef({ key: crypto.randomUUID(), payload: '' })
  const load = useCallback(async () => {
    const current = ++version.current
    setLoading(true)
    setError(null)
    try {
      const value = await creditNotesApi.list(
        invoiceId,
        notesPage.offset,
        refundsPage.offset,
      )
      if (version.current !== current) return
      if (value.invoice_id !== invoiceId)
        throw new Error('De factuur is gewijzigd. Open het overzicht opnieuw.')
      setStored({ owner, value })
    } catch (err) {
      if (version.current === current) setError(getErrorMessage(err))
    } finally {
      if (version.current === current) setLoading(false)
    }
  }, [invoiceId, owner, notesPage.offset, refundsPage.offset])
  useEffect(() => {
    void load()
    return () => {
      version.current += 1
    }
  }, [load])
  useEffect(() => {
    setQuantities({})
    setReason('')
    setAcknowledged(false)
    setNoteId('')
    setRefundAmount('')
    setReference('')
    setRefundAcknowledged(false)
    setResult(null)
    setBusy(false)
  }, [owner])

  const requested = (data?.available_lines || []).map((line) => {
    const raw = quantities[line.id]?.trim().replace(',', '.') || '0'
    return {
      line,
      quantity: /^\d+(?:\.\d{1,3})?$/.test(raw) ? new Decimal(raw) : null,
    }
  })
  const invalid = requested.some(
    (item) => !item.quantity || item.quantity.gt(item.line.available_quantity),
  )
  const selected = requested.filter((item) => item.quantity?.gt(0))
  const estimate = selected.reduce((total, { line, quantity }) => {
    const original = new Decimal(line.quantity)
    const before = original.minus(line.available_quantity)
    const after = before.plus(quantity!)
    const delta = (cents: number) =>
      new Decimal(cents)
        .mul(after)
        .div(original)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .minus(
          new Decimal(cents)
            .mul(before)
            .div(original)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
        )
        .toNumber()
    return total + delta(line.net_cents) + delta(line.vat_cents)
  }, 0)
  const issue = async () => {
    if (
      !data ||
      invalid ||
      !selected.length ||
      !acknowledged ||
      busy ||
      loading
    )
      return
    const payload = {
      issue_date: issueDate,
      reason: reason.trim(),
      lines: selected.map((item) => ({
        invoice_line_id: item.line.id,
        quantity: item.quantity!.toFixed(),
      })),
    }
    const serialized = JSON.stringify(payload)
    if (creation.current.payload && creation.current.payload !== serialized)
      creation.current.key = crypto.randomUUID()
    creation.current.payload = serialized
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const issued = await creditNotesApi.issue(
        invoiceId,
        payload,
        creation.current.key,
      )
      if (currentOwner.current !== owner) return
      setResult(
        `Creditnota ${issued.number} uitgegeven. Het origineel blijft bewaard.`,
      )
      creation.current = { key: crypto.randomUUID(), payload: '' }
      setQuantities({})
      setReason('')
      setAcknowledged(false)
      await load()
      await onChanged?.()
    } catch (err) {
      if (currentOwner.current === owner) setError(getErrorMessage(err))
    } finally {
      if (currentOwner.current === owner) setBusy(false)
    }
  }
  const refundableNote = data?.credit_notes.find((note) => note.id === noteId)
  const refundLimit = Math.min(
    data?.refund_due_cents || 0,
    refundableNote
      ? refundableNote.total_cents - refundableNote.refunded_cents
      : 0,
  )
  const refundValue = /^\d+(?:[.,]\d{1,2})?$/.test(refundAmount)
    ? new Decimal(refundAmount.replace(',', '.')).mul(100)
    : null
  const validRefund =
    !!refundValue && refundValue.gt(0) && refundValue.lte(refundLimit)
  const recordRefund = async () => {
    if (
      !data ||
      !noteId ||
      !refundAcknowledged ||
      busy ||
      loading ||
      !/^\d+(?:[.,]\d{1,2})?$/.test(refundAmount)
    )
      return
    const amount = new Decimal(refundAmount.replace(',', '.')).mul(100)
    if (
      !amount.isInteger() ||
      !amount.gt(0) ||
      amount.gt(data.refund_due_cents)
    )
      return
    const payload = {
      refund_date: refundDate,
      amount_cents: amount.toNumber(),
      reference: reference.trim(),
    }
    const serialized = JSON.stringify({ noteId, ...payload })
    if (
      refundCreation.current.payload &&
      refundCreation.current.payload !== serialized
    )
      refundCreation.current.key = crypto.randomUUID()
    refundCreation.current.payload = serialized
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      await creditNotesApi.refund(noteId, payload, refundCreation.current.key)
      if (currentOwner.current !== owner) return
      setResult(
        'Terugbetaling geregistreerd. Er is vanuit dit programma geen geld overgemaakt.',
      )
      refundCreation.current = { key: crypto.randomUUID(), payload: '' }
      setRefundAmount('')
      setReference('')
      setRefundAcknowledged(false)
      await load()
      await onChanged?.()
    } catch (err) {
      if (currentOwner.current === owner) setError(getErrorMessage(err))
    } finally {
      if (currentOwner.current === owner) setBusy(false)
    }
  }
  const download = async (id: string, number: string) => {
    setBusy(true)
    setError(null)
    try {
      const blob = await creditNotesApi.pdf(id)
      if (currentOwner.current === owner) saveInvoicePdf(blob, number)
    } catch (err) {
      if (currentOwner.current === owner) setError(getErrorMessage(err))
    } finally {
      if (currentOwner.current === owner) setBusy(false)
    }
  }
  return (
    <section
      className="mt-6 border-t pt-5 space-y-4"
      aria-labelledby="invoice-corrections-title"
    >
      <h3 id="invoice-corrections-title" className="font-semibold">
        Creditnota’s en terugbetalingen
      </h3>
      <p className="text-sm text-muted-foreground">
        Voor prijsvermindering of retour. Het originele document en de
        betalingen blijven bewaard. Controleer fiscale uitzonderingen met je
        boekhouder.
      </p>
      {error && (
        <div role="alert" className="text-sm text-destructive">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Overzicht opnieuw ophalen
          </Button>
        </div>
      )}
      {result && (
        <p role="status" className="text-sm font-medium">
          {result}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm">
          Correcties laden…
        </p>
      )}
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt>Gecrediteerd</dt>
              <dd className="font-semibold">{money(data.credited_cents)}</dd>
            </div>
            <div>
              <dt>Nog te ontvangen</dt>
              <dd className="font-semibold">{money(data.outstanding_cents)}</dd>
            </div>
            <div>
              <dt>Terugbetaald</dt>
              <dd>{money(data.refunded_cents)}</dd>
            </div>
            <div>
              <dt>Nog terug te betalen</dt>
              <dd>{money(data.refund_due_cents)}</dd>
            </div>
          </dl>
          <fieldset
            disabled={busy || loading}
            className="space-y-3 rounded-lg border p-4"
          >
            <legend className="px-1 text-sm font-medium">
              Nieuwe creditnota
            </legend>
            <label className="block text-sm">
              Creditdatum
              <Input
                type="date"
                value={issueDate}
                max={today()}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </label>
            {data.available_lines
              .filter((line) => new Decimal(line.available_quantity).gt(0))
              .map((line) => (
                <div key={line.id} className="space-y-1 text-sm">
                  <label htmlFor={`credit-${line.id}`}>
                    {line.description} · maximaal {line.available_quantity}
                  </label>
                  <Input
                    id={`credit-${line.id}`}
                    aria-label={`Te crediteren: ${line.description}`}
                    inputMode="decimal"
                    maxLength={16}
                    value={quantities[line.id] || ''}
                    placeholder="0"
                    onChange={(e) =>
                      setQuantities({
                        ...quantities,
                        [line.id]: e.target.value,
                      })
                    }
                  />
                </div>
              ))}
            <label className="block text-sm">
              Reden
              <Input
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Prijsvermindering of retour"
              />
            </label>
            <p className="text-sm font-semibold">
              Creditbedrag inclusief btw: {money(estimate)}
            </p>
            {invalid && (
              <p className="text-sm text-destructive">
                Controleer de hoeveelheden; gebruik maximaal drie decimalen en
                niet meer dan beschikbaar.
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                Ik heb de regels en bedragen gecontroleerd. De creditnota wordt
                definitief en kan niet worden verwijderd.
              </span>
            </label>
            <Button
              type="button"
              onClick={issue}
              disabled={
                busy ||
                loading ||
                invalid ||
                !selected.length ||
                estimate <= 0 ||
                reason.trim().length < 3 ||
                !issueDate ||
                !acknowledged
              }
            >
              Creditnota uitgeven
            </Button>
          </fieldset>
          <ServerPagination
            {...notesPage}
            total={data.total}
            loading={loading || busy}
          />
          <ul className="space-y-3">
            {data.credit_notes.map((note) => (
              <li key={note.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>
                    {note.number} · {money(note.total_cents)}
                  </strong>
                  <span>{note.issue_date}</span>
                </div>
                <p className="break-words">{note.reason}</p>
                <p>
                  Bij {note.original_invoice_number} · terugbetaald{' '}
                  {money(note.refunded_cents)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void download(note.id, note.number)}
                >
                  PDF creditnota {note.number}
                </Button>
              </li>
            ))}
          </ul>
          {data.refund_due_cents > 0 && (
            <fieldset
              disabled={busy || loading}
              className="space-y-3 rounded-lg border p-4"
            >
              <legend className="px-1 text-sm font-medium">
                Uitgevoerde terugbetaling vastleggen
              </legend>
              <p className="text-sm text-muted-foreground">
                Maak het geld zelf over via je bank. Leg hier alleen een
                werkelijk uitgevoerde betaling vast.
              </p>
              <label className="block text-sm">
                Creditnota
                <select
                  value={noteId}
                  onChange={(e) => setNoteId(e.target.value)}
                  className="w-full rounded-md border bg-background p-2"
                >
                  <option value="">Kies een creditnota</option>
                  {data.credit_notes
                    .filter((note) => note.refunded_cents < note.total_cents)
                    .map((note) => (
                      <option key={note.id} value={note.id}>
                        {note.number}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                Terugbetaald bedrag in euro
                <Input
                  inputMode="decimal"
                  maxLength={16}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0,00"
                />
              </label>
              {noteId && (
                <p className="text-sm">
                  Maximaal te registreren: {money(refundLimit)}
                </p>
              )}
              <label className="block text-sm">
                Datum terugbetaling
                <Input
                  type="date"
                  value={refundDate}
                  max={today()}
                  onChange={(e) => setRefundDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Betalingskenmerk
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={255}
                />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={refundAcknowledged}
                  onChange={(e) => setRefundAcknowledged(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Deze terugbetaling is werkelijk uitgevoerd. Dit formulier
                  maakt geen geld over.
                </span>
              </label>
              <Button
                type="button"
                onClick={recordRefund}
                disabled={
                  busy ||
                  loading ||
                  !noteId ||
                  !validRefund ||
                  !refundDate ||
                  reference.trim().length < 3 ||
                  !refundAcknowledged
                }
              >
                Terugbetaling registreren
              </Button>
            </fieldset>
          )}
          {data.refunds.total > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">
                Geregistreerde terugbetalingen
              </h4>
              <ServerPagination
                {...refundsPage}
                total={data.refunds.total}
                loading={loading || busy}
              />
              <ul className="text-sm space-y-2">
                {data.refunds.items.map((refund) => (
                  <li key={refund.id} className="border-b py-2 break-words">
                    {refund.refund_date} · {refund.credit_note_number} ·{' '}
                    {money(refund.amount_cents)}
                    <p>{refund.reference}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
