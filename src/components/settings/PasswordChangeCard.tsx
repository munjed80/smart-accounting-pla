/**
 * Password Change card from SettingsPage.
 *
 * Extracted as a presentational subcomponent. Behavior is unchanged.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Gear, ArrowsClockwise, Info } from '@phosphor-icons/react'

export interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

interface PasswordChangeCardProps {
  passwordForm: PasswordForm
  setPasswordForm: React.Dispatch<React.SetStateAction<PasswordForm>>
  isChangingPassword: boolean
  onChangePassword: () => void | Promise<void>
}

export const PasswordChangeCard = ({
  passwordForm,
  setPasswordForm,
  isChangingPassword,
  onChangePassword,
}: PasswordChangeCardProps) => (
  <Card className="bg-card/80 backdrop-blur-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Gear size={20} weight="duotone" />
        Wachtwoord wijzigen
      </CardTitle>
      <CardDescription>
        Wijzig je accountwachtwoord voor extra beveiliging
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Huidig wachtwoord</Label>
          <Input
            id="currentPassword"
            type="password"
            placeholder="Voer huidig wachtwoord in"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
            disabled={isChangingPassword}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">Nieuw wachtwoord</Label>
          <Input
            id="newPassword"
            type="password"
            placeholder="Voer nieuw wachtwoord in"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
            disabled={isChangingPassword}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Bevestig nieuw wachtwoord</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Bevestig nieuw wachtwoord"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
            disabled={isChangingPassword}
          />
        </div>
      </div>
      <div className="flex justify-end pt-4">
        <Button onClick={onChangePassword} disabled={isChangingPassword}>
          {isChangingPassword && <ArrowsClockwise size={18} className="mr-2 animate-spin" />}
          Wachtwoord wijzigen
        </Button>
      </div>
      <Alert>
        <Info size={16} />
        <AlertDescription>
          Je wachtwoord moet minimaal 10 tekens bevatten en minimaal één letter en één cijfer bevatten
        </AlertDescription>
      </Alert>
    </CardContent>
  </Card>
)

export default PasswordChangeCard
