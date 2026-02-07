/**
 * ZZPInvoicesPage - Invoice management page for ZZP users
 * 
 * Features:
 * - View invoices list
 * - Add new invoice (placeholder button)
 * - Static placeholder data for deployment verification
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { t } from '@/i18n'
import { FileText, Plus, Receipt } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'

// Placeholder static data for demo
const placeholderInvoices = [
  {
    id: '1',
    number: 'INV-2024-001',
    customer: 'Jan de Vries',
    date: new Date('2024-11-15'),
    amount: 1250.00,
    status: 'betaald',
  },
  {
    id: '2',
    number: 'INV-2024-002',
    customer: 'Marie Jansen',
    date: new Date('2024-11-20'),
    amount: 890.50,
    status: 'verzonden',
  },
  {
    id: '3',
    number: 'INV-2024-003',
    customer: 'Peter Bakker',
    date: new Date('2024-12-01'),
    amount: 2450.00,
    status: 'concept',
  },
]

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'betaald':
      return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30'
    case 'verzonden':
      return 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30'
    case 'concept':
      return 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30'
    default:
      return ''
  }
}

export const ZZPInvoicesPage = () => {
  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <FileText size={32} className="text-primary" weight="duotone" />
          <h1 className="text-2xl sm:text-3xl font-bold">{t('zzpInvoices.title')}</h1>
        </div>
        <Button className="gap-2">
          <Plus size={18} />
          {t('zzpInvoices.newInvoice')}
        </Button>
      </div>

      {/* Build check notice */}
      <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm text-green-700 dark:text-green-400">
        {t('zzpInvoices.buildCheck')}
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt size={20} weight="duotone" />
            {t('zzpInvoices.title')}
          </CardTitle>
          <CardDescription>
            {t('zzpInvoices.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('zzpInvoices.columnNumber')}</TableHead>
                <TableHead>{t('zzpInvoices.columnCustomer')}</TableHead>
                <TableHead>{t('zzpInvoices.columnDate')}</TableHead>
                <TableHead className="text-right">{t('zzpInvoices.columnAmount')}</TableHead>
                <TableHead>{t('zzpInvoices.columnStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placeholderInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium font-mono">{invoice.number}</TableCell>
                  <TableCell>{invoice.customer}</TableCell>
                  <TableCell>{format(invoice.date, 'dd MMM yyyy', { locale: nlLocale })}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      className={getStatusBadgeStyle(invoice.status)}
                    >
                      {invoice.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default ZZPInvoicesPage
