/**
 * Evidence Pack Panel Component
 * 
 * Panel for generating and downloading VAT evidence packs:
 * - Generate new evidence pack for a period
 * - List existing packs with download buttons
 * - Show pack metadata (size, checksum, download count)
 */

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  evidencePackApi,
  EvidencePackResponse,
  EvidencePackListResponse,
  getErrorMessage,
} from '@/lib/api'
import {
  Download,
  FileArchive,
  Plus,
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
} from '@phosphor-icons/react'
import { format } from 'date-fns'

interface EvidencePackPanelProps {
  clientId: string
  periodId: string
  periodName?: string
}

// Format file size
const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const EvidencePackPanel = ({ clientId, periodId, periodName }: EvidencePackPanelProps) => {
  // Data state
  const [packs, setPacks] = useState<EvidencePackResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Generate options
  const [packType, setPackType] = useState<'VAT_EVIDENCE' | 'AUDIT_TRAIL'>('VAT_EVIDENCE')

  // Fetch packs
  const fetchPacks = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await evidencePackApi.list(clientId, periodId)
      setPacks(response.packs)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [clientId, periodId])

  useEffect(() => {
    fetchPacks()
  }, [fetchPacks])

  // Generate new pack
  const handleGenerate = async () => {
    try {
      setIsGenerating(true)
      setError(null)
      setSuccess(null)
      
      const newPack = await evidencePackApi.generate(clientId, periodId, packType)
      
      // Add to list
      setPacks(prev => [newPack, ...prev])
      setSuccess(`Evidence pack generated successfully! File size: ${formatFileSize(newPack.file_size_bytes)}`)
      
      // Clear success after 5 seconds
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsGenerating(false)
    }
  }

  // Download pack
  const handleDownload = async (pack: EvidencePackResponse) => {
    try {
      const blob = await evidencePackApi.download(pack.id)
      
      // Create download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${pack.pack_type}_${pack.metadata?.period_name || 'pack'}_${format(new Date(pack.created_at || new Date()), 'yyyyMMdd')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      // Update download count in local state
      setPacks(prev => prev.map(p => 
        p.id === pack.id 
          ? { ...p, download_count: p.download_count + 1 }
          : p
      ))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileArchive size={20} />
          Evidence Packs
        </CardTitle>
        <CardDescription>
          Generate compliance evidence packs for {periodName || 'this period'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Generate new pack */}
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
          <Select value={packType} onValueChange={(v) => setPackType(v as typeof packType)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VAT_EVIDENCE">VAT Evidence</SelectItem>
              <SelectItem value="AUDIT_TRAIL">Audit Trail</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex-1"
          >
            {isGenerating ? (
              <>
                <ArrowsClockwise size={16} className="mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Plus size={16} className="mr-2" />
                Generate Evidence Pack
              </>
            )}
          </Button>
        </div>

        {/* Success message */}
        {success && (
          <Alert className="bg-green-500/10 border-green-500/40">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Error message */}
        {error && (
          <Alert className="bg-destructive/10 border-destructive/40">
            <WarningCircle className="h-5 w-5 text-destructive" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Packs list */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : packs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead className="w-24">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.map((pack) => (
                <TableRow key={pack.id}>
                  <TableCell>
                    <Badge variant="outline">
                      {pack.pack_type === 'VAT_EVIDENCE' ? 'VAT Evidence' : 'Audit Trail'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {pack.created_at
                      ? format(new Date(pack.created_at), 'MMM d, yyyy HH:mm')
                      : '—'
                    }
                  </TableCell>
                  <TableCell>
                    {formatFileSize(pack.file_size_bytes)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {pack.download_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(pack)}
                    >
                      <Download size={16} className="mr-1" />
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileArchive size={36} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No evidence packs generated yet</p>
            <p className="text-xs mt-1">Generate a VAT evidence pack above</p>
          </div>
        )}

        {/* Pack type descriptions */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p><strong>VAT Evidence:</strong> VAT boxes, journal entries, documents, validation status</p>
          <p><strong>Audit Trail:</strong> Complete audit log of all period transactions</p>
        </div>
      </CardContent>
    </Card>
  )
}
