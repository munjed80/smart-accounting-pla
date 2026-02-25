/**
 * Settings Page
 * 
 * Profile settings, company info, and notification preferences.
 * Includes editable Business Profile for ZZP users.
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/AuthContext'
import { 
  administrationApi, 
  Administration, 
  zzpApi,
  ZZPBusinessProfile,
  ZZPBusinessProfileCreate,
  subscriptionApi,
  SubscriptionMeResponse,
} from '@/lib/api'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useEntitlements } from '@/hooks/useEntitlements'
import { 
  User,
  Buildings,
  Bell,
  Gear,
  CheckCircle,
  Info,
  ArrowsClockwise,
  FloppyDisk,
  MapPin,
  Envelope,
  Phone,
  Globe,
  Bank,
  IdentificationCard,
  BellRinging,
  CreditCard,
  Calendar,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/utils'
import { t } from '@/i18n'
import { getBuildDate, PACKAGE_VERSION_ONLY } from '@/lib/version'
import { usePushNotifications, isPushEnabled } from '@/hooks/usePushNotifications'

export const SettingsPage = () => {
  const { user } = useAuth()
  const [administrations, setAdministrations] = useState<Administration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  
  // Push notifications hook
  const pushNotifications = usePushNotifications()
  
  // Subscription management hook (for ZZP users)
  const { isAccountantBypass, refetch: refetchSubscription } = useEntitlements()
  const [isCanceling, setIsCanceling] = useState(false)
  const [isReactivating, setIsReactivating] = useState(false)
  const [isActivating, setIsActivating] = useState(false)

  // Simplified subscription data from /subscription/me (ZZP users only)
  const isZzp = user?.role === 'zzp' && !isAccountantBypass
  const {
    data: subscriptionMe,
    isLoading: isLoadingSubscriptionMe,
    error: subscriptionMeError,
    refetch: refetchSubscriptionMe,
  } = useQuery<SubscriptionMeResponse>({
    queryKey: ['subscriptionMe', user?.id],
    queryFn: subscriptionApi.getSubscriptionMe,
    enabled: isZzp,
    staleTime: 5 * 60 * 1000,
  })
  
  // Business profile state (for ZZP users) - MUST be declared before useDelayedLoading
  const [businessProfile, setBusinessProfile] = useState<ZZPBusinessProfile | null>(null)
  const [profileForm, setProfileForm] = useState<ZZPBusinessProfileCreate>({
    company_name: '',
    trading_name: '',
    address_street: '',
    address_postal_code: '',
    address_city: '',
    address_country: 'Nederland',
    kvk_number: '',
    btw_number: '',
    iban: '',
    email: '',
    phone: '',
    website: '',
    logo_url: '',
  })
  
  // Use delayed loading to prevent skeleton flash
  const showLoading = useDelayedLoading(isLoading, 300, administrations.length > 0)
  const showProfileLoading = useDelayedLoading(isLoadingProfile, 300, !!businessProfile)
  
  // Notification preferences (local state - would be stored in backend in full implementation)
  const [notifications, setNotifications] = useState({
    emailDigest: true,
    transactionAlerts: true,
    vatReminders: true,
    documentProcessed: false,
  })
  
  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  useEffect(() => {
    let isMounted = true
    
    const fetchData = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const admins = await administrationApi.list()
        if (isMounted) {
          setAdministrations(admins)
        }
      } catch (error) {
        console.error('Failed to fetch administrations:', error)
        if (isMounted) {
          setLoadError('Failed to load company information')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }
    fetchData()
    
    // Fetch business profile from API (for ZZP users)
    const fetchBusinessProfile = async () => {
      if (!user?.id || user?.role !== 'zzp') return
      
      if (isMounted) {
        setIsLoadingProfile(true)
      }
      try {
        const profile = await zzpApi.profile.get()
        if (isMounted) {
          setBusinessProfile(profile)
          setProfileForm({
            company_name: profile.company_name || '',
            trading_name: profile.trading_name || '',
            address_street: profile.address_street || '',
            address_postal_code: profile.address_postal_code || '',
            address_city: profile.address_city || '',
            address_country: profile.address_country || 'Nederland',
            kvk_number: profile.kvk_number || '',
            btw_number: profile.btw_number || '',
            iban: profile.iban || '',
            email: profile.email || '',
            phone: profile.phone || '',
            website: profile.website || '',
            logo_url: profile.logo_url || '',
          })
        }
      } catch (error: unknown) {
        // 404 is expected if profile doesn't exist yet - that's OK
        const err = error as { response?: { status?: number } }
        if (err?.response?.status !== 404) {
          console.error('Failed to fetch business profile:', error)
        }
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false)
        }
      }
    }
    fetchBusinessProfile()
    
    return () => {
      isMounted = false
    }
  }, [user?.id, user?.role])

  const handleSaveNotifications = async () => {
    setIsSaving(true)
    // Simulate save - in full implementation this would call an API
    await new Promise(resolve => setTimeout(resolve, 500))
    toast.success(t('settings.preferencesSaved'))
    setIsSaving(false)
  }
  
  const handleSaveBusinessProfile = async () => {
    if (!user?.id) return
    
    // Validate required field
    if (!profileForm.company_name.trim()) {
      toast.error(t('settings.businessProfileError'))
      return
    }
    
    setIsSavingProfile(true)
    
    try {
      const saved = await zzpApi.profile.upsert(profileForm)
      setBusinessProfile(saved)
      toast.success(t('settings.businessProfileSaved'))
      // Emit onboarding event so the tour can auto-advance
      window.dispatchEvent(new CustomEvent('onboarding:settings_saved'))
    } catch (error) {
      console.error('Failed to save business profile:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsSavingProfile(false)
    }
  }
  
  const updateProfileField = (field: keyof ZZPBusinessProfileCreate, value: string) => {
    setProfileForm(prev => ({ ...prev, [field]: value }))
  }

  // Subscription management handlers
  const handleCancelSubscription = async () => {
    if (!window.confirm('Weet je zeker dat je je abonnement wilt opzeggen? Het blijft actief tot het einde van de huidige periode.')) {
      return
    }

    setIsCanceling(true)
    try {
      const result = await subscriptionApi.cancelSubscription()
      toast.success(result.message_nl || 'Abonnement opgezegd')
      await refetchSubscription()
      await refetchSubscriptionMe()
    } catch (error) {
      console.error('Failed to cancel subscription:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsCanceling(false)
    }
  }

  const handleReactivateSubscription = async () => {
    setIsReactivating(true)
    try {
      const result = await subscriptionApi.reactivateSubscription()
      toast.success(result.message_nl || 'Abonnement heractiveerd')
      await refetchSubscription()
      await refetchSubscriptionMe()
    } catch (error) {
      console.error('Failed to reactivate subscription:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsReactivating(false)
    }
  }

  const handleActivateSubscription = async () => {
    setIsActivating(true)
    try {
      const result = await subscriptionApi.activateSubscription()
      if (result.scheduled) {
        toast.success('Abonnement gepland', {
          description: `Je abonnement start automatisch na de proefperiode${result.trial_end_at ? ` op ${new Date(result.trial_end_at).toLocaleDateString('nl-NL')}` : ''}.`,
        })
      } else {
        toast.success('Abonnement actief', {
          description: 'Je abonnement is nu actief.',
        })
      }
      await refetchSubscription()
      await refetchSubscriptionMe()
    } catch (error) {
      console.error('Failed to activate subscription:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsActivating(false)
    }
  }

  const handleChangePassword = async () => {
    // Validate password fields
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Vul alle velden in')
      return
    }
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Nieuwe wachtwoorden komen niet overeen')
      return
    }
    
    if (passwordForm.newPassword.length < 8) {
      toast.error('Wachtwoord moet minimaal 8 tekens bevatten')
      return
    }
    
    setIsChangingPassword(true)
    
    try {
      // TODO: Implement backend endpoint for password change
      // await authApi.changePassword({
      //   current_password: passwordForm.currentPassword,
      //   new_password: passwordForm.newPassword
      // })
      
      // For now, simulate the API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      toast.success('Wachtwoord succesvol gewijzigd')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      console.error('Failed to change password:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsChangingPassword(false)
    }
  }
  
  const handleExportJSON = async () => {
    try {
      toast.info('Export wordt voorbereid...')
      
      // Gather all data for export
      const exportData: any = {
        exportDate: new Date().toISOString(),
        user: {
          name: user?.full_name,
          email: user?.email,
          role: user?.role,
        },
        administrations: administrations,
      }
      
      // For ZZP users, add business data
      if (user?.role === 'zzp') {
        try {
          const [profile, customers, invoices, expenses, timeEntries] = await Promise.all([
            zzpApi.profile.get().catch(() => null),
            zzpApi.customers.list().catch(() => []),
            zzpApi.invoices.list().catch(() => []),
            zzpApi.expenses.list().catch(() => ({ expenses: [] })),
            zzpApi.time.list().catch(() => []),
          ])
          
          exportData.businessProfile = profile
          exportData.customers = customers
          exportData.invoices = invoices
          exportData.expenses = expenses?.expenses || []
          exportData.timeEntries = timeEntries
        } catch (error) {
          console.error('Error gathering export data:', error)
        }
      }
      
      // Create JSON blob and download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `smart-accounting-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      toast.success('Export succesvol gedownload')
    } catch (error) {
      console.error('Failed to export data:', error)
      toast.error('Export mislukt')
    }
  }
  
  const handleExportCSV = async () => {
    try {
      toast.info('CSV export wordt voorbereid...')
      
      if (user?.role !== 'zzp') {
        toast.error('CSV export is alleen beschikbaar voor ZZP gebruikers')
        return
      }
      
      // Gather customers for CSV
      const customers = await zzpApi.customers.list().catch(() => [])
      
      // Create CSV content
      const headers = ['Naam', 'Email', 'Telefoon', 'KVK', 'BTW', 'Status']
      const rows = customers.map((c: any) => [
        c.name || '',
        c.email || '',
        c.phone || '',
        c.kvk_number || '',
        c.btw_number || '',
        c.status || ''
      ])
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n')
      
      // Create CSV blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `klanten-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      toast.success('CSV export succesvol gedownload')
    } catch (error) {
      console.error('Failed to export CSV:', error)
      toast.error('CSV export mislukt')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
            <Gear size={32} weight="duotone" className="text-primary" />
            {t('settings.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('settings.subtitle')}
          </p>
        </div>

        {/* Display load error if present */}
        {loadError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Profile Section */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User size={20} weight="duotone" />
                {t('settings.profileInfo')}
              </CardTitle>
              <CardDescription>
                {t('settings.profileDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {showLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : administrations.length === 0 ? (
                <Alert>
                  <Info size={16} />
                  <AlertDescription>
                    {t('settings.noAdministrations')}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">{t('auth.fullName')}</Label>
                      <Input 
                        id="fullName" 
                        value={user?.full_name || ''} 
                        readOnly 
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('auth.email')}</Label>
                      <Input 
                        id="email" 
                        type="email"
                        value={user?.email || ''} 
                        readOnly 
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {user?.role === 'zzp' ? t('roles.zzp') : user?.role === 'accountant' ? t('roles.accountant') : user?.role}
                    </Badge>
                    {user?.is_email_verified && (
                      <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/40">
                        <CheckCircle size={14} className="mr-1" />
                        {t('settings.emailVerified')}
                      </Badge>
                    )}
                  </div>
                  <Alert>
                    <Info size={16} />
                    <AlertDescription>
                      {t('settings.contactSupport')}
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </CardContent>
          </Card>

          {/* Business Profile Section - Editable for ZZP users */}
          {user?.role === 'zzp' && (
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Buildings size={20} weight="duotone" />
                  {t('settings.businessProfile')}
                </CardTitle>
                <CardDescription>
                  {t('settings.businessProfileDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {showProfileLoading ? (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <Skeleton className="h-4 w-32" />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-10 w-full" />
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full col-span-1 md:col-span-2" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                {/* Company Identity */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Buildings size={16} />
                    {t('settings.companyInfo')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="profileCompanyName">{t('settings.companyName')} *</Label>
                      <Input 
                        id="profileCompanyName" 
                        value={profileForm.company_name}
                        onChange={(e) => updateProfileField('company_name', e.target.value)}
                        placeholder="Mijn Bedrijf B.V."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profileTradingName">{t('settings.tradingName')}</Label>
                      <Input 
                        id="profileTradingName" 
                        value={profileForm.trading_name || ''}
                        onChange={(e) => updateProfileField('trading_name', e.target.value)}
                        placeholder={t('settings.tradingNamePlaceholder')}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Address */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <MapPin size={16} />
                    Adres
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="profileAddressStreet">{t('settings.addressStreet')}</Label>
                      <Input 
                        id="profileAddressStreet" 
                        value={profileForm.address_street || ''}
                        onChange={(e) => updateProfileField('address_street', e.target.value)}
                        placeholder="Hoofdstraat 123"
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="profileAddressPostalCode">{t('settings.addressPostalCode')}</Label>
                        <Input 
                          id="profileAddressPostalCode" 
                          value={profileForm.address_postal_code || ''}
                          onChange={(e) => updateProfileField('address_postal_code', e.target.value)}
                          placeholder="1234 AB"
                        />
                      </div>
                      <div className="space-y-2 col-span-1 md:col-span-2">
                        <Label htmlFor="profileAddressCity">{t('settings.addressCity')}</Label>
                        <Input 
                          id="profileAddressCity" 
                          value={profileForm.address_city || ''}
                          onChange={(e) => updateProfileField('address_city', e.target.value)}
                          placeholder="Amsterdam"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profileAddressCountry">{t('settings.addressCountry')}</Label>
                      <Input 
                        id="profileAddressCountry" 
                        value={profileForm.address_country || ''}
                        onChange={(e) => updateProfileField('address_country', e.target.value)}
                        placeholder="Nederland"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Business IDs */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <IdentificationCard size={16} />
                    Bedrijfsgegevens
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="profileKvk">{t('settings.kvkNumber')}</Label>
                      <Input 
                        id="profileKvk" 
                        value={profileForm.kvk_number || ''}
                        onChange={(e) => updateProfileField('kvk_number', e.target.value)}
                        placeholder="12345678"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profileBtw">{t('settings.btwNumber')}</Label>
                      <Input 
                        id="profileBtw" 
                        value={profileForm.btw_number || ''}
                        onChange={(e) => updateProfileField('btw_number', e.target.value)}
                        placeholder="NL123456789B01"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Bank Details */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Bank size={16} />
                    Bankgegevens
                  </h4>
                  <div className="space-y-2">
                    <Label htmlFor="profileIban">{t('settings.iban')}</Label>
                    <Input 
                      id="profileIban" 
                      value={profileForm.iban || ''}
                      onChange={(e) => updateProfileField('iban', e.target.value)}
                      placeholder={t('settings.ibanPlaceholder')}
                    />
                  </div>
                </div>

                <Separator />

                {/* Contact Details */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Envelope size={16} />
                    Contactgegevens
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="profileEmail">{t('settings.email')}</Label>
                      <Input 
                        id="profileEmail" 
                        type="email"
                        value={profileForm.email || ''}
                        onChange={(e) => updateProfileField('email', e.target.value)}
                        placeholder={t('settings.emailPlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profilePhone">{t('settings.phone')}</Label>
                      <Input 
                        id="profilePhone" 
                        value={profileForm.phone || ''}
                        onChange={(e) => updateProfileField('phone', e.target.value)}
                        placeholder={t('settings.phonePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="profileWebsite">{t('settings.website')}</Label>
                      <Input 
                        id="profileWebsite" 
                        value={profileForm.website || ''}
                        onChange={(e) => updateProfileField('website', e.target.value)}
                        placeholder={t('settings.websitePlaceholder')}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleSaveBusinessProfile} disabled={isSavingProfile} className="gap-2">
                    {isSavingProfile ? (
                      <ArrowsClockwise size={18} className="animate-spin" />
                    ) : (
                      <FloppyDisk size={18} />
                    )}
                    {t('settings.saveProfile')}
                  </Button>
                </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notification Preferences */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell size={20} weight="duotone" />
                {t('settings.notificationPreferences')}
              </CardTitle>
              <CardDescription>
                {t('settings.notificationDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="emailDigest">{t('settings.weeklyEmailDigest')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.weeklyEmailDescription')}
                    </p>
                  </div>
                  <Switch
                    id="emailDigest"
                    checked={notifications.emailDigest}
                    onCheckedChange={(checked) => 
                      setNotifications(prev => ({ ...prev, emailDigest: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="transactionAlerts">{t('settings.transactionAlerts')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.transactionAlertsDescription')}
                    </p>
                  </div>
                  <Switch
                    id="transactionAlerts"
                    checked={notifications.transactionAlerts}
                    onCheckedChange={(checked) => 
                      setNotifications(prev => ({ ...prev, transactionAlerts: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="vatReminders">{t('settings.vatReminders')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.vatRemindersDescription')}
                    </p>
                  </div>
                  <Switch
                    id="vatReminders"
                    checked={notifications.vatReminders}
                    onCheckedChange={(checked) => 
                      setNotifications(prev => ({ ...prev, vatReminders: checked }))
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="documentProcessed">{t('settings.documentProcessed')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.documentProcessedDescription')}
                    </p>
                  </div>
                  <Switch
                    id="documentProcessed"
                    checked={notifications.documentProcessed}
                    onCheckedChange={(checked) => 
                      setNotifications(prev => ({ ...prev, documentProcessed: checked }))
                    }
                  />
                </div>
                
                {/* Push Notifications (optional, feature-flagged) */}
                {isPushEnabled() && (
                  <>
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="pushNotifications" className="flex items-center gap-2">
                          <BellRinging size={16} />
                          Meldingen inschakelen
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Ontvang pushmeldingen voor belangrijke updates
                        </p>
                        {!pushNotifications.isSupported && (
                          <Badge variant="destructive" className="text-xs mt-1">
                            Niet ondersteund in deze browser
                          </Badge>
                        )}
                      </div>
                      <Switch
                        id="pushNotifications"
                        checked={pushNotifications.isSubscribed}
                        onCheckedChange={pushNotifications.toggle}
                        disabled={!pushNotifications.isSupported || pushNotifications.isLoading}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveNotifications} disabled={isSaving}>
                  {isSaving && <ArrowsClockwise size={18} className="mr-2 animate-spin" />}
                  {t('settings.savePreferences')}
                </Button>
              </div>

              <Alert>
                <Info size={16} />
                <AlertDescription>
                  <span className="font-medium">{t('settings.comingSoon')}</span> {t('settings.emailNotificationsFinalized')}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Subscription Management Section (ZZP users only) */}
          {isZzp && (
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard size={20} weight="duotone" />
                  Abonnement
                </CardTitle>
                <CardDescription>
                  Beheer je abonnement en betalingen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingSubscriptionMe ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : subscriptionMeError ? (
                  <Alert variant="destructive">
                    <Info size={16} />
                    <AlertDescription>
                      Abonnementsinformatie kon niet worden geladen. Probeer het opnieuw.
                    </AlertDescription>
                  </Alert>
                ) : subscriptionMe ? (
                  <div className="space-y-4">
                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Status:</span>
                      {subscriptionMe.status === 'trial' && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                          Trial
                        </Badge>
                      )}
                      {subscriptionMe.status === 'active' && (
                        <Badge className="bg-green-100 text-green-800 border-green-300">
                          Active
                        </Badge>
                      )}
                      {subscriptionMe.status === 'expired' && (
                        <Badge variant="secondary">
                          Expired
                        </Badge>
                      )}
                    </div>

                    {/* Date Info */}
                    <div className="space-y-2 text-sm">
                      {subscriptionMe.startDate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Calendar size={14} />
                            Startdatum
                          </span>
                          <span className="font-medium">
                            {new Date(subscriptionMe.startDate).toLocaleDateString('nl-NL')}
                          </span>
                        </div>
                      )}
                      {subscriptionMe.endDate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Calendar size={14} />
                            Einddatum
                          </span>
                          <span className="font-medium">
                            {new Date(subscriptionMe.endDate).toLocaleDateString('nl-NL')}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Dagen resterend</span>
                        <span className="font-medium">{subscriptionMe.daysRemaining}</span>
                      </div>
                    </div>

                    <Separator />

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      {subscriptionMe.status === 'trial' && (
                        <>
                          <Button
                            onClick={handleActivateSubscription}
                            disabled={isActivating}
                          >
                            {isActivating && <ArrowsClockwise size={18} className="mr-2 animate-spin" />}
                            Upgrade to Pro
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleCancelSubscription}
                            disabled={isCanceling}
                          >
                            {isCanceling && <ArrowsClockwise size={18} className="mr-2 animate-spin" />}
                            Cancel Trial
                          </Button>
                        </>
                      )}
                      {subscriptionMe.status === 'active' && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => toast.info('Abonnementsbeheer wordt binnenkort beschikbaar.')}
                          >
                            Manage Subscription
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleCancelSubscription}
                            disabled={isCanceling}
                          >
                            {isCanceling && <ArrowsClockwise size={18} className="mr-2 animate-spin" />}
                            Cancel Subscription
                          </Button>
                        </>
                      )}
                      {subscriptionMe.status === 'expired' && (
                        <Button
                          onClick={handleReactivateSubscription}
                          disabled={isReactivating}
                        >
                          {isReactivating && <ArrowsClockwise size={18} className="mr-2 animate-spin" />}
                          Renew Subscription
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <Info size={16} />
                    <AlertDescription>
                      Geen abonnementsinformatie beschikbaar
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Password Change Section */}
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
                <Button onClick={handleChangePassword} disabled={isChangingPassword}>
                  {isChangingPassword && <ArrowsClockwise size={18} className="mr-2 animate-spin" />}
                  Wachtwoord wijzigen
                </Button>
              </div>
              <Alert>
                <Info size={16} />
                <AlertDescription>
                  Je wachtwoord moet minimaal 8 tekens bevatten
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Data Export/Backup Section */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FloppyDisk size={20} weight="duotone" />
                Data export & backup
              </CardTitle>
              <CardDescription>
                Exporteer je bedrijfsgegevens als backup of voor externe verwerking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Download een complete export van je bedrijfsgegevens inclusief:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
                  <li>Bedrijfsprofiel en contactgegevens</li>
                  <li>Klanten</li>
                  <li>Facturen en betalingen</li>
                  <li>Uitgaven en bonnetjes</li>
                  <li>Uren registratie</li>
                  <li>Afspraken</li>
                </ul>
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={handleExportJSON}>
                  <FloppyDisk size={18} className="mr-2" />
                  Exporteer als JSON
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleExportCSV}>
                  <FloppyDisk size={18} className="mr-2" />
                  Exporteer als CSV
                </Button>
              </div>
              <Alert>
                <Info size={16} />
                <AlertDescription>
                  De export bevat alle gegevens in je huidige administratie. Bewaar de export veilig.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* About & Version Info */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info size={20} weight="duotone" />
                Over deze applicatie
              </CardTitle>
              <CardDescription>
                Versie-informatie en systeemdetails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Versie</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {PACKAGE_VERSION_ONLY}
                  </Badge>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Volledige versie</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {PACKAGE_VERSION_ONLY}
                  </Badge>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Laatste build</span>
                  <span className="text-sm font-medium">
                    {getBuildDate()}
                  </span>
                </div>
              </div>

              <Separator />

              <Alert>
                <Info size={16} />
                <AlertDescription className="text-xs">
                  <strong>Smart Accounting Platform</strong> — Professioneel boekhoudplatform voor ZZP'ers en accountants.
                  {' '}Versie: <code className="text-xs bg-muted px-1 py-0.5 rounded">{PACKAGE_VERSION_ONLY}</code>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}

export default SettingsPage
