import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  FolderOpen, 
  Plus,
  ArrowRight,
  Sparkle
} from '@phosphor-icons/react'
import { t } from '@/i18n'

interface EmptyStateProps {
  title: string
  description: string
  icon?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  tips?: string[]
}

/**
 * EmptyState component for displaying when there's no data
 * 
 * Used to replace blank screens with helpful guidance and CTAs.
 * Follows the requirement: "No blank screens allowed"
 */
export const EmptyState = ({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  tips,
}: EmptyStateProps) => {
  return (
    <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20 max-w-xl mx-auto">
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-4">
          {icon || <FolderOpen size={64} weight="duotone" className="text-muted-foreground" />}
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tips section */}
        {tips && tips.length > 0 && (
          <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Sparkle size={16} className="text-primary" />
              {t('emptyStates.gettingStarted')}
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {tips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          {actionLabel && onAction && (
            <Button onClick={onAction} className="gap-2">
              <Plus size={18} />
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" onClick={onSecondaryAction} className="gap-2">
              {secondaryActionLabel}
              <ArrowRight size={18} />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Specific empty state for when user has no administrations
 * Used in dashboards to guide users to create their first administration
 */
interface NoAdministrationsEmptyStateProps {
  userRole: 'zzp' | 'accountant' | 'admin'
  onCreateAdministration: () => void
}

export const NoAdministrationsEmptyState = ({
  userRole,
  onCreateAdministration,
}: NoAdministrationsEmptyStateProps) => {
  const isAccountant = userRole === 'accountant' || userRole === 'admin'
  
  return (
    <EmptyState
      title={isAccountant ? t('emptyStates.noClientsYetAccountant') : t('emptyStates.noAdministrationYet')}
      description={
        isAccountant
          ? t('emptyStates.noClientsAccountant')
          : t('emptyStates.noAdministrationZzp')
      }
      actionLabel={isAccountant ? t('emptyStates.addFirstClientAccountant') : t('emptyStates.createAdministration')}
      onAction={onCreateAdministration}
      tips={[
        isAccountant
          ? t('emptyStates.eachClientSeparate')
          : t('emptyStates.adminOrganized'),
        t('emptyStates.uploadInvoices'),
        t('emptyStates.trackVat'),
      ]}
    />
  )
}

/**
 * Specific empty state for when there are no transactions
 */
interface NoTransactionsEmptyStateProps {
  onUploadDocument?: () => void
}

export const NoTransactionsEmptyState = ({
  onUploadDocument,
}: NoTransactionsEmptyStateProps) => {
  return (
    <EmptyState
      title={t('emptyStates.noTransactionsYet')}
      description={t('emptyStates.noTransactionsDescription')}
      actionLabel={t('emptyStates.uploadDocument')}
      onAction={onUploadDocument}
      tips={[
        t('emptyStates.uploadFormats'),
        t('emptyStates.aiExtract'),
        t('emptyStates.reviewBeforePost'),
      ]}
    />
  )
}

/**
 * Specific empty state for when there are no documents
 */
interface NoDocumentsEmptyStateProps {
  onUploadDocument?: () => void
}

export const NoDocumentsEmptyState = ({
  onUploadDocument,
}: NoDocumentsEmptyStateProps) => {
  return (
    <EmptyState
      title={t('emptyStates.noDocumentsUploaded')}
      description={t('emptyStates.noDocumentsDescription')}
      actionLabel={t('emptyStates.uploadFirstDocument')}
      onAction={onUploadDocument}
      tips={[
        t('emptyStates.supportedFormats'),
        t('emptyStates.aiProcesses'),
        t('emptyStates.secureStorage'),
      ]}
    />
  )
}

/**
 * Empty state for accountant clients page when there are no clients assigned
 */
interface NoClientsAssignedEmptyStateProps {
  onRefresh?: () => void
}

export const NoClientsAssignedEmptyState = ({
  onRefresh,
}: NoClientsAssignedEmptyStateProps) => {
  return (
    <EmptyState
      title={t('emptyStates.noClientsAssigned')}
      description={t('emptyStates.noClientsAssignedDescription')}
      actionLabel={t('common.refresh')}
      onAction={onRefresh}
      tips={[
        t('emptyStates.clientsAssignedByAdmin'),
        t('emptyStates.onceAssigned'),
        t('emptyStates.trackVatDeadlines'),
      ]}
    />
  )
}

/**
 * Empty state for review queue when there are no items to review
 */
interface NoReviewItemsEmptyStateProps {
  onRefresh?: () => void
}

export const NoReviewItemsEmptyState = ({
  onRefresh,
}: NoReviewItemsEmptyStateProps) => {
  return (
    <EmptyState
      title={t('emptyStates.noReviewItems')}
      description={t('emptyStates.noReviewItemsDescription')}
      actionLabel={t('common.refresh')}
      onAction={onRefresh}
      tips={[
        t('emptyStates.newItemsAppear'),
        t('emptyStates.aiTransactionsNeedVerification'),
        t('emptyStates.checkBackLater'),
      ]}
    />
  )
}
