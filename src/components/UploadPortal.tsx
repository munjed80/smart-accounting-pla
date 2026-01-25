import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { documentApi, getErrorMessage } from '@/lib/api'
import { 
  UploadSimple, 
  FileImage, 
  FilePdf, 
  CheckCircle, 
  XCircle,
  Clock,
  Trash
} from '@phosphor-icons/react'
import { toast } from 'sonner'

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  documentId?: string
  errorMessage?: string
}

export const UploadPortal = () => {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    
    const newFiles: UploadedFile[] = selectedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...newFiles])
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    
    const newFiles: UploadedFile[] = droppedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...newFiles])
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const uploadFile = async (fileItem: UploadedFile) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileItem.id ? { ...f, status: 'uploading', progress: 0 } : f
      )
    )

    try {
      const progressInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id && f.progress < 90
              ? { ...f, progress: f.progress + 10 }
              : f
          )
        )
      }, 100)

      const response = await documentApi.upload(fileItem.file)

      clearInterval(progressInterval)

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? {
                ...f,
                status: 'success',
                progress: 100,
                documentId: response.document_id,
              }
            : f
        )
      )

      toast.success(`${fileItem.file.name} uploaded successfully!`)
    } catch (error) {
      const message = getErrorMessage(error)
      
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? {
                ...f,
                status: 'error',
                progress: 0,
                errorMessage: message,
              }
            : f
        )
      )

      toast.error(`Failed to upload ${fileItem.file.name}: ${message}`)
    }
  }

  const uploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending')
    
    for (const file of pendingFiles) {
      await uploadFile(file)
    }
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const clearAll = () => {
    setFiles([])
  }

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <FileImage size={24} className="text-accent" />
    }
    if (file.type === 'application/pdf') {
      return <FilePdf size={24} className="text-destructive" />
    }
    return <FileImage size={24} className="text-muted-foreground" />
  }

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock size={20} className="text-muted-foreground" />
      case 'uploading':
        return <Clock size={20} className="text-accent animate-spin" />
      case 'success':
        return <CheckCircle size={20} className="text-green-500" weight="fill" />
      case 'error':
        return <XCircle size={20} className="text-destructive" weight="fill" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const uploadingCount = files.filter((f) => f.status === 'uploading').length
  const successCount = files.filter((f) => f.status === 'success').length
  const errorCount = files.filter((f) => f.status === 'error').length

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2">
            Upload Invoices
          </h1>
          <p className="text-muted-foreground">
            Upload invoice images or PDFs for automatic OCR processing
          </p>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadSimple size={24} className="text-primary" />
              Drop Zone
            </CardTitle>
            <CardDescription>
              Drag and drop files or click to browse
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-accent/50 rounded-lg p-12 text-center cursor-pointer hover:bg-accent/5 transition-colors"
            >
              <UploadSimple size={64} className="mx-auto mb-4 text-accent" weight="duotone" />
              <p className="text-lg font-semibold mb-2">Drop files here or click to upload</p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports: JPEG, PNG, PDF (Max 10MB per file)
              </p>
              <Badge variant="outline">Click or Drag & Drop</Badge>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </CardContent>
        </Card>

        {files.length > 0 && (
          <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Upload Queue</CardTitle>
                  <CardDescription>
                    {successCount > 0 && `${successCount} uploaded`}
                    {successCount > 0 && pendingCount > 0 && ' • '}
                    {pendingCount > 0 && `${pendingCount} pending`}
                    {errorCount > 0 && ` • ${errorCount} failed`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {pendingCount > 0 && (
                    <Button onClick={uploadAll} disabled={uploadingCount > 0}>
                      <UploadSimple size={18} className="mr-2" />
                      Upload All ({pendingCount})
                    </Button>
                  )}
                  <Button onClick={clearAll} variant="outline" size="sm">
                    <Trash size={18} className="mr-2" />
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {files.map((fileItem) => (
                  <div
                    key={fileItem.id}
                    className="p-4 rounded-lg bg-secondary/30 border border-border"
                  >
                    <div className="flex items-center gap-4">
                      <div>{getFileIcon(fileItem.file)}</div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium truncate">{fileItem.file.name}</p>
                          {getStatusIcon(fileItem.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(fileItem.file.size)}
                        </p>
                        
                        {fileItem.status === 'uploading' && (
                          <Progress value={fileItem.progress} className="mt-2 h-1" />
                        )}
                        
                        {fileItem.status === 'error' && fileItem.errorMessage && (
                          <Alert className="mt-2 bg-destructive/10 border-destructive/40 py-2">
                            <AlertDescription className="text-xs">
                              {fileItem.errorMessage}
                            </AlertDescription>
                          </Alert>
                        )}

                        {fileItem.status === 'success' && fileItem.documentId && (
                          <p className="text-xs text-green-600 mt-1">
                            Document ID: {fileItem.documentId}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {fileItem.status === 'pending' && (
                          <Button
                            onClick={() => uploadFile(fileItem)}
                            size="sm"
                            variant="outline"
                          >
                            Upload
                          </Button>
                        )}
                        {fileItem.status === 'error' && (
                          <Button
                            onClick={() => uploadFile(fileItem)}
                            size="sm"
                            variant="outline"
                          >
                            Retry
                          </Button>
                        )}
                        <Button
                          onClick={() => removeFile(fileItem.id)}
                          size="sm"
                          variant="ghost"
                        >
                          <Trash size={18} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {successCount > 0 && (
          <Alert className="mt-6 bg-green-500/10 border-green-500/40">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <AlertDescription className="ml-2">
              <span className="font-semibold">{successCount} file(s) uploaded successfully!</span>
              <br />
              <span className="text-sm text-muted-foreground">
                The Spark OCR processor will analyze them and create draft transactions.
              </span>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
