/* eslint-disable react-hooks/set-state-in-effect */
import { Save } from '@mui/icons-material'
import {
  Alert,
  Button,
  FormControlLabel,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getApiErrorMessage, request } from '../lib/api.ts'

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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<ServerSettingsForm | null>(null)
  const [errors, setErrors] = useState<ServerSettingsFieldErrors>({})
  const [isDirty, setIsDirty] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')
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
      setSnackbarMessage(t('admin.server.updateSuccess'))
      setSnackbarOpen(true)
    },
    onError: (error) => {
      setSnackbarSeverity('error')
      setSnackbarMessage(getApiErrorMessage(error, t('admin.server.updateFail')))
      setSnackbarOpen(true)
    },
  })

  const handleNumberChange = (
    field: keyof Omit<ServerSettingsForm, 'secure_cookies'>,
    value: string,
  ) => {
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
      const nextErrors = validateServerSettingsFields(settings, t)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) {
        return
      }

      try {
        updateMutation.mutate(parseFormState(settings))
      } catch (error) {
        setSnackbarSeverity('error')
        setSnackbarMessage(getApiErrorMessage(error, t('admin.server.validateFail')))
        setSnackbarOpen(true)
      }
    }
  }

  if (settingsQuery.isLoading || !settings) {
    return <Typography sx={{ p: 4 }}>{t('admin.server.loading')}</Typography>
  }

  if (settingsQuery.isError) {
    return (
      <Typography color="error" sx={{ p: 4 }}>
        {t('admin.server.loadFail')}
      </Typography>
    )
  }

  return (
    <Fragment>
      <form onSubmit={handleSave} noValidate>
        <Stack spacing={3} sx={{ p: { xs: 2, sm: 4 }, maxWidth: 800, mx: 'auto' }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t('admin.server.title')}
            </Typography>
            <Button
              type="submit"
              variant="outlined"
              startIcon={<Save />}
              disabled={updateMutation.isPending || !isDirty}
            >
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </Stack>

          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              '& input[type=number]': {
                MozAppearance: 'textfield',
              },
              '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
                {
                  WebkitAppearance: 'none',
                  margin: 0,
                },
            }}
          >
            <Stack spacing={4}>
              <Stack spacing={3}>
                <Typography
                  variant="h6"
                  sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary' }}
                >
                  {t('admin.server.downloads')}
                </Typography>
                <TextField
                  label={t('admin.server.maxDownloadImages')}
                  type="number"
                  required
                  value={settings.max_download_images}
                  onChange={(e) => handleNumberChange('max_download_images', e.target.value)}
                  error={Boolean(errors.max_download_images)}
                  helperText={errors.max_download_images ?? t('admin.server.maxDownloadImagesHelp')}
                  fullWidth
                />
                <TextField
                  label={t('admin.server.maxDownloadSize')}
                  type="number"
                  required
                  value={settings.max_download_total_bytes}
                  onChange={(e) => handleNumberChange('max_download_total_bytes', e.target.value)}
                  error={Boolean(errors.max_download_total_bytes)}
                  helperText={
                    errors.max_download_total_bytes ?? t('admin.server.maxDownloadSizeHelp')
                  }
                  fullWidth
                />
                <TextField
                  label={t('admin.server.downloadRetention')}
                  type="number"
                  required
                  value={settings.download_retention_hours}
                  onChange={(e) => handleNumberChange('download_retention_hours', e.target.value)}
                  error={Boolean(errors.download_retention_hours)}
                  helperText={
                    errors.download_retention_hours ?? t('admin.server.downloadRetentionHelp')
                  }
                  fullWidth
                />
              </Stack>

              <Stack spacing={3}>
                <Typography
                  variant="h6"
                  sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary' }}
                >
                  {t('admin.server.imports')}
                </Typography>
                <TextField
                  label={t('admin.server.batchSize')}
                  type="number"
                  required
                  value={settings.import_progress_batch_size}
                  onChange={(e) => handleNumberChange('import_progress_batch_size', e.target.value)}
                  error={Boolean(errors.import_progress_batch_size)}
                  helperText={errors.import_progress_batch_size ?? t('admin.server.batchSizeHelp')}
                  fullWidth
                />
              </Stack>

              <Stack spacing={3}>
                <Typography
                  variant="h6"
                  sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary' }}
                >
                  {t('admin.server.imageProcessing')}
                </Typography>
                <TextField
                  label={t('admin.server.thumbSize')}
                  type="number"
                  required
                  value={settings.thumbnail_size}
                  onChange={(e) => handleNumberChange('thumbnail_size', e.target.value)}
                  error={Boolean(errors.thumbnail_size)}
                  helperText={errors.thumbnail_size ?? t('admin.server.thumbSizeHelp')}
                  fullWidth
                />
                <TextField
                  label={t('admin.server.thumbQuality')}
                  type="number"
                  required
                  value={settings.thumbnail_quality}
                  onChange={(e) => handleNumberChange('thumbnail_quality', e.target.value)}
                  error={Boolean(errors.thumbnail_quality)}
                  helperText={errors.thumbnail_quality ?? t('admin.server.thumbQualityHelp')}
                  fullWidth
                />
                <TextField
                  label={t('admin.server.sampleSize')}
                  type="number"
                  required
                  value={settings.sample_size}
                  onChange={(e) => handleNumberChange('sample_size', e.target.value)}
                  error={Boolean(errors.sample_size)}
                  helperText={errors.sample_size ?? t('admin.server.sampleSizeHelp')}
                  fullWidth
                />
                <TextField
                  label={t('admin.server.sampleQuality')}
                  type="number"
                  required
                  value={settings.sample_quality}
                  onChange={(e) => handleNumberChange('sample_quality', e.target.value)}
                  error={Boolean(errors.sample_quality)}
                  helperText={errors.sample_quality ?? t('admin.server.sampleQualityHelp')}
                  fullWidth
                />
              </Stack>

              <Stack spacing={3}>
                <Typography
                  variant="h6"
                  sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary' }}
                >
                  {t('admin.server.security')}
                </Typography>
                <TextField
                  label={t('admin.server.sessionTtl')}
                  type="number"
                  required
                  value={settings.session_ttl_hours}
                  onChange={(e) => handleNumberChange('session_ttl_hours', e.target.value)}
                  error={Boolean(errors.session_ttl_hours)}
                  helperText={errors.session_ttl_hours ?? t('admin.server.sessionTtlHelp')}
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
                      <Typography>{t('admin.server.secureCookies')}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {t('admin.server.secureCookiesHelp')}
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
        <Alert
          severity={snackbarSeverity}
          onClose={() => setSnackbarOpen(false)}
          sx={{ width: '100%' }}
        >
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

