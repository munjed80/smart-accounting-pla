export function readPdfResponseText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Bestand lezen mislukt.'))
    reader.readAsText(blob)
  })
}

export async function validateInvoicePdf(blob: Blob): Promise<Blob> {
  if (blob.size === 0 || await readPdfResponseText(blob.slice(0, 5)) !== '%PDF-') {
    throw new Error('De server gaf geen geldig PDF-bestand terug. Probeer opnieuw.')
  }
  return blob
}

/** The file is ready once the authenticated request succeeds; browser saving remains user controlled. */
export function saveInvoicePdf(blob: Blob, invoiceNumber: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${Array.from(invoiceNumber).map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || '/\\'.includes(char) ? '_' : char).join('')}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
