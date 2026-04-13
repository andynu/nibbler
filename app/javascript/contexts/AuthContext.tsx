import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { api, User } from "@/lib/api"

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (login: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkAuth = useCallback(async () => {
    try {
      const userData = await api.auth.me()
      setUser(userData)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (loginName: string, password: string) => {
    const userData = await api.auth.login(loginName, password)
    setUser(userData)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
    }
  }, [])

  // Check auth status on mount
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
