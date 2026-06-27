/**
 * React Router guards to protect routes and redirect unauthenticated users to the login page.
 */

import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { FullscreenState } from '../components/fullscreen-state.tsx'
import { ROUTES } from '../lib/routes.ts'
import type { UserRole } from '../types.ts'
import { useAuth } from './auth-provider.tsx'

export function RequireAuth() {
  const { t } = useTranslation()
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <FullscreenState
        title={t('auth.guards.checkingSession')}
        description={t('auth.guards.restoringSession')}
      />
    )
  }

  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`${ROUTES.LOGIN}?next=${encodeURIComponent(next)}`} replace />
  }

  return <Outlet />
}

const ROLE_WEIGHT: Record<UserRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
}

export function RequireRole({ role }: { role: UserRole }) {
  const { t } = useTranslation()
  const { status, user } = useAuth()

  if (status === 'loading') {
    return (
      <FullscreenState
        title={t('auth.guards.checkingAccess')}
        description={t('auth.guards.verifyingPermissions')}
      />
    )
  }

  if (!user || ROLE_WEIGHT[user.role] < ROLE_WEIGHT[role]) {
    return <Navigate to={ROUTES.HOME} replace />
  }

  return <Outlet />
}
