import { describe, expect, it } from 'vitest'
import { invoiceDecimal, invoiceLineAmounts, invoicePriceCents } from '@/lib/invoiceMoney'

describe('invoice arithmetic matches backend half-up cents', () => {
  it.each([['1','19,99','21',1999,420],['1,5','1,01','21',152,32],['1,23','1,01','9',124,11]])('%s × %s at %s%%', (qty,price,rate,net,vat) => {
    expect(invoiceLineAmounts(qty,price,rate)).toEqual({net,vat})
  })
  it.each(['1.234,56','12abc','1,2345','Infinity','-2',''])('rejects ambiguous or invalid amounts %s', value => {
    expect(invoicePriceCents(value)).toBeNull()
  })
  it('preserves cent precision instead of floating-point currency multiplication', () => {
    expect(invoicePriceCents('1.15')).toBe(115)
    expect(invoiceDecimal('1,2345')).toBeNull()
  })
})
