/**
 * AccountantNotFoundPage - 404 Fallback Page for Accountant Routes
 * 
 * Shows a Dutch message when an accountant navigates to a non-existent route.
 * Provides a button to go back to the main workqueue.
 * 
 * Features:
 * - Dutch UI text
 * - Clear messaging
 * - CTA button to return to workqueue
 * - Mobile-responsive design
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  WarningCircle,
  ArrowLeft,
} from '@phosphor-icons/react'

interface AccountantNotFoundPageProps {
  onNavigate?: (tab: string) => void
}

export const AccountantNotFoundPage = ({ onNavigate }: AccountantNotFoundPageProps) => {
  const handleBackToWorkqueue = () => {
    if (onNavigate) {
      onNavigate('workqueue')
    } else {
      navigateTo('/accountant')
    }
  }

  return (
    <div className="container mx-auto py-12 px-4 sm:px-6 max-w-md">
      <Card className="bg-card/80 backdrop-blur-sm text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <WarningCircle size={64} weight="duotone" className="text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">{t('accountantNotFound.title')}</CardTitle>
          <CardDescription className="text-base">
            {t('accountantNotFound.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackToWorkqueue} className="gap-2">
            <ArrowLeft size={18} />
            {t('accountantNotFound.backToWorkqueue')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default AccountantNotFoundPage
