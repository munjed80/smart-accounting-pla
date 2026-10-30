import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Lock, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'
import { BrandLockup } from '@/components/BrandLockup'

interface ResetPasswordPageProps {
  token: string
  onNavigateToLogin: () => void
}

export const ResetPasswordPage = ({ token, onNavigateToLogin }: ResetPasswordPageProps) => {
  const { resetPassword, isLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [success, setSuccess] = useState(false)
  const [failed, setFailed] = useState(false)

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = []
    if (pwd.length < 10) {
      errors.push('Gebruik minimaal 10 tekens')
    }
    if (!/[A-Za-z]/.test(pwd)) {
      errors.push('Gebruik minimaal één letter')
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push('Gebruik minimaal één cijfer')
    }
    return errors
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])
    setFailed(false)

    // Validate password
    const passwordErrors = validatePassword(password)
    if (passwordErrors.length > 0) {
      setErrors(passwordErrors)
      return
    }

    // Check passwords match
    if (password !== confirmPassword) {
      setErrors(['De wachtwoorden komen niet overeen'])
      return
    }

    if (!token) {
      setErrors(['De resetlink ontbreekt'])
      return
    }

    try {
      await resetPassword(token, password)
      setSuccess(true)
    } catch {
      setFailed(true)
      setErrors(['Deze resetlink is ongeldig of verlopen. Vraag een nieuwe link aan.'])
    }
  }

  if (success) {
    return (
      <div className="auth-page min-h-screen bg-background flex items-center justify-center p-4">

        <div className="relative w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <BrandLockup size="lg" />
            </div>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle size={48} weight="fill" className="text-green-500" />
              </div>
              <CardTitle className="text-green-600">Je wachtwoord is gewijzigd</CardTitle>
              <CardDescription>
                Je kunt nu inloggen met je nieuwe wachtwoord.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={onNavigateToLogin} className="w-full">
                Naar inloggen
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page min-h-screen bg-background flex items-center justify-center p-4">

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <BrandLockup size="lg" />
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            {failed ? (
              <>
                <div className="flex justify-center mb-4">
                  <XCircle size={48} weight="fill" className="text-red-500" />
                </div>
                <CardTitle className="text-red-600 text-center">Wachtwoord wijzigen niet gelukt</CardTitle>
                <CardDescription className="text-center">
                  Deze resetlink is ongeldig of verlopen.
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle>Wachtwoord wijzigen</CardTitle>
                <CardDescription>
                  Kies hieronder je nieuwe wachtwoord.
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {failed ? (
              <div className="space-y-4">
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 text-sm">
                    <Warning size={16} />
                    <span>Vraag een nieuwe link aan om je wachtwoord te wijzigen.</span>
                  </div>
                </div>
                <Button onClick={onNavigateToLogin} variant="outline" className="w-full">
                  Terug naar inloggen
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {errors.length > 0 && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <ul className="text-red-700 dark:text-red-400 text-sm space-y-1">
                      {errors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">Nieuw wachtwoord</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-muted-foreground" size={18} />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={10}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimaal 10 tekens met letters en cijfers
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Herhaal je wachtwoord</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-muted-foreground" size={18} />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Bezig met wijzigen...' : 'Wachtwoord wijzigen'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
