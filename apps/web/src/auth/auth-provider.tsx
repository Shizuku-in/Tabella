/* eslint-disable react-refresh/only-export-components */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'

import { getMe, login as loginRequest, logout as logoutRequest } from '../lib/api.ts'
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
    queryKey: ['auth', 'me'],
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

  const value: AuthContextValue = {
    status,
    user,
    async login(credentials) {
      const response = await loginMutation.mutateAsync(credentials)
      queryClient.setQueryData(['auth', 'me'], response)
      return response.user
    },
    async logout() {
      await logoutMutation.mutateAsync()
      queryClient.setQueryData(['auth', 'me'], null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return value
}
