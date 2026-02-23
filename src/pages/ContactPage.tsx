import { useState } from 'react'
import { navigateTo } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle } from 'lucide-react'
import { MarketingFooter } from '@/components/marketing/Footer'

type ContactFormData = {
  name: string
  email: string
  role: 'zzp' | 'boekhouder' | ''
  message: string
}

type ContactFormErrors = {
  name?: string
  email?: string
  role?: string
  message?: string
}

export const ContactPage = () => {
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    role: '',
    message: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<ContactFormErrors>({})

  const validate = (): boolean => {
    const newErrors: ContactFormErrors = {}
    if (!formData.name.trim()) newErrors.name = 'Naam is verplicht'
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Voer een geldig e-mailadres in'
    }
    if (!formData.role) newErrors.role = 'Selecteer uw rol'
    if (!formData.message.trim() || formData.message.trim().length < 10) {
      newErrors.message = 'Bericht moet minimaal 10 tekens bevatten'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    // In a real implementation this would call an API endpoint
    setSubmitted(true)
  }

  const handleChange = (field: keyof ContactFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field as keyof ContactFormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => navigateTo('/')} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            Smart Accounting
          </button>
          <Button variant="ghost" onClick={() => navigateTo('/login')}>Inloggen</Button>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2">Contact opnemen</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Vragen over het platform, prijzen of samenwerking? Vul het formulier in en wij reageren binnen één werkdag.
        </p>

        {submitted ? (
          <Card className="border-accent/30">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="h-12 w-12 text-accent" />
              </div>
              <h2 className="text-xl font-semibold">Bericht verstuurd!</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Bedankt voor uw bericht. Wij nemen zo snel mogelijk contact met u op, uiterlijk binnen één werkdag.
              </p>
              <Button variant="outline" onClick={() => navigateTo('/')}>Terug naar home</Button>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1.5">
                Naam <span className="text-destructive">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Uw volledige naam"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                E-mailadres <span className="text-destructive">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="u@voorbeeld.nl"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
              />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Ik ben een <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-4">
                {(['zzp', 'boekhouder'] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={formData.role === r}
                      onChange={() => handleChange('role', r)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm capitalize">{r === 'zzp' ? 'ZZP\'er' : 'Boekhouder'}</span>
                  </label>
                ))}
              </div>
              {errors.role && <p className="mt-1 text-xs text-destructive">{errors.role}</p>}
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium mb-1.5">
                Bericht <span className="text-destructive">*</span>
              </label>
              <textarea
                id="message"
                value={formData.message}
                onChange={(e) => handleChange('message', e.target.value)}
                placeholder="Uw vraag of opmerking..."
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 resize-y"
              />
              {errors.message && <p className="mt-1 text-xs text-destructive">{errors.message}</p>}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="submit" className="w-full sm:w-auto">
                Verstuur bericht
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigateTo('/')}>
                Annuleren
              </Button>
            </div>
          </form>
        )}
      </main>

      <MarketingFooter />
    </div>
  )
}
