/**
 * ZZPCustomersPage - Customer management page for ZZP users
 * 
 * Features:
 * - View customers list
 * - Add new customer (placeholder button)
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
import { UsersThree, Plus, User } from '@phosphor-icons/react'

// Placeholder static data for demo
const placeholderCustomers = [
  {
    id: '1',
    name: 'Jan de Vries',
    email: 'jan@devries.nl',
    phone: '+31 6 12345678',
    status: 'actief',
  },
  {
    id: '2',
    name: 'Marie Jansen',
    email: 'marie@jansen.com',
    phone: '+31 6 87654321',
    status: 'actief',
  },
  {
    id: '3',
    name: 'Peter Bakker',
    email: 'peter@bakker.nl',
    phone: '+31 6 11223344',
    status: 'inactief',
  },
]

export const ZZPCustomersPage = () => {
  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <UsersThree size={32} className="text-primary" weight="duotone" />
          <h1 className="text-2xl sm:text-3xl font-bold">{t('zzpCustomers.title')}</h1>
        </div>
        <Button className="gap-2">
          <Plus size={18} />
          {t('zzpCustomers.newCustomer')}
        </Button>
      </div>

      {/* Build check notice */}
      <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm text-green-700 dark:text-green-400">
        {t('zzpCustomers.buildCheck')}
      </div>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User size={20} weight="duotone" />
            {t('zzpCustomers.title')}
          </CardTitle>
          <CardDescription>
            {t('zzpCustomers.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('zzpCustomers.columnName')}</TableHead>
                <TableHead>{t('zzpCustomers.columnEmail')}</TableHead>
                <TableHead>{t('zzpCustomers.columnPhone')}</TableHead>
                <TableHead>{t('zzpCustomers.columnStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placeholderCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={customer.status === 'actief' ? 'default' : 'secondary'}
                      className={customer.status === 'actief' 
                        ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30' 
                        : ''
                      }
                    >
                      {customer.status}
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

export default ZZPCustomersPage
