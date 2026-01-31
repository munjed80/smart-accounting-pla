/**
 * Accountant Onboarding Page
 * 
 * Dutch-first onboarding flow for accountants:
 * - Step 1: "Koppel je eerste klant" (link first client by email)
 * - Step 2: "Selecteer een klant" (select from assigned clients)
 * - Step 3: "Ga naar Te beoordelen" (proceed to review queue)
 * 
 * Triggered when accountant has 0 assigned clients.
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Database, 
  User, 
  UsersThree,
  CheckCircle, 
  ArrowRight,
  ArrowLeft,
  EnvelopeSimple,
  Stack,
  WarningCircle,
  Plus,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import { 
  accountantClientApi, 
  AccountantClientListItem,
  getErrorMessage 
} from '@/lib/api'
import { t } from '@/i18n'
import { navigateTo } from '@/lib/navigation'

interface AccountantOnboardingPageProps {
  userName: string
  onComplete: () => void
  onSkip?: () => void
}

type OnboardingStep = 'link-client' | 'select-client' | 'go-to-review'

export const AccountantOnboardingPage = ({ 
  userName, 
  onComplete,
  onSkip 
}: AccountantOnboardingPageProps) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('link-client')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Client email input
  const [clientEmail, setClientEmail] = useState('')
  
  // Assigned clients list
  const [clients, setClients] = useState<AccountantClientListItem[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(false)
  
  // Fetch assigned clients
  const fetchClients = async () => {
    setIsLoadingClients(true)
    try {
      const response = await accountantClientApi.listClients()
      setClients(response.clients)
      
      // If we have clients, move to step 2
      if (response.clients.length > 0 && currentStep === 'link-client') {
        setCurrentStep('select-client')
      }
    } catch (err) {
      console.error('Failed to fetch clients:', err)
    } finally {
      setIsLoadingClients(false)
    }
  }
  
  useEffect(() => {
    fetchClients()
  }, [])
  
  // Handle linking a client by email
  const handleLinkClient = async () => {
    if (!clientEmail.trim()) return
    
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    
    try {
      const response = await accountantClientApi.assignByEmail({ client_email: clientEmail.trim() })
      setSuccess(`${t('onboarding.clientLinkedSuccess')} ${response.administration_name}`)
      setClientEmail('')
      
      // Refresh clients list
      await fetchClients()
      
      // Move to step 2
      setTimeout(() => {
        setCurrentStep('select-client')
        setSuccess(null)
      }, 1500)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }
  
  // Handle selecting a client
  const handleSelectClient = (client: AccountantClientListItem) => {
    if (client.administration_id) {
      localStorage.setItem('selectedClientId', client.administration_id)
      localStorage.setItem('selectedClientName', client.name || client.email)
    }
    setCurrentStep('go-to-review')
  }
  
  // Handle proceeding to review queue
  const handleGoToReview = () => {
    onComplete()
    navigateTo('/accountant')
  }
  
  // Handle skip
  const handleSkip = () => {
    if (onSkip) {
      onSkip()
    } else {
      onComplete()
      navigateTo('/accountant/clients')
    }
  }

  // Step 1: Link first client
  const renderLinkClientStep = () => (
    <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <EnvelopeSimple size={48} weight="duotone" className="text-primary" />
        </div>
        <CardTitle className="text-2xl">{t('onboarding.step1Title')}</CardTitle>
        <CardDescription className="text-base">
          {t('onboarding.step1Description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="client-email">{t('onboarding.clientEmail')}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="client-email"
                type="email"
                placeholder="klant@email.nl"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="pl-9"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLinkClient()
                  }
                }}
              />
            </div>
            <Button 
              onClick={handleLinkClient}
              disabled={isLoading || !clientEmail.trim()}
            >
              {isLoading ? (
                <ArrowsClockwise size={16} className="animate-spin" />
              ) : (
                <>
                  <Plus size={16} className="mr-1" />
                  {t('onboarding.linkClient')}
                </>
              )}
            </Button>
          </div>
        </div>
        
        {error && (
          <Alert className="bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-4 w-4" />
            <AlertDescription className="ml-2">{error}</AlertDescription>
          </Alert>
        )}
        
        {success && (
          <Alert className="bg-green-500/10 border-green-500/40">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="ml-2 text-green-700">{success}</AlertDescription>
          </Alert>
        )}
        
        {/* Show existing clients if any */}
        {clients.length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">
              Je hebt al {clients.length} klant{clients.length > 1 ? 'en' : ''} gekoppeld:
            </p>
            <div className="flex flex-wrap gap-2">
              {clients.map(client => (
                <Badge key={client.id} variant="outline">
                  {client.name || client.email}
                </Badge>
              ))}
            </div>
            <Button 
              variant="link" 
              className="mt-2 p-0 h-auto" 
              onClick={() => setCurrentStep('select-client')}
            >
              {t('onboarding.step2Title')} →
            </Button>
          </div>
        )}
        
        <div className="pt-4 border-t text-center">
          <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
            {t('onboarding.skipForNow')}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            {t('onboarding.continueWithoutClients')}
          </p>
        </div>
      </CardContent>
    </Card>
  )

  // Step 2: Select a client
  const renderSelectClientStep = () => (
    <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep('link-client')}
            className="text-muted-foreground"
          >
            <ArrowLeft size={16} className="mr-1" />
            {t('common.back')}
          </Button>
        </div>
        <div className="flex justify-center mb-4">
          <UsersThree size={48} weight="duotone" className="text-primary" />
        </div>
        <CardTitle className="text-2xl text-center">{t('onboarding.step2Title')}</CardTitle>
        <CardDescription className="text-base text-center">
          {t('onboarding.step2Description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingClients ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : clients.length > 0 ? (
          <div className="space-y-2">
            {clients.map(client => (
              <div 
                key={client.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="font-semibold">{client.name || client.email}</p>
                  <p className="text-sm text-muted-foreground">{client.email}</p>
                  <div className="flex gap-2 mt-1">
                    {client.open_red_count > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {client.open_red_count} rood
                      </Badge>
                    )}
                    {client.open_yellow_count > 0 && (
                      <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-700">
                        {client.open_yellow_count} geel
                      </Badge>
                    )}
                    {client.open_red_count === 0 && client.open_yellow_count === 0 && (
                      <Badge variant="outline" className="text-xs bg-green-500/20 text-green-700">
                        ✓ OK
                      </Badge>
                    )}
                  </div>
                </div>
                <Button onClick={() => handleSelectClient(client)}>
                  {t('onboarding.selectClientButton')}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <UsersThree size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t('onboarding.noClientsYet')}</p>
            <p className="text-sm text-muted-foreground mt-2">{t('onboarding.addYourFirstClient')}</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setCurrentStep('link-client')}
            >
              <ArrowLeft size={16} className="mr-2" />
              {t('onboarding.step1Title')}
            </Button>
          </div>
        )}
        
        {clients.length > 0 && (
          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setCurrentStep('link-client')}
            >
              <Plus size={16} className="mr-2" />
              {t('accountant.addClient')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )

  // Step 3: Go to review queue
  const renderGoToReviewStep = () => {
    const selectedClientName = localStorage.getItem('selectedClientName') || 'geselecteerde klant'
    
    return (
      <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle size={64} weight="fill" className="text-green-500" />
          </div>
          <CardTitle className="text-2xl text-green-600">{t('onboarding.step3Title')}</CardTitle>
          <CardDescription className="text-base">
            {t('onboarding.step3Description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-secondary/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">{t('clientSwitcher.activeClient')}:</p>
            <p className="text-lg font-semibold">{selectedClientName}</p>
          </div>
          
          <Button onClick={handleGoToReview} className="w-full" size="lg">
            <Stack size={20} className="mr-2" />
            {t('onboarding.goToReviewQueue')}
            <ArrowRight size={18} className="ml-2" />
          </Button>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setCurrentStep('select-client')}
            >
              <ArrowLeft size={16} className="mr-2" />
              {t('clientSwitcher.change')}
            </Button>
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => {
                onComplete()
                navigateTo('/accountant/clients')
              }}
            >
              {t('sidebar.accountantClients')}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Calculate step number for progress indicator
  const getStepNumber = () => {
    switch (currentStep) {
      case 'link-client': return 1
      case 'select-client': return 2
      case 'go-to-review': return 3
      default: return 1
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Database size={48} weight="duotone" className="text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              {t('brand.name')}
            </h1>
          </div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            {t('onboarding.welcomeAccountant')}, {userName}!
          </h2>
          <p className="text-muted-foreground">
            {t('onboarding.accountantDescription')}
          </p>
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mt-6">
            <div className={`h-2 w-16 rounded-full transition-colors ${getStepNumber() >= 1 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-2 w-16 rounded-full transition-colors ${getStepNumber() >= 2 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-2 w-16 rounded-full transition-colors ${getStepNumber() >= 3 ? 'bg-primary' : 'bg-muted'}`} />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Stap {getStepNumber()} van 3
          </p>
        </div>
        
        {/* Step content */}
        {currentStep === 'link-client' && renderLinkClientStep()}
        {currentStep === 'select-client' && renderSelectClientStep()}
        {currentStep === 'go-to-review' && renderGoToReviewStep()}
      </div>
    </div>
  )
}
