/**
 * Settings Page
 * 
 * Profile settings, company info, and notification preferences.
 * Includes version footer for debugging.
 */

import { useState, useEffect } from 'react'
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
import { administrationApi, Administration, getApiBaseUrl } from '@/lib/api'
import { 
  User,
  Buildings,
  Bell,
  Gear,
  CheckCircle,
  Info,
  ArrowsClockwise
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { t } from '@/i18n'

// Build timestamp - injected at build time or fallback
const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION || 'dev'
const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP || 'development'

export const SettingsPage = () => {
  const { user } = useAuth()
  const [administrations, setAdministrations] = useState<Administration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  
  // Notification preferences (local state - would be stored in backend in full implementation)
  const [notifications, setNotifications] = useState({
    emailDigest: true,
    transactionAlerts: true,
    vatReminders: true,
    documentProcessed: false,
  })

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const admins = await administrationApi.list()
        setAdministrations(admins)
      } catch (error) {
        console.error('Failed to fetch administrations:', error)
        setLoadError('Failed to load company information')
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleSaveNotifications = async () => {
    setIsSaving(true)
    // Simulate save - in full implementation this would call an API
    await new Promise(resolve => setTimeout(resolve, 500))
    toast.success(t('settings.preferencesSaved'))
    setIsSaving(false)
  }

  const primaryAdmin = administrations[0]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
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

          {/* Company/Administration Section - Only for ZZP users */}
          {user?.role === 'zzp' && (
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Buildings size={20} weight="duotone" />
                  {t('settings.companyInfo')}
                </CardTitle>
                <CardDescription>
                  {t('settings.companyDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : primaryAdmin ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">{t('settings.companyName')}</Label>
                        <Input 
                          id="companyName" 
                          value={primaryAdmin.name} 
                          readOnly 
                          className="bg-secondary/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="kvkNumber">{t('settings.kvkNumber')}</Label>
                        <Input 
                          id="kvkNumber" 
                          value={primaryAdmin.kvk_number || t('settings.notSet')} 
                          readOnly 
                          className="bg-secondary/50"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="btwNumber">{t('settings.btwNumber')}</Label>
                        <Input 
                          id="btwNumber" 
                          value={primaryAdmin.btw_number || t('settings.notSet')} 
                          readOnly 
                          className="bg-secondary/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">{t('settings.description')}</Label>
                        <Input 
                          id="description" 
                          value={primaryAdmin.description || t('settings.noDescription')} 
                          readOnly 
                          className="bg-secondary/50"
                        />
                      </div>
                    </div>
                    <Alert>
                      <Info size={16} />
                      <AlertDescription>
                        {t('settings.companyInfoUpdate')}
                      </AlertDescription>
                    </Alert>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Buildings size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" weight="duotone" />
                    <p className="text-muted-foreground">{t('settings.noAdministrationSetup')}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('settings.completeOnboarding')}
                    </p>
                  </div>
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

          {/* Version Footer */}
          <Card className="bg-secondary/30 border-dashed">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>
                    <strong>{t('settings.version')}:</strong> {BUILD_VERSION}
                  </span>
                  <span>
                    <strong>{t('settings.build')}:</strong> {BUILD_TIMESTAMP === 'development' ? t('settings.development') : new Date(BUILD_TIMESTAMP).toLocaleString('nl-NL')}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span>
                    <strong>{t('settings.api')}:</strong> {getApiBaseUrl().replace('/api/v1', '')}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {import.meta.env.DEV ? t('settings.development') : t('settings.production')}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
