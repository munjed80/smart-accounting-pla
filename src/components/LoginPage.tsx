import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth, isEmailNotVerifiedError, getEmailNotVerifiedMessage } from '@/lib/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Lock, User, Envelope, CheckCircle, PaperPlaneTilt, Warning, CircleNotch, Clock, Eye, EyeSlash, ShieldCheck } from '@phosphor-icons/react'
import { BrandLockup } from '@/components/BrandLockup'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getApiBaseUrl, isApiMisconfigured, getApiMisconfigurationReason, getErrorMessage, getValidationErrors } from '@/lib/api'
import { AxiosError } from 'axios'
import { t } from '@/i18n'
import { useSeoMeta } from '@/hooks/useSeoMeta'

interface LoginPageProps {
  onSuccess?: (user: { role: string } | null) => void
  onForgotPassword?: () => void
}

export const LoginPage = ({ onSuccess, onForgotPassword }: LoginPageProps) => {
  const { login, register, resendVerification, isLoading } = useAuth()

  const [activeTab, setActiveTab] = useState<'login' | 'register'>(
    window.location.pathname === '/register' ? 'register' : 'login'
  )

  useSeoMeta({
    title: activeTab === 'register' ? "Start gratis — ZZPers Hub | Gratis factuur maken voor zzp'ers" : 'Inloggen | ZZPers Hub',
    description: activeTab === 'register'
      ? "Maak gratis een account aan bij ZZPers Hub. 90 dagen gratis facturen maken als zzp'er — geen creditcard vereist."
      : "Log in op uw ZZPers Hub account en beheer uw facturen, klanten en uren.",
    canonical: 'https://zzpershub.nl/login',
  })

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

  // State for password visibility toggles (login + register)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)

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
            <div className="flex items-center justify-center mb-4">
              <BrandLockup size="lg" />
            </div>
          </div>

          <Card className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl">
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
    <div className="relative min-h-screen overflow-hidden bg-[#0b0d12] text-foreground flex items-center justify-center px-4 py-10 sm:py-16">
      {/* Premium ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b0d12] via-[#0d1018] to-[#0b0d12]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(120,119,198,0.22),rgba(11,13,18,0))] blur-2xl" />
      <div className="pointer-events-none absolute bottom-[-15%] right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),rgba(11,13,18,0))] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:48px_48px]" />

      {/* API Misconfiguration Warning Banner */}
      {isMisconfigured && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white px-4 py-3 text-center z-50">
          <div className="flex items-center justify-center gap-2 font-medium">
            <Warning size={20} weight="bold" />
            <span>{t('api.configError')}</span>
          </div>
          <p className="text-sm mt-1">{misconfigurationReason}</p>
          {import.meta.env.DEV && (
            <p className="text-xs mt-1 opacity-90">
              {t('api.currentApiUrl')}: <code className="bg-red-800 px-2 py-0.5 rounded">{apiUrl || '(not set)'}</code>
            </p>
          )}
        </div>
      )}

      <div className={`relative w-full max-w-[440px] ${isMisconfigured ? 'mt-24' : ''}`}>
        {/* Header / brand */}
        <div className="text-center mb-8 sm:mb-10">
          <BrandLockup size="lg" className="mb-4" />
          <p className="text-sm text-white/55">{t('brand.tagline')}</p>
        </div>

        {/* Tab switcher — segmented pill */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'register')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-11 p-1 bg-white/[0.04] border border-white/10 rounded-xl backdrop-blur-md mb-5">
            <TabsTrigger
              value="login"
              className="h-full rounded-lg text-sm font-medium text-white/60 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] dark:data-[state=active]:bg-white/[0.08] dark:data-[state=active]:border-transparent transition-colors"
            >
              {t('auth.login')}
            </TabsTrigger>
            <TabsTrigger
              value="register"
              className="h-full rounded-lg text-sm font-medium text-white/60 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] dark:data-[state=active]:bg-white/[0.08] dark:data-[state=active]:border-transparent transition-colors"
            >
              {t('auth.register')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
              <CardHeader className="pb-3 sm:pb-4 px-6 pt-6 sm:px-7 sm:pt-7">
                <CardTitle className="text-xl font-semibold tracking-tight text-white">{t('auth.welcomeBack')}</CardTitle>
                <CardDescription className="text-white/55">{t('auth.loginDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 sm:px-7 sm:pb-7">
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
                  <div role="alert" aria-live="polite" className="mb-4 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                    <div className="flex items-start gap-3">
                      <Warning size={20} className="text-red-400 mt-0.5" weight="fill" aria-hidden="true" />
                      <div className="flex-1">
                        <p className="text-red-300 font-medium text-sm">
                          {t('auth.loginFailed')}
                        </p>
                        <p className="text-red-300/80 text-sm mt-1">
                          {loginError}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-xs font-medium uppercase tracking-wide text-white/60">
                      {t('auth.email')}
                    </Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} aria-hidden="true" />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        value={loginForm.username}
                        onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                        className="h-11 pl-10 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 hover:border-white/20 focus-visible:border-primary/60 focus-visible:ring-primary/30"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="login-password" className="text-xs font-medium uppercase tracking-wide text-white/60">
                        {t('auth.password')}
                      </Label>
                      {onForgotPassword && (
                        <button
                          type="button"
                          className="text-xs text-white/55 hover:text-white focus:text-white focus:outline-none transition-colors"
                          onClick={onForgotPassword}
                        >
                          {t('auth.forgotPassword')}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} aria-hidden="true" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="h-11 pl-10 pr-11 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 hover:border-white/20 focus-visible:border-primary/60 focus-visible:ring-primary/30"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((v) => !v)}
                        aria-label={showLoginPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        aria-pressed={showLoginPassword}
                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                      >
                        {showLoginPassword ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_8px_24px_-8px_rgba(120,119,198,0.55)] transition-all"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <CircleNotch size={16} className="mr-2 animate-spin" />
                        {t('auth.loggingIn')}
                      </>
                    ) : (
                      t('auth.login')
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-sm text-white/55">
                    {t('auth.noAccount')}{' '}
                    <button
                      type="button"
                      className="text-white font-medium hover:text-primary focus:text-primary focus:outline-none transition-colors"
                      onClick={() => setActiveTab('register')}
                    >
                      {t('auth.createAccountCta')}
                    </button>
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
              <CardHeader className="pb-3 sm:pb-4 px-6 pt-6 sm:px-7 sm:pt-7">
                <CardTitle className="text-xl font-semibold tracking-tight text-white">{t('auth.createAccount')}</CardTitle>
                <CardDescription className="text-white/55">{t('auth.registerDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 sm:px-7 sm:pb-7">
                {/* Register Error Message - shown even if toast fails */}
                {registerError && (
                  <div role="alert" aria-live="polite" className="mb-4 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                    <div className="flex items-start gap-3">
                      <Warning size={20} className="text-red-400 mt-0.5" weight="fill" aria-hidden="true" />
                      <div className="flex-1">
                        <p className="text-red-300 font-medium text-sm">
                          {t('auth.registrationFailed')}
                        </p>
                        <p className="text-red-300/80 text-sm mt-1">
                          {registerError}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleRegister} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="register-name" className="text-xs font-medium uppercase tracking-wide text-white/60">
                      {t('auth.fullName')}
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} aria-hidden="true" />
                      <Input
                        id="register-name"
                        type="text"
                        autoComplete="name"
                        value={registerForm.full_name}
                        onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                        className={`h-11 pl-10 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 hover:border-white/20 focus-visible:border-primary/60 focus-visible:ring-primary/30 ${registerFieldErrors.full_name ? 'border-red-500/60 focus-visible:border-red-500/60' : ''}`}
                        aria-invalid={!!registerFieldErrors.full_name}
                        aria-describedby={registerFieldErrors.full_name ? 'register-name-error' : undefined}
                        required
                      />
                    </div>
                    {registerFieldErrors.full_name && (
                      <p id="register-name-error" className="text-xs text-red-400" role="alert">{registerFieldErrors.full_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email" className="text-xs font-medium uppercase tracking-wide text-white/60">
                      {t('auth.email')}
                    </Label>
                    <div className="relative">
                      <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} aria-hidden="true" />
                      <Input
                        id="register-email"
                        type="email"
                        autoComplete="email"
                        value={registerForm.email}
                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                        className={`h-11 pl-10 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 hover:border-white/20 focus-visible:border-primary/60 focus-visible:ring-primary/30 ${registerFieldErrors.email ? 'border-red-500/60 focus-visible:border-red-500/60' : ''}`}
                        aria-invalid={!!registerFieldErrors.email}
                        aria-describedby={registerFieldErrors.email ? 'register-email-error' : undefined}
                        required
                      />
                    </div>
                    {registerFieldErrors.email && (
                      <p id="register-email-error" className="text-xs text-red-400" role="alert">{registerFieldErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password" className="text-xs font-medium uppercase tracking-wide text-white/60">
                      {t('auth.password')}
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} aria-hidden="true" />
                      <Input
                        id="register-password"
                        type={showRegisterPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        className={`h-11 pl-10 pr-11 bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 hover:border-white/20 focus-visible:border-primary/60 focus-visible:ring-primary/30 ${registerFieldErrors.password ? 'border-red-500/60 focus-visible:border-red-500/60' : ''}`}
                        aria-invalid={!!registerFieldErrors.password}
                        aria-describedby={registerFieldErrors.password ? 'register-password-error' : 'register-password-hint'}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword((v) => !v)}
                        aria-label={showRegisterPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        aria-pressed={showRegisterPassword}
                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                      >
                        {showRegisterPassword ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                    {registerFieldErrors.password ? (
                      <p id="register-password-error" className="text-xs text-red-400" role="alert">{registerFieldErrors.password}</p>
                    ) : (
                      <p id="register-password-hint" className="text-xs text-white/45">{t('auth.passwordHint')}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-role" className="text-xs font-medium uppercase tracking-wide text-white/60">
                      {t('auth.role')}
                    </Label>
                    <Select
                      value={registerForm.role}
                      onValueChange={(value: 'zzp' | 'accountant') =>
                        setRegisterForm({ ...registerForm, role: value })
                      }
                    >
                      <SelectTrigger
                        id="register-role"
                        className="h-11 bg-white/[0.04] border-white/10 text-white hover:border-white/20 focus-visible:border-primary/60 focus-visible:ring-primary/30"
                        aria-describedby={registerFieldErrors.role ? 'register-role-error' : undefined}
                      >
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
                      <p id="register-role-error" className="text-xs text-red-400" role="alert">{registerFieldErrors.role}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_8px_24px_-8px_rgba(120,119,198,0.55)] transition-all"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <CircleNotch size={16} className="mr-2 animate-spin" />
                        {t('auth.creatingAccount')}
                      </>
                    ) : (
                      t('auth.createAccount')
                    )}
                  </Button>

                  <p className="text-xs text-white/45 text-center leading-relaxed">{t('auth.trialInfo')}</p>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-sm text-white/55">
                    {t('auth.haveAccount')}{' '}
                    <button
                      type="button"
                      className="text-white font-medium hover:text-primary focus:text-primary focus:outline-none transition-colors"
                      onClick={() => setActiveTab('login')}
                    >
                      {t('auth.loginCta')}
                    </button>
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Trust footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-white/40">
          <ShieldCheck size={14} weight="duotone" aria-hidden="true" />
          <span>{t('auth.secureLogin')}</span>
        </div>
      </div>
    </div>
  )
}
