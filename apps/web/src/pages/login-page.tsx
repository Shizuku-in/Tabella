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
import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../auth/auth-provider.tsx'
import { FullscreenState } from '../components/fullscreen-state.tsx'
import { getApiErrorMessage } from '../lib/api.ts'

export function LoginPage() {
  const { status, login } = useAuth()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const next = searchParams.get('next') || '/'
  const targetLabel = useMemo(() => (next === '/' ? 'gallery' : next), [next])

  if (status === 'loading') {
    return (
      <FullscreenState title="Checking session" description="Restoring the current login state." />
    )
  }

  if (status === 'authenticated') {
    return <Navigate to={next} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)

    try {
      await login({ username, password })
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Sign in failed. Please try again.'))
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
      }}
    >
      <Paper
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: 360,
          p: { xs: 2.5, sm: 3 },
          borderRadius: 2,
          bgcolor: 'background.paper',
          boxShadow: 'none',
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
                Sign in
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Private access for your Tabella gallery.
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                After login you will return to {targetLabel}.
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
            label="Username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
            {submitting ? 'Signing in' : 'Sign in'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
