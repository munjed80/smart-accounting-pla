import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { intelligentProcessor, ExtractedInvoiceData, LedgerAccountPredictor } from '@/lib/intelligentProcessor'
import { useKV } from '@github/spark/hooks'
import { 
  UploadSimple, 
  FileImage, 
  Brain,
  CheckCircle, 
  XCircle,
  Clock,
  Trash,
  Eye,
  Sparkle,
  WarningCircle
} from '@phosphor-icons/react'
import { toast } from 'sonner'

interface ProcessedInvoice {
  id: string
  file: File
  status: 'pending' | 'processing' | 'processed' | 'error' | 'manual_review'
  progress: number
  extractedData?: ExtractedInvoiceData
  errorMessage?: string
  imageUrl?: string
}

export const IntelligentUploadPortal = () => {
  const [files, setFiles] = useState<ProcessedInvoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<ProcessedInvoice | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [transactions, setTransactions] = useKV<any[]>('transactions', [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    addFiles(selectedFiles)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const addFiles = (selectedFiles: File[]) => {
    const newFiles: ProcessedInvoice[] = selectedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...newFiles])
  }

  const processFile = async (fileItem: ProcessedInvoice) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileItem.id ? { ...f, status: 'processing', progress: 10 } : f
      )
    )

    try {
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        const imageUrl = e.target?.result as string
        
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id ? { ...f, progress: 30, imageUrl } : f
          )
        )

        try {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id ? { ...f, progress: 50 } : f
            )
          )

          const extractedData = await intelligentProcessor.processInvoiceWithLLM(imageUrl)
          
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id ? { ...f, progress: 90 } : f
            )
          )

          const finalStatus = extractedData.status === 'MANUAL_REVIEW_REQUIRED' 
            ? 'manual_review' 
            : extractedData.status === 'FAILED'
            ? 'error'
            : 'processed'

          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id 
                ? { ...f, status: finalStatus, progress: 100, extractedData } 
                : f
            )
          )

          if (finalStatus === 'processed') {
            toast.success(`Invoice processed: ${extractedData.merchant}`, {
              description: `€${extractedData.totalAmount.toFixed(2)} → ${extractedData.predictedAccountName}`
            })
          } else if (finalStatus === 'manual_review') {
            toast.warning('Manual review required', {
              description: 'Some invoice data could not be extracted automatically'
            })
          }

        } catch (error) {
          console.error('Processing failed:', error)
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id 
                ? { 
                    ...f, 
                    status: 'error', 
                    progress: 100, 
                    errorMessage: error instanceof Error ? error.message : 'Processing failed' 
                  } 
                : f
            )
          )
          toast.error('Processing failed', {
            description: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      reader.onerror = () => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id 
              ? { ...f, status: 'error', progress: 100, errorMessage: 'Failed to read file' } 
              : f
          )
        )
        toast.error('Failed to read file')
      }

      reader.readAsDataURL(fileItem.file)

    } catch (error) {
      console.error('Upload failed:', error)
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id 
            ? { 
                ...f, 
                status: 'error', 
                progress: 100, 
                errorMessage: error instanceof Error ? error.message : 'Upload failed' 
              } 
            : f
        )
      )
      toast.error('Upload failed')
    }
  }

  const processAllPending = () => {
    files.forEach((file) => {
      if (file.status === 'pending') {
        processFile(file)
      }
    })
  }

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const viewDetails = (file: ProcessedInvoice) => {
    setSelectedInvoice(file)
    setIsDetailOpen(true)
  }

  const approveDraft = () => {
    if (!selectedInvoice?.extractedData) return

    const newTransaction = {
      id: selectedInvoice.id,
      booking_number: `AUTO-${Date.now()}`,
      date: selectedInvoice.extractedData.invoiceDate,
      description: `${selectedInvoice.extractedData.merchant}`,
      amount: selectedInvoice.extractedData.totalAmount,
      vat_amount: selectedInvoice.extractedData.vatAmount,
      net_amount: selectedInvoice.extractedData.netAmount,
      account_code: selectedInvoice.extractedData.predictedAccountCode,
      account_name: selectedInvoice.extractedData.predictedAccountName,
      confidence: selectedInvoice.extractedData.predictionConfidence,
      status: 'APPROVED',
      created_at: new Date().toISOString(),
      type: 'EXPENSE'
    }

    setTransactions((current) => {
      const existing = current || []
      return [...existing, newTransaction]
    })
    
    removeFile(selectedInvoice.id)
    setIsDetailOpen(false)
    
    toast.success('Transaction approved!', {
      description: `€${newTransaction.amount.toFixed(2)} booked to ${newTransaction.account_name}`
    })
  }

  const getStatusIcon = (status: ProcessedInvoice['status']) => {
    switch (status) {
      case 'pending':
        return <Clock size={20} className="text-muted-foreground" />
      case 'processing':
        return <Brain size={20} className="text-primary animate-pulse" weight="duotone" />
      case 'processed':
        return <CheckCircle size={20} className="text-accent" weight="fill" />
      case 'manual_review':
        return <WarningCircle size={20} className="text-amber-500" weight="fill" />
      case 'error':
        return <XCircle size={20} className="text-destructive" weight="fill" />
    }
  }

  const getStatusBadge = (status: ProcessedInvoice['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>
      case 'processing':
        return <Badge variant="default" className="bg-primary">Processing...</Badge>
      case 'processed':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Processed</Badge>
      case 'manual_review':
        return <Badge variant="default" className="bg-amber-500">Review Required</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const processingCount = files.filter((f) => f.status === 'processing').length
  const processedCount = files.filter((f) => f.status === 'processed').length
  const reviewCount = files.filter((f) => f.status === 'manual_review').length

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Intelligent Invoice Processing
          </h2>
          <p className="text-muted-foreground mt-1">
            AI-powered OCR with automatic ledger classification
          </p>
        </div>
        <div className="flex gap-2">
          {files.length > 0 && (
            <>
              <Button variant="outline" onClick={() => setFiles([])}>
                <Trash size={18} className="mr-2" />
                Clear All
              </Button>
              {pendingCount > 0 && (
                <Button onClick={processAllPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Brain size={18} className="mr-2" weight="duotone" />
                  Process All ({pendingCount})
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Processing</CardDescription>
            <CardTitle className="text-3xl text-primary">{processingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Processed</CardDescription>
            <CardTitle className="text-3xl text-accent">{processedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Review Required</CardDescription>
            <CardTitle className="text-3xl text-amber-500">{reviewCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkle size={24} weight="duotone" className="text-primary" />
            Upload Invoices
          </CardTitle>
          <CardDescription>
            Drop invoice images here or click to browse. The AI will extract data and suggest ledger accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary hover:bg-accent/5 transition-all"
          >
            <UploadSimple size={48} className="mx-auto mb-4 text-muted-foreground" weight="duotone" />
            <p className="text-lg font-medium mb-2">Drop invoice images here</p>
            <p className="text-sm text-muted-foreground">or click to browse (PNG, JPG, PDF)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {files.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="font-semibold">Uploaded Files ({files.length})</h3>
              {files.map((file) => (
                <div key={file.id} className="border border-border rounded-lg p-4 hover:bg-accent/5 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {file.file.type.includes('pdf') ? (
                        <FileImage size={32} className="text-muted-foreground" weight="duotone" />
                      ) : (
                        <FileImage size={32} className="text-primary" weight="duotone" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(file.status)}
                        <p className="font-medium truncate">{file.file.name}</p>
                        {getStatusBadge(file.status)}
                      </div>

                      {file.status === 'processing' && (
                        <Progress value={file.progress} className="h-2 mb-2" />
                      )}

                      {file.extractedData && (
                        <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Merchant:</span>
                            <span className="ml-2 font-medium">{file.extractedData.merchant}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Date:</span>
                            <span className="ml-2 font-medium">{file.extractedData.invoiceDate}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total:</span>
                            <span className="ml-2 font-medium">€{file.extractedData.totalAmount.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Account:</span>
                            <span className="ml-2 font-medium">
                              {file.extractedData.predictedAccountCode} ({file.extractedData.predictionConfidence}%)
                            </span>
                          </div>
                        </div>
                      )}

                      {file.errorMessage && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertDescription>{file.errorMessage}</AlertDescription>
                        </Alert>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {file.status === 'pending' && (
                        <Button onClick={() => processFile(file)} size="sm" variant="default">
                          <Brain size={16} className="mr-1" />
                          Process
                        </Button>
                      )}
                      {(file.status === 'processed' || file.status === 'manual_review') && (
                        <Button onClick={() => viewDetails(file)} size="sm" variant="outline">
                          <Eye size={16} className="mr-1" />
                          Review
                        </Button>
                      )}
                      <Button onClick={() => removeFile(file.id)} size="sm" variant="ghost">
                        <Trash size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              Review and approve the extracted invoice data
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice?.extractedData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Merchant</Label>
                  <Input value={selectedInvoice.extractedData.merchant} readOnly />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input value={selectedInvoice.extractedData.invoiceDate} readOnly />
                </div>
                <div>
                  <Label>Total Amount (incl. VAT)</Label>
                  <Input value={`€${selectedInvoice.extractedData.totalAmount.toFixed(2)}`} readOnly />
                </div>
                <div>
                  <Label>VAT Amount</Label>
                  <Input value={`€${selectedInvoice.extractedData.vatAmount.toFixed(2)}`} readOnly />
                </div>
                <div>
                  <Label>Net Amount</Label>
                  <Input value={`€${selectedInvoice.extractedData.netAmount.toFixed(2)}`} readOnly />
                </div>
                <div>
                  <Label>Confidence</Label>
                  <Input value={`${selectedInvoice.extractedData.predictionConfidence}%`} readOnly />
                </div>
              </div>

              <div>
                <Label>Predicted Ledger Account</Label>
                <Select value={selectedInvoice.extractedData.predictedAccountCode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LedgerAccountPredictor.getAllAccounts().map((account) => (
                      <SelectItem key={account.code} value={account.code}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedInvoice.imageUrl && (
                <div>
                  <Label>Invoice Image</Label>
                  <div className="mt-2 border rounded-lg overflow-hidden">
                    <img 
                      src={selectedInvoice.imageUrl} 
                      alt="Invoice" 
                      className="w-full h-auto max-h-96 object-contain"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={approveDraft} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <CheckCircle size={18} className="mr-2" weight="fill" />
                  Approve & Book
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
