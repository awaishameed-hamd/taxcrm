'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Role } from '@ca-firm/shared'
import api from '@/lib/api'
import type { User } from '@/types'

// ── Permission types ──────────────────────────────────────────────────────────
export type Permissions = Record<string, boolean> | { all: true }

function isAllAccess(p: Permissions): p is { all: true } {
  return (p as any).all === true
}

interface AuthState {
  user:            User | null
  token:           string | null
  isAuthenticated: boolean
  isLoading:       boolean
  permissions:     Permissions
}

interface LoginResponse {
  accessToken:  string
  refreshToken: string
  user:         User
  attendance:   { date: string; loginTime: string; isLate: boolean; lateMinutes: number | null; status: string } | null
}

interface AuthContextValue extends AuthState {
  login:      (identifier: string, password: string) => Promise<LoginResponse>
  logout:     () => Promise<void>
  updateUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user:            null,
    token:           null,
    isAuthenticated: false,
    isLoading:       true,
    permissions:     {},
  })

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    const token = sessionStorage.getItem('access_token')
    const raw   = sessionStorage.getItem('user')
    const rawPerms = sessionStorage.getItem('permissions')

    if (token && raw) {
      try {
        const user  = JSON.parse(raw) as User
        const perms = rawPerms ? (JSON.parse(rawPerms) as Permissions) : {}
        setState({ user, token, isAuthenticated: true, isLoading: false, permissions: perms })

        // Re-fetch permissions in background to keep them fresh
        api.get('/role-permissions/my')
          .then(res => {
            const freshPerms = res.data?.data ?? res.data
            sessionStorage.setItem('permissions', JSON.stringify(freshPerms))
            setState(s => ({ ...s, permissions: freshPerms }))
          })
          .catch(() => {})
        return
      } catch {}
    }
    setState((s) => ({ ...s, isLoading: false }))
  }, [])

  const login = useCallback(async (identifier: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<{ data: LoginResponse }>('/auth/login', { identifier, password })

    const { accessToken, refreshToken, user, attendance } = data.data

    sessionStorage.setItem('access_token',  accessToken)
    sessionStorage.setItem('refresh_token', refreshToken)
    sessionStorage.setItem('user',          JSON.stringify(user))

    // Set auth state immediately (permissions will load after)
    setState({ user, token: accessToken, isAuthenticated: true, isLoading: false, permissions: {} })

    // Fetch permissions after login — use the token we just got
    let perms: Permissions = {}
    try {
      const permsRes = await api.get('/role-permissions/my', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      perms = permsRes.data?.data ?? permsRes.data ?? {}
    } catch {}

    sessionStorage.setItem('permissions', JSON.stringify(perms))
    setState(s => ({ ...s, permissions: perms }))

    return { accessToken, refreshToken, user, attendance }
  }, [])

  const updateUser = useCallback((patch: Partial<User>) => {
    setState(s => {
      if (!s.user) return s
      const updated = { ...s.user, ...patch }
      sessionStorage.setItem('user', JSON.stringify(updated))
      return { ...s, user: updated }
    })
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getItem('refresh_token')
    try {
      await api.post('/auth/logout', { refreshToken })
    } catch {}

    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('refresh_token')
    sessionStorage.removeItem('user')
    sessionStorage.removeItem('permissions')

    setState({ user: null, token: null, isAuthenticated: false, isLoading: false, permissions: {} })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// ── usePermission hook ────────────────────────────────────────────────────────
// Returns true if ADMIN/PARTNER (all:true) OR the specific feature is enabled.
export function usePermission(feature: string): boolean {
  const { permissions } = useAuth()
  if (isAllAccess(permissions)) return true
  return (permissions as Record<string, boolean>)[feature] === true
}
