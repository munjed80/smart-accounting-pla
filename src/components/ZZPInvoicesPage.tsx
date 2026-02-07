import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { FileText, Plus, Info } from '@phosphor-icons/react'
import { t } from '@/i18n'

/**
 * ZZP Invoices Page
 * 
 * Placeholder page for ZZP users to manage their invoices.
 * This is part of the deployment verification - no backend integration yet.
 */
export const ZZPInvoicesPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
              <FileText size={40} weight="duotone" className="text-primary" />
              {t('zzpInvoices.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('zzpInvoices.noInvoicesDescription')}
            </p>
          </div>
          <Button className="gap-2">
            <Plus size={18} weight="bold" />
            {t('zzpInvoices.newInvoice')}
          </Button>
        </div>

        {/* Build Check Notice */}
        <Card className="mb-6 border-blue-500/50 bg-blue-500/10">
          <CardContent className="flex items-center gap-3 py-4">
            <Info size={24} className="text-blue-500" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {t('zzpInvoices.buildCheck')}
            </span>
          </CardContent>
        </Card>

        {/* Invoices Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('zzpInvoices.title')}</CardTitle>
            <CardDescription>{t('zzpInvoices.noInvoicesDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('zzpInvoices.columnNumber')}</TableHead>
                  <TableHead>{t('zzpInvoices.columnCustomer')}</TableHead>
                  <TableHead>{t('zzpInvoices.columnDate')}</TableHead>
                  <TableHead>{t('zzpInvoices.columnAmount')}</TableHead>
                  <TableHead>{t('zzpInvoices.columnStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Empty state - placeholder data can be added later */}
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <FileText size={32} weight="duotone" className="mb-2 opacity-50" />
                      <p>{t('zzpInvoices.noInvoices')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ZZPInvoicesPage
