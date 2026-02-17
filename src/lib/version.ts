/**
 * Application version information
 * 
 * This module provides versioning information for the PWA,
 * combining package.json version with build timestamp or git commit.
 */

import packageJson from '../../package.json'

// Build timestamp (set at build time)
const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP || new Date().toISOString()

// Git commit hash (set at build time if available)
const GIT_COMMIT = import.meta.env.VITE_GIT_COMMIT || 'dev'

// Package version from package.json
const PACKAGE_VERSION = packageJson.version

/**
 * Full application version string
 * Format: {version}+{commit}.{timestamp}
 * Example: 0.0.0+a9864f7.20260217T233104Z
 */
export const APP_VERSION = `${PACKAGE_VERSION}+${GIT_COMMIT}.${BUILD_TIMESTAMP.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`

/**
 * Short version for display (version + commit)
 * Example: 0.0.0+a9864f7
 */
export const APP_VERSION_SHORT = `${PACKAGE_VERSION}+${GIT_COMMIT}`

/**
 * Package version only
 */
export const PACKAGE_VERSION_ONLY = PACKAGE_VERSION

/**
 * Build timestamp
 */
export const BUILD_TIME = BUILD_TIMESTAMP

/**
 * Git commit hash
 */
export const GIT_COMMIT_HASH = GIT_COMMIT

/**
 * Check if running in development mode
 */
export const IS_DEV = import.meta.env.DEV

/**
 * Check if running in production mode
 */
export const IS_PROD = import.meta.env.PROD

/**
 * Get formatted build date
 */
export const getBuildDate = (): string => {
  try {
    return new Date(BUILD_TIMESTAMP).toLocaleString('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return BUILD_TIMESTAMP
  }
}