function validateServerSettingsFields(
  settings: ServerSettingsForm,
  t: import('i18next').TFunction,
): ServerSettingsFieldErrors {
  const errors: ServerSettingsFieldErrors = {}

  const validatePositiveInteger = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
      return t('admin.server.errors.positiveInteger', { label })
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return t('admin.server.errors.greaterThanZero', { label })
    }
    return undefined
  }

  const validateIntegerRange = (
    value: string,
    label: string,
    min: number,
    max: number,
    allowZero = false,
  ) => {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
      return t('admin.server.errors.mustBeInteger', { label })
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (allowZero && parsed === 0) return undefined
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      return allowZero
        ? t('admin.server.errors.betweenMinMaxOrZero', { label, min, max })
        : t('admin.server.errors.betweenMinMax', { label, min, max })
    }
    return undefined
  }

  const validateFloatRange = (value: string, label: string, min: number, max: number) => {
    const trimmed = value.trim()
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      return t('admin.server.errors.mustBeNumber', { label })
    }
    const parsed = Number.parseFloat(trimmed)
    if (Number.isNaN(parsed) || parsed < min || parsed > max) {
      return t('admin.server.errors.betweenMinMax', { label, min, max })
    }
    return undefined
  }

  const maxImages = validatePositiveInteger(
    settings.max_download_images,
    t('admin.server.maxDownloadImages'),
  )
  if (maxImages) errors.max_download_images = maxImages

  const maxBytes = validatePositiveInteger(
    settings.max_download_total_bytes,
    t('admin.server.maxDownloadSize'),
  )
  if (maxBytes) errors.max_download_total_bytes = maxBytes

  const retention = validatePositiveInteger(
    settings.download_retention_hours,
    t('admin.server.downloadRetention'),
  )
  if (retention) errors.download_retention_hours = retention

  const sessionTtl = validatePositiveInteger(
    settings.session_ttl_hours,
    t('admin.server.sessionTtl'),
  )
  if (sessionTtl) errors.session_ttl_hours = sessionTtl

  const batchSize = validatePositiveInteger(
    settings.import_progress_batch_size,
    t('admin.server.batchSize'),
  )
  if (batchSize) errors.import_progress_batch_size = batchSize

  const thumbSize = validateIntegerRange(
    settings.thumbnail_size,
    t('admin.server.thumbSize'),
    100,
    4000,
  )
  if (thumbSize) errors.thumbnail_size = thumbSize

  const thumbQuality = validateFloatRange(
    settings.thumbnail_quality,
    t('admin.server.thumbQuality'),
    1.0,
    100.0,
  )
  if (thumbQuality) errors.thumbnail_quality = thumbQuality

  const sampleSize = validateIntegerRange(
    settings.sample_size,
    t('admin.server.sampleSize'),
    100,
    16000,
    true,
  )
  if (sampleSize) errors.sample_size = sampleSize

  const sampleQuality = validateFloatRange(
    settings.sample_quality,
    t('admin.server.sampleQuality'),
    1.0,
    100.0,
  )
  if (sampleQuality) errors.sample_quality = sampleQuality

  return errors
}
