/**
 * Unit tests for the getBrandName helper
 */
import { describe, it, expect } from 'vitest'
import { getBrandName } from '../lib/roles'

describe('getBrandName', () => {
  it('returns "ZZPers Hub" for zzp role', () => {
    expect(getBrandName('zzp')).toBe('ZZPers Hub')
  })

  it('returns "Smart Accounting" for accountant role', () => {
    expect(getBrandName('accountant')).toBe('Smart Accounting')
  })

  it('returns "Smart Accounting" for super_admin role', () => {
    expect(getBrandName('super_admin')).toBe('Smart Accounting')
  })

  it('returns "Smart Accounting" for admin role', () => {
    expect(getBrandName('admin')).toBe('Smart Accounting')
  })

  it('returns "Smart Accounting" when role is undefined', () => {
    expect(getBrandName(undefined)).toBe('Smart Accounting')
  })

  it('returns "Smart Accounting" when role is an empty string', () => {
    expect(getBrandName('')).toBe('Smart Accounting')
  })
})
