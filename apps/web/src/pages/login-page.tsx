/**
 * Authentication page for user login and session initialization.
 */

import { LockOutlined, LoginOutlined } from '@mui/icons-material'
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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../auth/auth-provider.tsx'
import { FullscreenState } from '../components/fullscreen-state.tsx'
import { getApiErrorMessage } from '../lib/api.ts'
import { ROUTES } from '../lib/routes.ts'

/** Shared easing for enter/exit transitions (MUI deceleration curve). */
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'
const TRANSITION_DURATION_MS = 500
const TRANSITION_CSS = `opacity ${TRANSITION_DURATION_MS}ms ${TRANSITION_EASING}, transform ${TRANSITION_DURATION_MS}ms ${TRANSITION_EASING}`

/**
 * Tachie (standing portrait) image set. One is randomly picked each time the
 * login page renders. Drop images into `public/images/` and list their
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
  const [entering, setEntering] = useState(false)
  const [exiting, setExiting] = useState(false)
  const enteredRef = useRef(false)
  const isAnimating = entering || exiting
  const next = searchParams.get('next') || ROUTES.HOME
  const targetLabel = useMemo(() => (next === ROUTES.HOME ? 'gallery' : next), [next])
  const tachie = useMemo(() => pickTachie(), [])
  const [tachieReady, setTachieReady] = useState(() => !tachie)
  const [tachieFailed, setTachieFailed] = useState(false)
  const contentLoading = status === 'loading' || !tachieReady

  // Preload the tachie image so it renders instantly when the form appears.
  // Errors don't block the page — the form shows without the tachie.
  useEffect(() => {
    if (!tachie) return
    let canceled = false
    const img = new Image()
    img.onload = () => {
      if (!canceled) setTachieReady(true)
    }
    img.onerror = () => {
      if (!canceled) {
        setTachieFailed(true)
        setTachieReady(true)
      }
    }
    img.src = tachie
    return () => {
      canceled = true
    }
  }, [tachie])

  // Kick off the enter animation once both auth and tachie are ready.
  // enteredRef ensures the animation only plays once per mount.
  useEffect(() => {
    if (status !== 'anonymous' || !tachieReady || enteredRef.current || exiting) return
    enteredRef.current = true
    setEntering(true)
  }, [status, tachieReady, exiting])

  // Double-RAF so the browser paints the enter-from state before transitioning
  // to idle — without this a hard refresh skips the enter animation.
  useEffect(() => {
    if (!entering) return
    let canceled = false
    requestAnimationFrame(() => {
      if (canceled) return
      requestAnimationFrame(() => {
        if (!canceled) setEntering(false)
      })
    })
    return () => {
      canceled = true
    }
  }, [entering])

  // Hold the login page during the exit animation, then allow navigation.
  useEffect(() => {
    if (!exiting) return
    const timer = setTimeout(() => setExiting(false), TRANSITION_DURATION_MS)
    return () => clearTimeout(timer)
  }, [exiting])

  // Already authenticated — navigate immediately, no need to wait for tachie.
  if (status === 'authenticated' && !exiting) {
    return <Navigate to={next} replace />
  }

  // Show loading skeleton while auth or tachie haven't resolved yet.
  // Skip it during enter/exit animations so there is content to animate.
  if (!isAnimating && contentLoading) {
    return <FullscreenState title={t('auth.login.preparing')} />
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
      // Don't clear submitting here — the exit animation plays immediately and
      // the spinner looks more natural than a brief flash of the normal button.
      setExiting(true)
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, t('auth.login.signInFailed')))
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
      {tachie && !tachieFailed && (
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
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? 'translateY(24px)' : 'translateY(0)',
            transition: TRANSITION_CSS,
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
          borderRadius: 1,
          bgcolor: 'background.paper',
          boxShadow: 'none',
          zIndex: 1,
          opacity: isAnimating ? 0 : 1,
          transform: isAnimating ? 'scale(0.98)' : 'scale(1)',
          transition: TRANSITION_CSS,
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
                borderRadius: 1,
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
                borderRadius: 1,
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
            startIcon={
              submitting ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <LoginOutlined fontSize="small" />
              )
            }
            sx={{ mt: 0.5 }}
          >
            {submitting ? t('auth.login.signingIn') : t('auth.login.signIn')}
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
