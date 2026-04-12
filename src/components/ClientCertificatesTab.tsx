/**
 * Client Certificates Tab (Dutch-first)
 * 
 * Manage PKI certificates for a client administration.
 * - List registered certificates with validity status
 * - Register new certificates via storage reference
 * - Delete (deactivate) certificates
 * 
 * All text in Dutch.
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import {
  certificateApi,
  CertificateResponse,
  getErrorMessage,
} from '@/lib/api'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { nl as nlLocale } from 'date-fns/locale'
import {
  Shield,
  Plus,
  Trash,
  CheckCircle,
  WarningCircle,
  Warning,
  ArrowsClockwise,
  Certificate,
} from '@phosphor-icons/react'

interface ClientCertificatesTabProps {
  clientId: string
}

const CertificateStatusBadge = ({ cert }: { cert: CertificateResponse }) => {
  if (!cert.is_active) {
    return (
      <Badge variant="outline" className="bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/40">
        Inactief
      </Badge>
    )
  }
  if (!cert.is_valid) {
    return (
      <Badge variant="outline" className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40">
        Verlopen
      </Badge>
    )
  }
  if (cert.days_until_expiry <= 30) {
    return (
      <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40">
        Verloopt binnenkort ({cert.days_until_expiry}d)
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40">
      Geldig ({cert.days_until_expiry}d)
    </Badge>
  )
}

export const ClientCertificatesTab = ({ clientId }: ClientCertificatesTabProps) => {
  const [certificates, setCertificates] = useState<CertificateResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showExpired, setShowExpired] = useState(false)
  const [showRegisterDialog, setShowRegisterDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const showLoading = useDelayedLoading(isLoading, 300, certificates.length > 0)

  // Register form state
  const [storageRef, setStorageRef] = useState('')
  const [passphraseRef, setPassphraseRef] = useState('')
  const [friendlyName, setFriendlyName] = useState('')
  const [purpose, setPurpose] = useState('BTW_SUBMISSION')

  const fetchCertificates = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await certificateApi.list(clientId, showExpired)
      setCertificates(data.certificates)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [clientId, showExpired])

  useEffect(() => {
    fetchCertificates()
  }, [fetchCertificates])

  const handleRegister = async () => {
    if (!storageRef.trim()) return

    setIsSubmitting(true)
    try {
      await certificateApi.register(clientId, {
        type: 'PKI_OVERHEID',
        storage_ref: storageRef.trim(),
        passphrase_ref: passphraseRef.trim() || undefined,
        friendly_name: friendlyName.trim() || undefined,
        purpose: purpose || undefined,
      })
      toast.success('Certificaat succesvol geregistreerd')
      setShowRegisterDialog(false)
      setStorageRef('')
      setPassphraseRef('')
      setFriendlyName('')
      setPurpose('BTW_SUBMISSION')
      fetchCertificates()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (certificateId: string) => {
    setIsSubmitting(true)
    try {
      await certificateApi.delete(clientId, certificateId)
      toast.success('Certificaat verwijderd')
      setShowDeleteDialog(null)
      fetchCertificates()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (error && certificates.length === 0) {
    return (
      <Alert className="bg-destructive/10 border-destructive/40">
        <WarningCircle className="h-5 w-5 text-destructive" />
        <AlertDescription className="ml-2">
          <div className="font-semibold mb-2">{t('errors.loadFailed')}</div>
          <div className="text-sm text-muted-foreground mb-4">{error}</div>
          <Button onClick={fetchCertificates} size="sm" variant="outline">
            <ArrowsClockwise size={16} className="mr-2" />
            {t('errors.tryAgain')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Certificaten</h2>
          <p className="text-sm text-muted-foreground">PKI-certificaten voor BTW-aangifte ondertekening</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExpired(!showExpired)}
          >
            {showExpired ? 'Verberg verlopen' : 'Toon verlopen'}
          </Button>
          <Button
            onClick={fetchCertificates}
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            <ArrowsClockwise size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
          <Button size="sm" onClick={() => setShowRegisterDialog(true)}>
            <Plus size={18} className="mr-2" />
            Registreer certificaat
          </Button>
        </div>
      </div>

      {/* Certificates List */}
      {showLoading ? (
        <div className="space-y-4 transition-opacity duration-200">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : certificates.length > 0 ? (
        <div className="space-y-4">
          {certificates.map((cert) => (
            <Card key={cert.id} className="bg-card/80 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${cert.is_valid && cert.is_active ? 'bg-green-500/20' : 'bg-gray-500/20'}`}>
                      <Shield size={24} weight="fill" className={cert.is_valid && cert.is_active ? 'text-green-600' : 'text-gray-500'} />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{cert.friendly_name || cert.subject}</h3>
                        <CertificateStatusBadge cert={cert} />
                      </div>

                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Type: {cert.type} &middot; Doel: {cert.purpose || '—'}</p>
                        <p>Onderwerp: {cert.subject}</p>
                        <p>Uitgever: {cert.issuer}</p>
                        <p>
                          Geldig van {format(new Date(cert.valid_from), 'd MMM yyyy', { locale: nlLocale })}
                          {' t/m '}
                          {format(new Date(cert.valid_to), 'd MMM yyyy', { locale: nlLocale })}
                        </p>
                        <p className="text-xs">
                          Vingerafdruk: <code className="text-[10px] bg-muted px-1 rounded">{cert.fingerprint}</code>
                        </p>
                      </div>
                    </div>
                  </div>

                  {cert.is_active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-500/10"
                      onClick={() => setShowDeleteDialog(cert.id)}
                    >
                      <Trash size={16} className="mr-1" />
                      Verwijderen
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <Certificate size={48} className="mx-auto mb-4 opacity-50" />
              <p className="font-medium">Geen certificaten geregistreerd</p>
              <p className="text-sm mt-2">
                Registreer een PKI-certificaat om BTW-aangiften digitaal te ondertekenen.
              </p>
              <Button size="sm" className="mt-4" onClick={() => setShowRegisterDialog(true)}>
                <Plus size={16} className="mr-2" />
                Registreer certificaat
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Register Dialog */}
      <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield size={20} />
              Certificaat registreren
            </DialogTitle>
            <DialogDescription>
              Registreer een PKI Overheid-certificaat voor BTW-aangifte ondertekening.
              Het certificaat zelf wordt niet opgeslagen — alleen metadata.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cert-name">Naam (optioneel)</Label>
              <Input
                id="cert-name"
                placeholder="Bijv. Belastingdienst BTW Certificaat 2026"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cert-ref">Certificaat referentie *</Label>
              <Input
                id="cert-ref"
                placeholder="$PKI_CERT_PATH of /secrets/cert.pfx"
                value={storageRef}
                onChange={(e) => setStorageRef(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pad naar het certificaatbestand (omgevingsvariabele, Coolify-secret, of bestandspad)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cert-pass">Wachtwoord referentie (optioneel)</Label>
              <Input
                id="cert-pass"
                placeholder="$PKI_CERT_PASSPHRASE"
                value={passphraseRef}
                onChange={(e) => setPassphraseRef(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cert-purpose">Doel</Label>
              <Input
                id="cert-purpose"
                placeholder="BTW_SUBMISSION"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegisterDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRegister}
              disabled={isSubmitting || !storageRef.trim()}
            >
              {isSubmitting ? t('common.processing') : 'Registreren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash size={20} />
              Certificaat verwijderen
            </DialogTitle>
            <DialogDescription>
              Weet u zeker dat u dit certificaat wilt deactiveren? Het kan daarna niet meer worden gebruikt voor ondertekening.
            </DialogDescription>
          </DialogHeader>

          <Alert className="bg-amber-500/10 border-amber-500/40">
            <Warning className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-sm">
              Het certificaatbestand zelf wordt niet verwijderd, alleen de registratie wordt gedeactiveerd.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteDialog && handleDelete(showDeleteDialog)}
              disabled={isSubmitting}
            >
              {isSubmitting ? t('common.processing') : 'Verwijderen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ClientCertificatesTab
