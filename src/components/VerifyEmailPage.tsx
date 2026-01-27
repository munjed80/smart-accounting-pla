import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Database, CheckCircle, XCircle, Spinner, Warning } from '@phosphor-icons/react'

interface VerifyEmailPageProps {
  token: string
  onNavigateToLogin: () => void
}

type VerifyState = 'verifying' | 'success' | 'already_verified' | 'error'

export const VerifyEmailPage = ({ token, onNavigateToLogin }: VerifyEmailPageProps) => {
  const { verifyEmail, isLoading } = useAuth()
  const [state, setState] = useState<VerifyState>('verifying')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setState('error')
        setErrorMessage('No verification token provided')
        return
      }

      try {
        const response = await verifyEmail(token)
        if (response.message?.includes('already verified')) {
          setState('already_verified')
        } else {
          setState('success')
        }
      } catch (error) {
        setState('error')
        setErrorMessage('Invalid or expired verification link. Please request a new one.')
      }
    }

    verify()
  }, [token, verifyEmail])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Database size={48} weight="duotone" className="text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Smart Accounting
            </h1>
          </div>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
          <CardHeader className="text-center">
            {(state === 'verifying' || isLoading) && (
              <>
                <div className="flex justify-center mb-4">
                  <Spinner size={48} className="text-primary animate-spin" />
                </div>
                <CardTitle>Verifying Your Email</CardTitle>
                <CardDescription>Please wait while we verify your email address...</CardDescription>
              </>
            )}
            
            {state === 'success' && (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle size={48} weight="fill" className="text-green-500" />
                </div>
                <CardTitle className="text-green-600">Email Verified!</CardTitle>
                <CardDescription>Your email has been verified successfully. You can now log in to your account.</CardDescription>
              </>
            )}
            
            {state === 'already_verified' && (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle size={48} weight="fill" className="text-blue-500" />
                </div>
                <CardTitle className="text-blue-600">Already Verified</CardTitle>
                <CardDescription>Your email address is already verified. You can log in to your account.</CardDescription>
              </>
            )}
            
            {state === 'error' && (
              <>
                <div className="flex justify-center mb-4">
                  <XCircle size={48} weight="fill" className="text-red-500" />
                </div>
                <CardTitle className="text-red-600">Verification Failed</CardTitle>
                <CardDescription>{errorMessage}</CardDescription>
              </>
            )}
          </CardHeader>
          
          <CardContent className="text-center">
            {(state === 'success' || state === 'already_verified') && (
              <Button onClick={onNavigateToLogin} className="w-full">
                Go to Login
              </Button>
            )}
            
            {state === 'error' && (
              <div className="space-y-3">
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 text-sm">
                    <Warning size={16} />
                    <span>The link may have expired or already been used.</span>
                  </div>
                </div>
                <Button onClick={onNavigateToLogin} variant="outline" className="w-full">
                  Back to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
