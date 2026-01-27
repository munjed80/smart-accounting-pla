import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Database, Lock, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'

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
      errors.push('Password must be at least 10 characters')
    }
    if (!/[A-Za-z]/.test(pwd)) {
      errors.push('Password must contain at least one letter')
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push('Password must contain at least one number')
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
      setErrors(['Passwords do not match'])
      return
    }

    if (!token) {
      setErrors(['No reset token provided'])
      return
    }

    try {
      await resetPassword(token, password)
      setSuccess(true)
    } catch {
      setFailed(true)
      setErrors(['Invalid or expired reset link. Please request a new one.'])
    }
  }

  if (success) {
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
              <div className="flex justify-center mb-4">
                <CheckCircle size={48} weight="fill" className="text-green-500" />
              </div>
              <CardTitle className="text-green-600">Password Reset!</CardTitle>
              <CardDescription>
                Your password has been reset successfully. You can now log in with your new password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={onNavigateToLogin} className="w-full">
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
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
          <CardHeader>
            {failed ? (
              <>
                <div className="flex justify-center mb-4">
                  <XCircle size={48} weight="fill" className="text-red-500" />
                </div>
                <CardTitle className="text-red-600 text-center">Reset Failed</CardTitle>
                <CardDescription className="text-center">
                  The reset link is invalid or has expired.
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle>Reset Password</CardTitle>
                <CardDescription>
                  Enter your new password below.
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
                    <span>Please request a new password reset link.</span>
                  </div>
                </div>
                <Button onClick={onNavigateToLogin} variant="outline" className="w-full">
                  Back to Login
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
                  <Label htmlFor="password">New Password</Label>
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
                    At least 10 characters with letters and numbers
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
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
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
