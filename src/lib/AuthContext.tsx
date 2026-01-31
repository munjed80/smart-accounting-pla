import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { authApi, User, LoginRequest, RegisterRequest, getErrorMessage, RegisterResponse } from '@/lib/api'
import { toast } from 'sonner'
import { AxiosError } from 'axios'

// Custom error type for email not verified
export interface EmailNotVerifiedError {
  isEmailNotVerified: true
  message: string
  hint: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<RegisterResponse>
  logout: () => void
  hasPermission: (role: 'zzp' | 'accountant' | 'admin') => boolean
  checkSession: () => Promise<void>
  resendVerification: (email: string) => Promise<void>
  forgotPassword: (email: string) => Promise<void>
  resetPassword: (token: string, newPassword: string) => Promise<void>
  verifyEmail: (token: string) => Promise<{ verified: boolean; message: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

// Helper to check if error is EMAIL_NOT_VERIFIED
export const isEmailNotVerifiedError = (error: unknown): error is AxiosError => {
  if (error instanceof AxiosError && error.response?.status === 403) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'object' && detail?.code === 'EMAIL_NOT_VERIFIED') {
      return true
    }
  }
  return false
}

export const getEmailNotVerifiedMessage = (error: AxiosError): { message: string; hint: string } => {
  const detail = error.response?.data?.detail as { message?: string; hint?: string }
  return {
    message: detail?.message || 'Please verify your email before logging in',
    hint: detail?.hint || 'Check your inbox for a verification email or request a new one',
  }
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkSession = useCallback(async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setIsLoading(false)
      return
    }

    try {
      const userData = await authApi.me()
      setUser(userData)
    } catch (error) {
      console.error('Session check failed:', error)
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const login = useCallback(async (credentials: LoginRequest) => {
    try {
      setIsLoading(true)
      const tokenResponse = await authApi.login(credentials)
      
      localStorage.setItem('access_token', tokenResponse.access_token)
      
      const userData = await authApi.me()
      setUser(userData)
      
      toast.success(`Welcome back, ${userData.full_name}!`)
    } catch (error) {
      // Check for EMAIL_NOT_VERIFIED error specifically
      if (isEmailNotVerifiedError(error)) {
        const { message } = getEmailNotVerifiedMessage(error)
        toast.error(message)
        throw error  // Re-throw so component can handle it
      }
      const message = getErrorMessage(error)
      toast.error('Login failed: ' + message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const register = useCallback(async (data: RegisterRequest): Promise<RegisterResponse> => {
    try {
      setIsLoading(true)
      const response = await authApi.register(data)
      
      toast.success('Registration successful! Check your email to verify your account.')
      
      return response
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error('Registration failed: ' + message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const resendVerification = useCallback(async (email: string) => {
    try {
      setIsLoading(true)
      await authApi.resendVerification(email)
      toast.success('If your email exists and is not verified, a verification email has been sent.')
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error('Failed to resend verification: ' + message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    try {
      setIsLoading(true)
      await authApi.forgotPassword(email)
      toast.success('If an account with this email exists, a password reset email has been sent.')
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error('Failed to send reset email: ' + message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    try {
      setIsLoading(true)
      await authApi.resetPassword({ token, new_password: newPassword })
      toast.success('Password reset successfully! You can now log in.')
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error('Failed to reset password: ' + message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const verifyEmail = useCallback(async (token: string) => {
    try {
      setIsLoading(true)
      const response = await authApi.verifyEmail(token)
      if (response.verified) {
        toast.success(response.message || 'Email verified successfully!')
      }
      return response
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error('Failed to verify email: ' + message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    // Clear localStorage tokens and user data
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    
    // Clear sessionStorage (in case tokens are stored there)
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('user')
    
    // Clear any auth-related cookies (best effort - httpOnly cookies require server-side logout)
    // This handles client-accessible cookies only
    document.cookie.split(';').forEach(cookie => {
      const eqPos = cookie.indexOf('=')
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim()
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
    })
    
    setUser(null)
    toast.success('Logged out successfully')
  }, [])

  const hasPermission = useCallback((requiredRole: 'zzp' | 'accountant' | 'admin'): boolean => {
    if (!user) return false

    const roleHierarchy = {
      admin: 3,
      accountant: 2,
      zzp: 1,
    }

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole]
  }, [user])

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    hasPermission,
    checkSession,
    resendVerification,
    forgotPassword,
    resetPassword,
    verifyEmail,
  }), [
    user,
    isLoading,
    login,
    register,
    logout,
    hasPermission,
    checkSession,
    resendVerification,
    forgotPassword,
    resetPassword,
    verifyEmail,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
