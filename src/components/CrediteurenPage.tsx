/**
 * CrediteurenPage - Suppliers/Payables Page
 * 
 * Frontend-only page showing crediteuren (suppliers/payables) overview.
 * This is a placeholder page with empty state and CTA buttons
 * pointing to related functionality (AI Upload, Bank & Kas).
 * 
 * Features:
 * - Dutch UI text
 * - Empty state with helpful tips
 * - CTA buttons to navigate to upload and bank pages
 * - Mobile-responsive design
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  UsersThree,
  Sparkle,
  Bank,
  FileText,
} from '@phosphor-icons/react'

interface CrediteurenPageProps {
  onNavigate?: (tab: string) => void
}

export const CrediteurenPage = ({ onNavigate }: CrediteurenPageProps) => {
  const handleGoToUpload = () => {
    if (onNavigate) {
      onNavigate('upload')
    } else {
      navigateTo('/ai-upload')
    }
  }

  const handleGoToBank = () => {
    if (onNavigate) {
      onNavigate('bank')
    } else {
      navigateTo('/accountant/bank')
    }
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 max-w-4xl">
      <Card className="bg-card/80 backdrop-blur-sm mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <UsersThree size={24} weight="duotone" className="text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">{t('crediteuren.title')}</CardTitle>
              <CardDescription>{t('crediteuren.subtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Empty State */}
      <EmptyState
        title={t('crediteuren.noSuppliersYet')}
        description={t('crediteuren.noSuppliersDescription')}
        icon={<FileText size={64} weight="duotone" className="text-muted-foreground" />}
        tips={[
          t('crediteuren.tips.uploadInvoices'),
          t('crediteuren.tips.autoExtract'),
          t('crediteuren.tips.trackPayables'),
        ]}
      />

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
        <Button onClick={handleGoToUpload} className="gap-2">
          <Sparkle size={18} />
          {t('crediteuren.goToUpload')}
        </Button>
        <Button variant="outline" onClick={handleGoToBank} className="gap-2">
          <Bank size={18} />
          {t('crediteuren.goToBank')}
        </Button>
      </div>
    </div>
  )
}

export default CrediteurenPage
