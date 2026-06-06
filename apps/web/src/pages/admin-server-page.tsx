/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, Fragment } from 'react'
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
import { getApiErrorMessage, request } from '../lib/api.ts'
import { Save } from '@mui/icons-material'

interface ServerSettings {
  max_download_images: number
  max_download_total_bytes: number
  download_retention_hours: number
  session_ttl_hours: number
  secure_cookies: boolean
  import_progress_batch_size: number
  thumbnail_size: number
  thumbnail_quality: number
  sample_size: number
  sample_quality: number
}

interface ServerSettingsForm {
  max_download_images: string
  max_download_total_bytes: string
  download_retention_hours: string
  session_ttl_hours: string
  secure_cookies: boolean
  import_progress_batch_size: string
  thumbnail_size: string
  thumbnail_quality: string
  sample_size: string
  sample_quality: string
}

interface ServerSettingsFieldErrors {
  max_download_images?: string
  max_download_total_bytes?: string
  download_retention_hours?: string
  session_ttl_hours?: string
  import_progress_batch_size?: string
  thumbnail_size?: string
  thumbnail_quality?: string
  sample_size?: string
  sample_quality?: string
}

export function AdminServerPage() {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<ServerSettingsForm | null>(null)
  const [errors, setErrors] = useState<ServerSettingsFieldErrors>({})
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
      setSnackbarMessage(getApiErrorMessage(error, 'Failed to update server settings.'))
      setSnackbarOpen(true)
    },
  })

  const handleNumberChange = (field: keyof Omit<ServerSettingsForm, 'secure_cookies'>, value: string) => {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))
    setIsDirty(true)
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const handleToggleChange = (value: boolean) => {
    setSettings((prev) => (prev ? { ...prev, secure_cookies: value } : prev))
    setIsDirty(true)
  }

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (settings) {
      const nextErrors = validateServerSettingsFields(settings)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) {
        return
      }

      try {
        updateMutation.mutate(parseFormState(settings))
      } catch (error) {
        setSnackbarSeverity('error')
        setSnackbarMessage(getApiErrorMessage(error, 'Failed to validate server settings.'))
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
    <Fragment>
      <form onSubmit={handleSave} noValidate>
        <Stack spacing={3} sx={{ p: { xs: 2, sm: 4 }, maxWidth: 800, mx: 'auto' }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Server Settings
            </Typography>
            <Button
              type="submit"
              variant="outlined"
              startIcon={<Save />}
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
                  required
                  value={settings.max_download_images}
                  onChange={(e) => handleNumberChange('max_download_images', e.target.value)}
                  error={Boolean(errors.max_download_images)}
                  helperText={errors.max_download_images ?? "Maximum number of images allowed in a single archive download."}
                  fullWidth
                />
                <TextField
                  label="Max Download Size (Bytes)"
                  type="number"
                  required
                  value={settings.max_download_total_bytes}
                  onChange={(e) => handleNumberChange('max_download_total_bytes', e.target.value)}
                  error={Boolean(errors.max_download_total_bytes)}
                  helperText={errors.max_download_total_bytes ?? "Maximum total file size allowed in a single archive download."}
                  fullWidth
                />
                <TextField
                  label="Download Retention (Hours)"
                  type="number"
                  required
                  value={settings.download_retention_hours}
                  onChange={(e) => handleNumberChange('download_retention_hours', e.target.value)}
                  error={Boolean(errors.download_retention_hours)}
                  helperText={errors.download_retention_hours ?? "How long generated archives are kept before being automatically deleted."}
                  fullWidth
                />
              </Stack>

              <Stack spacing={3}>
                <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary' }}>
                  Imports
                </Typography>
                <TextField
                  label="Import Progress Batch Size"
                  type="number"
                  required
                  value={settings.import_progress_batch_size}
                  onChange={(e) => handleNumberChange('import_progress_batch_size', e.target.value)}
                  error={Boolean(errors.import_progress_batch_size)}
                  helperText={errors.import_progress_batch_size ?? "How many files to process before updating progress in the database. Lower values give more frequent UI updates but higher DB load."}
                  fullWidth
                />
              </Stack>

              <Stack spacing={3}>
                <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary' }}>
                  Image Processing
                </Typography>
                <TextField
                  label="Thumbnail Max Size (px)"
                  type="number"
                  required
                  value={settings.thumbnail_size}
                  onChange={(e) => handleNumberChange('thumbnail_size', e.target.value)}
                  error={Boolean(errors.thumbnail_size)}
                  helperText={errors.thumbnail_size ?? "Maximum dimension (width or height) for generated thumbnails. Default is 500."}
                  fullWidth
                />
                <TextField
                  label="Thumbnail Quality (WebP)"
                  type="number"
                  required
                  value={settings.thumbnail_quality}
                  onChange={(e) => handleNumberChange('thumbnail_quality', e.target.value)}
                  error={Boolean(errors.thumbnail_quality)}
                  helperText={errors.thumbnail_quality ?? "WebP compression quality for thumbnails (1.0 - 100.0). Default is 75."}
                  fullWidth
                />
                <TextField
                  label="Sample Max Size (px)"
                  type="number"
                  required
                  value={settings.sample_size}
                  onChange={(e) => handleNumberChange('sample_size', e.target.value)}
                  error={Boolean(errors.sample_size)}
                  helperText={errors.sample_size ?? "Maximum dimension for sample images. Set to 0 to keep the original resolution. Default is 0."}
                  fullWidth
                />
                <TextField
                  label="Sample Quality (WebP)"
                  type="number"
                  required
                  value={settings.sample_quality}
                  onChange={(e) => handleNumberChange('sample_quality', e.target.value)}
                  error={Boolean(errors.sample_quality)}
                  helperText={errors.sample_quality ?? "WebP compression quality for samples (1.0 - 100.0). Default is 80."}
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
                  required
                  value={settings.session_ttl_hours}
                  onChange={(e) => handleNumberChange('session_ttl_hours', e.target.value)}
                  error={Boolean(errors.session_ttl_hours)}
                  helperText={errors.session_ttl_hours ?? "How long a user session remains valid before requiring re-login."}
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
        </Stack>
      </form>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbarSeverity} onClose={() => setSnackbarOpen(false)} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Fragment>
  )
}

