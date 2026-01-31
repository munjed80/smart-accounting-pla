import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Database, Envelope, ArrowLeft, CheckCircle } from '@phosphor-icons/react'
import { t } from '@/i18n'

interface ForgotPasswordPageProps {
  onNavigateToLogin: () => void
}

export const ForgotPasswordPage = ({ onNavigateToLogin }: ForgotPasswordPageProps) => {
  const { forgotPassword, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await forgotPassword(email)
      setSubmitted(true)
    } catch {
      // Error is handled in AuthContext with toast
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Database size={48} weight="duotone" className="text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              {t('brand.name')}
            </h1>
          </div>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
          {!submitted ? (
            <>
              <CardHeader>
                <CardTitle>{t('auth.forgotPasswordTitle')}</CardTitle>
                <CardDescription>
                  {t('auth.forgotPasswordDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('auth.email')}</Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="email"
                        type="email"
                        placeholder="uw@email.nl"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t('common.sending') : t('auth.sendResetLink')}
                  </Button>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={onNavigateToLogin}
                  >
                    <ArrowLeft size={18} className="mr-2" />
                    {t('auth.backToLogin')}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <CheckCircle size={48} weight="fill" className="text-green-500" />
                </div>
                <CardTitle>{t('auth.resetEmailSent')}</CardTitle>
                <CardDescription>
                  {t('auth.resetEmailSentDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary/50 rounded-lg text-sm text-muted-foreground text-center">
                  <p>{t('auth.didntReceiveEmail')}</p>
                  <p className="mt-1">{t('auth.checkSpamFolder')}</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSubmitted(false)}
                >
                  {t('auth.tryAgain')}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={onNavigateToLogin}
                >
                  <ArrowLeft size={18} className="mr-2" />
                  {t('auth.backToLogin')}
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
