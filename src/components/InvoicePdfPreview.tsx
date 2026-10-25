import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'
import { saveInvoicePdf } from '@/lib/invoicePdf'

export function InvoicePdfPreview({ pdf, title, onClose }: { pdf: Blob | null; title: string; onClose: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!pdf) { setUrl(''); return }
    const next = URL.createObjectURL(pdf)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [pdf])
  return <Dialog open={!!pdf} onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="flex h-[92dvh] max-w-5xl flex-col">
      <DialogHeader><DialogTitle>PDF-voorbeeld</DialogTitle><DialogDescription>Controleer de factuur. Een voorbeeld slaat je wijzigingen niet op.</DialogDescription></DialogHeader>
      {url && <><div className="flex flex-wrap gap-3"><Button onClick={() => { if (pdf) saveInvoicePdf(pdf, title) }}>PDF downloaden</Button><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm underline">Open PDF in nieuw tabblad</a></div>
        <iframe src={url} title="Factuur PDF-voorbeeld" className="min-h-0 w-full flex-1 rounded border" /></>}
    </DialogContent>
  </Dialog>
}
