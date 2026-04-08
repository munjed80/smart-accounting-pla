/**
 * Belastinghulp – Jaaroverzicht
 *
 * Annual summary page for ZZP users showing key financial totals
 * for the fiscal year. Placeholder layout while backend logic is
 * being developed.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChartBar, CalendarBlank } from '@phosphor-icons/react'

export const BelastinghulpJaaroverzichtPage = () => {
  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Jaaroverzicht</h1>
        <p className="text-muted-foreground mt-1">
          Totaaloverzicht van je financiële gegevens voor het boekjaar {currentYear}.
        </p>
      </div>

      {/* Year selector hint */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CalendarBlank size={24} weight="duotone" className="text-primary" />
            <div>
              <CardTitle>Boekjaar {currentYear}</CardTitle>
              <CardDescription>Samenvatting van inkomsten, uitgaven en belastingen</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Totale omzet</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Totale kosten</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Winst voor belasting</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">BTW afgedragen</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quarterly breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ChartBar size={24} weight="duotone" className="text-primary" />
            <div>
              <CardTitle>Kwartaaloverzicht</CardTitle>
              <CardDescription>Omzet en kosten per kwartaal</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
              <div key={q} className="rounded-lg border p-4">
                <p className="text-sm font-medium">{q} {currentYear}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Omzet</span>
                    <span>€ 0,00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kosten</span>
                    <span>€ 0,00</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Badge variant="secondary">Binnenkort beschikbaar</Badge>
            <span className="text-sm text-muted-foreground">
              Automatisch gegenereerd op basis van je boekhouding
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
