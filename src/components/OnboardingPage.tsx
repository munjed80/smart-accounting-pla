import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Database, 
  User, 
  Buildings, 
  CheckCircle, 
  ArrowRight,
  ArrowLeft,
  Sparkle,
  Briefcase
} from '@phosphor-icons/react'
import { administrationApi, AdministrationCreateRequest } from '@/lib/api'
import { toast } from 'sonner'

interface OnboardingPageProps {
  userRole: 'zzp' | 'accountant' | 'admin'
  userName: string
  onComplete: () => void
}

type OnboardingStep = 'account-type' | 'create-administration' | 'confirmation'

export const OnboardingPage = ({ userRole, userName, onComplete }: OnboardingPageProps) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('account-type')
  const [accountType, setAccountType] = useState<'zzp' | 'accountant'>(
    userRole === 'accountant' ? 'accountant' : 'zzp'
  )
  const [isLoading, setIsLoading] = useState(false)
  
  // Administration form state
  const [administrationForm, setAdministrationForm] = useState<AdministrationCreateRequest>({
    name: '',
    description: '',
    kvk_number: '',
    btw_number: '',
  })
  
  const handleAccountTypeSelect = (type: 'zzp' | 'accountant') => {
    setAccountType(type)
    setCurrentStep('create-administration')
  }
  
  const handleCreateAdministration = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      await administrationApi.create(administrationForm)
      toast.success('Administration created successfully!')
      setCurrentStep('confirmation')
    } catch (error) {
      console.error('Failed to create administration:', error)
      toast.error('Failed to create administration. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleGoBack = () => {
    if (currentStep === 'create-administration') {
      setCurrentStep('account-type')
    }
  }

  // Step 1: Choose account type
  const renderAccountTypeStep = () => (
    <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <User size={48} weight="duotone" className="text-primary" />
        </div>
        <CardTitle className="text-2xl">Welcome, {userName}!</CardTitle>
        <CardDescription className="text-base">
          Let's set up your account. First, tell us how you'll be using Smart Accounting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ZZP Option */}
          <button
            onClick={() => handleAccountTypeSelect('zzp')}
            className={`p-6 rounded-lg border-2 text-left transition-all hover:border-primary hover:bg-primary/5 ${
              accountType === 'zzp' ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <Briefcase size={32} weight="duotone" className="text-primary" />
              <div>
                <h3 className="font-semibold text-lg">ZZP / Freelancer</h3>
                <Badge variant="outline" className="text-xs">Self-Employed</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              I'm self-employed and want to manage my own bookkeeping and VAT returns.
            </p>
          </button>
          
          {/* Accountant Option */}
          <button
            onClick={() => handleAccountTypeSelect('accountant')}
            className={`p-6 rounded-lg border-2 text-left transition-all hover:border-primary hover:bg-primary/5 ${
              accountType === 'accountant' ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <Buildings size={32} weight="duotone" className="text-accent" />
              <div>
                <h3 className="font-semibold text-lg">Accountant</h3>
                <Badge variant="outline" className="text-xs">Multi-client</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              I'm an accountant managing bookkeeping for multiple clients (ZZP or businesses).
            </p>
          </button>
        </div>
        
        <p className="text-center text-xs text-muted-foreground mt-6">
          <Sparkle size={14} className="inline mr-1" />
          You can change this later in your settings
        </p>
      </CardContent>
    </Card>
  )

  // Step 2: Create first administration
  const renderCreateAdministrationStep = () => (
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
            Back
          </Button>
        </div>
        <div className="flex justify-center mb-4">
          <Buildings size={48} weight="duotone" className="text-primary" />
        </div>
        <CardTitle className="text-2xl text-center">
          {accountType === 'zzp' ? 'Create Your Administration' : 'Create Your First Client'}
        </CardTitle>
        <CardDescription className="text-base text-center">
          {accountType === 'zzp'
            ? 'Set up your business administration to start tracking invoices and expenses.'
            : 'Add your first client administration. You can add more clients later.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateAdministration} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-name">
              {accountType === 'zzp' ? 'Business Name' : 'Client Name'} *
            </Label>
            <Input
              id="admin-name"
              placeholder={accountType === 'zzp' ? 'e.g., John Doe Consulting' : 'e.g., Client Company B.V.'}
              value={administrationForm.name}
              onChange={(e) => setAdministrationForm({ ...administrationForm, name: e.target.value })}
              required
              minLength={1}
              maxLength={255}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="admin-kvk">KVK Number (optional)</Label>
            <Input
              id="admin-kvk"
              placeholder="e.g., 12345678"
              value={administrationForm.kvk_number}
              onChange={(e) => setAdministrationForm({ ...administrationForm, kvk_number: e.target.value })}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">Dutch Chamber of Commerce registration number</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="admin-btw">BTW Number (optional)</Label>
            <Input
              id="admin-btw"
              placeholder="e.g., NL123456789B01"
              value={administrationForm.btw_number}
              onChange={(e) => setAdministrationForm({ ...administrationForm, btw_number: e.target.value })}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">VAT identification number</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="admin-description">Description (optional)</Label>
            <Input
              id="admin-description"
              placeholder="Brief description of the business"
              value={administrationForm.description}
              onChange={(e) => setAdministrationForm({ ...administrationForm, description: e.target.value })}
              maxLength={1000}
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full mt-6" 
            disabled={isLoading || !administrationForm.name.trim()}
          >
            {isLoading ? 'Creating...' : 'Create Administration'}
            <ArrowRight size={18} className="ml-2" />
          </Button>
        </form>
      </CardContent>
    </Card>
  )

  // Step 3: Confirmation
  const renderConfirmationStep = () => (
    <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <CheckCircle size={64} weight="fill" className="text-green-500" />
        </div>
        <CardTitle className="text-2xl text-green-600">You're All Set!</CardTitle>
        <CardDescription className="text-base">
          Your account is ready. You can now start using Smart Accounting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
          <h4 className="font-medium">What you can do now:</h4>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-center gap-2">
              <Sparkle size={16} className="text-primary" />
              Upload invoices and receipts for automatic processing
            </li>
            <li className="flex items-center gap-2">
              <Sparkle size={16} className="text-primary" />
              Review and approve AI-generated transactions
            </li>
            <li className="flex items-center gap-2">
              <Sparkle size={16} className="text-primary" />
              Track your VAT obligations and deadlines
            </li>
            {accountType === 'accountant' && (
              <li className="flex items-center gap-2">
                <Sparkle size={16} className="text-primary" />
                Add more client administrations from the dashboard
              </li>
            )}
          </ul>
        </div>
        
        <Button onClick={onComplete} className="w-full" size="lg">
          Go to Dashboard
          <ArrowRight size={18} className="ml-2" />
        </Button>
        
        {/* TODO: Future expansion - Add links to help docs, video tutorials, etc. */}
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
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {/* Step 1 is always highlighted (current or completed) */}
            <div className="h-2 w-16 rounded-full transition-colors bg-primary" />
            <div className={`h-2 w-16 rounded-full transition-colors ${
              currentStep === 'create-administration' || currentStep === 'confirmation' 
                ? 'bg-primary' 
                : 'bg-muted'
            }`} />
            <div className={`h-2 w-16 rounded-full transition-colors ${
              currentStep === 'confirmation' ? 'bg-primary' : 'bg-muted'
            }`} />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Step {currentStep === 'account-type' ? '1' : currentStep === 'create-administration' ? '2' : '3'} of 3
          </p>
        </div>
        
        {/* Step content */}
        {currentStep === 'account-type' && renderAccountTypeStep()}
        {currentStep === 'create-administration' && renderCreateAdministrationStep()}
        {currentStep === 'confirmation' && renderConfirmationStep()}
      </div>
    </div>
  )
}
