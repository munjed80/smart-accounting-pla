import { useState } from 'react'
import { zzpBtwApi, getErrorMessage } from '@/lib/api'
import type { VatPolicy } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function VatPolicySetup({
  policy,
  year,
  quarter,
  onSaved,
}: {
  policy?: VatPolicy | null
  year: number
  quarter: number
  onSaved: () => Promise<void>
}) {
  const [basis, setBasis] = useState<'' | 'factuurstelsel' | 'kasstelsel'>('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const effectiveFrom = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`
  const future = new Date(`${effectiveFrom}T00:00:00`) > new Date()
  const save = async () => {
    if (!basis || !acknowledged || saving || future) return
    setSaving(true)
    setError(null)
    try {
      await zzpBtwApi.confirmPolicy(basis, effectiveFrom)
      await onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold leading-none">
          BTW-stelsel bevestigen
        </h2>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {policy ? (
          <p>
            Het stelsel {policy.basis} is bevestigd vanaf{' '}
            {policy.effective_from}. Eerdere perioden blijven historische
            schattingen. Een overgang naar een ander stelsel vraagt begeleiding
            door je boekhouder.
          </p>
        ) : (
          <>
            <p>
              Bevestig met je boekhouder welk stelsel voor je onderneming geldt
              vanaf Q{quarter} {year}. Eerdere perioden worden niet automatisch
              aangepast. Dit is geen knop om later vrij tussen stelsels te
              wisselen.
            </p>
            <div className="space-y-2">
              <label htmlFor="vat-basis" className="block font-medium">
                Stelsel
              </label>
              <select
                id="vat-basis"
                value={basis}
                disabled={saving}
                onChange={(e) => setBasis(e.target.value as typeof basis)}
                className="w-full rounded-md border border-input bg-background p-3"
              >
                <option value="">Kies na controle met je boekhouder</option>
                <option value="factuurstelsel">
                  Factuurstelsel — verkoop op factuurdatum
                </option>
                <option value="kasstelsel">
                  Kasstelsel — verkoop op ontvangen betalingen
                </option>
              </select>
            </div>
            <p className="text-muted-foreground">
              Bij het kasstelsel tellen gekoppelde deelbetalingen mee.
              Voorbelasting blijft gebaseerd op ontvangen inkoopfacturen.
              Controleer bijzondere transacties, KOR, vrijstelling en verlegging
              apart.
            </p>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={saving}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span>
                Ik heb het juiste stelsel en de ingangsperiode gecontroleerd.
                Dit bevestigt een bestaande fiscale situatie; het vraagt geen
                wijziging aan bij de Belastingdienst.
              </span>
            </label>
            {future && (
              <p>Kies een gestart kwartaal om het stelsel te bevestigen.</p>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <Button
              onClick={save}
              disabled={!basis || !acknowledged || saving || future}
            >
              {saving ? 'Opslaan…' : `Bevestigen vanaf Q${quarter} ${year}`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
