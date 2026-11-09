import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken, type ApiUser } from './api'

interface AuthValue {
  user: ApiUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api<{ user: ApiUser }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      async login(username, password) {
        const d = await api<{ token: string; user: ApiUser }>('/auth/login', {
          body: { username, password },
        })
        setToken(d.token)
        setUser(d.user)
      },
      async register(username, password, displayName) {
        const d = await api<{ token: string; user: ApiUser }>('/auth/register', {
          body: { username, password, displayName },
        })
        setToken(d.token)
        setUser(d.user)
      },
      async logout() {
        try {
          await api('/auth/logout', { method: 'POST' })
        } catch {
          /* 忽略：本地清除即可 */
        }
        setToken(null)
        setUser(null)
      },
    }),
    [user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
