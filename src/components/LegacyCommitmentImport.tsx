import { useState } from 'react'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { hasLegacyCommitments, readLegacyCommitments, type LegacyCommitmentCandidate } from '@/lib/legacyCommitments'
import { zzpApi, getErrorMessage } from '@/lib/api'

export function LegacyCommitmentImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<LegacyCommitmentCandidate[]>([])
  const [selected, setSelected] = useState(new Set<string>())
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  if (!hasLegacyCommitments() || done) return null
  const importRows = async () => {
    setBusy(true); setError('')
    try {
      for (const row of rows.filter(row => selected.has(row.key))) await zzpApi.commitments.create(row.payload)
      setDone(true); setOpen(false); onImported()
    } catch (error) { setError(getErrorMessage(error)) }
    finally { setBusy(false) }
  }
  return <>
    <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3">
      Oude lokale gegevens gevonden. Ze zijn nog niet aan een bedrijf gekoppeld.
      <Button variant="outline" onClick={() => { setRows(readLegacyCommitments()); setOpen(true) }}>Lokale gegevens beoordelen</Button>
    </AlertDescription></Alert>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader>
        <DialogTitle>Lokale verplichtingen importeren</DialogTitle>
        <DialogDescription>Selecteer alleen gegevens van dit bedrijf. De oorspronkelijke gegevens blijven in deze browser bewaard. Opnieuw proberen maakt geen tweede kopie.</DialogDescription>
      </DialogHeader>
        {rows.map(row => <label key={row.key} className="flex items-center gap-3 rounded border p-3">
          <Checkbox checked={selected.has(row.key)} disabled={busy} onCheckedChange={checked => setSelected(prev => { const next = new Set(prev); if (checked) next.add(row.key); else next.delete(row.key); return next })}/>
          <span>{row.name} · € {(row.payload.amount_cents / 100).toFixed(2)} · {row.payload.recurring_frequency}</span>
        </label>)}
        {rows.length === 0 && <p>Geen complete importeerbare gegevens gevonden. De brongegevens blijven bewaard.</p>}
        <label className="flex items-center gap-3"><Checkbox checked={confirmed} disabled={busy} onCheckedChange={value => setConfirmed(value === true)}/>Deze gegevens behoren tot mijn huidige bedrijf.</label>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button disabled={busy || !confirmed || selected.size === 0} onClick={importRows}>{busy ? 'Importeren...' : `${selected.size} verplichting(en) importeren`}</Button>
      </DialogContent>
    </Dialog>
  </>
}
