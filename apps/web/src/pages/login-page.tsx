/**
 * Authentication page for user login and session initialization.
 */

import { LockOutlined } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { SyntheticEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../auth/auth-provider.tsx'
import { FullscreenState } from '../components/fullscreen-state.tsx'
import { getApiErrorMessage } from '../lib/api.ts'
import { ROUTES } from '../lib/routes.ts'

/** Shared easing for the exit transition (MUI deceleration curve). */
const EXIT_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'
const EXIT_DURATION_MS = 500

/**
 * Tachie (standing portrait) image set. One is randomly picked each time the
 * login page renders. Drop images into `public/tachie/` and list their
 * filenames below, e.g. `'/images/tachie.png'`.
 */
const TACHIE_SET: string[] = ['/images/example.webp']

function pickTachie(): string | null {
  if (TACHIE_SET.length === 0) return null
  return TACHIE_SET[Math.floor(Math.random() * TACHIE_SET.length)]
}

export function LoginPage() {
  const { t } = useTranslation()
  const { status, login } = useAuth()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({})
  const [exiting, setExiting] = useState(false)
  const next = searchParams.get('next') || ROUTES.HOME
  const targetLabel = useMemo(() => (next === ROUTES.HOME ? 'gallery' : next), [next])
  const tachie = useMemo(() => pickTachie(), [])

  // Wait for exit animation to finish before navigating away.
  useEffect(() => {
    if (!exiting) return
    const timer = setTimeout(() => setExiting(false), EXIT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [exiting])

  // During the exit transition, keep rendering the login page (not the loading
  // skeleton) so the fade/slide-out animation can play.
  if (exiting) {
    // fall through to the login form below
  } else if (status === 'loading') {
    return (
      <FullscreenState
        title={t('auth.login.checkingSession')}
        description={t('auth.login.restoring')}
      />
    )
  }

  if (status === 'authenticated' && !exiting) {
    return <Navigate to={next} replace />
  }

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors: { username?: string; password?: string } = {}
    if (!username.trim()) {
      nextErrors.username = t('auth.login.usernameRequired')
    }
    if (!password) {
      nextErrors.password = t('auth.login.passwordRequired')
    }

    setFieldErrors(nextErrors)
    setErrorMessage(null)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)
    setErrorMessage(null)

    try {
      await login({ username, password })
      setExiting(true)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t('auth.login.signInFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 3,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Tachie (standing portrait) — add images to TACHIE_SET above. */}
      {tachie && (
        <Box
          component="img"
          src={tachie}
          alt=""
          sx={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            maxHeight: { xs: '30vh', md: '50vh', lg: '60vh' },
            width: 'auto',
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none',
            opacity: exiting ? 0 : 1,
            transform: exiting ? 'translateY(24px)' : 'translateY(0)',
            transition: exiting
              ? `opacity ${EXIT_DURATION_MS}ms ${EXIT_EASING}, transform ${EXIT_DURATION_MS}ms ${EXIT_EASING}`
              : undefined,
          }}
        />
      )}
      <Paper
        component="form"
        onSubmit={handleSubmit}
        noValidate
        sx={{
          width: '100%',
          maxWidth: 360,
          p: { xs: 2.5, sm: 3 },
          borderRadius: 2,
          bgcolor: 'background.paper',
          boxShadow: 'none',
          zIndex: 1,
          opacity: exiting ? 0 : 1,
          transform: exiting ? 'scale(0.98)' : 'scale(1)',
          transition: exiting
            ? `opacity ${EXIT_DURATION_MS}ms ${EXIT_EASING}, transform ${EXIT_DURATION_MS}ms ${EXIT_EASING}`
            : undefined,
        }}
      >
        <Stack spacing={2.25}>
          <Stack spacing={1}>
            <Box
              sx={{
                width: 34,
                height: 34,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 1.5,
                color: 'primary.main',
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
              }}
            >
              <LockOutlined fontSize="small" />
            </Box>
            <Stack spacing={0.5}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {t('auth.login.signIn')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('auth.login.description')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('auth.login.returnTo', { target: targetLabel })}
              </Typography>
            </Stack>
          </Stack>

          {errorMessage ? (
            <Alert
              severity="error"
              sx={{
                py: 0.25,
                borderRadius: 1.5,
                alignItems: 'center',
              }}
            >
              {errorMessage}
            </Alert>
          ) : null}

          <TextField
            label={t('auth.login.username')}
            autoComplete="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: undefined }))
            }}
            error={Boolean(fieldErrors.username)}
            helperText={fieldErrors.username}
            fullWidth
            required
          />
          <TextField
            label={t('auth.login.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
            }}
            error={Boolean(fieldErrors.password)}
            helperText={fieldErrors.password}
            fullWidth
            required
          />

          <Button
            variant="contained"
            type="submit"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ mt: 0.5 }}
          >
            {submitting ? t('auth.login.signingIn') : t('auth.login.signIn')}
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
