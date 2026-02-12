import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { t } from '@/i18n'
import { zzpLedgerApi, ZZPLedgerEntry, ZZPAccountBalance, ZZPLedgerAccountOption } from '@/lib/api'
import { ArrowsClockwise, Receipt, WarningCircle } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'

export const SmartTransactionList = () => {
  const [entries, setEntries] = useState<ZZPLedgerEntry[]>([])
  const [balances, setBalances] = useState<ZZPAccountBalance[]>([])
  const [accounts, setAccounts] = useState<ZZPLedgerAccountOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [accountId, setAccountId] = useState<string>('all')

  const fetchLedger = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await zzpLedgerApi.getEntries({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        account_id: accountId !== 'all' ? accountId : undefined,
      })
      setEntries(data.entries)
      setBalances(data.account_balances)
      setAccounts(data.accounts)
    } catch {
      setError(t('smartTransactions.failedToLoad'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLedger()
  }, [])

  const totalDebit = useMemo(
    () => entries.flatMap((e) => e.lines).reduce((sum, l) => sum + Number(l.debit), 0),
    [entries]
  )
  const totalCredit = useMemo(
    () => entries.flatMap((e) => e.lines).reduce((sum, l) => sum + Number(l.credit), 0),
    [entries]
  )

  const formatCurrency = (amount: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2"><Receipt size={30} />{t('smartTransactions.title')}</h2>
          <p className="text-muted-foreground">Journaalposten met regels en saldi</p>
        </div>
        <Button onClick={fetchLedger} variant="outline" size="sm" disabled={isLoading}>
          <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Rekening" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle rekeningen</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={fetchLedger}>Toepassen</Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardDescription>Journaalposten</CardDescription><CardTitle>{entries.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Totaal Debet</CardDescription><CardTitle>{formatCurrency(totalDebit)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Totaal Credit</CardDescription><CardTitle>{formatCurrency(totalCredit)}</CardTitle></CardHeader></Card>
      </div>

      {error && <Alert variant="destructive"><WarningCircle size={18} /><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader><CardTitle>Journaal</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium">{entry.description}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(entry.date), 'dd-MM-yyyy', { locale: nlLocale })}</p>
                </div>
                <Badge>{entry.posted ? 'POSTED' : 'DRAFT'}</Badge>
              </div>
              <div className="space-y-1 text-sm">
                {entry.lines.map((line) => (
                  <div key={line.id} className="grid grid-cols-12 gap-2">
                    <div className="col-span-7">{line.account_code} - {line.account_name}</div>
                    <div className="col-span-2 text-right">{formatCurrency(Number(line.debit))}</div>
                    <div className="col-span-3 text-right">{formatCurrency(Number(line.credit))}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Saldo per rekening</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {balances.map((b) => (
            <div key={b.account_id} className="grid grid-cols-12 gap-2 text-sm border-b pb-1">
              <div className="col-span-6">{b.account_code} - {b.account_name}</div>
              <div className="col-span-2 text-right">{formatCurrency(Number(b.total_debit))}</div>
              <div className="col-span-2 text-right">{formatCurrency(Number(b.total_credit))}</div>
              <div className="col-span-2 text-right font-semibold">{formatCurrency(Number(b.balance))}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
