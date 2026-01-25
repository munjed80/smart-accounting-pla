import { Decimal } from 'decimal.js'

export interface LedgerAccountRule {
  code: string
  name: string
  keywords: string[]
  priority: number
}

export interface ExtractedInvoiceData {
  merchant: string
  invoiceDate: string
  totalAmount: number
  vatAmount: number
  netAmount: number
  predictedAccountCode: string
  predictedAccountName: string
  predictionConfidence: number
  ocrText: string
  processedAt: string
  status: 'PROCESSED' | 'MANUAL_REVIEW_REQUIRED' | 'FAILED'
}

export class LedgerAccountPredictor {
  private static readonly ACCOUNT_RULES: Record<string, LedgerAccountRule> = {
    '4310': {
      code: '4310',
      name: 'Brandstof (Fuel)',
      keywords: ['shell', 'bp', 'esso', 'texaco', 'total', 'tankstation', 'fuel', 'benzine', 'diesel'],
      priority: 1
    },
    '4300': {
      code: '4300',
      name: 'Reiskosten Auto (Car Travel)',
      keywords: ['parkeren', 'parking', 'tolweg', 'toll', 'vignette', 'snelweg'],
      priority: 1
    },
    '4400': {
      code: '4400',
      name: 'Kantoorbenodigdheden (Office Supplies)',
      keywords: ['staples', 'office centre', 'viking', 'kantoor', 'printer', 'papier', 'toner', 'pen'],
      priority: 2
    },
    '4500': {
      code: '4500',
      name: 'Automatiseringskosten (IT Costs)',
      keywords: ['microsoft', 'google workspace', 'adobe', 'dropbox', 'hosting', 'domain', 'aws', 'azure', 'digitalocean', 'heroku'],
      priority: 1
    },
    '4510': {
      code: '4510',
      name: 'Software Licenties',
      keywords: ['software', 'saas', 'subscription', 'license', 'licentie'],
      priority: 2
    },
    '4600': {
      code: '4600',
      name: 'Reclame & Marketing',
      keywords: ['google ads', 'facebook ads', 'meta', 'linkedin', 'advertentie', 'marketing', 'reclame'],
      priority: 1
    },
    '4710': {
      code: '4710',
      name: 'Representatiekosten (Business Entertainment)',
      keywords: ['restaurant', 'cafe', 'lunch', 'dinner', 'horeca'],
      priority: 2
    },
    '4720': {
      code: '4720',
      name: 'Zakelijke Maaltijden',
      keywords: ['deliveroo', 'uber eats', 'thuisbezorgd'],
      priority: 2
    },
    '1450': {
      code: '1450',
      name: 'Prive Uitgaven (Private Expenses)',
      keywords: ['albert heijn', 'jumbo', 'lidl', 'aldi', 'plus', 'ah', 'supermarkt'],
      priority: 3
    },
    '4800': {
      code: '4800',
      name: 'Accountantskosten',
      keywords: ['accountant', 'boekhouder', 'administratie'],
      priority: 1
    },
    '4810': {
      code: '4810',
      name: 'Juridische Kosten',
      keywords: ['advocaat', 'notaris', 'legal', 'rechtsbijstand'],
      priority: 1
    },
    '4900': {
      code: '4900',
      name: 'Abonnementen & Diensten',
      keywords: ['subscription', 'abonnement', 'netflix', 'spotify', 'monthly fee'],
      priority: 3
    },
    '5010': {
      code: '5010',
      name: 'Telefoon & Internet',
      keywords: ['kpn', 'vodafone', 'tmobile', 'ziggo', 'telecom', 'internet', 'mobile'],
      priority: 1
    },
    '4999': {
      code: '4999',
      name: 'Overige Bedrijfskosten (Other Expenses)',
      keywords: [],
      priority: 99
    }
  }

  static predict(merchant: string, description: string = ""): {
    accountCode: string
    accountName: string
    confidence: number
  } {
    const text = `${merchant} ${description}`.toLowerCase()
    
    let bestMatch: { accountCode: string; accountName: string; confidence: number } | null = null
    let bestScore = 0
    
    for (const [_, rule] of Object.entries(this.ACCOUNT_RULES)) {
      if (!rule.keywords || rule.keywords.length === 0) {
        continue
      }
      
      const matches = rule.keywords.filter(keyword => text.includes(keyword)).length
      
      if (matches > 0) {
        const score = matches * Math.floor(100 / rule.priority)
        
        if (score > bestScore) {
          bestScore = score
          bestMatch = {
            accountCode: rule.code,
            accountName: rule.name,
            confidence: Math.min(score, 95)
          }
        }
      }
    }
    
    if (!bestMatch) {
      return {
        accountCode: '4999',
        accountName: this.ACCOUNT_RULES['4999'].name,
        confidence: 10
      }
    }
    
    return bestMatch
  }
  
