import Decimal from 'decimal.js'

const decimalInput = /^\d+(?:[.,]\d{1,2})?$/
export function invoiceDecimal(value: string): Decimal | null {
  if (!decimalInput.test(value.trim())) return null
  const parsed = new Decimal(value.trim().replace(',', '.'))
  return parsed.isFinite() ? parsed : null
}
export function invoicePriceCents(value: string): number | null {
  const parsed = invoiceDecimal(value)
  if (!parsed) return null
  const cents = parsed.mul(100)
  return cents.lte(Number.MAX_SAFE_INTEGER) ? cents.toNumber() : null
}
export function invoiceLineAmounts(quantity: string, price: string, vatRate: string) {
  const qty = invoiceDecimal(quantity)
  const cents = invoicePriceCents(price)
  const rate = Number(vatRate)
  if (!qty || cents === null || ![0, 9, 21].includes(rate)) return { net: 0, vat: 0 }
  const net = qty.mul(cents).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  return { net: net.toNumber(), vat: net.mul(rate).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() }
}
