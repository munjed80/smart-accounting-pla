/**
 * GrootboekPage - General Ledger (Grootboek) Explorer
 * 
 * Minimal ledger explorer showing account categories and transactions.
 * 
 * Features:
 * - Left: Account group categories (static Dutch categories)
 * - Right: List of accounts with balances from balance sheet
 * - Category filtering with heuristics based on account types
 * - Dutch UI text with proper empty states
 * - Mobile-responsive design
 * 
 * Data sources:
 * - ledgerApi.getBalanceSheet() for account balances
 * - Categories mapped from account_type field
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/EmptyState'
import { useActiveClient } from '@/lib/ActiveClientContext'
import { ledgerApi, BalanceSheetResponse, AccountBalance, getErrorMessage } from '@/lib/api'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import {
  Books,
  Bank,
  Users,
  Storefront,
  Receipt,
  CurrencyEur,
  TrendUp,
  TrendDown,
  Warning,
  MagnifyingGlass,
  User,
  CaretRight,
  Scales,
} from '@phosphor-icons/react'

interface GrootboekPageProps {
  onNavigate?: (tab: string) => void
}

// Grootboek category definitions
type CategoryKey = 'all' | 'activa' | 'passiva' | 'debiteuren' | 'crediteuren' | 'bank' | 'omzet' | 'kosten'

interface Category {
  key: CategoryKey
  label: string
  icon: React.ReactNode
  description: string
  color: string
}

const CATEGORIES: Category[] = [
  { key: 'all', label: 'Alle rekeningen', icon: <Books size={18} />, description: 'Volledig rekeningschema', color: 'bg-primary/10 text-primary' },
  { key: 'activa', label: 'Activa', icon: <CurrencyEur size={18} />, description: 'Bezittingen', color: 'bg-blue-500/10 text-blue-600' },
  { key: 'passiva', label: 'Passiva', icon: <Scales size={18} />, description: 'Schulden & eigen vermogen', color: 'bg-purple-500/10 text-purple-600' },
  { key: 'bank', label: 'Bank & Kas', icon: <Bank size={18} />, description: 'Liquide middelen', color: 'bg-cyan-500/10 text-cyan-600' },
  { key: 'debiteuren', label: 'Debiteuren', icon: <Users size={18} />, description: 'Vorderingen op klanten', color: 'bg-green-500/10 text-green-600' },
  { key: 'crediteuren', label: 'Crediteuren', icon: <Storefront size={18} />, description: 'Schulden aan leveranciers', color: 'bg-orange-500/10 text-orange-600' },
  { key: 'omzet', label: 'Omzet', icon: <TrendUp size={18} />, description: 'Opbrengsten', color: 'bg-emerald-500/10 text-emerald-600' },
  { key: 'kosten', label: 'Kosten', icon: <TrendDown size={18} />, description: 'Uitgaven', color: 'bg-red-500/10 text-red-600' },
]

// Map account types to categories
const mapAccountToCategory = (account: AccountBalance): CategoryKey[] => {
  const code = account.account_code?.toLowerCase() || ''
  const name = account.account_name?.toLowerCase() || ''
  const type = account.account_type?.toLowerCase() || ''
  
  const categories: CategoryKey[] = []
  
  // Check by account code patterns (Dutch RGS-like)
  if (code.startsWith('0') || code.startsWith('1')) {
    categories.push('activa')
  }
  if (code.startsWith('2') || code.startsWith('3')) {
    categories.push('passiva')
  }
  if (code.startsWith('8')) {
    categories.push('omzet')
  }
  if (code.startsWith('4') || code.startsWith('7')) {
    categories.push('kosten')
  }
  
  // Check by account type
  if (type.includes('asset') || type.includes('activa')) {
    if (!categories.includes('activa')) categories.push('activa')
  }
  if (type.includes('liability') || type.includes('passiva') || type.includes('equity')) {
    if (!categories.includes('passiva')) categories.push('passiva')
  }
  if (type.includes('revenue') || type.includes('income') || type.includes('omzet')) {
    if (!categories.includes('omzet')) categories.push('omzet')
  }
  if (type.includes('expense') || type.includes('cost') || type.includes('kosten')) {
    if (!categories.includes('kosten')) categories.push('kosten')
  }
  
  // Check by name patterns
  if (name.includes('bank') || name.includes('kas') || name.includes('rekening-courant') || name.includes('liquide')) {
    categories.push('bank')
  }
  if (name.includes('debiteur') || name.includes('vordering') || name.includes('te ontvangen')) {
    categories.push('debiteuren')
  }
  if (name.includes('crediteur') || name.includes('leverancier') || name.includes('te betalen')) {
    categories.push('crediteuren')
  }
  
  return categories.length > 0 ? categories : ['activa'] // Default to activa
}

export const GrootboekPage = ({ onNavigate }: GrootboekPageProps) => {
  const { activeClientId, activeClientName } = useActiveClient()
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Load balance sheet data
  useEffect(() => {
    const loadData = async () => {
      if (!activeClientId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const response = await ledgerApi.getBalanceSheet(activeClientId)
        setBalanceSheet(response)
      } catch (err) {
        console.error('Failed to load balance sheet:', err)
        setError(getErrorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [activeClientId])

  // Collect all accounts from balance sheet sections
  const allAccounts = useMemo((): AccountBalance[] => {
    if (!balanceSheet) return []
    
    const accounts: AccountBalance[] = []
    
    // Add all accounts from each section
    accounts.push(...balanceSheet.current_assets.accounts)
    accounts.push(...balanceSheet.fixed_assets.accounts)
    accounts.push(...balanceSheet.current_liabilities.accounts)
    accounts.push(...balanceSheet.long_term_liabilities.accounts)
    accounts.push(...balanceSheet.equity.accounts)
    
    return accounts
  }, [balanceSheet])

  // Filter accounts by category and search
  const filteredAccounts = useMemo(() => {
    let result = allAccounts

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter(account => {
        const categories = mapAccountToCategory(account)
        return categories.includes(selectedCategory)
      })
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(account =>
        account.account_code?.toLowerCase().includes(query) ||
        account.account_name?.toLowerCase().includes(query)
      )
    }

    // Sort by account code
    return result.sort((a, b) => 
      (a.account_code || '').localeCompare(b.account_code || '')
    )
  }, [allAccounts, selectedCategory, searchQuery])

  // Count accounts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryKey, number> = {
      all: allAccounts.length,
      activa: 0,
      passiva: 0,
      bank: 0,
      debiteuren: 0,
      crediteuren: 0,
      omzet: 0,
      kosten: 0,
    }

    for (const account of allAccounts) {
      const categories = mapAccountToCategory(account)
      for (const cat of categories) {
        counts[cat]++
      }
    }

    return counts
  }, [allAccounts])

  const handleGoToClients = () => {
    if (onNavigate) {
      onNavigate('clients')
    } else {
      navigateTo('/accountant/clients')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  // No active client selected
  if (!activeClientId) {
    return (
      <div className="container mx-auto py-6 px-4 sm:px-6 max-w-6xl">
        <Card className="bg-card/80 backdrop-blur-sm mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Books size={24} weight="duotone" className="text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">Grootboek</CardTitle>
                <CardDescription>Rekeningschema en balans overzicht</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <EmptyState
          title="Geen klant geselecteerd"
          description="Selecteer eerst een klant om het grootboek te bekijken."
          icon={<User size={64} weight="duotone" className="text-muted-foreground" />}
          actionLabel="Klant selecteren"
          onAction={handleGoToClients}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 max-w-6xl">
      {/* Header */}
      <Card className="bg-card/80 backdrop-blur-sm mb-6">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Books size={24} weight="duotone" className="text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">Grootboek</CardTitle>
                <CardDescription>
                  {activeClientName ? `${activeClientName} – ` : ''}Rekeningschema en balans overzicht
                </CardDescription>
              </div>
            </div>
            {/* Summary */}
            {!isLoading && balanceSheet && (
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-sm">
                  <Books size={14} className="mr-1" />
                  {allAccounts.length} rekeningen
                </Badge>
                {balanceSheet.is_balanced ? (
                  <Badge variant="outline" className="text-sm bg-green-500/10 text-green-600 border-green-500/30">
                    ✓ In balans
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-sm">
                    <Warning size={14} className="mr-1" />
                    Niet in balans
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-6 text-center">
            <Warning size={48} className="mx-auto mb-4 text-destructive" />
            <p className="text-destructive font-medium mb-2">Laden mislukt</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Opnieuw proberen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main content */}
      {!isLoading && !error && balanceSheet && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left sidebar - Categories */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Categorieën</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {CATEGORIES.map((category) => (
                  <button
                    key={category.key}
                    onClick={() => setSelectedCategory(category.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors
                      ${selectedCategory === category.key 
                        ? 'bg-primary text-primary-foreground' 
                        : 'hover:bg-muted'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      {category.icon}
                      {category.label}
                    </span>
                    <Badge 
                      variant={selectedCategory === category.key ? 'secondary' : 'outline'} 
                      className="text-xs"
                    >
                      {categoryCounts[category.key]}
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Balance summary */}
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Balans</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Totaal activa</span>
                  <span className="font-mono">{formatCurrency(balanceSheet.total_assets)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Totaal passiva</span>
                  <span className="font-mono">{formatCurrency(balanceSheet.total_liabilities_equity)}</span>
                </div>
                <Separator />
                <div className={`flex justify-between font-semibold ${balanceSheet.is_balanced ? 'text-green-600' : 'text-red-600'}`}>
                  <span>Verschil</span>
                  <span className="font-mono">
                    {formatCurrency(balanceSheet.total_assets - balanceSheet.total_liabilities_equity)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right content - Accounts list */}
          <div className="lg:col-span-3">
            {/* Search */}
            <Card className="mb-4">
              <CardContent className="py-4">
                <div className="relative">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Zoek op rekeningnummer of naam..."
                    className="pl-9"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Category info */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                {CATEGORIES.find(c => c.key === selectedCategory)?.icon}
                <div>
                  <h2 className="font-semibold">
                    {CATEGORIES.find(c => c.key === selectedCategory)?.label}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {CATEGORIES.find(c => c.key === selectedCategory)?.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Results count */}
            <p className="text-sm text-muted-foreground mb-4">
              {filteredAccounts.length} rekening{filteredAccounts.length !== 1 ? 'en' : ''} gevonden
              {searchQuery && ` voor "${searchQuery}"`}
            </p>

            {/* Empty state for filtered */}
            {filteredAccounts.length === 0 && (
              <Card className="bg-muted/50">
                <CardContent className="py-8 text-center">
                  <Books size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Geen rekeningen gevonden in deze categorie
                  </p>
                  {searchQuery && (
                    <Button variant="link" onClick={() => setSearchQuery('')}>
                      Zoekopdracht wissen
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Accounts list */}
            {filteredAccounts.length > 0 && (
              <div className="space-y-2">
                {filteredAccounts.map((account) => (
                  <Card key={account.account_id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {account.account_code}
                            </Badge>
                            <span className="font-medium truncate">{account.account_name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                            <span>Debet: {formatCurrency(account.debit_total)}</span>
                            <span>Credit: {formatCurrency(account.credit_total)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono font-semibold ${account.balance >= 0 ? 'text-foreground' : 'text-red-600'}`}>
                            {formatCurrency(account.balance)}
                          </p>
                          <p className="text-xs text-muted-foreground">saldo</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state - no accounts at all */}
      {!isLoading && !error && allAccounts.length === 0 && (
        <EmptyState
          title="Geen grootboekrekeningen"
          description="Er zijn nog geen grootboekrekeningen aangemaakt voor deze klant. Rekeningen worden automatisch aangemaakt bij het verwerken van transacties."
          icon={<Books size={64} weight="duotone" className="text-muted-foreground" />}
          tips={[
            'Upload facturen via de AI Upload om rekeningen aan te maken',
            'Importeer banktransacties om liquide middelen te registreren',
            'Rekeningen worden automatisch gecategoriseerd',
          ]}
        />
      )}
    </div>
  )
}

export default GrootboekPage
