/**
 * ZZP Storage Module
 * 
 * Provides localStorage-based persistence for Customer and Invoice entities.
 * Each user's data is stored with a prefix: zzp:{userId}:customers / zzp:{userId}:invoices
 * 
 * This is a frontend-only storage solution - no backend calls.
 */

// ============================================================================
// Types
// ============================================================================

export interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

export interface Invoice {
  id: string
  number: string
  customerId: string
  date: string
  dueDate?: string
  amountCents: number
  currency: 'EUR'
  status: 'draft' | 'sent' | 'paid' | 'overdue'
  notes?: string
  createdAt: string
  updatedAt: string
}

export type CustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
export type CustomerUpdate = Partial<CustomerInput>

export type InvoiceInput = Omit<Invoice, 'id' | 'number' | 'createdAt' | 'updatedAt'>
export type InvoiceUpdate = Partial<Omit<InvoiceInput, 'customerId'>>

// ============================================================================
// Storage Keys
// ============================================================================

const getStorageKey = (userId: string, entity: 'customers' | 'invoices') => 
  `zzp:${userId}:${entity}`

const getInvoiceCounterKey = (userId: string) => 
  `zzp:${userId}:invoice_counter`

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Safely read JSON from localStorage with fallback to empty array
 */
function safeReadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn(`Failed to read localStorage key "${key}":`, error)
    return []
  }
}

/**
 * Safely write JSON to localStorage
 */
function safeWrite<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.error(`Failed to write to localStorage key "${key}":`, error)
    throw new Error('Failed to save data to local storage')
  }
}

/**
 * Generate a unique ID using crypto.randomUUID()
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Generate invoice number in format INV-YYYY-0001
 * Increments counter per user in localStorage
 */
function generateInvoiceNumber(userId: string): string {
  const counterKey = getInvoiceCounterKey(userId)
  const year = new Date().getFullYear()
  
  // Read current counter
  let counter = 1
  try {
    const stored = localStorage.getItem(counterKey)
    if (stored) {
      const data = JSON.parse(stored)
      // Reset counter if year changed
      if (data.year === year) {
        counter = (data.counter || 0) + 1
      }
    }
  } catch {
    // Start fresh if parsing fails
  }
  
  // Save new counter
  safeWrite(counterKey, { year, counter })
  
  // Format: INV-2026-0001
  return `INV-${year}-${counter.toString().padStart(4, '0')}`
}

/**
 * Get current ISO timestamp
 */
function now(): string {
  return new Date().toISOString()
}

// ============================================================================
// Customer Storage Functions
// ============================================================================

/**
 * List all customers for a user
 */
export function listCustomers(userId: string): Customer[] {
  const key = getStorageKey(userId, 'customers')
  return safeReadArray<Customer>(key)
}

/**
 * Get a single customer by ID
 */
export function getCustomer(userId: string, customerId: string): Customer | undefined {
  const customers = listCustomers(userId)
  return customers.find(c => c.id === customerId)
}

/**
 * Add a new customer
 */
export function addCustomer(userId: string, input: CustomerInput): Customer {
  const key = getStorageKey(userId, 'customers')
  const customers = listCustomers(userId)
  
  const timestamp = now()
  const newCustomer: Customer = {
    id: generateId(),
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  
  customers.push(newCustomer)
  safeWrite(key, customers)
  
  return newCustomer
}

/**
 * Update an existing customer
 */
export function updateCustomer(
  userId: string, 
  customerId: string, 
  updates: CustomerUpdate
): Customer | undefined {
  const key = getStorageKey(userId, 'customers')
  const customers = listCustomers(userId)
  
  const index = customers.findIndex(c => c.id === customerId)
  if (index === -1) return undefined
  
  const updated: Customer = {
    ...customers[index],
    ...updates,
    updatedAt: now(),
  }
  
  customers[index] = updated
  safeWrite(key, customers)
  
  return updated
}

/**
 * Remove a customer by ID
 */
export function removeCustomer(userId: string, customerId: string): boolean {
  const key = getStorageKey(userId, 'customers')
  const customers = listCustomers(userId)
  
  const index = customers.findIndex(c => c.id === customerId)
  if (index === -1) return false
  
  customers.splice(index, 1)
  safeWrite(key, customers)
  
  return true
}

// ============================================================================
// Invoice Storage Functions
// ============================================================================

/**
 * List all invoices for a user
 */
export function listInvoices(userId: string): Invoice[] {
  const key = getStorageKey(userId, 'invoices')
  return safeReadArray<Invoice>(key)
}

/**
 * Get a single invoice by ID
 */
export function getInvoice(userId: string, invoiceId: string): Invoice | undefined {
  const invoices = listInvoices(userId)
  return invoices.find(i => i.id === invoiceId)
}

/**
 * Add a new invoice
 */
export function addInvoice(userId: string, input: InvoiceInput): Invoice {
  const key = getStorageKey(userId, 'invoices')
  const invoices = listInvoices(userId)
  
  const timestamp = now()
  const newInvoice: Invoice = {
    id: generateId(),
    number: generateInvoiceNumber(userId),
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  
  invoices.push(newInvoice)
  safeWrite(key, invoices)
  
  return newInvoice
}

/**
 * Update an existing invoice
 */
export function updateInvoice(
  userId: string, 
  invoiceId: string, 
  updates: InvoiceUpdate
): Invoice | undefined {
  const key = getStorageKey(userId, 'invoices')
  const invoices = listInvoices(userId)
  
  const index = invoices.findIndex(i => i.id === invoiceId)
  if (index === -1) return undefined
  
  const updated: Invoice = {
    ...invoices[index],
    ...updates,
    updatedAt: now(),
  }
  
  invoices[index] = updated
  safeWrite(key, invoices)
  
  return updated
}

/**
 * Remove an invoice by ID
 */
export function removeInvoice(userId: string, invoiceId: string): boolean {
  const key = getStorageKey(userId, 'invoices')
  const invoices = listInvoices(userId)
  
  const index = invoices.findIndex(i => i.id === invoiceId)
  if (index === -1) return false
  
  invoices.splice(index, 1)
  safeWrite(key, invoices)
  
  return true
}

// ============================================================================
// Utility Functions for UI
// ============================================================================

/**
 * Format amount in cents to EUR currency string
 */
export function formatAmountEUR(amountCents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amountCents / 100)
}

/**
 * Format date string for display (Dutch locale)
 */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoDate))
}
