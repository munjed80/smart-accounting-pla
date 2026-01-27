import { useState } from 'react'
import { useAuth, isEmailNotVerifiedError, getEmailNotVerifiedMessage } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Database, Lock, User, Envelope, CheckCircle, PaperPlaneTilt, Warning } from '@phosphor-icons/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getApiBaseUrl, isApiMisconfigured } from '@/lib/api'

interface LoginPageProps {
  onSuccess?: () => void
  onForgotPassword?: () => void
}

export const LoginPage = ({ onSuccess, onForgotPassword }: LoginPageProps) => {
  const { login, register, resendVerification, isLoading } = useAuth()
  
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
  })

  const [registerForm, setRegisterForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'zzp' as 'zzp' | 'accountant',  // Admin role not allowed via public registration
  })

  // State for email not verified handling
  const [showEmailNotVerified, setShowEmailNotVerified] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState('')
  
  // State for registration success
  const [registrationSuccess, setRegistrationSuccess] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setShowEmailNotVerified(false)
    
    try {
      await login(loginForm)
      onSuccess?.()
    } catch (error) {
      if (isEmailNotVerifiedError(error)) {
        setShowEmailNotVerified(true)
        setUnverifiedEmail(loginForm.username)
      }
    }
  }

  const handleResendVerification = async () => {
    const email = showEmailNotVerified ? unverifiedEmail : registeredEmail
    if (email) {
      try {
        await resendVerification(email)
      } catch {
        // Error handled in AuthContext
      }
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await register(registerForm)
      setRegisteredEmail(registerForm.email)
      setRegistrationSuccess(true)
      setRegisterForm({
        email: '',
        password: '',
        full_name: '',
        role: 'zzp',
      })
    } catch (error) {
      console.error('Register error:', error)
    }
  }

  const apiUrl = getApiBaseUrl()
  const isMisconfigured = isApiMisconfigured()

  // Show registration success screen
  if (registrationSuccess) {
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
              <CardTitle className="text-green-600">Check Your Email</CardTitle>
              <CardDescription>
                We've sent a verification link to <strong>{registeredEmail}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-secondary/50 rounded-lg text-sm text-muted-foreground text-center">
                <p>Click the link in the email to verify your account.</p>
                <p className="mt-2">The link will expire in 24 hours.</p>
              </div>
              
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={handleResendVerification}
                  disabled={isLoading}
                  className="w-full"
                >
                  <PaperPlaneTilt size={18} className="mr-2" />
                  {isLoading ? 'Sending...' : 'Resend Verification Email'}
                </Button>
                
                <Button
                  variant="ghost"
                  onClick={() => setRegistrationSuccess(false)}
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      {/* API Misconfiguration Warning Banner */}
      {isMisconfigured && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-yellow-900 px-4 py-2 text-center text-sm font-medium z-50">
          <Warning size={16} className="inline mr-2" />
          Warning: API appears to be configured for localhost in production mode. Please check VITE_API_URL.
        </div>
      )}
      
      <div className={`relative w-full max-w-md ${isMisconfigured ? 'mt-12' : ''}`}>
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Database size={48} weight="duotone" className="text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Smart Accounting
            </h1>
          </div>
          <p className="text-muted-foreground">Professional accounting platform</p>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <CardTitle>Welcome Back</CardTitle>
                <CardDescription>Login to your accounting dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Email Not Verified Warning */}
                {showEmailNotVerified && (
                  <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-start gap-3">
                      <Warning size={20} className="text-yellow-600 dark:text-yellow-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-yellow-700 dark:text-yellow-400 font-medium text-sm">
                          Email not verified
                        </p>
                        <p className="text-yellow-600 dark:text-yellow-500 text-sm mt-1">
                          Please check your inbox for a verification email.
                        </p>
                        <Button
                          variant="link"
                          size="sm"
                          className="text-yellow-700 dark:text-yellow-400 p-0 h-auto mt-2"
                          onClick={handleResendVerification}
                          disabled={isLoading}
                        >
                          <PaperPlaneTilt size={14} className="mr-1" />
                          Resend verification email
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        value={loginForm.username}
                        onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="login-password">Password</Label>
                      {onForgotPassword && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="text-xs p-0 h-auto"
                          onClick={onForgotPassword}
                        >
                          Forgot password?
                        </Button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Logging in...' : 'Login'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>Register for a new accounting account</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="John Doe"
                        value={registerForm.full_name}
                        onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="your@email.com"
                        value={registerForm.email}
                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="••••••••"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        className="pl-10"
                        required
                        minLength={8}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">At least 8 characters</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-role">Role</Label>
                    <Select
                      value={registerForm.role}
                      onValueChange={(value: 'zzp' | 'accountant') => 
                        setRegisterForm({ ...registerForm, role: value })
                      }
                    >
                      <SelectTrigger id="register-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zzp">ZZP (Self-Employed)</SelectItem>
                        <SelectItem value="accountant">Accountant</SelectItem>
                        {/* Admin role is NOT available via public registration for security */}
                        {/* Admin users can only be created via database seed */}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Backend API: <code className="bg-secondary px-2 py-1 rounded">{apiUrl}</code>
        </p>
      </div>
    </div>
  )
}
