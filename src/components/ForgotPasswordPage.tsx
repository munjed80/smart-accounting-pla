import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Database, Envelope, ArrowLeft, CheckCircle } from '@phosphor-icons/react'

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
              Smart Accounting
            </h1>
          </div>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
          {!submitted ? (
            <>
              <CardHeader>
                <CardTitle>Forgot Password</CardTitle>
                <CardDescription>
                  Enter your email address and we'll send you a link to reset your password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={onNavigateToLogin}
                  >
                    <ArrowLeft size={18} className="mr-2" />
                    Back to Login
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
                <CardTitle>Check Your Email</CardTitle>
                <CardDescription>
                  If an account with this email exists, you'll receive a password reset link shortly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary/50 rounded-lg text-sm text-muted-foreground text-center">
                  <p>Didn't receive an email?</p>
                  <p className="mt-1">Check your spam folder or try again with a different email address.</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSubmitted(false)}
                >
                  Try Again
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={onNavigateToLogin}
                >
                  <ArrowLeft size={18} className="mr-2" />
                  Back to Login
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