function toFormState(settings: ServerSettings): ServerSettingsForm {
  return {
    max_download_images: settings.max_download_images.toString(),
    max_download_total_bytes: settings.max_download_total_bytes.toString(),
    download_retention_hours: settings.download_retention_hours.toString(),
    session_ttl_hours: settings.session_ttl_hours.toString(),
    secure_cookies: settings.secure_cookies,
    import_progress_batch_size: settings.import_progress_batch_size.toString(),
    thumbnail_size: (settings.thumbnail_size ?? 500).toString(),
    thumbnail_quality: (settings.thumbnail_quality ?? 75).toString(),
    sample_size: (settings.sample_size ?? 0).toString(),
    sample_quality: (settings.sample_quality ?? 80).toString(),
  }
}

function parseFormState(settings: ServerSettingsForm): ServerSettings {
  return {
    max_download_images: Number.parseInt(settings.max_download_images.trim(), 10),
    max_download_total_bytes: Number.parseInt(settings.max_download_total_bytes.trim(), 10),
    download_retention_hours: Number.parseInt(settings.download_retention_hours.trim(), 10),
    session_ttl_hours: Number.parseInt(settings.session_ttl_hours.trim(), 10),
    secure_cookies: settings.secure_cookies,
    import_progress_batch_size: Number.parseInt(settings.import_progress_batch_size.trim(), 10),
    thumbnail_size: Number.parseInt(settings.thumbnail_size.trim(), 10),
    thumbnail_quality: Number.parseFloat(settings.thumbnail_quality.trim()),
    sample_size: Number.parseInt(settings.sample_size.trim(), 10),
    sample_quality: Number.parseFloat(settings.sample_quality.trim()),
  }
}

function validateServerSettingsFields(settings: ServerSettingsForm): ServerSettingsFieldErrors {
  const errors: ServerSettingsFieldErrors = {}

  const validatePositiveInteger = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
      return `${label} must be a positive integer.`
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return `${label} must be greater than 0.`
    }
    return undefined
  }

  const validateIntegerRange = (value: string, label: string, min: number, max: number, allowZero = false) => {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
      return `${label} must be an integer.`
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (allowZero && parsed === 0) return undefined
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      return `${label} must be between ${min} and ${max}${allowZero ? ' (or 0)' : ''}.`
    }
    return undefined
  }

  const validateFloatRange = (value: string, label: string, min: number, max: number) => {
    const trimmed = value.trim()
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      return `${label} must be a number.`
    }
    const parsed = Number.parseFloat(trimmed)
    if (Number.isNaN(parsed) || parsed < min || parsed > max) {
      return `${label} must be between ${min} and ${max}.`
    }
    return undefined
  }

  const maxImages = validatePositiveInteger(settings.max_download_images, 'Max download images')
  if (maxImages) errors.max_download_images = maxImages

  const maxBytes = validatePositiveInteger(settings.max_download_total_bytes, 'Max download size')
  if (maxBytes) errors.max_download_total_bytes = maxBytes

  const retention = validatePositiveInteger(settings.download_retention_hours, 'Download retention')
  if (retention) errors.download_retention_hours = retention

  const sessionTtl = validatePositiveInteger(settings.session_ttl_hours, 'Session TTL')
  if (sessionTtl) errors.session_ttl_hours = sessionTtl

  const batchSize = validatePositiveInteger(settings.import_progress_batch_size, 'Import progress batch size')
  if (batchSize) errors.import_progress_batch_size = batchSize

  const thumbSize = validateIntegerRange(settings.thumbnail_size, 'Thumbnail size', 100, 4000)
  if (thumbSize) errors.thumbnail_size = thumbSize

  const thumbQuality = validateFloatRange(settings.thumbnail_quality, 'Thumbnail quality', 1.0, 100.0)
  if (thumbQuality) errors.thumbnail_quality = thumbQuality

  const sampleSize = validateIntegerRange(settings.sample_size, 'Sample size', 100, 16000, true)
  if (sampleSize) errors.sample_size = sampleSize

  const sampleQuality = validateFloatRange(settings.sample_quality, 'Sample quality', 1.0, 100.0)
  if (sampleQuality) errors.sample_quality = sampleQuality

  return errors
}
