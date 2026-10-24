/**
 * Unit tests for the getBrandName helper
 */
import { describe, it, expect } from 'vitest'
import { getBrandName } from '../lib/roles'

describe('getBrandName', () => {
  it('returns "ZZPers Hub" for zzp role', () => {
    expect(getBrandName('zzp')).toBe('ZZPers Hub')
  })

  it('returns "ZZPers Hub" for accountant role', () => {
    expect(getBrandName('accountant')).toBe('ZZPers Hub')
  })

  it('returns "ZZPers Hub" for super_admin role', () => {
    expect(getBrandName('super_admin')).toBe('ZZPers Hub')
  })

  it('returns "ZZPers Hub" for admin role', () => {
    expect(getBrandName('admin')).toBe('ZZPers Hub')
  })

  it('returns "ZZPers Hub" when role is undefined', () => {
    expect(getBrandName(undefined)).toBe('ZZPers Hub')
  })

  it('returns "ZZPers Hub" when role is an empty string', () => {
    expect(getBrandName('')).toBe('ZZPers Hub')
  })
})
