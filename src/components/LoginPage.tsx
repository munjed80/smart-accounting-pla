import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth, isEmailNotVerifiedError, getEmailNotVerifiedMessage } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Database, Lock, User, Envelope, CheckCircle, PaperPlaneTilt, Warning, CircleNotch, Clock } from '@phosphor-icons/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getApiBaseUrl, isApiMisconfigured, getApiMisconfigurationReason, getErrorMessage, getValidationErrors } from '@/lib/api'
import { AxiosError } from 'axios'
import { t } from '@/i18n'

interface LoginPageProps {
  onSuccess?: (user: { role: string } | null) => void
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

  // State for visible error messages (in addition to toasts)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [registerError, setRegisterError] = useState<string | null>(null)
  
  // State for field-level validation errors (for 422 responses)
  const [registerFieldErrors, setRegisterFieldErrors] = useState<Record<string, string>>({})

  // State for resend verification cooldown
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isResending, setIsResending] = useState(false)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
      }
    }
  }, [])

  // Start cooldown timer
  const startCooldownTimer = useCallback((seconds: number) => {
    // Clear any existing timer
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current)
    }
    
    setResendCooldown(seconds)
    
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current)
            cooldownTimerRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setShowEmailNotVerified(false)
    setLoginError(null)
    
    try {
      const loggedInUser = await login(loginForm)
      onSuccess?.(loggedInUser)
    } catch (error) {
      if (isEmailNotVerifiedError(error)) {
        setShowEmailNotVerified(true)
        setUnverifiedEmail(loginForm.username)
      } else {
        // Set visible error message (in addition to toast)
        const errorMessage = getErrorMessage(error)
        setLoginError(errorMessage)
      }
    }
  }

  const handleResendVerification = async () => {
    const email = showEmailNotVerified ? unverifiedEmail : registeredEmail
    if (!email || isResending || resendCooldown > 0) {
      return
    }
    
    setIsResending(true)
    try {
      await resendVerification(email)
      // Start cooldown after successful resend
      startCooldownTimer(60)
    } catch (error) {
      // Handle 429 rate limit error - start cooldown
      if (error instanceof AxiosError && error.response?.status === 429) {
        // Start cooldown timer on rate limit
        startCooldownTimer(60)
      }
      // Other errors are handled in AuthContext
    } finally {
      setIsResending(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterError(null)
    setRegisterFieldErrors({})
    
    try {
      await register(registerForm)
      setRegisteredEmail(registerForm.email)
      setRegistrationSuccess(true)
      setRegisterForm({
        email: '',
        password: '',
        full_name: '',
        role: 'zzp',
      })
    } catch (error) {
      // Extract field-level validation errors for inline display
      const fieldErrors = getValidationErrors(error)
      if (Object.keys(fieldErrors).length > 0) {
        setRegisterFieldErrors(fieldErrors)
      }
      // Set visible error message (in addition to toast)
      const errorMessage = getErrorMessage(error)
      setRegisterError(errorMessage)
    }
  }

  const apiUrl = getApiBaseUrl()
  const isMisconfigured = isApiMisconfigured()
  const misconfigurationReason = getApiMisconfigurationReason()

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
                {t('brand.name')}
              </h1>
            </div>
          </div>

          <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle size={48} weight="fill" className="text-green-500" />
              </div>
              <CardTitle className="text-green-600">{t('auth.checkEmail')}</CardTitle>
              <CardDescription>
                {t('auth.checkEmailDescription')} <strong>{registeredEmail}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-secondary/50 rounded-lg text-sm text-muted-foreground text-center">
                <p>{t('auth.verificationLinkInfo')}</p>
                <p className="mt-2">{t('auth.linkExpires')}</p>
              </div>
              
              {resendCooldown > 0 && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-sm">
                    <Clock size={16} />
                    <span>{t('auth.resendIn')} {resendCooldown}s</span>
                  </div>
                </div>
              )}
              
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={handleResendVerification}
                  disabled={isResending || resendCooldown > 0}
                  className="w-full"
                >
                  {isResending ? (
                    <CircleNotch size={18} className="mr-2 animate-spin" />
                  ) : (
                    <PaperPlaneTilt size={18} className="mr-2" />
                  )}
                  {isResending ? t('common.sending') : resendCooldown > 0 ? `${t('auth.resendIn')} ${resendCooldown}s` : t('auth.resendVerificationEmail')}
                </Button>
                
                <Button
                  variant="ghost"
                  onClick={() => setRegistrationSuccess(false)}
                  className="w-full"
                >
                  {t('auth.backToLogin')}
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
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white px-4 py-3 text-center z-50">
          <div className="flex items-center justify-center gap-2 font-medium">
            <Warning size={20} weight="bold" />
            <span>{t('api.configError')}</span>
          </div>
          <p className="text-sm mt-1">{misconfigurationReason}</p>
          <p className="text-xs mt-1 opacity-90">
            {t('api.currentApiUrl')}: <code className="bg-red-800 px-2 py-0.5 rounded">{apiUrl || '(not set)'}</code>
          </p>
        </div>
      )}
      
      <div className={`relative w-full max-w-md ${isMisconfigured ? 'mt-24' : ''}`}>
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Database size={48} weight="duotone" className="text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              {t('brand.name')}
            </h1>
          </div>
          <p className="text-muted-foreground">{t('brand.tagline')}</p>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="login">{t('auth.login')}</TabsTrigger>
            <TabsTrigger value="register">{t('auth.register')}</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <CardTitle>{t('auth.welcomeBack')}</CardTitle>
                <CardDescription>{t('auth.loginDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Email Not Verified Warning */}
                {showEmailNotVerified && (
                  <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-start gap-3">
                      <Warning size={20} className="text-yellow-600 dark:text-yellow-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-yellow-700 dark:text-yellow-400 font-medium text-sm">
                          {t('auth.emailNotVerified')}
                        </p>
                        <p className="text-yellow-600 dark:text-yellow-500 text-sm mt-1">
                          {t('auth.emailNotVerifiedDescription')}
                        </p>
                        {resendCooldown > 0 ? (
                          <p className="text-yellow-600 dark:text-yellow-500 text-sm mt-2 flex items-center gap-1">
                            <Clock size={14} />
                            {t('auth.waitToResend').replace('{seconds}', String(resendCooldown))}
                          </p>
                        ) : (
                          <Button
                            variant="link"
                            size="sm"
                            className="text-yellow-700 dark:text-yellow-400 p-0 h-auto mt-2"
                            onClick={handleResendVerification}
                            disabled={isResending || resendCooldown > 0}
                          >
                            {isResending ? (
                              <CircleNotch size={14} className="mr-1 animate-spin" />
                            ) : (
                              <PaperPlaneTilt size={14} className="mr-1" />
                            )}
                            {isResending ? t('common.sending') : t('auth.resendVerificationEmail')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Login Error Message - shown even if toast fails */}
                {loginError && (
                  <div role="alert" aria-live="polite" className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-start gap-3">
                      <Warning size={20} className="text-red-600 dark:text-red-400 mt-0.5" weight="fill" aria-hidden="true" />
                      <div className="flex-1">
                        <p className="text-red-700 dark:text-red-400 font-medium text-sm">
                          {t('auth.loginFailed')}
                        </p>
                        <p className="text-red-600 dark:text-red-500 text-sm mt-1">
                          {loginError}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t('auth.email')}</Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="uw@email.nl"
                        value={loginForm.username}
                        onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="login-password">{t('auth.password')}</Label>
                      {onForgotPassword && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="text-xs p-0 h-auto"
                          onClick={onForgotPassword}
                        >
                          {t('auth.forgotPassword')}
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
                    {isLoading ? t('auth.loggingIn') : t('auth.login')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <CardTitle>{t('auth.createAccount')}</CardTitle>
                <CardDescription>{t('auth.registerDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Register Error Message - shown even if toast fails */}
                {registerError && (
                  <div role="alert" aria-live="polite" className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-start gap-3">
                      <Warning size={20} className="text-red-600 dark:text-red-400 mt-0.5" weight="fill" aria-hidden="true" />
                      <div className="flex-1">
                        <p className="text-red-700 dark:text-red-400 font-medium text-sm">
                          {t('auth.registrationFailed')}
                        </p>
                        <p className="text-red-600 dark:text-red-500 text-sm mt-1">
                          {registerError}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">{t('auth.fullName')}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="Jan de Vries"
                        value={registerForm.full_name}
                        onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                        className={`pl-10 ${registerFieldErrors.full_name ? 'border-red-500' : ''}`}
                        aria-invalid={!!registerFieldErrors.full_name}
                        aria-describedby={registerFieldErrors.full_name ? 'register-name-error' : undefined}
                        required
                      />
                    </div>
                    {registerFieldErrors.full_name && (
                      <p id="register-name-error" className="text-xs text-red-500" role="alert">{registerFieldErrors.full_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">{t('auth.email')}</Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="uw@email.nl"
                        value={registerForm.email}
                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                        className={`pl-10 ${registerFieldErrors.email ? 'border-red-500' : ''}`}
                        aria-invalid={!!registerFieldErrors.email}
                        aria-describedby={registerFieldErrors.email ? 'register-email-error' : undefined}
                        required
                      />
                    </div>
                    {registerFieldErrors.email && (
                      <p id="register-email-error" className="text-xs text-red-500" role="alert">{registerFieldErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">{t('auth.password')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 text-muted-foreground" size={18} />
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="••••••••"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        className={`pl-10 ${registerFieldErrors.password ? 'border-red-500' : ''}`}
                        aria-invalid={!!registerFieldErrors.password}
                        aria-describedby={registerFieldErrors.password ? 'register-password-error' : 'register-password-hint'}
                        required
                        minLength={8}
                      />
                    </div>
                    {registerFieldErrors.password ? (
                      <p id="register-password-error" className="text-xs text-red-500" role="alert">{registerFieldErrors.password}</p>
                    ) : (
                      <p id="register-password-hint" className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-role">{t('auth.role')}</Label>
                    <Select
                      value={registerForm.role}
                      onValueChange={(value: 'zzp' | 'accountant') => 
                        setRegisterForm({ ...registerForm, role: value })
                      }
                    >
                      <SelectTrigger id="register-role" aria-describedby={registerFieldErrors.role ? 'register-role-error' : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zzp">{t('roles.zzpDescription')}</SelectItem>
                        <SelectItem value="accountant">{t('roles.accountant')}</SelectItem>
                        {/* Admin role is NOT available via public registration for security */}
                        {/* Admin users can only be created via database seed */}
                      </SelectContent>
                    </Select>
                    {registerFieldErrors.role && (
                      <p id="register-role-error" className="text-xs text-red-500" role="alert">{registerFieldErrors.role}</p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t('auth.creatingAccount') : t('auth.createAccount')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
