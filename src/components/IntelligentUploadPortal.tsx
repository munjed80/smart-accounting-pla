import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { documentApi, getErrorMessage, DocumentResponse } from '@/lib/api'
import { 
  UploadSimple, 
  FileImage, 
  CheckCircle, 
  XCircle,
  Clock,
  Trash,
  Sparkle,
  CloudArrowUp,
  ArrowsClockwise,
  WarningCircle
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'uploaded' | 'error'
  progress: number
  documentId?: string
  errorMessage?: string
  imageUrl?: string
}

export const IntelligentUploadPortal = () => {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [documents, setDocuments] = useState<DocumentResponse[]>([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(false)
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = async () => {
    setIsLoadingDocs(true)
    try {
      const docs = await documentApi.list()
      setDocuments(docs)
    } catch (error) {
      console.error('Failed to fetch documents:', error)
    } finally {
      setIsLoadingDocs(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const handleReprocess = async (docId: string) => {
    setReprocessingIds(prev => new Set(prev).add(docId))
    try {
      await documentApi.reprocess(docId)
      toast.success('Document queued for reprocessing')
      // Refresh the document list
      await fetchDocuments()
    } catch (error) {
      toast.error('Failed to reprocess: ' + getErrorMessage(error))
    } finally {
      setReprocessingIds(prev => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }

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
    const validExtensions = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']
    const validFiles = selectedFiles.filter(file => {
      if (!validExtensions.includes(file.type)) {
        toast.error(`Invalid file type: ${file.name}. Only PNG, JPG, and PDF are allowed.`)
        return false
      }
      return true
    })

    const newFiles: UploadedFile[] = validFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...newFiles])
  }

  const uploadFile = async (fileItem: UploadedFile) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileItem.id ? { ...f, status: 'uploading', progress: 10 } : f
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

          const response = await documentApi.upload(fileItem.file)
          
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id ? { ...f, progress: 90 } : f
            )
          )

          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id 
                ? { ...f, status: 'uploaded', progress: 100, documentId: response.document_id } 
                : f
            )
          )

          toast.success(`File uploaded successfully!`, {
            description: `${fileItem.file.name} - Document ID: ${response.document_id.substring(0, 8)}...`
          })

        } catch (error) {
          const errorMessage = getErrorMessage(error)
          console.error('Upload failed:', error)
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id 
                ? { 
                    ...f, 
                    status: 'error', 
                    progress: 100, 
                    errorMessage 
                  } 
                : f
            )
          )
          toast.error('Upload failed', {
            description: errorMessage
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
      const errorMessage = getErrorMessage(error)
      console.error('Upload failed:', error)
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id 
            ? { 
                ...f, 
                status: 'error', 
                progress: 100, 
                errorMessage 
              } 
            : f
        )
      )
      toast.error('Upload failed', {
        description: errorMessage
      })
    }
  }

  const uploadAllPending = () => {
    files.forEach((file) => {
      if (file.status === 'pending') {
        uploadFile(file)
      }
    })
  }

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock size={20} className="text-muted-foreground" />
      case 'uploading':
        return <CloudArrowUp size={20} className="text-primary animate-pulse" weight="duotone" />
      case 'uploaded':
        return <CheckCircle size={20} className="text-accent" weight="fill" />
      case 'error':
        return <XCircle size={20} className="text-destructive" weight="fill" />
    }
  }

  const getStatusBadge = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>
      case 'uploading':
        return <Badge variant="default" className="bg-primary">Uploading...</Badge>
      case 'uploaded':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Uploaded</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
    }
  }

  const getDocStatusIcon = (status: DocumentResponse['status']) => {
    switch (status) {
      case 'UPLOADED':
        return <Clock size={16} className="text-muted-foreground" />
      case 'PROCESSING':
        return <ArrowsClockwise size={16} className="text-primary animate-spin" />
      case 'DRAFT_READY':
        return <CheckCircle size={16} className="text-accent" weight="fill" />
      case 'FAILED':
        return <XCircle size={16} className="text-destructive" weight="fill" />
    }
  }

  const getDocStatusBadge = (status: DocumentResponse['status']) => {
    switch (status) {
      case 'UPLOADED':
        return <Badge variant="outline">Uploaded</Badge>
      case 'PROCESSING':
        return <Badge variant="default" className="bg-primary">Processing...</Badge>
      case 'DRAFT_READY':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Ready</Badge>
      case 'FAILED':
        return <Badge variant="destructive">Failed</Badge>
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const uploadingCount = files.filter((f) => f.status === 'uploading').length
  const uploadedCount = files.filter((f) => f.status === 'uploaded').length
  const errorCount = files.filter((f) => f.status === 'error').length
  
  const failedDocCount = documents.filter((d) => d.status === 'FAILED').length

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Document Upload Portal
          </h2>
          <p className="text-muted-foreground mt-1">
            Upload invoices and receipts to the backend for AI processing
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
                <Button onClick={uploadAllPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <CloudArrowUp size={18} className="mr-2" weight="duotone" />
                  Upload All ({pendingCount})
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
            <CardDescription>Uploading</CardDescription>
            <CardTitle className="text-3xl text-primary">{uploadingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Uploaded</CardDescription>
            <CardTitle className="text-3xl text-accent">{uploadedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Errors</CardDescription>
            <CardTitle className="text-3xl text-destructive">{errorCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkle size={24} weight="duotone" className="text-primary" />
            Upload Documents
          </CardTitle>
          <CardDescription>
            Drop invoice or receipt images here. Files will be uploaded to the backend at <code className="bg-secondary px-2 py-0.5 rounded text-xs">POST /api/v1/documents/upload</code>
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
            <p className="text-lg font-medium mb-2">Drop documents here</p>
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

                      <div className="text-sm text-muted-foreground">
                        Size: {(file.file.size / 1024).toFixed(2)} KB
                      </div>

                      {file.status === 'uploading' && (
                        <Progress value={file.progress} className="h-2 mt-2" />
                      )}

                      {file.documentId && (
                        <div className="mt-2">
                          <Alert>
                            <CheckCircle size={16} weight="fill" />
                            <AlertDescription>
                              Document ID: <code className="bg-secondary px-2 py-0.5 rounded text-xs">{file.documentId}</code>
                            </AlertDescription>
                          </Alert>
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
                        <Button onClick={() => uploadFile(file)} size="sm" variant="default">
                          <CloudArrowUp size={16} className="mr-1" />
                          Upload
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

      {/* Processed Documents Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileImage size={24} weight="duotone" className="text-primary" />
                Processed Documents
                {failedDocCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {failedDocCount} Failed
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Documents uploaded and processed by the AI worker
              </CardDescription>
            </div>
            <Button onClick={fetchDocuments} variant="outline" size="sm" disabled={isLoadingDocs}>
              <ArrowsClockwise size={18} className={`mr-2 ${isLoadingDocs ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingDocs ? (
            <div className="text-center py-8">
              <ArrowsClockwise size={32} className="mx-auto mb-4 text-primary animate-spin" />
              <p className="text-muted-foreground">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <FileImage size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" weight="duotone" />
              <p className="text-muted-foreground">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="border border-border rounded-lg p-4 hover:bg-accent/5 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {getDocStatusIcon(doc.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{doc.original_filename}</span>
                          {getDocStatusBadge(doc.status)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Uploaded: {format(new Date(doc.created_at), 'dd MMM yyyy HH:mm')}
                          {doc.transaction_id && (
                            <span className="ml-2">• Transaction linked</span>
                          )}
                        </div>
                        
                        {/* Show error message for FAILED documents */}
                        {doc.status === 'FAILED' && doc.error_message && (
                          <Alert variant="destructive" className="mt-3">
                            <WarningCircle size={16} />
                            <AlertDescription className="ml-2">
                              <strong>Error:</strong> {doc.error_message}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                    
                    {/* Reprocess button for FAILED documents */}
                    {doc.status === 'FAILED' && (
                      <Button 
                        onClick={() => handleReprocess(doc.id)}
                        size="sm" 
                        variant="outline"
                        disabled={reprocessingIds.has(doc.id)}
                      >
                        <ArrowsClockwise 
                          size={16} 
                          className={`mr-1 ${reprocessingIds.has(doc.id) ? 'animate-spin' : ''}`} 
                        />
                        {reprocessingIds.has(doc.id) ? 'Reprocessing...' : 'Reprocess'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Sparkle size={16} weight="duotone" />
        <AlertDescription>
          <strong>Backend Integration:</strong> Files are uploaded to <code className="bg-secondary px-2 py-0.5 rounded text-xs">http://localhost:8000/api/v1/documents/upload</code>. 
          The Spark worker will automatically process uploaded documents and create draft transactions with AI-predicted ledger accounts.
        </AlertDescription>
      </Alert>
    </div>
  )
}
