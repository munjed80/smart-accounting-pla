import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useKV } from '@github/spark/hooks'
import { intelligentProcessor } from '@/lib/intelligentProcessor'
import { toast } from 'sonner'
import { Brain, Receipt, Sparkle } from '@phosphor-icons/react'

const DEMO_INVOICES = [
  {
    merchant: 'Shell Tankstation',
    date: '2024-01-15',
    total: 85.50,
    vat: 14.85,
    description: 'Fuel for business trip'
  },
  {
    merchant: 'Albert Heijn',
    date: '2024-01-16',
    total: 42.30,
    vat: 7.35,
    description: 'Office supplies and snacks'
  },
  {
    merchant: 'KPN Telecom',
    date: '2024-01-20',
    total: 65.00,
    vat: 11.30,
    description: 'Monthly internet subscription'
  },
  {
    merchant: 'Microsoft 365',
    date: '2024-01-22',
    total: 12.99,
    vat: 2.26,
    description: 'Software license'
  },
  {
    merchant: 'BP Station',
    date: '2024-01-25',
    total: 72.15,
    vat: 12.53,
    description: 'Diesel fuel'
  }
]

export const DemoInvoiceGenerator = () => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [transactions, setTransactions] = useKV<any[]>('transactions', [])

  const generateDemoTransaction = async (invoice: typeof DEMO_INVOICES[0]) => {
    try {
      const extractedData = await intelligentProcessor.processInvoiceSimple(
        invoice.merchant,
        invoice.date,
        invoice.total,
        invoice.vat
      )

      const newTransaction = {
        id: `demo-${Date.now()}-${Math.random()}`,
        booking_number: `AUTO-${Date.now()}`,
        date: extractedData.invoiceDate,
        description: extractedData.merchant,
        amount: extractedData.totalAmount,
        vat_amount: extractedData.vatAmount,
        net_amount: extractedData.netAmount,
        account_code: extractedData.predictedAccountCode,
        account_name: extractedData.predictedAccountName,
        confidence: extractedData.predictionConfidence,
        status: 'APPROVED',
        created_at: new Date().toISOString(),
        type: 'EXPENSE' as const
      }

      setTransactions((current) => {
        const existing = current || []
        return [...existing, newTransaction]
      })

      toast.success(`Processed: ${invoice.merchant}`, {
        description: `€${invoice.total.toFixed(2)} → ${extractedData.predictedAccountName} (${extractedData.predictionConfidence}%)`
      })

      return newTransaction
    } catch (error) {
      console.error('Failed to generate demo transaction:', error)
      toast.error('Failed to process invoice')
    }
  }

  const generateAllDemos = async () => {
    setIsProcessing(true)
    
    for (const invoice of DEMO_INVOICES) {
      await generateDemoTransaction(invoice)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    setIsProcessing(false)
    toast.success('Demo data generated!', {
      description: `${DEMO_INVOICES.length} invoices processed`
    })
  }

  const clearAllTransactions = () => {
    setTransactions([])
    toast.success('All transactions cleared')
  }

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain size={24} weight="duotone" className="text-primary" />
          Demo Invoice Generator
        </CardTitle>
        <CardDescription>
          Generate sample transactions to test the intelligent processing system
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2">
          {DEMO_INVOICES.map((invoice, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Receipt size={20} className="text-muted-foreground" weight="duotone" />
                <div>
                  <p className="font-medium">{invoice.merchant}</p>
                  <p className="text-xs text-muted-foreground">{invoice.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold">€{invoice.total.toFixed(2)}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => generateDemoTransaction(invoice)}
                  disabled={isProcessing}
                >
                  <Sparkle size={14} className="mr-1" />
                  Process
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-4">
          <Button 
            onClick={generateAllDemos} 
            disabled={isProcessing}
            className="flex-1"
          >
            <Brain size={18} className="mr-2" weight="duotone" />
            {isProcessing ? 'Processing...' : 'Process All Demos'}
          </Button>
          <Button 
            onClick={clearAllTransactions} 
            variant="outline"
            disabled={isProcessing}
          >
            Clear All
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2">
          This will create {DEMO_INVOICES.length} sample transactions with AI classification
        </p>
      </CardContent>
    </Card>
  )
}
