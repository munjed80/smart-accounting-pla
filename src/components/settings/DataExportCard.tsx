/**
 * Data Export / Backup card from SettingsPage.
 *
 * Extracted as a presentational subcomponent. Behavior is unchanged.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FloppyDisk, Info } from '@phosphor-icons/react'

interface DataExportCardProps {
  onExportJSON: () => void | Promise<void>
  onExportCSV: () => void | Promise<void>
}

export const DataExportCard = ({ onExportJSON, onExportCSV }: DataExportCardProps) => (
  <Card className="bg-card/80 backdrop-blur-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <FloppyDisk size={20} weight="duotone" />
        Data export & backup
      </CardTitle>
      <CardDescription>
        Exporteer je bedrijfsgegevens als backup of voor externe verwerking
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Download een complete export van je bedrijfsgegevens inclusief:
        </p>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
          <li>Bedrijfsprofiel en contactgegevens</li>
          <li>Klanten</li>
          <li>Facturen en betalingen</li>
          <li>Uitgaven en bonnetjes</li>
          <li>Uren registratie</li>
          <li>Afspraken</li>
        </ul>
      </div>
      <div className="flex gap-3 pt-4">
        <Button variant="outline" className="flex-1" onClick={onExportJSON}>
          <FloppyDisk size={18} className="mr-2" />
          Exporteer als JSON
        </Button>
        <Button variant="outline" className="flex-1" onClick={onExportCSV}>
          <FloppyDisk size={18} className="mr-2" />
          Exporteer als CSV
        </Button>
      </div>
      <Alert>
        <Info size={16} />
        <AlertDescription>
          De export bevat alle gegevens in je huidige administratie. Bewaar de export veilig.
        </AlertDescription>
      </Alert>
    </CardContent>
  </Card>
)

export default DataExportCard
