/**
 * ZZP Customers Page
 * 
 * Full CRUD functionality for managing customers.
 * Data is stored in localStorage per user.
 */

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Users, 
  Plus, 
  MagnifyingGlass, 
  PencilSimple, 
  TrashSimple,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { 
  Customer, 
  CustomerInput, 
  listCustomers, 
  addCustomer, 
  updateCustomer, 
  removeCustomer,
  formatDate,
} from '@/lib/storage/zzp'
import { t } from '@/i18n'
import { toast } from 'sonner'

// Status badge component
const StatusBadge = ({ status }: { status: 'active' | 'inactive' }) => {
  if (status === 'active') {
    return (
      <Badge variant="outline" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40">
        <CheckCircle size={14} className="mr-1" weight="fill" />
        {t('zzpCustomers.statusActive')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/40">
      <XCircle size={14} className="mr-1" weight="fill" />
      {t('zzpCustomers.statusInactive')}
    </Badge>
  )
}

// Customer form dialog
const CustomerFormDialog = ({
  open,
  onOpenChange,
  customer,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: Customer
  onSave: (data: CustomerInput) => void
}) => {
  const isEdit = !!customer
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  const [nameError, setNameError] = useState('')

  // Reset form when dialog opens/closes or customer changes
  useEffect(() => {
    if (open) {
      if (customer) {
        setName(customer.name)
        setEmail(customer.email || '')
        setPhone(customer.phone || '')
        setStatus(customer.status)
      } else {
        setName('')
        setEmail('')
        setPhone('')
        setStatus('active')
      }
      setNameError('')
    }
  }, [open, customer])

  const handleSave = () => {
    // Validate
    if (!name.trim()) {
      setNameError(t('zzpCustomers.formNameRequired'))
      return
    }

    onSave({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      status,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={24} className="text-primary" weight="duotone" />
            {isEdit ? t('zzpCustomers.editCustomer') : t('zzpCustomers.newCustomer')}
          </DialogTitle>
          <DialogDescription>
            {isEdit 
              ? t('zzpCustomers.noCustomersDescription') 
              : t('zzpCustomers.noCustomersDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name field (required) */}
          <div className="space-y-2">
            <Label htmlFor="customer-name">{t('zzpCustomers.formName')} *</Label>
            <Input
              id="customer-name"
              placeholder={t('zzpCustomers.formNamePlaceholder')}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameError('')
              }}
              className={nameError ? 'border-destructive' : ''}
            />
            {nameError && (
              <p className="text-sm text-destructive">{nameError}</p>
            )}
          </div>

          {/* Email field */}
          <div className="space-y-2">
            <Label htmlFor="customer-email">{t('zzpCustomers.formEmail')}</Label>
            <Input
              id="customer-email"
              type="email"
              placeholder={t('zzpCustomers.formEmailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Phone field */}
          <div className="space-y-2">
            <Label htmlFor="customer-phone">{t('zzpCustomers.formPhone')}</Label>
            <Input
              id="customer-phone"
              type="tel"
              placeholder={t('zzpCustomers.formPhonePlaceholder')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="customer-status">{t('zzpCustomers.formStatus')}</Label>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${status === 'inactive' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t('zzpCustomers.formStatusInactive')}
              </span>
              <Switch
                id="customer-status"
                checked={status === 'active'}
                onCheckedChange={(checked) => setStatus(checked ? 'active' : 'inactive')}
              />
              <span className={`text-sm ${status === 'active' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t('zzpCustomers.formStatusActive')}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>
            {t('zzpCustomers.saveCustomer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Delete confirmation dialog
const DeleteConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  customerName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  customerName: string
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('zzpCustomers.deleteCustomer')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('zzpCustomers.deleteCustomerConfirm')}
            <br />
            <span className="font-medium">{customerName}</span>
            <br /><br />
            {t('zzpCustomers.deleteCustomerWarning')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Empty state component
const EmptyState = ({ onAddCustomer }: { onAddCustomer: () => void }) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
      <Users size={64} weight="duotone" className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">{t('zzpCustomers.noCustomers')}</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        {t('zzpCustomers.noCustomersDescription')}
      </p>
      <Button onClick={onAddCustomer} className="gap-2">
        <Plus size={18} />
        {t('zzpCustomers.addFirstCustomer')}
      </Button>
    </CardContent>
  </Card>
)

export const ZZPCustomersPage = () => {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  
  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>()
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | undefined>()

  // Load customers from localStorage
  useEffect(() => {
    if (user?.id) {
      setCustomers(listCustomers(user.id))
    }
  }, [user?.id])

  // Filter customers based on search and status
  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      // Status filter
      if (statusFilter !== 'all' && customer.status !== statusFilter) {
        return false
      }
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesName = customer.name.toLowerCase().includes(query)
        const matchesEmail = customer.email?.toLowerCase().includes(query)
        const matchesPhone = customer.phone?.toLowerCase().includes(query)
        if (!matchesName && !matchesEmail && !matchesPhone) {
          return false
        }
      }
      
      return true
    })
  }, [customers, searchQuery, statusFilter])

  // Handle adding/editing customer
  const handleSaveCustomer = (data: CustomerInput) => {
    if (!user?.id) return

    if (editingCustomer) {
      // Update existing
      const updated = updateCustomer(user.id, editingCustomer.id, data)
      if (updated) {
        setCustomers(listCustomers(user.id))
        toast.success(t('zzpCustomers.customerSaved'))
      }
    } else {
      // Add new
      addCustomer(user.id, data)
      setCustomers(listCustomers(user.id))
      toast.success(t('zzpCustomers.customerSaved'))
    }

    setIsFormOpen(false)
    setEditingCustomer(undefined)
  }

  // Handle delete customer
  const handleDeleteCustomer = () => {
    if (!user?.id || !deletingCustomer) return

    const success = removeCustomer(user.id, deletingCustomer.id)
    if (success) {
      setCustomers(listCustomers(user.id))
      toast.success(t('zzpCustomers.customerDeleted'))
    }

    setDeletingCustomer(undefined)
  }

  // Open form for new customer
  const openNewForm = () => {
    setEditingCustomer(undefined)
    setIsFormOpen(true)
  }

  // Open form for editing
  const openEditForm = (customer: Customer) => {
    setEditingCustomer(customer)
    setIsFormOpen(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2 flex items-center gap-3">
              <Users size={40} weight="duotone" className="text-primary" />
              {t('zzpCustomers.title')}
            </h1>
            <p className="text-muted-foreground">
              {customers.length} {customers.length === 1 ? 'klant' : 'klanten'}
            </p>
          </div>
          <Button onClick={openNewForm} className="gap-2">
            <Plus size={18} weight="bold" />
            {t('zzpCustomers.newCustomer')}
          </Button>
        </div>

        {/* Show empty state or table */}
        {customers.length === 0 ? (
          <EmptyState onAddCustomer={openNewForm} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t('zzpCustomers.title')}</CardTitle>
              <CardDescription>
                {t('zzpCustomers.noCustomersDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search and filter controls */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <MagnifyingGlass 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
                    size={18} 
                  />
                  <Input
                    placeholder={t('zzpCustomers.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select 
                  value={statusFilter} 
                  onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'inactive')}
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('zzpCustomers.filterAll')}</SelectItem>
                    <SelectItem value="active">{t('zzpCustomers.filterActive')}</SelectItem>
                    <SelectItem value="inactive">{t('zzpCustomers.filterInactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Customers table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('zzpCustomers.columnName')}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t('zzpCustomers.columnEmail')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('zzpCustomers.columnPhone')}</TableHead>
                      <TableHead>{t('zzpCustomers.columnStatus')}</TableHead>
                      <TableHead className="text-right">{t('zzpCustomers.columnActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <MagnifyingGlass size={32} className="mb-2 opacity-50" />
                            <p>Geen klanten gevonden</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{customer.name}</div>
                              {/* Show email on mobile in name cell */}
                              <div className="text-sm text-muted-foreground sm:hidden">
                                {customer.email || '-'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {customer.email || '-'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {customer.phone || '-'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={customer.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditForm(customer)}
                                className="h-8 w-8 p-0"
                              >
                                <PencilSimple size={16} />
                                <span className="sr-only">{t('common.edit')}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingCustomer(customer)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <TrashSimple size={16} />
                                <span className="sr-only">{t('common.delete')}</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Customer form dialog */}
      <CustomerFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) setEditingCustomer(undefined)
        }}
        customer={editingCustomer}
        onSave={handleSaveCustomer}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deletingCustomer}
        onOpenChange={(open) => {
          if (!open) setDeletingCustomer(undefined)
        }}
        onConfirm={handleDeleteCustomer}
        customerName={deletingCustomer?.name || ''}
      />
    </div>
  )
}

export default ZZPCustomersPage
