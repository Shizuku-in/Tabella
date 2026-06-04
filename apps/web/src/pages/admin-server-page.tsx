/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react'
import {
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
  Switch,
  FormControlLabel,
  Snackbar,
  Alert,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, request } from '../lib/api.ts'
import { Save } from '@mui/icons-material'

interface ServerSettings {
  max_download_images: number
  max_download_total_bytes: number
  download_retention_hours: number
  session_ttl_hours: number
  secure_cookies: boolean
}

interface ServerSettingsForm {
  max_download_images: string
  max_download_total_bytes: string
  download_retention_hours: string
  session_ttl_hours: string
  secure_cookies: boolean
}

export function AdminServerPage() {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<ServerSettingsForm | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('Server settings updated successfully!')
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success')

  const settingsQuery = useQuery({
    queryKey: ['adminSettings'],
    queryFn: async () => {
      return request<ServerSettings>('/api/settings')
    },
    refetchOnWindowFocus: !isDirty,
  })

  useEffect(() => {
    if (settingsQuery.data && !isDirty) {
      setSettings(toFormState(settingsQuery.data))
    }
  }, [isDirty, settingsQuery.data])

  const updateMutation = useMutation({
    mutationFn: async (data: ServerSettings) => {
      return request<ServerSettings>('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['adminSettings'], data)
      setSettings(toFormState(data))
      setIsDirty(false)
      setSnackbarSeverity('success')
      setSnackbarMessage('Server settings updated successfully!')
      setSnackbarOpen(true)
    },
    onError: (error) => {
      setSnackbarSeverity('error')
      setSnackbarMessage(error instanceof ApiError ? error.message : 'Failed to update server settings.')
      setSnackbarOpen(true)
    },
  })

  const handleNumberChange = (field: keyof Omit<ServerSettingsForm, 'secure_cookies'>, value: string) => {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))
    setIsDirty(true)
  }

  const handleToggleChange = (value: boolean) => {
    setSettings((prev) => (prev ? { ...prev, secure_cookies: value } : prev))
    setIsDirty(true)
  }

  const handleSave = () => {
    if (settings) {
      try {
        updateMutation.mutate(parseFormState(settings))
      } catch (error) {
        setSnackbarSeverity('error')
        setSnackbarMessage(error instanceof Error ? error.message : 'Failed to validate server settings.')
        setSnackbarOpen(true)
      }
    }
  }

  if (settingsQuery.isLoading || !settings) {
    return <Typography sx={{ p: 4 }}>Loading settings...</Typography>
  }

  if (settingsQuery.isError) {
    return <Typography color="error" sx={{ p: 4 }}>Failed to load server settings.</Typography>
  }

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 4 }, maxWidth: 800, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Server Settings
        </Typography>
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={handleSave}
          disabled={updateMutation.isPending || !isDirty}
        >
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </Stack>

      <Paper
        sx={{
          p: 3,
          borderRadius: 2,
          '& input[type=number]': {
            MozAppearance: 'textfield',
          },
          '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
        }}
      >
        <Stack spacing={4}>
          <Stack spacing={3}>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary' }}>
              Downloads
            </Typography>
            <TextField
              label="Max Download Images"
              type="number"
              value={settings.max_download_images}
              onChange={(e) => handleNumberChange('max_download_images', e.target.value)}
              helperText="Maximum number of images allowed in a single archive download."
              fullWidth
            />
            <TextField
              label="Max Download Size (Bytes)"
              type="number"
              value={settings.max_download_total_bytes}
              onChange={(e) => handleNumberChange('max_download_total_bytes', e.target.value)}
              helperText="Maximum total file size allowed in a single archive download."
              fullWidth
            />
            <TextField
              label="Download Retention (Hours)"
              type="number"
              value={settings.download_retention_hours}
              onChange={(e) => handleNumberChange('download_retention_hours', e.target.value)}
              helperText="How long generated archives are kept before being automatically deleted."
              fullWidth
            />
          </Stack>

          <Stack spacing={3}>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary' }}>
              Security & Sessions
            </Typography>
            <TextField
              label="Session TTL (Hours)"
              type="number"
              value={settings.session_ttl_hours}
              onChange={(e) => handleNumberChange('session_ttl_hours', e.target.value)}
              helperText="How long a user session remains valid before requiring re-login."
              fullWidth
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.secure_cookies}
                  onChange={(e) => handleToggleChange(e.target.checked)}
                />
              }
              label={
                <Stack>
                  <Typography>Secure Cookies</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Only send cookies over HTTPS. Recommended for production.
                  </Typography>
                </Stack>
              }
            />
          </Stack>
        </Stack>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Stack>
  )
}

function toFormState(settings: ServerSettings): ServerSettingsForm {
  return {
    max_download_images: settings.max_download_images.toString(),
    max_download_total_bytes: settings.max_download_total_bytes.toString(),
    download_retention_hours: settings.download_retention_hours.toString(),
    session_ttl_hours: settings.session_ttl_hours.toString(),
    secure_cookies: settings.secure_cookies,
  }
}

function parseFormState(settings: ServerSettingsForm): ServerSettings {
  return {
    max_download_images: parsePositiveInteger(settings.max_download_images, 'Max download images'),
    max_download_total_bytes: parsePositiveInteger(settings.max_download_total_bytes, 'Max download size'),
    download_retention_hours: parsePositiveInteger(settings.download_retention_hours, 'Download retention'),
    session_ttl_hours: parsePositiveInteger(settings.session_ttl_hours, 'Session TTL'),
    secure_cookies: settings.secure_cookies,
  }
}

function parsePositiveInteger(value: string, label: string): number {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a positive integer.`)
  }

  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than 0.`)
  }

  return parsed
}
