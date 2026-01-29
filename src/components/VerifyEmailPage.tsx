import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Database, CheckCircle, XCircle, Spinner, Warning, Clock } from '@phosphor-icons/react'
import { AxiosError } from 'axios'

interface VerifyEmailPageProps {
  token: string
  onNavigateToLogin: () => void
}

type VerifyState = 'verifying' | 'success' | 'already_verified' | 'error' | 'rate_limited'

export const VerifyEmailPage = ({ token, onNavigateToLogin }: VerifyEmailPageProps) => {
  const { verifyEmail } = useAuth()
  const [state, setState] = useState<VerifyState>('verifying')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isVerifying, setIsVerifying] = useState(false)
  
  // Track if we've already submitted for this token to prevent duplicate calls
  const hasSubmittedRef = useRef<string | null>(null)

  useEffect(() => {
    // Abort controller for cleanup on unmount
    const abortController = new AbortController()
    
    const verify = async () => {
      if (!token) {
        setState('error')
        setErrorMessage('No verification token provided')
        return
      }

      // Guard: prevent duplicate calls for the same token
      if (hasSubmittedRef.current === token) {
        return
      }
      hasSubmittedRef.current = token
      
      setIsVerifying(true)

      try {
        const response = await verifyEmail(token)
        
        // Check if component is still mounted before updating state
        if (abortController.signal.aborted) return
        
        if (response.message?.includes('already verified')) {
          setState('already_verified')
        } else {
          setState('success')
        }
      } catch (error) {
        // Check if component is still mounted before updating state
        if (abortController.signal.aborted) return
        
        // Handle 429 rate limit error specifically
        if (error instanceof AxiosError && error.response?.status === 429) {
          setState('rate_limited')
          setErrorMessage('Too many attempts. Please wait 60 seconds and try again.')
        } else {
          setState('error')
          setErrorMessage('Invalid or expired verification link. Please request a new one.')
        }
      } finally {
        // Always set loading to false to prevent infinite spinner
        if (!abortController.signal.aborted) {
          setIsVerifying(false)
        }
      }
    }

    verify()
    
    // Cleanup on unmount to prevent state updates
    return () => {
      abortController.abort()
    }
  }, [token, verifyEmail])

  const showSpinner = state === 'verifying' || isVerifying

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
            {showSpinner && (
              <>
                <div className="flex justify-center mb-4">
                  <Spinner size={48} className="text-primary animate-spin" />
                </div>
                <CardTitle>Verifying Your Email</CardTitle>
                <CardDescription>Please wait while we verify your email address...</CardDescription>
              </>
            )}
            
            {!showSpinner && state === 'success' && (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle size={48} weight="fill" className="text-green-500" />
                </div>
                <CardTitle className="text-green-600">Email Verified!</CardTitle>
                <CardDescription>Your email has been verified successfully. You can now log in to your account.</CardDescription>
              </>
            )}
            
            {!showSpinner && state === 'already_verified' && (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle size={48} weight="fill" className="text-blue-500" />
                </div>
                <CardTitle className="text-blue-600">Already Verified</CardTitle>
                <CardDescription>Your email address is already verified. You can log in to your account.</CardDescription>
              </>
            )}
            
            {!showSpinner && state === 'rate_limited' && (
              <>
                <div className="flex justify-center mb-4">
                  <Clock size={48} weight="fill" className="text-orange-500" />
                </div>
                <CardTitle className="text-orange-600">Too Many Requests</CardTitle>
                <CardDescription>{errorMessage}</CardDescription>
              </>
            )}
            
            {!showSpinner && state === 'error' && (
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
            {!showSpinner && (state === 'success' || state === 'already_verified') && (
              <Button onClick={onNavigateToLogin} className="w-full">
                Go to Login
              </Button>
            )}
            
            {!showSpinner && state === 'rate_limited' && (
              <div className="space-y-3">
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-sm">
                    <Warning size={16} />
                    <span>Please wait and try clicking the verification link again.</span>
                  </div>
                </div>
                <Button onClick={onNavigateToLogin} variant="outline" className="w-full">
                  Back to Login
                </Button>
              </div>
            )}
            
            {!showSpinner && state === 'error' && (
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
