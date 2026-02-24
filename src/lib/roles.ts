/**
 * Role Constants Module
 * 
 * This module defines the valid user roles for the Smart Accounting Platform.
 * It provides a single source of truth for role values across the frontend.
 * 
 * Usage:
 *   import { UserRole, VALID_ROLES, isAccountantRole } from '@/lib/roles'
 *   
 *   // Check if user is an accountant
 *   if (isAccountantRole(user.role)) {
 *     ...
 *   }
 * 
 * Rules:
 * - Only "zzp" and "accountant" are allowed via public registration
 * - "admin" can only be created via database seed
 * - All roles are lowercase (no uppercase variants)
 */

/**
 * Enumeration of valid user roles.
 */
export const UserRole = {
  /** Self-employed professional (ZZP'er) managing their own bookkeeping */
  ZZP: 'zzp',
  /** Professional accountant managing ZZP client administrations */
  ACCOUNTANT: 'accountant',
  /** System administrator */
  ADMIN: 'admin',
  /** Platform super administrator */
  SUPER_ADMIN: 'super_admin',
} as const

export type UserRoleType = typeof UserRole[keyof typeof UserRole]

/**
 * Set of all valid roles
 */
export const VALID_ROLES = new Set<string>([
  UserRole.ZZP,
  UserRole.ACCOUNTANT,
  UserRole.ADMIN,
])

/**
 * Set of roles allowed for public registration
 */
export const REGISTRATION_ROLES = new Set<string>([
  UserRole.ZZP,
  UserRole.ACCOUNTANT,
])

/**
 * Check if a role string is valid
 */
export function isValidRole(role: string): role is UserRoleType {
  return VALID_ROLES.has(role)
}

/**
 * Check if a role can be used for public registration
 */
export function isRegistrationRole(role: string): boolean {
  return REGISTRATION_ROLES.has(role)
}

/**
 * Check if a role is an accountant role (accountant or admin).
 * 
 * This is the standard check for accountant-only UI features.
 * Admin users are considered accountants for permission purposes.
 */
export function isAccountantRole(role: string | undefined): boolean {
  if (!role) return false
  return role === UserRole.ACCOUNTANT || role === UserRole.ADMIN
}

/**
 * Check if a role is a ZZP role.
 */
export function isZzpRole(role: string | undefined): boolean {
  if (!role) return false
  return role === UserRole.ZZP
}

/**
 * Get the brand display name based on the user's role.
 *
 * ZZP users see "ZZPers Hub"; all other roles see "Smart Accounting".
 */
export const BRAND_NAME_ZZP = 'ZZPers Hub'
export const BRAND_NAME_DEFAULT = 'Smart Accounting'

export function getBrandName(role?: string): string {
  return isZzpRole(role) ? BRAND_NAME_ZZP : BRAND_NAME_DEFAULT
}
