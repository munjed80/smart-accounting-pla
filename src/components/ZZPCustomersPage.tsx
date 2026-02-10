/**
 * ZZP Customers Page
 * 
 * Full CRUD functionality for managing customers.
 * Data is stored in localStorage per user.
 * 
 * Premium UI with:
 * - Stats mini-cards
 * - Search with debounce
 * - Responsive table/card design
 * - Two-column modal on desktop
 * - Loading/skeleton states
 * - Customer detail drawer for viewing all fields
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Users, 
  Plus, 
  MagnifyingGlass, 
  PencilSimple, 
  TrashSimple,
  CheckCircle,
  XCircle,
  UserCirclePlus,
  UsersThree,
  UserCheck,
  UserMinus,
  Envelope,
  Phone,
  SpinnerGap,
  Eye,
  MapPin,
  Buildings,
  Bank,
  IdentificationCard,
  Receipt,
  ArrowRight,
  DotsThreeVertical,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/AuthContext'
import { zzpApi, ZZPCustomer, ZZPCustomerCreate, ZZPCustomerUpdate } from '@/lib/api'
import { parseApiError } from '@/lib/utils'
import { navigateTo } from '@/lib/navigation'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

// Status badge component
const StatusBadge = ({ status, size = 'default' }: { status: 'active' | 'inactive'; size?: 'default' | 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'text-xs py-0.5 px-1.5' : ''
  if (status === 'active') {
    return (
      <Badge variant="outline" className={`bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40 ${sizeClasses}`}>
        <CheckCircle size={size === 'sm' ? 12 : 14} className="mr-1" weight="fill" />
        {t('zzpCustomers.statusActive')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={`bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/40 ${sizeClasses}`}>
      <XCircle size={size === 'sm' ? 12 : 14} className="mr-1" weight="fill" />
      {t('zzpCustomers.statusInactive')}
    </Badge>
  )
}

// Stats card component
const StatsCard = ({ 
  title, 
  value, 
  icon: Icon, 
  className = '' 
}: { 
  title: string
  value: number
  icon: React.ElementType
  className?: string 
}) => (
  <Card className={`bg-card/80 backdrop-blur-sm border border-border/50 ${className}`}>
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon size={20} className="text-primary sm:hidden" weight="duotone" />
          <Icon size={24} className="text-primary hidden sm:block" weight="duotone" />
        </div>
      </div>
    </CardContent>
  </Card>
)

// Loading skeleton for stats
const StatsLoadingSkeleton = () => (
  <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
    {[1, 2, 3].map((i) => (
      <Card key={i} className="bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 sm:w-20" />
              <Skeleton className="h-7 w-10 sm:h-8 sm:w-12" />
            </div>
            <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
)

// Loading skeleton for table
const TableLoadingSkeleton = () => (
  <Card className="bg-card/80 backdrop-blur-sm">
    <CardContent className="p-4 sm:p-6">
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-3 sm:gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 sm:w-32" />
                <Skeleton className="h-3 w-32 sm:w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)

// Customer form dialog
const CustomerFormDialog = ({
  open,
  onOpenChange,
  customer,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: ZZPCustomer
  onSave: (data: ZZPCustomerCreate) => Promise<void>
}) => {
  const isEdit = !!customer
  
  // Contact fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  
  // Address fields
  const [addressStreet, setAddressStreet] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [addressPostalCode, setAddressPostalCode] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressCountry, setAddressCountry] = useState('')
  
  // Business fields
  const [kvkNumber, setKvkNumber] = useState('')
  const [btwNumber, setBtwNumber] = useState('')
  
  // Bank fields
  const [iban, setIban] = useState('')
  const [bankBic, setBankBic] = useState('')
  
  // Notes
  const [notes, setNotes] = useState('')
  
  // Status
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  
  // Validation errors
  const [nameError, setNameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [kvkError, setKvkError] = useState('')
  const [btwError, setBtwError] = useState('')
  const [ibanError, setIbanError] = useState('')
  const [bicError, setBicError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when dialog opens/closes or customer changes
  useEffect(() => {
    if (open) {
      if (customer) {
        setName(customer.name)
        setEmail(customer.email || '')
        setPhone(customer.phone || '')
        setContactPerson(customer.contact_person || '')
        setAddressStreet(customer.address_street || '')
        setAddressLine2(customer.address_line2 || '')
        setAddressPostalCode(customer.address_postal_code || '')
        setAddressCity(customer.address_city || '')
        setAddressCountry(customer.address_country || '')
        setKvkNumber(customer.kvk_number || '')
        setBtwNumber(customer.btw_number || '')
        setIban(customer.iban || '')
        setBankBic(customer.bank_bic || '')
        setNotes(customer.notes || '')
        setStatus(customer.status)
      } else {
        setName('')
        setEmail('')
        setPhone('')
        setContactPerson('')
        setAddressStreet('')
        setAddressLine2('')
        setAddressPostalCode('')
        setAddressCity('')
        setAddressCountry('')
        setKvkNumber('')
        setBtwNumber('')
        setIban('')
        setBankBic('')
        setNotes('')
        setStatus('active')
      }
      // Clear errors
      setNameError('')
      setEmailError('')
      setKvkError('')
      setBtwError('')
      setIbanError('')
      setBicError('')
      setIsSubmitting(false)
    }
  }, [open, customer])

  // Validation functions
  const validateEmail = (value: string): boolean => {
    if (!value) return true // Optional field
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
    return emailRegex.test(value)
  }

  const validateKvk = (value: string): boolean => {
    if (!value) return true // Optional field
    return /^[0-9]{8}$/.test(value.replace(/\s/g, ''))
  }

  const validateBtw = (value: string): boolean => {
    if (!value) return true // Optional field
    const cleaned = value.replace(/[\s.]/g, '').toUpperCase()
    return /^NL[0-9]{9}B[0-9]{2}$/.test(cleaned)
  }

  const validateIban = (value: string): boolean => {
    if (!value) return true // Optional field
    const cleaned = value.replace(/\s/g, '').toUpperCase()
    return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(cleaned)
  }

  const validateBic = (value: string): boolean => {
    if (!value) return true // Optional field
    const cleaned = value.replace(/\s/g, '').toUpperCase()
    return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned)
  }

  const handleSave = async () => {
    let hasError = false
    
    // Validate name
    if (!name.trim()) {
      setNameError(t('zzpCustomers.formNameRequired'))
      hasError = true
    }
    
    // Validate email format
    if (email && !validateEmail(email)) {
      setEmailError(t('zzpCustomers.formEmailInvalid'))
      hasError = true
    }

    // Validate KVK
    if (kvkNumber && !validateKvk(kvkNumber)) {
      setKvkError(t('zzpCustomers.formKvkInvalid'))
      hasError = true
    }

    // Validate BTW
    if (btwNumber && !validateBtw(btwNumber)) {
      setBtwError(t('zzpCustomers.formBtwInvalid'))
      hasError = true
    }

    // Validate IBAN
    if (iban && !validateIban(iban)) {
      setIbanError(t('zzpCustomers.formIbanInvalid'))
      hasError = true
    }

    // Validate BIC
    if (bankBic && !validateBic(bankBic)) {
      setBicError(t('zzpCustomers.formBicInvalid'))
      hasError = true
    }

    if (hasError) return

    setIsSubmitting(true)

    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        address_street: addressStreet.trim() || undefined,
        address_line2: addressLine2.trim() || undefined,
        address_postal_code: addressPostalCode.trim().toUpperCase().replace(/\s/g, '') || undefined,
        address_city: addressCity.trim() || undefined,
        address_country: addressCountry.trim() || undefined,
        kvk_number: kvkNumber.replace(/\s/g, '') || undefined,
        btw_number: btwNumber.replace(/[\s.]/g, '').toUpperCase() || undefined,
        iban: iban.replace(/\s/g, '').toUpperCase() || undefined,
        bank_bic: bankBic.replace(/\s/g, '').toUpperCase() || undefined,
        notes: notes.trim() || undefined,
        status,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFormValid = name.trim() && 
    (!email || validateEmail(email)) && 
    (!kvkNumber || validateKvk(kvkNumber)) &&
    (!btwNumber || validateBtw(btwNumber)) &&
    (!iban || validateIban(iban)) &&
    (!bankBic || validateBic(bankBic))

  // Section header component
  const SectionHeader = ({ title }: { title: string }) => (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  )

  // Optional label component
  const OptionalLabel = () => (
    <span className="text-xs text-muted-foreground font-normal ml-1">
      ({t('zzpCustomers.helperOptional')})
    </span>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserCirclePlus size={24} className="text-primary" weight="duotone" />
            </div>
            {isEdit ? t('zzpCustomers.editCustomer') : t('zzpCustomers.newCustomer')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isEdit 
              ? t('zzpCustomers.editCustomerDescription')
              : t('zzpCustomers.newCustomerDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* ==================== CONTACT SECTION ==================== */}
          <SectionHeader title={t('zzpCustomers.sectionContact')} />
          
          {/* Name field (required) - full width */}
          <div className="space-y-2">
            <Label htmlFor="customer-name" className="text-sm font-medium">
              {t('zzpCustomers.formName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="customer-name"
              placeholder={t('zzpCustomers.formNamePlaceholder')}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameError('')
              }}
              className={`h-11 ${nameError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={isSubmitting}
              autoFocus
            />
            {nameError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle size={14} />
                {nameError}
              </p>
            )}
          </div>

          {/* Email and Phone - two columns on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer-email" className="text-sm font-medium flex items-center gap-2">
                <Envelope size={14} className="text-muted-foreground" />
                {t('zzpCustomers.formEmail')}
                <OptionalLabel />
              </Label>
              <Input
                id="customer-email"
                type="email"
                placeholder={t('zzpCustomers.formEmailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setEmailError('')
                }}
                className={`h-11 ${emailError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
              {emailError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {emailError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-phone" className="text-sm font-medium flex items-center gap-2">
                <Phone size={14} className="text-muted-foreground" />
                {t('zzpCustomers.formPhone')}
                <OptionalLabel />
              </Label>
              <Input
                id="customer-phone"
                type="tel"
                placeholder={t('zzpCustomers.formPhonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Contact person field */}
          <div className="space-y-2">
            <Label htmlFor="customer-contact-person" className="text-sm font-medium">
              {t('zzpCustomers.formContactPerson')}
              <OptionalLabel />
            </Label>
            <Input
              id="customer-contact-person"
              placeholder={t('zzpCustomers.formContactPersonPlaceholder')}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="h-11"
              disabled={isSubmitting}
            />
          </div>

          {/* ==================== ADDRESS SECTION ==================== */}
          <SectionHeader title={t('zzpCustomers.sectionAddress')} />
          
          <div className="space-y-2">
            <Label htmlFor="customer-address-street" className="text-sm font-medium">
              {t('zzpCustomers.formAddressStreet')}
              <OptionalLabel />
            </Label>
            <Input
              id="customer-address-street"
              placeholder={t('zzpCustomers.formAddressStreetPlaceholder')}
              value={addressStreet}
              onChange={(e) => setAddressStreet(e.target.value)}
              className="h-11"
              disabled={isSubmitting}
            />
          </div>

          {/* Secondary address line */}
          <div className="space-y-2">
            <Label htmlFor="customer-address-line2" className="text-sm font-medium">
              {t('zzpCustomers.formAddressLine2')}
              <OptionalLabel />
            </Label>
            <Input
              id="customer-address-line2"
              placeholder={t('zzpCustomers.formAddressLine2Placeholder')}
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              className="h-11"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label htmlFor="customer-postal" className="text-sm font-medium">
                {t('zzpCustomers.formAddressPostalCode')}
              </Label>
              <Input
                id="customer-postal"
                placeholder={t('zzpCustomers.formAddressPostalCodePlaceholder')}
                value={addressPostalCode}
                onChange={(e) => setAddressPostalCode(e.target.value)}
                className="h-11"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2 col-span-1 sm:col-span-2">
              <Label htmlFor="customer-city" className="text-sm font-medium">
                {t('zzpCustomers.formAddressCity')}
              </Label>
              <Input
                id="customer-city"
                placeholder={t('zzpCustomers.formAddressCityPlaceholder')}
                value={addressCity}
                onChange={(e) => setAddressCity(e.target.value)}
                className="h-11"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-country" className="text-sm font-medium">
                {t('zzpCustomers.formAddressCountry')}
              </Label>
              <Input
                id="customer-country"
                placeholder={t('zzpCustomers.formAddressCountryPlaceholder')}
                value={addressCountry}
                onChange={(e) => setAddressCountry(e.target.value)}
                className="h-11"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* ==================== BUSINESS IDS SECTION ==================== */}
          <SectionHeader title={t('zzpCustomers.sectionBusiness')} />
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer-kvk" className="text-sm font-medium">
                {t('zzpCustomers.formKvk')}
                <OptionalLabel />
              </Label>
              <Input
                id="customer-kvk"
                placeholder={t('zzpCustomers.formKvkPlaceholder')}
                value={kvkNumber}
                onChange={(e) => {
                  setKvkNumber(e.target.value)
                  setKvkError('')
                }}
                className={`h-11 ${kvkError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
              {kvkError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {kvkError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-btw" className="text-sm font-medium">
                {t('zzpCustomers.formBtw')}
                <OptionalLabel />
              </Label>
              <Input
                id="customer-btw"
                placeholder={t('zzpCustomers.formBtwPlaceholder')}
                value={btwNumber}
                onChange={(e) => {
                  setBtwNumber(e.target.value)
                  setBtwError('')
                }}
                className={`h-11 ${btwError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
              {btwError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {btwError}
                </p>
              )}
            </div>
          </div>

          {/* ==================== BANK SECTION ==================== */}
          <SectionHeader title={t('zzpCustomers.sectionBank')} />
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer-iban" className="text-sm font-medium">
                {t('zzpCustomers.formIban')}
                <OptionalLabel />
              </Label>
              <Input
                id="customer-iban"
                placeholder={t('zzpCustomers.formIbanPlaceholder')}
                value={iban}
                onChange={(e) => {
                  setIban(e.target.value)
                  setIbanError('')
                }}
                className={`h-11 ${ibanError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
              {ibanError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {ibanError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-bic" className="text-sm font-medium">
                {t('zzpCustomers.formBic')}
                <OptionalLabel />
              </Label>
              <Input
                id="customer-bic"
                placeholder={t('zzpCustomers.formBicPlaceholder')}
                value={bankBic}
                onChange={(e) => {
                  setBankBic(e.target.value)
                  setBicError('')
                }}
                className={`h-11 ${bicError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                disabled={isSubmitting}
              />
              {bicError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle size={14} />
                  {bicError}
                </p>
              )}
            </div>
          </div>

          {/* ==================== NOTES SECTION ==================== */}
          <SectionHeader title={t('zzpCustomers.sectionNotes')} />
          
          <div className="space-y-2">
            <Label htmlFor="customer-notes" className="text-sm font-medium">
              {t('zzpCustomers.formNotes')}
              <OptionalLabel />
            </Label>
            <textarea
              id="customer-notes"
              placeholder={t('zzpCustomers.formNotesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* ==================== STATUS SECTION ==================== */}
          <div className="pt-2 pb-1">
            <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border/50">
              <div className="space-y-1">
                <Label htmlFor="customer-status" className="text-sm font-medium">
                  {t('zzpCustomers.formStatus')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {status === 'active' 
                    ? t('zzpCustomers.statusActiveDescription')
                    : t('zzpCustomers.statusInactiveDescription')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={status} size="sm" />
                <Switch
                  id="customer-status"
                  checked={status === 'active'}
                  onCheckedChange={(checked) => setStatus(checked ? 'active' : 'inactive')}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-border/50 gap-2 sm:gap-0">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-11"
          >
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleSave}
            disabled={isSubmitting || !isFormValid}
            className="h-11 min-w-[140px]"
          >
            {isSubmitting ? (
              <>
                <SpinnerGap size={18} className="mr-2 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <CheckCircle size={18} className="mr-2" weight="fill" />
                {t('zzpCustomers.saveCustomer')}
              </>
            )}
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

// Customer detail sheet/drawer for viewing all fields
const CustomerDetailSheet = ({
  open,
  onOpenChange,
  customer,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: ZZPCustomer
  onEdit: () => void
}) => {
  if (!customer) return null

  // Helper to format address
  const formatAddress = () => {
    const parts = [
      customer.address_street,
      customer.address_line2,
      [customer.address_postal_code, customer.address_city].filter(Boolean).join(' '),
      customer.address_country,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : null
  }

  // Detail row component
  const DetailRow = ({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ElementType }) => {
    if (!value) return null
    return (
      <div className="flex items-start gap-3 py-2">
        {Icon && <Icon size={18} className="text-muted-foreground mt-0.5 flex-shrink-0" weight="duotone" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium break-words">{value}</p>
        </div>
      </div>
    )
  }

  const address = formatAddress()
  const hasContactDetails = customer.email || customer.phone || customer.contact_person
  const hasAddressDetails = address
  const hasBusinessDetails = customer.kvk_number || customer.btw_number
  const hasBankDetails = customer.iban || customer.bank_bic
  const hasNotes = customer.notes

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users size={28} className="text-primary" weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl truncate">{customer.name}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <StatusBadge status={customer.status} size="sm" />
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Contact Section */}
          {hasContactDetails && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('zzpCustomers.sectionContact')}
              </h4>
              <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                <DetailRow label={t('zzpCustomers.formEmail')} value={customer.email} icon={Envelope} />
                <DetailRow label={t('zzpCustomers.formPhone')} value={customer.phone} icon={Phone} />
                <DetailRow label={t('zzpCustomers.formContactPerson')} value={customer.contact_person} icon={Users} />
              </div>
            </div>
          )}

          {/* Address Section */}
          {hasAddressDetails && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('zzpCustomers.sectionAddress')}
              </h4>
              <div className="bg-secondary/30 rounded-lg p-3">
                <DetailRow label={t('zzpCustomers.sectionAddress')} value={address} icon={MapPin} />
              </div>
            </div>
          )}

          {/* Business IDs Section */}
          {hasBusinessDetails && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('zzpCustomers.sectionBusiness')}
              </h4>
              <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                <DetailRow label={t('zzpCustomers.formKvk')} value={customer.kvk_number} icon={Buildings} />
                <DetailRow label={t('zzpCustomers.formBtw')} value={customer.btw_number} icon={IdentificationCard} />
              </div>
            </div>
          )}

          {/* Bank Section */}
          {hasBankDetails && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('zzpCustomers.sectionBank')}
              </h4>
              <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                <DetailRow label={t('zzpCustomers.formIban')} value={customer.iban} icon={Bank} />
                <DetailRow label={t('zzpCustomers.formBic')} value={customer.bank_bic} icon={Bank} />
              </div>
            </div>
          )}

          {/* Notes Section */}
          {hasNotes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('zzpCustomers.sectionNotes')}
              </h4>
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
              </div>
            </div>
          )}

          {/* Show message if no extra details */}
          {!hasContactDetails && !hasAddressDetails && !hasBusinessDetails && !hasBankDetails && !hasNotes && (
            <div className="text-center py-8 text-muted-foreground">
              <IdentificationCard size={40} className="mx-auto mb-3 opacity-50" weight="duotone" />
              <p className="text-sm">{t('zzpCustomers.noDetailsAvailable')}</p>
            </div>
          )}
        </div>

        <Separator className="my-2" />

        <div className="pt-4 flex gap-2">
          <Button onClick={onEdit} className="flex-1 gap-2">
            <PencilSimple size={18} />
            {t('common.edit')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Empty state component
const EmptyState = ({ onAddCustomer }: { onAddCustomer: () => void }) => (
  <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
    <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <UsersThree size={40} weight="duotone" className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('zzpCustomers.noCustomers')}</h3>
      <p className="text-muted-foreground mb-8 max-w-md">
        {t('zzpCustomers.noCustomersDescription')}
      </p>
      <Button onClick={onAddCustomer} size="lg" className="gap-2 h-12 px-6">
        <UserCirclePlus size={20} weight="bold" />
        {t('zzpCustomers.addFirstCustomer')}
      </Button>
    </CardContent>
  </Card>
)

// Mobile customer card component
const CustomerCard = ({ 
  customer, 
  onView,
  onEdit, 
  onDelete 
}: { 
  customer: ZZPCustomer
  onView: () => void
  onEdit: () => void
  onDelete: () => void 
}) => (
  <Card className="bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors">
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer" onClick={onView}>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Users size={20} className="text-primary" weight="duotone" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold truncate">{customer.name}</h4>
            {customer.email && (
              <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5 mt-1">
                <Envelope size={12} />
                {customer.email}
              </p>
            )}
            {customer.phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Phone size={12} />
                {customer.phone}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <StatusBadge status={customer.status} size="sm" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                <DotsThreeVertical size={18} />
                <span className="sr-only">{t('common.actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView}>
                <Eye size={16} className="mr-2" />
                {t('zzpCustomers.viewDetails')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <PencilSimple size={16} className="mr-2" />
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <TrashSimple size={16} className="mr-2" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </CardContent>
  </Card>
)

export const ZZPCustomersPage = () => {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<ZZPCustomer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [isLoading, setIsLoading] = useState(true)
  
  const showLoading = useDelayedLoading(isLoading, 300, customers.length > 0)
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchQuery, 300)
  
  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<ZZPCustomer | undefined>()
  const [deletingCustomer, setDeletingCustomer] = useState<ZZPCustomer | undefined>()
  const [viewingCustomer, setViewingCustomer] = useState<ZZPCustomer | undefined>()
  
  // Success dialog state (for CTA after creating customer)
  const [newlyCreatedCustomer, setNewlyCreatedCustomer] = useState<ZZPCustomer | undefined>()
  const [showCreateInvoiceCta, setShowCreateInvoiceCta] = useState(false)

  // Load customers from API
  const loadCustomers = useCallback(async () => {
    if (!user?.id) return
    
    setIsLoading(true)
    try {
      const response = await zzpApi.customers.list()
      setCustomers(response.customers)
    } catch (error) {
      console.error('Failed to load customers:', error)
      toast.error(parseApiError(error))
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // Calculate stats
  const stats = useMemo(() => {
    const total = customers.length
    const active = customers.filter(c => c.status === 'active').length
    const inactive = customers.filter(c => c.status === 'inactive').length
    return { total, active, inactive }
  }, [customers])

  // Filter customers based on search and status
  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      // Status filter
      if (statusFilter !== 'all' && customer.status !== statusFilter) {
        return false
      }
      
      // Search filter (debounced)
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase()
        const matchesName = customer.name.toLowerCase().includes(query)
        const matchesEmail = customer.email?.toLowerCase().includes(query)
        const matchesPhone = customer.phone?.toLowerCase().includes(query)
        if (!matchesName && !matchesEmail && !matchesPhone) {
          return false
        }
      }
      
      return true
    })
  }, [customers, debouncedSearch, statusFilter])

  // Handle adding/editing customer
  const handleSaveCustomer = useCallback(async (data: ZZPCustomerCreate) => {
    if (!user?.id) return

    try {
      if (editingCustomer) {
        // Update existing
        await zzpApi.customers.update(editingCustomer.id, data as ZZPCustomerUpdate)
        toast.success(t('zzpCustomers.customerSaved'))
      } else {
        // Add new - show CTA to create invoice
        const newCustomer = await zzpApi.customers.create(data)
        setNewlyCreatedCustomer(newCustomer)
        setShowCreateInvoiceCta(true)
      }

      // Reload customers list
      await loadCustomers()

      setIsFormOpen(false)
      setEditingCustomer(undefined)
    } catch (error) {
      console.error('Failed to save customer:', error)
      toast.error(parseApiError(error))
    }
  }, [user?.id, editingCustomer, loadCustomers])

  // Handle navigation to invoices with pre-selected customer
  const handleCreateInvoiceForCustomer = useCallback(() => {
    if (newlyCreatedCustomer) {
      // Navigate to invoices page with customer_id in the URL params
      navigateTo(`/zzp/invoices?customer_id=${newlyCreatedCustomer.id}`)
    }
    setShowCreateInvoiceCta(false)
    setNewlyCreatedCustomer(undefined)
  }, [newlyCreatedCustomer])

  // Dismiss the CTA dialog
  const handleDismissCreateInvoiceCta = useCallback(() => {
    toast.success(t('zzpCustomers.customerSaved'))
    setShowCreateInvoiceCta(false)
    setNewlyCreatedCustomer(undefined)
  }, [])

  // Handle delete customer
  const handleDeleteCustomer = useCallback(async () => {
    if (!user?.id || !deletingCustomer) return

    try {
      await zzpApi.customers.delete(deletingCustomer.id)
      toast.success(t('zzpCustomers.customerDeleted'))
      
      // Reload customers list
      await loadCustomers()
    } catch (error) {
      console.error('Failed to delete customer:', error)
      toast.error(parseApiError(error))
    }

    setDeletingCustomer(undefined)
  }, [user?.id, deletingCustomer, loadCustomers])

  // Open form for new customer
  const openNewForm = useCallback(() => {
    setEditingCustomer(undefined)
    setIsFormOpen(true)
  }, [])

  // Open form for editing
  const openEditForm = useCallback((customer: ZZPCustomer) => {
    setEditingCustomer(customer)
    setIsFormOpen(true)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
              <Users size={28} className="text-primary sm:hidden" weight="duotone" />
              <Users size={40} className="text-primary hidden sm:block" weight="duotone" />
              {t('zzpCustomers.title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t('zzpCustomers.pageDescription')}
            </p>
          </div>
          <Button onClick={openNewForm} className="gap-2 h-10 sm:h-11 w-full sm:w-auto">
            <Plus size={18} weight="bold" />
            {t('zzpCustomers.newCustomer')}
          </Button>
        </div>

        {/* Stats Cards */}
        {showLoading ? (
          <StatsLoadingSkeleton />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <StatsCard 
              title={t('zzpCustomers.statsTotal')} 
              value={stats.total} 
              icon={UsersThree}
              className="border-primary/20"
            />
            <StatsCard 
              title={t('zzpCustomers.statsActive')} 
              value={stats.active} 
              icon={UserCheck}
              className="border-green-500/20"
            />
            <StatsCard 
              title={t('zzpCustomers.statsInactive')} 
              value={stats.inactive} 
              icon={UserMinus}
              className="border-gray-500/20"
            />
          </div>
        )}

        {/* Show loading, empty state or content */}
        {showLoading ? (
          <TableLoadingSkeleton />
        ) : customers.length === 0 ? (
          <EmptyState onAddCustomer={openNewForm} />
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm" style={{ opacity: 1, transition: 'opacity 200ms ease-in-out' }}>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{t('zzpCustomers.listTitle')}</CardTitle>
                  <CardDescription>
                    {filteredCustomers.length} {filteredCustomers.length === 1 ? 'klant' : 'klanten'} 
                    {statusFilter !== 'all' && ` (${statusFilter === 'active' ? t('zzpCustomers.filterActive') : t('zzpCustomers.filterInactive')})`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search and filter controls */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <MagnifyingGlass 
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
                    size={18} 
                  />
                  <Input
                    placeholder={t('zzpCustomers.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11"
                  />
                </div>
                <Select 
                  value={statusFilter} 
                  onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'inactive')}
                >
                  <SelectTrigger className="w-full sm:w-44 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('zzpCustomers.filterAll')}</SelectItem>
                    <SelectItem value="active">{t('zzpCustomers.filterActive')}</SelectItem>
                    <SelectItem value="inactive">{t('zzpCustomers.filterInactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Mobile: Card list */}
              <div className="sm:hidden space-y-3">
                {filteredCustomers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <MagnifyingGlass size={40} className="mb-3 opacity-50" />
                    <p className="font-medium">{t('zzpCustomers.noCustomersFound')}</p>
                    <p className="text-sm">{t('zzpCustomers.tryDifferentSearch')}</p>
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <CustomerCard
                      key={customer.id}
                      customer={customer}
                      onView={() => setViewingCustomer(customer)}
                      onEdit={() => openEditForm(customer)}
                      onDelete={() => setDeletingCustomer(customer)}
                    />
                  ))
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                      <TableHead className="font-semibold">{t('zzpCustomers.columnName')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpCustomers.columnEmail')}</TableHead>
                      <TableHead className="font-semibold hidden lg:table-cell">{t('zzpCustomers.columnPhone')}</TableHead>
                      <TableHead className="font-semibold">{t('zzpCustomers.columnStatus')}</TableHead>
                      <TableHead className="text-right font-semibold">{t('zzpCustomers.columnActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <MagnifyingGlass size={40} className="mb-3 opacity-50" />
                            <p className="font-medium">{t('zzpCustomers.noCustomersFound')}</p>
                            <p className="text-sm">{t('zzpCustomers.tryDifferentSearch')}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <TableRow key={customer.id} className="hover:bg-secondary/30">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                                <Users size={16} className="text-primary" weight="duotone" />
                              </div>
                              <span className="font-medium">{customer.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {customer.email || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden lg:table-cell">
                            {customer.phone || '-'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={customer.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewingCustomer(customer)}
                                className="h-8 w-8 p-0"
                              >
                                <Eye size={16} />
                                <span className="sr-only">{t('zzpCustomers.viewDetails')}</span>
                              </Button>
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

      {/* Customer detail sheet */}
      <CustomerDetailSheet
        open={!!viewingCustomer}
        onOpenChange={(open) => {
          if (!open) setViewingCustomer(undefined)
        }}
        customer={viewingCustomer}
        onEdit={() => {
          if (viewingCustomer) {
            setViewingCustomer(undefined)
            openEditForm(viewingCustomer)
          }
        }}
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

      {/* Success CTA dialog - offer to create invoice for new customer */}
      <AlertDialog open={showCreateInvoiceCta} onOpenChange={(open) => {
        if (!open) handleDismissCreateInvoiceCta()
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <CheckCircle size={28} className="text-green-600" weight="duotone" />
              </div>
              <div>
                <AlertDialogTitle className="text-left">{t('zzpCustomers.customerCreatedTitle')}</AlertDialogTitle>
                {newlyCreatedCustomer && (
                  <p className="text-sm text-muted-foreground font-medium">{newlyCreatedCustomer.name}</p>
                )}
              </div>
            </div>
            <AlertDialogDescription>
              {t('zzpCustomers.customerCreatedMessage')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={handleDismissCreateInvoiceCta}>
              {t('zzpCustomers.maybeLater')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateInvoiceForCustomer} className="gap-2">
              <Receipt size={18} weight="duotone" />
              {t('zzpCustomers.createInvoiceForCustomer')}
              <ArrowRight size={18} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ZZPCustomersPage
