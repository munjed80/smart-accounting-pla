/**
 * Belastinghulp – BTW Aangifte
 *
 * Self-service page for ZZP users to prepare and review their
 * quarterly VAT (BTW) returns. Placeholder layout while backend
 * logic is being developed.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Receipt } from '@phosphor-icons/react'

export const BelastinghulpBTWPage = () => {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">BTW Aangifte</h1>
        <p className="text-muted-foreground mt-1">
          Bereid je BTW-aangifte voor en dien deze eenvoudig in bij de Belastingdienst.
        </p>
      </div>

      {/* Status overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Receipt size={24} weight="duotone" className="text-primary" />
            <div>
              <CardTitle>Huidig kwartaal</CardTitle>
              <CardDescription>Overzicht van je BTW-gegevens voor deze periode</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">BTW ontvangen</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">BTW betaald</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Te betalen / ontvangen</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder info */}
      <Card>
        <CardHeader>
          <CardTitle>Aangifte voorbereiden</CardTitle>
          <CardDescription>
            Zodra je facturen en uitgaven hebt ingevoerd, berekenen we automatisch je BTW-aangifte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">In ontwikkeling</Badge>
            <span className="text-sm text-muted-foreground">
              Automatische berekening en indienen via Digipoort
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
