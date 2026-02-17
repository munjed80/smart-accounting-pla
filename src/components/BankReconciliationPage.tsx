/**
 * BankReconciliationPage - Bank Import & Reconciliation for Accountants
 * 
 * Features:
 * - Upload bank statement CSV files
 * - View imported transactions with filters
 * - Get match suggestions
 * - Apply reconciliation actions (match, ignore, create expense)
 * - Dutch-first UI
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { RequireActiveClient } from '@/components/RequireActiveClient'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { 
  bankReconciliationApi, 
  BankTransaction, 
  BankTransactionStatus,
  MatchSuggestion,
  ApplyActionRequest,
  BankKPI,
  MatchProposal,
  getErrorMessage 
} from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import {
  Upload,
  FileText,
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  Clock,
  Warning,
  Lightning,
  Link,
  Receipt,
  X,
  CaretDown,
  Bank,
  Info,
  TrendUp,
  ArrowUp,
  ArrowDown,
  Sparkle,
  ThumbsUp,
  ThumbsDown,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'

// Status badge colors
const statusStyles: Record<BankTransactionStatus, { bg: string; text: string; border: string }> = {
  NEW: { 
    bg: 'bg-blue-500/20', 
    text: 'text-blue-700 dark:text-blue-400', 
    border: 'border-blue-500/40' 
  },
  MATCHED: { 
    bg: 'bg-green-500/20', 
    text: 'text-green-700 dark:text-green-400', 
    border: 'border-green-500/40' 
  },
  IGNORED: { 
    bg: 'bg-gray-500/20', 
    text: 'text-gray-700 dark:text-gray-400', 
    border: 'border-gray-500/40' 
  },
  NEEDS_REVIEW: { 
    bg: 'bg-amber-500/20', 
    text: 'text-amber-700 dark:text-amber-400', 
    border: 'border-amber-500/40' 
  },
}

const StatusBadge = ({ status }: { status: BankTransactionStatus }) => {
  const styles = statusStyles[status]
  const statusLabels: Record<BankTransactionStatus, string> = {
    NEW: t('reconciliation.new'),
    MATCHED: t('reconciliation.matched'),
    IGNORED: t('reconciliation.ignored'),
    NEEDS_REVIEW: t('reconciliation.needsReview'),
  }
  
  const StatusIcon = {
    NEW: Clock,
    MATCHED: CheckCircle,
    IGNORED: XCircle,
    NEEDS_REVIEW: Warning,
  }[status]
  
  return (
    <Badge 
      variant="outline" 
      className={`${styles.bg} ${styles.text} ${styles.border} font-medium`}
    >
      <StatusIcon size={14} className="mr-1" weight="fill" />
      {statusLabels[status]}
    </Badge>
  )
}

// Format amount with color
const AmountDisplay = ({ amount }: { amount: number | string }) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  const isPositive = numAmount >= 0
  
  return (
    <span className={`font-mono font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {isPositive ? '+' : ''}{numAmount.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}
    </span>
  )
}

// KPI Strip Component
const KPIStrip = ({ 
  kpi, 
  isLoading,
  onGenerateProposals,
  isGeneratingProposals,
}: { 
  kpi: BankKPI | null
  isLoading: boolean
  onGenerateProposals: () => void
  isGeneratingProposals: boolean
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!kpi) return null

  const matchedPercentage = kpi.matched_percentage || 0
  const unmatchedCount = kpi.unmatched_count || 0
  const totalInflow = typeof kpi.total_inflow === 'string' ? parseFloat(kpi.total_inflow) : kpi.total_inflow
  const totalOutflow = typeof kpi.total_outflow === 'string' ? parseFloat(kpi.total_outflow) : kpi.total_outflow

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Matched Percentage */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendUp size={16} />
              <span>Gematcht (30d)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{matchedPercentage.toFixed(0)}%</span>
              <Badge 
                variant="secondary" 
                className={matchedPercentage >= 80 ? 'bg-green-500/20 text-green-700' : matchedPercentage >= 60 ? 'bg-amber-500/20 text-amber-700' : 'bg-red-500/20 text-red-700'}
              >
                {matchedPercentage >= 80 ? 'Goed' : matchedPercentage >= 60 ? 'Matig' : 'Laag'}
              </Badge>
            </div>
          </div>

          {/* Unmatched Count */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Warning size={16} />
              <span>Ongematcht</span>
            </div>
            <div className="text-2xl font-bold">{unmatchedCount}</div>
          </div>

          {/* Total Inflow */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowUp size={16} />
              <span>Instroom</span>
            </div>
            <div className="text-xl font-bold font-mono text-green-600 dark:text-green-400">
              {totalInflow.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>

          {/* Total Outflow */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowDown size={16} />
              <span>Uitstroom</span>
            </div>
            <div className="text-xl font-bold font-mono text-red-600 dark:text-red-400">
              {totalOutflow.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>

          {/* Generate Proposals Button */}
          <div className="flex items-end">
            <Button 
              onClick={onGenerateProposals}
              disabled={isGeneratingProposals}
              className="w-full"
            >
              <Sparkle size={16} className="mr-2" weight="fill" />
              {isGeneratingProposals ? 'Genereren...' : 'Genereer voorstellen'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Confidence Badge Component
const ConfidenceBadge = ({ score }: { score: number }) => {
  const getBadgeStyle = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40'
    if (score >= 60) return 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40'
    return 'bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/40'
  }

  return (
    <Badge variant="outline" className={`font-mono ${getBadgeStyle(score)}`}>
      {score}%
    </Badge>
  )
}

// Transaction row component
const TransactionRow = ({ 
  transaction, 
  onClick,
  isSelected,
  topProposal,
  onQuickMatch,
  onViewAllProposals,
  onUndo,
  isProcessing,
}: { 
  transaction: BankTransaction
  onClick: () => void
  isSelected: boolean
  topProposal?: MatchProposal | null
  onQuickMatch?: () => void
  onViewAllProposals?: () => void
  onUndo?: () => void
  isProcessing?: boolean
}) => {
  const numAmount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount
  const hasProposal = topProposal && topProposal.status === 'PENDING'
  const isMatched = transaction.status === 'MATCHED'
  
  return (
    <div 
      className={`p-4 border-b hover:bg-muted/50 transition-colors ${isSelected ? 'bg-muted' : ''}`}
    >
      <div 
        className="flex items-center justify-between gap-4 cursor-pointer"
        onClick={onClick}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-muted-foreground">
              {format(new Date(transaction.booking_date), 'd MMM yyyy', { locale: nlLocale })}
            </span>
            <StatusBadge status={transaction.status} />
          </div>
          <p className="font-medium truncate">
            {transaction.counterparty_name || t('common.unknown')}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {transaction.description}
          </p>
          {transaction.reference && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('bank.referenceShort')}: {transaction.reference}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <AmountDisplay amount={numAmount} />
        </div>
        <CaretDown size={20} className="text-muted-foreground rotate-[-90deg]" />
      </div>

      {/* Proposal Quick Actions */}
      {hasProposal && (
        <div className="mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <Sparkle size={20} className="text-primary flex-shrink-0 mt-0.5" weight="fill" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">Voorstel:</span>
                <ConfidenceBadge score={topProposal.confidence_score} />
              </div>
              <p className="text-sm font-medium">{topProposal.entity_reference}</p>
              <p className="text-xs text-muted-foreground mt-1">{topProposal.reason}</p>
              
              <div className="flex gap-2 mt-2">
                <Button 
                  size="sm" 
                  onClick={onQuickMatch}
                  disabled={isProcessing}
                >
                  <CheckCircle size={16} className="mr-1" weight="fill" />
                  Match
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={onViewAllProposals}
                  disabled={isProcessing}
                >
                  Andere voorstellen
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Undo for matched transactions */}
      {isMatched && onUndo && (
        <div className="mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
          <Button 
            size="sm" 
            variant="outline"
            onClick={onUndo}
            disabled={isProcessing}
          >
            <ArrowCounterClockwise size={16} className="mr-1" />
            Undo match
          </Button>
        </div>
      )}
    </div>
  )
}

// Upload dialog component
const UploadDialog = ({ 
  isOpen, 
  onClose, 
  administrationId,
  onImportSuccess,
}: { 
  isOpen: boolean
  onClose: () => void
  administrationId: string
  onImportSuccess: () => void
}) => {
  const [file, setFile] = useState<File | null>(null)
  const [bankAccountIban, setBankAccountIban] = useState('')
  const [bankName, setBankName] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    try {
      const result = await bankReconciliationApi.importFile({
        administration_id: administrationId,
        file,
        bank_account_iban: bankAccountIban || undefined,
        bank_name: bankName || undefined,
      })

      if (result.imported_count > 0) {
        toast.success(t('bank.importSuccess'), {
          description: `${result.imported_count} ${t('bank.imported')}${result.skipped_duplicates_count > 0 ? `, ${result.skipped_duplicates_count} ${t('bank.skipped')}` : ''}`
        })
        onImportSuccess()
        onClose()
      } else if (result.skipped_duplicates_count > 0) {
        toast.info(result.message)
      } else {
        toast.error(t('bank.importFailed'), {
          description: result.errors.length > 0 ? result.errors[0] : result.message
        })
      }
    } catch (error) {
      toast.error(t('bank.importFailed'), {
        description: getErrorMessage(error)
      })
      setIsUploading(false)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={20} />
            {t('bank.uploadTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('bank.uploadDescription')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* File input */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xml,.txt,.sta,.mt940"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full h-24 border-dashed"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-2">
                {file ? (
                  <>
                    <FileText size={24} className="text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{t('bank.fileSelected')}</span>
                  </>
                ) : (
                  <>
                    <Upload size={24} className="text-muted-foreground" />
                    <span className="text-sm">{t('bank.selectFile')}</span>
                  </>
                )}
              </div>
            </Button>
          </div>

          <div className="space-y-2">
            <Label>{t('bank.ibanLabel')}</Label>
            <Input
              value={bankAccountIban}
              onChange={(e) => setBankAccountIban(e.target.value)}
              placeholder={t('bank.ibanPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('bank.ibanHint')}</p>
          </div>

          <div className="space-y-2">
            <Label>{t('bank.bankNameLabel')}</Label>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={t('bank.bankNamePlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUploading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? t('bank.importing') : t('bank.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Suggestion card component
const SuggestionCard = ({ 
  suggestion, 
  onApply,
  isApplying,
}: { 
  suggestion: MatchSuggestion
  onApply: () => void
  isApplying: boolean
}) => {
  const typeLabels = {
    INVOICE: t('bankSuggestions.matchTypes.INVOICE'),
    EXPENSE: t('bankSuggestions.matchTypes.EXPENSE'),
    TRANSFER: t('bankSuggestions.matchTypes.TRANSFER'),
    MANUAL: t('bankSuggestions.matchTypes.MANUAL'),
  }

  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline">
                {typeLabels[suggestion.entity_type]}
              </Badge>
              <Badge 
                variant="secondary" 
                className={suggestion.confidence_score >= 80 ? 'bg-green-500/20' : suggestion.confidence_score >= 60 ? 'bg-amber-500/20' : 'bg-gray-500/20'}
              >
                {suggestion.confidence_score}%
              </Badge>
            </div>
            <p className="font-medium">{suggestion.entity_reference}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {suggestion.explanation}
            </p>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span>
                {format(new Date(suggestion.date), 'd MMM yyyy', { locale: nlLocale })}
              </span>
              <span className="font-mono">
                €{parseFloat(String(suggestion.amount)).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={onApply}
            disabled={isApplying}
          >
            <Link size={16} className="mr-1" />
            {t('reconciliation.match')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Transaction detail drawer
const TransactionDrawer = ({ 
  transaction, 
  isOpen, 
  onClose,
  administrationId,
  onActionApplied,
}: { 
  transaction: BankTransaction | null
  isOpen: boolean
  onClose: () => void
  administrationId: string
  onActionApplied: () => void
}) => {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [showCreateExpense, setShowCreateExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    vatRate: '',
    expenseCategory: '',
    notes: '',
  })

  const loadSuggestions = useCallback(async () => {
    if (!transaction) return
    
    setIsLoadingSuggestions(true)
    try {
      const response = await bankReconciliationApi.suggestMatches(transaction.id, administrationId)
      setSuggestions(response.suggestions)
    } catch (error) {
      console.error('Failed to load suggestions:', error)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }, [transaction])

  useEffect(() => {
    if (transaction && isOpen) {
      loadSuggestions()
    }
  }, [transaction, isOpen, loadSuggestions])

  const applyAction = async (request: ApplyActionRequest) => {
    if (!transaction) return
    
    setIsApplying(true)
    try {
      const response = await bankReconciliationApi.applyAction(transaction.id, administrationId, request)
      toast.success(t('reconciliation.applySuccess'), {
        description: response.message
      })
      onActionApplied()
      onClose()
    } catch (error) {
      toast.error(t('reconciliation.applyError'), {
        description: getErrorMessage(error)
      })
    } finally {
      setIsApplying(false)
    }
  }

  const handleAcceptMatch = (suggestion: MatchSuggestion) => {
    applyAction({
      action_type: 'APPLY_MATCH',
      match_entity_type: suggestion.entity_type,
      match_entity_id: suggestion.entity_id,
    })
  }

  const handleIgnore = () => {
    applyAction({ action_type: 'IGNORE' })
  }

  const handleUnmatch = () => {
    applyAction({ action_type: 'UNMATCH' })
  }

  const handleCreateExpense = () => {
    applyAction({
      action_type: 'CREATE_EXPENSE',
      expense_category: expenseForm.expenseCategory || undefined,
      vat_rate: expenseForm.vatRate ? Number(expenseForm.vatRate) : undefined,
      notes: expenseForm.notes || undefined,
    })
  }

  if (!transaction) return null

  const numAmount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bank size={20} />
            {t('reconciliation.title')}
          </SheetTitle>
          <SheetDescription>
            {format(new Date(transaction.booking_date), 'd MMMM yyyy', { locale: nlLocale })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Transaction details */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <AmountDisplay amount={numAmount} />
                <StatusBadge status={transaction.status} />
              </div>
              
              {transaction.counterparty_name && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('bank.counterparty')}</Label>
                  <p className="font-medium">{transaction.counterparty_name}</p>
                  {transaction.counterparty_iban && (
                    <p className="text-sm text-muted-foreground font-mono">{transaction.counterparty_iban}</p>
                  )}
                </div>
              )}
              
              <div>
                <Label className="text-xs text-muted-foreground">{t('bank.description')}</Label>
                <p className="text-sm">{transaction.description}</p>
              </div>
              
              {transaction.reference && (
                <div>
                  <Label className="text-xs text-muted-foreground">{t('bank.reference')}</Label>
                  <p className="text-sm font-mono">{transaction.reference}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick actions for non-matched transactions */}
          {transaction.status !== 'MATCHED' && (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={handleIgnore}
                disabled={isApplying}
              >
                <XCircle size={16} className="mr-1" />
                {t('reconciliation.ignore')}
              </Button>
              <Button 
                className="flex-1"
                onClick={() => setShowCreateExpense(true)}
                disabled={isApplying}
              >
                <Receipt size={16} className="mr-1" />
                {t('reconciliation.createExpense')}
              </Button>
            </div>
          )}

          {/* Unmatch button for matched transactions */}
          {transaction.status === 'MATCHED' && (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleUnmatch}
              disabled={isApplying}
            >
              <X size={16} className="mr-1" />
              {t('reconciliation.unmatch')}
            </Button>
          )}

          {/* Create expense form */}
          {showCreateExpense && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('reconciliation.createExpense')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('reconciliation.expenseCategory')}</Label>
                  <Input
                    value={expenseForm.expenseCategory}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, expenseCategory: e.target.value }))}
                    placeholder={t('reconciliation.expenseCategoryPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('reconciliation.vatRate')}</Label>
                  <Input
                    value={expenseForm.vatRate}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, vatRate: e.target.value }))}
                    placeholder={t('reconciliation.vatRatePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('reconciliation.notes')}</Label>
                  <Input
                    value={expenseForm.notes}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder={t('reconciliation.notesPlaceholder')}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowCreateExpense(false)}
                    disabled={isApplying}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button 
                    onClick={handleCreateExpense}
                    disabled={isApplying}
                  >
                    {t('reconciliation.createExpense')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Suggestions */}
          {transaction.status === 'NEW' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lightning size={18} className="text-primary" />
                <h3 className="font-semibold">{t('reconciliation.suggestions')}</h3>
              </div>
              
              {isLoadingSuggestions ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : suggestions.length > 0 ? (
                <div>
                  {suggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.entity_id}
                      suggestion={suggestion}
                      onApply={() => handleAcceptMatch(suggestion)}
                      isApplying={isApplying}
                    />
                  ))}
                </div>
              ) : (
                <Card className="bg-muted/50">
                  <CardContent className="p-4 text-center text-muted-foreground">
                    <Info size={24} className="mx-auto mb-2" />
                    <p className="text-sm">{t('reconciliation.noSuggestions')}</p>
                    <p className="text-xs mt-1">{t('reconciliation.noSuggestionsDescription')}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Proposals drawer component
const ProposalsDrawer = ({ 
  transaction, 
  proposals,
  isOpen, 
  onClose,
  clientId,
  onProposalAccepted,
  onProposalRejected,
}: { 
  transaction: BankTransaction | null
  proposals: MatchProposal[]
  isOpen: boolean
  onClose: () => void
  clientId: string
  onProposalAccepted: () => void
  onProposalRejected: () => void
}) => {
  const [processingProposalId, setProcessingProposalId] = useState<string | null>(null)

  const handleAcceptProposal = async (proposalId: string) => {
    setProcessingProposalId(proposalId)
    try {
      const response = await bankReconciliationApi.acceptProposal(clientId, proposalId)
      toast.success('Voorstel geaccepteerd', {
        description: response.message
      })
      onProposalAccepted()
      onClose()
    } catch (error) {
      toast.error('Fout bij accepteren voorstel', {
        description: getErrorMessage(error)
      })
    } finally {
      setProcessingProposalId(null)
    }
  }

  const handleRejectProposal = async (proposalId: string) => {
    setProcessingProposalId(proposalId)
    try {
      const response = await bankReconciliationApi.rejectProposal(clientId, proposalId)
      toast.success('Voorstel afgewezen', {
        description: response.message
      })
      onProposalRejected()
    } catch (error) {
      toast.error('Fout bij afwijzen voorstel', {
        description: getErrorMessage(error)
      })
    } finally {
      setProcessingProposalId(null)
    }
  }

  if (!transaction) return null

  const sortedProposals = [...proposals].sort((a, b) => b.confidence_score - a.confidence_score)
  const numAmount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkle size={20} weight="fill" />
            Alle voorstellen
          </SheetTitle>
          <SheetDescription>
            {transaction.counterparty_name || t('common.unknown')} • <AmountDisplay amount={numAmount} />
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {sortedProposals.length > 0 ? (
            sortedProposals.map((proposal) => (
              <Card key={proposal.id} className={proposal.status !== 'PENDING' ? 'opacity-60' : ''}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <ConfidenceBadge score={proposal.confidence_score} />
                          {proposal.status !== 'PENDING' && (
                            <Badge variant="outline">
                              {proposal.status === 'ACCEPTED' ? 'Geaccepteerd' : 'Afgewezen'}
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium">{proposal.entity_reference}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {proposal.reason}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                          <span>
                            {format(new Date(proposal.date), 'd MMM yyyy', { locale: nlLocale })}
                          </span>
                          <span className="font-mono">
                            {typeof proposal.amount === 'string' 
                              ? parseFloat(proposal.amount).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
                              : proposal.amount.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {proposal.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleAcceptProposal(proposal.id)}
                          disabled={processingProposalId !== null}
                        >
                          <ThumbsUp size={16} className="mr-1" weight="fill" />
                          Accepteren
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleRejectProposal(proposal.id)}
                          disabled={processingProposalId !== null}
                        >
                          <ThumbsDown size={16} className="mr-1" weight="fill" />
                          Afwijzen
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-muted/50">
              <CardContent className="p-6 text-center text-muted-foreground">
                <Info size={32} className="mx-auto mb-2" />
                <p className="text-sm">Geen voorstellen beschikbaar</p>
                <p className="text-xs mt-1">Genereer eerst voorstellen via de knop bovenaan</p>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Main page component
export const BankReconciliationPage = () => {
  const { activeClientId, activeClientName } = useActiveClient()
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [statusFilter, setStatusFilter] = useState<BankTransactionStatus | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const showLoading = useDelayedLoading(isLoading, 300, !!transactions.length)

  // Matching engine state
  const [kpi, setKPI] = useState<BankKPI | null>(null)
  const [isLoadingKPI, setIsLoadingKPI] = useState(false)
  const [isGeneratingProposals, setIsGeneratingProposals] = useState(false)
  const [proposalsMap, setProposalsMap] = useState<Record<string, MatchProposal[]>>({})
  const [isProposalsDrawerOpen, setIsProposalsDrawerOpen] = useState(false)
  const [selectedTransactionForProposals, setSelectedTransactionForProposals] = useState<BankTransaction | null>(null)
  const [processingTransactionId, setProcessingTransactionId] = useState<string | null>(null)

  const loadTransactions = useCallback(async (reset: boolean = true, pageOverride?: number) => {
    if (!activeClientId) return

    if (reset) {
      setIsLoading(true)
    } else {
      setIsLoadingMore(true)
    }

    try {
      const nextPage = reset ? 1 : (pageOverride ?? 1)
      const response = await bankReconciliationApi.listTransactions(
        activeClientId,
        {
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          q: searchQuery || undefined,
          page: nextPage,
          pageSize,
        }
      )

      if (reset) {
        setTransactions(response.transactions)
      } else {
        setTransactions(prev => [...prev, ...response.transactions])
      }
      setTotalCount(response.total_count)
      setCurrentPage(nextPage)
    } catch (error) {
      console.error('Failed to load transactions:', error)
      toast.error(t('errors.loadFailed'), {
        description: getErrorMessage(error)
      })
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [activeClientId, statusFilter, searchQuery])

  useEffect(() => {
    loadTransactions(true)
  }, [activeClientId, statusFilter, loadTransactions])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeClientId) {
        loadTransactions(true)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, activeClientId, loadTransactions])

  const handleTransactionClick = (transaction: BankTransaction) => {
    setSelectedTransaction(transaction)
    setIsDrawerOpen(true)
  }

  const handleActionApplied = () => {
    loadTransactions(true)
  }

  const handleImportSuccess = () => {
    loadTransactions(true)
    loadKPI()
  }

  // Load KPI data
  const loadKPI = useCallback(async () => {
    if (!activeClientId) return
    
    setIsLoadingKPI(true)
    try {
      const response = await bankReconciliationApi.getKPI(activeClientId)
      setKPI(response)
    } catch (error) {
      console.error('Failed to load KPI:', error)
    } finally {
      setIsLoadingKPI(false)
    }
  }, [activeClientId])

  // Load proposals for a transaction
  const loadProposalsForTransaction = useCallback(async (transactionId: string) => {
    if (!activeClientId) return
    
    try {
      const response = await bankReconciliationApi.getTransactionProposals(activeClientId, transactionId)
      setProposalsMap(prev => ({
        ...prev,
        [transactionId]: response.proposals
      }))
    } catch (error) {
      console.error('Failed to load proposals:', error)
    }
  }, [activeClientId])

  // Load proposals for all visible transactions
  const loadAllProposals = useCallback(async () => {
    if (!activeClientId || transactions.length === 0) return
    
    const newTransactionIds = transactions
      .filter(tx => tx.status === 'NEW' && !proposalsMap[tx.id])
      .map(tx => tx.id)
    
    await Promise.all(
      newTransactionIds.map(txId => loadProposalsForTransaction(txId))
    )
  }, [activeClientId, transactions, proposalsMap, loadProposalsForTransaction])

  // Generate proposals
  const handleGenerateProposals = async () => {
    if (!activeClientId) return
    
    setIsGeneratingProposals(true)
    try {
      const response = await bankReconciliationApi.generateProposals(activeClientId)
      toast.success('Voorstellen gegenereerd', {
        description: response.message
      })
      await loadTransactions(true)
      await loadAllProposals()
      await loadKPI()
    } catch (error) {
      toast.error('Fout bij genereren voorstellen', {
        description: getErrorMessage(error)
      })
    } finally {
      setIsGeneratingProposals(false)
    }
  }

  // Quick match handler
  const handleQuickMatch = async (transaction: BankTransaction, proposalId: string) => {
    if (!activeClientId) return
    
    setProcessingTransactionId(transaction.id)
    try {
      const response = await bankReconciliationApi.acceptProposal(activeClientId, proposalId)
      toast.success('Match succesvol', {
        description: response.message
      })
      await loadTransactions(true)
      await loadKPI()
    } catch (error) {
      toast.error('Fout bij matchen', {
        description: getErrorMessage(error)
      })
    } finally {
      setProcessingTransactionId(null)
    }
  }

  // Undo match handler
  const handleUndoMatch = async (transaction: BankTransaction) => {
    if (!activeClientId) return
    
    setProcessingTransactionId(transaction.id)
    try {
      const response = await bankReconciliationApi.unmatchTransaction(activeClientId, transaction.id)
      toast.success('Match ongedaan gemaakt', {
        description: response.message
      })
      await loadTransactions(true)
      await loadKPI()
    } catch (error) {
      toast.error('Fout bij ongedaan maken', {
        description: getErrorMessage(error)
      })
    } finally {
      setProcessingTransactionId(null)
    }
  }

  // Open proposals drawer
  const handleViewAllProposals = (transaction: BankTransaction) => {
    setSelectedTransactionForProposals(transaction)
    setIsProposalsDrawerOpen(true)
  }

  // Load KPI and proposals on mount and when transactions change
  useEffect(() => {
    if (activeClientId) {
      loadKPI()
    }
  }, [activeClientId, loadKPI])

  useEffect(() => {
    if (activeClientId && transactions.length > 0) {
      loadAllProposals()
    }
  }, [activeClientId, transactions.length, loadAllProposals])

  if (!activeClientId) {
    return (
      <RequireActiveClient
        headerIcon={<Bank size={24} weight="duotone" className="text-primary" />}
        headerTitle={t('bank.title')}
        headerSubtitle={t('bank.noActiveClientDescription')}
      />
    )
  }

  const hasMore = transactions.length < totalCount

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bank size={28} weight="duotone" />
            {t('bank.title')}
          </h1>
          {activeClientName && (
            <p className="text-muted-foreground mt-1">
              {activeClientName}
            </p>
          )}
        </div>
        <Button onClick={() => setIsUploadDialogOpen(true)}>
          <Upload size={18} className="mr-2" />
          {t('bank.import')}
        </Button>
      </div>

      {/* KPI Strip */}
      <KPIStrip
        kpi={kpi}
        isLoading={isLoadingKPI}
        onGenerateProposals={handleGenerateProposals}
        isGeneratingProposals={isGeneratingProposals}
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Status tabs */}
            <Tabs 
              value={statusFilter} 
              onValueChange={(v) => setStatusFilter(v as BankTransactionStatus | 'ALL')}
              className="flex-1"
            >
              <TabsList className="grid grid-cols-5 w-full max-w-lg">
                <TabsTrigger value="ALL">{t('bank.filters.all')}</TabsTrigger>
                <TabsTrigger value="NEW">{t('bank.filters.new')}</TabsTrigger>
                <TabsTrigger value="NEEDS_REVIEW">{t('bank.filters.needsReview')}</TabsTrigger>
                <TabsTrigger value="MATCHED">{t('bank.filters.matched')}</TabsTrigger>
                <TabsTrigger value="IGNORED">{t('bank.filters.ignored')}</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('bank.search')}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions list */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle>{t('bank.transactions')}</CardTitle>
            {totalCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('bank.showingCount')
                  .replace('{count}', String(transactions.length))
                  .replace('{total}', String(totalCount))}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {showLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : transactions.length > 0 ? (
            <>
              <div className="divide-y transition-opacity duration-200" style={{ opacity: isLoading ? 0.5 : 1 }}>
                {transactions.map((transaction) => {
                  const proposals = proposalsMap[transaction.id] || []
                  const topProposal = proposals.find(p => p.status === 'PENDING') || null
                  
                  return (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      onClick={() => handleTransactionClick(transaction)}
                      isSelected={selectedTransaction?.id === transaction.id}
                      topProposal={topProposal}
                      onQuickMatch={() => topProposal && handleQuickMatch(transaction, topProposal.id)}
                      onViewAllProposals={() => handleViewAllProposals(transaction)}
                      onUndo={transaction.status === 'MATCHED' ? () => handleUndoMatch(transaction) : undefined}
                      isProcessing={processingTransactionId === transaction.id}
                    />
                  )
                })}
              </div>
              {hasMore && (
                <div className="p-4 text-center">
                  <Button 
                    variant="outline" 
                    onClick={() => loadTransactions(false, currentPage + 1)}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? t('common.loading') : t('bank.loadMore')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center">
              <FileText size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">{t('bank.noTransactions')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('bank.noTransactionsDescription')}
              </p>
              <Button onClick={() => setIsUploadDialogOpen(true)}>
                <Upload size={18} className="mr-2" />
                {t('bank.import')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <UploadDialog
        isOpen={isUploadDialogOpen}
        onClose={() => setIsUploadDialogOpen(false)}
        administrationId={activeClientId}
        onImportSuccess={handleImportSuccess}
      />

      {/* Transaction detail drawer */}
      <TransactionDrawer
        transaction={selectedTransaction}
        isOpen={isDrawerOpen}
        administrationId={activeClientId}
        onClose={() => {
          setIsDrawerOpen(false)
          setSelectedTransaction(null)
        }}
        onActionApplied={handleActionApplied}
      />

      {/* Proposals drawer */}
      <ProposalsDrawer
        transaction={selectedTransactionForProposals}
        proposals={selectedTransactionForProposals ? (proposalsMap[selectedTransactionForProposals.id] || []) : []}
        isOpen={isProposalsDrawerOpen}
        clientId={activeClientId}
        onClose={() => {
          setIsProposalsDrawerOpen(false)
          setSelectedTransactionForProposals(null)
        }}
        onProposalAccepted={async () => {
          await loadTransactions(true)
          await loadKPI()
        }}
        onProposalRejected={async () => {
          if (selectedTransactionForProposals) {
            await loadProposalsForTransaction(selectedTransactionForProposals.id)
          }
        }}
      />
    </div>
  )
}

export default BankReconciliationPage
