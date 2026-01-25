import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi, User, LoginRequest, RegisterRequest, getErrorMessage } from '@/lib/api'
import { toast } from 'sonner'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => void
  hasPermission: (role: 'zzp' | 'accountant' | 'admin') => boolean
  checkSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkSession = async () => {
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
  }

  useEffect(() => {
    checkSession()
  }, [])

  const login = async (credentials: LoginRequest) => {
    try {
      setIsLoading(true)
      const tokenResponse = await authApi.login(credentials)
      
      localStorage.setItem('access_token', tokenResponse.access_token)
      
      const userData = await authApi.me()
      setUser(userData)
      
      toast.success(`Welcome back, ${userData.full_name}!`)
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error('Login failed: ' + message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (data: RegisterRequest) => {
    try {
      setIsLoading(true)
      const newUser = await authApi.register(data)
      
      toast.success('Registration successful! Please log in.')
      
      return
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error('Registration failed: ' + message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    setUser(null)
    toast.success('Logged out successfully')
  }

  const hasPermission = (requiredRole: 'zzp' | 'accountant' | 'admin'): boolean => {
    if (!user) return false

    const roleHierarchy = {
      admin: 3,
      accountant: 2,
      zzp: 1,
    }

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole]
  }

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    hasPermission,
    checkSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
