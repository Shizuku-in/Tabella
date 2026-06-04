import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullscreenState } from '../components/fullscreen-state.tsx'
import { useAuth } from './auth-provider.tsx'
import type { UserRole } from '../types.ts'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <FullscreenState
        title="Checking session"
        description="Restoring the current login state."
      />
    )
  }

  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  return <Outlet />
}

const ROLE_WEIGHT: Record<UserRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
}

export function RequireRole({ role }: { role: UserRole }) {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return (
      <FullscreenState
        title="Checking access"
        description="Verifying account permissions."
      />
    )
  }

  if (!user || ROLE_WEIGHT[user.role] < ROLE_WEIGHT[role]) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
