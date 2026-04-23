/**
 * About & Version info card from SettingsPage.
 *
 * Extracted as a presentational subcomponent. Behavior is unchanged.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from '@phosphor-icons/react'
import { getBuildDate, PACKAGE_VERSION_ONLY } from '@/lib/version'

export const AboutVersionCard = () => (
  <Card className="bg-card/80 backdrop-blur-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Info size={20} weight="duotone" />
        Over deze applicatie
      </CardTitle>
      <CardDescription>
        Versie-informatie en systeemdetails
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-3">
        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-muted-foreground">Versie</span>
          <Badge variant="secondary" className="font-mono text-xs">
            {PACKAGE_VERSION_ONLY}
          </Badge>
        </div>

        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-muted-foreground">Volledige versie</span>
          <Badge variant="outline" className="font-mono text-xs">
            {PACKAGE_VERSION_ONLY}
          </Badge>
        </div>

        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-muted-foreground">Laatste build</span>
          <span className="text-sm font-medium">
            {getBuildDate()}
          </span>
        </div>
      </div>

      <Separator />

      <Alert>
        <Info size={16} />
        <AlertDescription className="text-xs">
          <strong>Smart Accounting Platform</strong> — Professioneel boekhoudplatform voor ZZP'ers en accountants.
          {' '}Versie: <code className="text-xs bg-muted px-1 py-0.5 rounded">{PACKAGE_VERSION_ONLY}</code>
        </AlertDescription>
      </Alert>
    </CardContent>
  </Card>
)

export default AboutVersionCard