  static getAllAccounts(): LedgerAccountRule[] {
    return Object.values(this.ACCOUNT_RULES)
  }
}

export class IntelligentInvoiceProcessor {
  async processInvoiceWithLLM(imageDataUrl: string): Promise<ExtractedInvoiceData> {
    try {
      const todayDate = new Date().toISOString().split('T')[0]
      const promptText = `
You are an expert Dutch invoice OCR and accounting system. Analyze the invoice image and extract the following information in valid JSON format.

Extract these fields:
- merchant: The company/vendor name
- invoiceDate: Date in YYYY-MM-DD format (if found, otherwise use today's date)
- totalAmount: The total amount including VAT as a number
- vatAmount: The VAT amount as a number (if found, otherwise estimate 21% of total)
- description: Brief description of the invoice/items

Return ONLY valid JSON in this exact format:
{
  "data": {
    "merchant": "Company Name",
    "invoiceDate": "2024-01-15",
    "totalAmount": 125.50,
    "vatAmount": 21.85,
    "description": "Brief description of purchase"
  }
}

If you cannot extract the data, return:
{
  "data": {
    "merchant": "Unknown",
    "invoiceDate": "${todayDate}",
    "totalAmount": 0,
    "vatAmount": 0,
    "description": "Could not extract invoice data"
  }
}
`
      
      const response = await window.spark.llm(promptText, 'gpt-4o', true)
      const parsed = JSON.parse(response)
      const data = parsed.data
      
      const totalAmount = new Decimal(data.totalAmount || 0)
      const vatAmount = new Decimal(data.vatAmount || 0)
      const netAmount = totalAmount.minus(vatAmount)
      
      const prediction = LedgerAccountPredictor.predict(
        data.merchant || 'Unknown',
        data.description || ''
      )
      
      const result: ExtractedInvoiceData = {
        merchant: data.merchant || 'Unknown Merchant',
        invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
        totalAmount: totalAmount.toNumber(),
        vatAmount: vatAmount.toNumber(),
        netAmount: netAmount.toNumber(),
        predictedAccountCode: prediction.accountCode,
        predictedAccountName: prediction.accountName,
        predictionConfidence: prediction.confidence,
        ocrText: data.description || '',
        processedAt: new Date().toISOString(),
        status: 'PROCESSED'
      }
      
      if (totalAmount.isZero() || !data.merchant || data.merchant === 'Unknown') {
        result.status = 'MANUAL_REVIEW_REQUIRED'
        result.predictionConfidence = 0
      }
      
      return result
      
    } catch (error) {
      console.error('LLM processing failed:', error)
      
      return {
        merchant: 'Processing Failed',
        invoiceDate: new Date().toISOString().split('T')[0],
        totalAmount: 0,
        vatAmount: 0,
        netAmount: 0,
        predictedAccountCode: '4999',
        predictedAccountName: 'Te rubriceren',
        predictionConfidence: 0,
        ocrText: '',
        processedAt: new Date().toISOString(),
        status: 'FAILED'
      }
    }
  }
  
  async processInvoiceSimple(
    merchant: string,
    date: string,
    total: number,
    vat?: number
  ): Promise<ExtractedInvoiceData> {
    try {
      const totalAmount = new Decimal(total)
      const vatAmount = vat ? new Decimal(vat) : totalAmount.times(0.21).dividedBy(1.21)
      const netAmount = totalAmount.minus(vatAmount)
      
      const prediction = LedgerAccountPredictor.predict(merchant, '')
      
      return {
        merchant,
        invoiceDate: date,
        totalAmount: totalAmount.toNumber(),
        vatAmount: vatAmount.toNumber(),
        netAmount: netAmount.toNumber(),
        predictedAccountCode: prediction.accountCode,
        predictedAccountName: prediction.accountName,
        predictionConfidence: prediction.confidence,
        ocrText: `Manual entry: ${merchant}`,
        processedAt: new Date().toISOString(),
        status: 'PROCESSED'
      }
    } catch (error) {
      console.error('Simple processing failed:', error)
      throw error
    }
  }
}

export const intelligentProcessor = new IntelligentInvoiceProcessor()
