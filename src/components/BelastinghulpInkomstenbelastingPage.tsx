/**
 * Belastinghulp – Inkomstenbelasting
 *
 * Self-service page for ZZP users to prepare their annual
 * income-tax return. Placeholder layout while backend logic is
 * being developed.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CurrencyEur, CheckCircle } from '@phosphor-icons/react'

export const BelastinghulpInkomstenbelastingPage = () => {
  const checklistItems = [
    { label: 'Alle facturen ingevoerd', done: false },
    { label: 'Alle uitgaven verwerkt', done: false },
    { label: 'Zakelijke kilometers opgegeven', done: false },
    { label: 'Privégebruik auto berekend', done: false },
    { label: 'Zelfstandigenaftrek toegepast', done: false },
    { label: 'Startersaftrek gecontroleerd', done: false },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inkomstenbelasting</h1>
        <p className="text-muted-foreground mt-1">
          Overzicht en voorbereiding van je jaarlijkse aangifte inkomstenbelasting.
        </p>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CurrencyEur size={24} weight="duotone" className="text-primary" />
            <div>
              <CardTitle>Belastbaar inkomen</CardTitle>
              <CardDescription>Schatting op basis van je huidige boekhouding</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Omzet</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Kosten</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">Winst (schatting)</p>
              <p className="text-2xl font-semibold mt-1">€ 0,00</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Voorbereidingschecklist</CardTitle>
          <CardDescription>
            Zorg dat alle punten zijn afgevinkt voordat je je aangifte indient.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {checklistItems.map((item) => (
              <li key={item.label} className="flex items-center gap-3">
                <CheckCircle
                  size={20}
                  weight={item.done ? 'fill' : 'regular'}
                  className={item.done ? 'text-green-600' : 'text-muted-foreground'}
                />
                <span className={`text-sm ${item.done ? 'line-through text-muted-foreground' : ''}`}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2">
            <Badge variant="secondary">Binnenkort beschikbaar</Badge>
            <span className="text-sm text-muted-foreground">
              Automatische controle en suggesties
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
