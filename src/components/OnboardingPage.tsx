import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Database, 
  Buildings, 
  CheckCircle, 
  ArrowRight,
  ArrowLeft,
  Bank,
  Invoice,
  Upload,
  House
} from '@phosphor-icons/react'
import { administrationApi, AdministrationCreateRequest } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { toast } from 'sonner'
import { t } from '@/i18n'

interface OnboardingPageProps {
  userRole: 'zzp' | 'accountant' | 'admin'
  userName: string
  onComplete: () => void
}

type OnboardingStep = 'bedrijf' | 'bankgegevens' | 'klaar'

export const OnboardingPage = ({ userName, onComplete }: OnboardingPageProps) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('bedrijf')
  const [isLoading, setIsLoading] = useState(false)
  
  // Administration form state
  const [administrationForm, setAdministrationForm] = useState<AdministrationCreateRequest>({
    name: '',
    kvk_number: '',
    btw_number: '',
  })
  
  // IBAN is collected but stored in description for now (no backend field yet)
  const [iban, setIban] = useState('')
  
  const handleBedrijfNext = () => {
    if (!administrationForm.name.trim()) return
    setCurrentStep('bankgegevens')
  }
  
  const handleCreateAdministration = async () => {
    setIsLoading(true)
    
    try {
      // Store IBAN in description if provided (until dedicated field is added)
      const createData: AdministrationCreateRequest = {
        ...administrationForm,
        description: iban ? `IBAN: ${iban}` : undefined,
      }
      await administrationApi.create(createData)
      toast.success(t('onboarding.adminCreatedSuccess'))
      setCurrentStep('klaar')
    } catch (error) {
      console.error('Failed to create administration:', error)
      toast.error(t('onboarding.adminCreatedError'))
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleGoBack = () => {
    if (currentStep === 'bankgegevens') {
      setCurrentStep('bedrijf')
    }
  }

  // Step 1: Over je bedrijf
  const renderBedrijfStep = () => (
    <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Buildings size={48} weight="duotone" className="text-primary" />
        </div>
        <CardTitle className="text-2xl">Over je bedrijf</CardTitle>
        <CardDescription className="text-base">
          Vul je bedrijfsgegevens in om je administratie aan te maken.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-name">Bedrijfsnaam *</Label>
            <Input
              id="admin-name"
              placeholder="bijv. Jan Jansen Consulting"
              value={administrationForm.name}
              onChange={(e) => setAdministrationForm({ ...administrationForm, name: e.target.value })}
              required
              minLength={1}
              maxLength={255}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="admin-kvk">KVK-nummer (optioneel maar aanbevolen)</Label>
            <Input
              id="admin-kvk"
              placeholder="bijv. 12345678"
              value={administrationForm.kvk_number}
              onChange={(e) => setAdministrationForm({ ...administrationForm, kvk_number: e.target.value })}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">Inschrijfnummer Kamer van Koophandel</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="admin-btw">BTW-nummer (optioneel maar aanbevolen)</Label>
            <Input
              id="admin-btw"
              placeholder="bijv. NL123456789B01"
              value={administrationForm.btw_number}
              onChange={(e) => setAdministrationForm({ ...administrationForm, btw_number: e.target.value })}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">BTW-identificatienummer</p>
          </div>
          
          <Button 
            onClick={handleBedrijfNext}
            className="w-full mt-6" 
            disabled={!administrationForm.name.trim()}
          >
            Volgende
            <ArrowRight size={18} className="ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  // Step 2: Bankgegevens
  const renderBankgegevensStep = () => (
    <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoBack}
            className="text-muted-foreground"
          >
            <ArrowLeft size={16} className="mr-1" />
            {t('common.back')}
          </Button>
        </div>
        <div className="flex justify-center mb-4">
          <Bank size={48} weight="duotone" className="text-primary" />
        </div>
        <CardTitle className="text-2xl text-center">Bankgegevens</CardTitle>
        <CardDescription className="text-base text-center">
          Voeg je IBAN toe. Dit wordt later gebruikt voor factuursjablonen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-iban">IBAN (optioneel maar aanbevolen)</Label>
            <Input
              id="admin-iban"
              placeholder="bijv. NL91 ABNA 0417 1643 00"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              maxLength={34}
            />
            <p className="text-xs text-muted-foreground">
              Je IBAN wordt gebruikt voor je factuursjablonen
            </p>
          </div>
          
          <Button 
            onClick={handleCreateAdministration}
            className="w-full mt-6" 
            disabled={isLoading}
          >
            {isLoading ? 'Aanmaken...' : 'Administratie aanmaken'}
            <ArrowRight size={18} className="ml-2" />
          </Button>
          
          <Button
            variant="ghost"
            onClick={handleCreateAdministration}
            className="w-full text-muted-foreground"
            disabled={isLoading}
          >
            Overslaan — ik voeg dit later toe
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  // Step 3: Klaar!
  const renderKlaarStep = () => (
    <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <CheckCircle size={64} weight="fill" className="text-green-500" />
        </div>
        <CardTitle className="text-2xl text-green-600">Klaar!</CardTitle>
        <CardDescription className="text-base">
          Je administratie is aangemaakt. Je kunt nu aan de slag!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button 
            onClick={() => {
              onComplete()
              setTimeout(() => navigateTo('/zzp/invoices'), 0)
            }}
            variant="outline"
            className="flex flex-col items-center gap-2 h-auto py-4"
          >
            <Invoice size={24} weight="duotone" className="text-primary" />
            <span className="text-sm">Maak je eerste factuur →</span>
          </Button>
          
          <Button 
            onClick={() => {
              onComplete()
              setTimeout(() => navigateTo('/ai-upload'), 0)
            }}
            variant="outline"
            className="flex flex-col items-center gap-2 h-auto py-4"
          >
            <Upload size={24} weight="duotone" className="text-primary" />
            <span className="text-sm">Upload een bon →</span>
          </Button>
          
          <Button 
            onClick={onComplete}
            className="flex flex-col items-center gap-2 h-auto py-4"
          >
            <House size={24} weight="duotone" />
            <span className="text-sm">Bekijk je dashboard →</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Database size={48} weight="duotone" className="text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Smart Accounting
            </h1>
          </div>
          
          <p className="text-lg text-muted-foreground mb-2">
            Welkom, {userName}!
          </p>
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mt-6">
            <div className="h-2 w-16 rounded-full transition-colors bg-primary" />
            <div className={`h-2 w-16 rounded-full transition-colors ${
              currentStep === 'bankgegevens' || currentStep === 'klaar' 
                ? 'bg-primary' 
                : 'bg-muted'
            }`} />
            <div className={`h-2 w-16 rounded-full transition-colors ${
              currentStep === 'klaar' ? 'bg-primary' : 'bg-muted'
            }`} />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {t('onboarding.step')} {currentStep === 'bedrijf' ? '1' : currentStep === 'bankgegevens' ? '2' : '3'} {t('onboarding.of')} 3
          </p>
        </div>
        
        {/* Step content */}
        {currentStep === 'bedrijf' && renderBedrijfStep()}
        {currentStep === 'bankgegevens' && renderBankgegevensStep()}
        {currentStep === 'klaar' && renderKlaarStep()}
      </div>
    </div>
  )
}
