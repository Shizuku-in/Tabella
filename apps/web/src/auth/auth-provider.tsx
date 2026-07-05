/**
 * Global authentication context provider for managing session state and login/logout operations.
 */

/* eslint-disable react-refresh/only-export-components */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo } from 'react'

import { getMe, login as loginRequest, logout as logoutRequest } from '../lib/api.ts'
import { QUERY_KEYS } from '../lib/query-keys.ts'
import type { AuthStatus, SessionUser } from '../types.ts'

interface AuthContextValue {
  status: AuthStatus
  user: SessionUser | null
  login: (credentials: { username: string; password: string }) => Promise<SessionUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const meQuery = useQuery({
    queryKey: QUERY_KEYS.AUTH_ME,
    queryFn: getMe,
    retry: false,
  })

  const loginMutation = useMutation({
    mutationFn: loginRequest,
  })

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
  })

  const user = meQuery.data?.user ?? null
  const status: AuthStatus = meQuery.isPending ? 'loading' : user ? 'authenticated' : 'anonymous'

  /** Stable across renders so background meQuery refetches don't cascade to all consumers. */
  const login = useCallback(
    async (credentials: { username: string; password: string }) => {
      const response = await loginMutation.mutateAsync(credentials)
      queryClient.setQueryData(QUERY_KEYS.AUTH_ME, response)
      return response.user
    },
    [loginMutation, queryClient],
  )

  /** Stable across renders — see {@link login}. */
  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
    queryClient.setQueryData(QUERY_KEYS.AUTH_ME, null)
  }, [logoutMutation, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return value
}
