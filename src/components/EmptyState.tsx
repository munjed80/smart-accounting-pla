import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  FolderOpen, 
  Plus,
  ArrowRight,
  Sparkle
} from '@phosphor-icons/react'

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
              Getting Started
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
      title={isAccountant ? 'No Clients Yet' : 'No Administration Yet'}
      description={
        isAccountant
          ? 'Add your first client administration to start managing their bookkeeping.'
          : 'Create your business administration to start tracking invoices and expenses.'
      }
      actionLabel={isAccountant ? 'Add First Client' : 'Create Administration'}
      onAction={onCreateAdministration}
      tips={[
        isAccountant
          ? 'Each client gets their own separate administration'
          : 'Your administration keeps all your financial data organized',
        'Upload invoices and receipts for automatic AI processing',
        'Track VAT obligations and generate BTW reports',
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
      title="No Transactions Yet"
      description="Upload your first invoice or receipt to create transactions automatically."
      actionLabel="Upload Document"
      onAction={onUploadDocument}
      tips={[
        'Upload PDFs, images, or scanned documents',
        'AI will extract data and create transactions',
        'Review and approve before posting to ledger',
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
      title="No Documents Uploaded"
      description="Start by uploading your invoices, receipts, or bank statements."
      actionLabel="Upload First Document"
      onAction={onUploadDocument}
      tips={[
        'Supported formats: PDF, PNG, JPG, JPEG',
        'AI processes documents in seconds',
        'All documents are securely stored',
      ]}
    />
  )
}
