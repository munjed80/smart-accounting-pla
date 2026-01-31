/**
 * Support Page
 * 
 * Contact information and support message form.
 * Uses mailto fallback if API endpoint is not available.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/lib/AuthContext'
import { api } from '@/lib/api'
import { 
  Envelope,
  Phone,
  ChatCircle,
  Headset,
  PaperPlaneTilt,
  CheckCircle,
  Info,
  ArrowsClockwise,
  Question
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { t } from '@/i18n'

const SUPPORT_EMAIL = 'support@zzpershub.nl'
const SUPPORT_PHONE = '+31 (0)20 123 4567'

interface SupportRequest {
  subject: string
  category: string
  message: string
  email: string
  name: string
}

export const SupportPage = () => {
  const { user } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [formData, setFormData] = useState<SupportRequest>({
    subject: '',
    category: '',
    message: '',
    email: user?.email || '',
    name: user?.full_name || '',
  })

  const handleInputChange = (field: keyof SupportRequest, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.subject || !formData.category || !formData.message || !formData.email || !formData.name) {
      toast.error(t('support.fillAllFields'))
      return
    }

    setIsSubmitting(true)
    
    try {
      // Try to submit via API first
      await api.post('/support/contact', formData)
      setIsSubmitted(true)
      toast.success(t('support.messageSent'))
    } catch (error) {
      // Fallback to mailto if API fails
      console.log('API support endpoint not available, using mailto fallback')
      const mailtoLink = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[${formData.category}] ${formData.subject}`)}&body=${encodeURIComponent(`Name: ${formData.name}\nEmail: ${formData.email}\n\n${formData.message}`)}`
      window.location.href = mailtoLink
      // Mark as submitted since we're using fallback
      setIsSubmitted(true)
      toast.info(t('support.openingEmailClient'), {
        description: t('support.emailClientFallback') + ' ' + SUPPORT_EMAIL
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setIsSubmitted(false)
    setFormData({
      subject: '',
      category: '',
      message: '',
      email: user?.email || '',
      name: user?.full_name || '',
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
            <Headset size={32} weight="duotone" className="text-primary" />
            {t('support.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('support.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Information */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">{t('support.contactInfo')}</CardTitle>
                <CardDescription>{t('support.contactDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Envelope size={20} className="text-primary mt-0.5" weight="duotone" />
                  <div>
                    <p className="font-medium text-sm">{t('support.emailSupport')}</p>
                    <a 
                      href={`mailto:${SUPPORT_EMAIL}`}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {SUPPORT_EMAIL}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone size={20} className="text-primary mt-0.5" weight="duotone" />
                  <div>
                    <p className="font-medium text-sm">{t('support.phoneSupport')}</p>
                    <a 
                      href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {SUPPORT_PHONE}
                    </a>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('support.phoneHours')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <ChatCircle size={20} className="text-primary mt-0.5" weight="duotone" />
                  <div>
                    <p className="font-medium text-sm">{t('support.responseTime')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('support.responseTimeValue')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">{t('support.quickHelp')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="ghost" className="w-full justify-start gap-2" asChild>
                  <a href="https://docs.zzpershub.nl" target="_blank" rel="noopener noreferrer">
                    <Question size={18} />
                    {t('support.documentation')}
                  </a>
                </Button>
                <Button variant="ghost" className="w-full justify-start gap-2" asChild>
                  <a href="https://status.zzpershub.nl" target="_blank" rel="noopener noreferrer">
                    <Info size={18} />
                    {t('support.systemStatus')}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PaperPlaneTilt size={20} weight="duotone" />
                  {t('support.sendMessage')}
                </CardTitle>
                <CardDescription>
                  {t('support.sendMessageDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isSubmitted ? (
                  <div className="text-center py-8">
                    <CheckCircle size={64} className="mx-auto mb-4 text-green-500" weight="duotone" />
                    <h3 className="text-xl font-semibold mb-2">{t('support.messageSent')}</h3>
                    <p className="text-muted-foreground mb-6">
                      {t('support.thankYou')}
                    </p>
                    <Button onClick={handleReset} variant="outline">
                      {t('support.sendAnotherMessage')}
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">{t('support.yourName')}</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          placeholder={t('auth.fullName')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{t('support.emailAddress')}</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          placeholder="uw@email.nl"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category">{t('support.category')} *</Label>
                      <Select 
                        value={formData.category} 
                        onValueChange={(value) => handleInputChange('category', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('support.selectCategory')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">{t('support.generalQuestion')}</SelectItem>
                          <SelectItem value="technical">{t('support.technicalIssue')}</SelectItem>
                          <SelectItem value="billing">{t('support.billingAccount')}</SelectItem>
                          <SelectItem value="feature">{t('support.featureRequest')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">{t('support.subject')} *</Label>
                      <Input
                        id="subject"
                        value={formData.subject}
                        onChange={(e) => handleInputChange('subject', e.target.value)}
                        placeholder={t('support.subjectPlaceholder')}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">{t('support.message')} *</Label>
                      <Textarea
                        id="message"
                        value={formData.message}
                        onChange={(e) => handleInputChange('message', e.target.value)}
                        placeholder={t('support.messagePlaceholder')}
                        rows={6}
                        required
                      />
                    </div>

                    <Alert>
                      <Info size={16} />
                      <AlertDescription>
                        {t('support.helpTip')}
                      </AlertDescription>
                    </Alert>

                    <div className="flex justify-end pt-4">
                      <Button type="submit" disabled={isSubmitting} className="gap-2">
                        {isSubmitting ? (
                          <>
                            <ArrowsClockwise size={18} className="animate-spin" />
                            {t('common.sending')}
                          </>
                        ) : (
                          <>
                            <PaperPlaneTilt size={18} />
                            {t('common.send')}
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SupportPage
