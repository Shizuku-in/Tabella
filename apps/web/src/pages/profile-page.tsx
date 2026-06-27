import { Edit, Save } from '@mui/icons-material'
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../auth/auth-provider.tsx'
import { ApiError, getApiErrorMessage, request, uploadWithProgress } from '../lib/api.ts'
import { API_ERROR_CODES } from '../lib/api-error-codes.ts'
import { SNACKBAR_DURATION_SHORT } from '../lib/constants.ts'
import { QUERY_KEYS } from '../lib/query-keys.ts'
import type { SessionUser } from '../types.ts'

interface ProfileFieldErrors {
  username?: string
  currentPassword?: string
  newPassword?: string
}

export function ProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<ProfileFieldErrors>({})

  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }))

  useEffect(() => {
    if (user) {
      setUsername(user.username)
      setErrors({})
    }
  }, [user])

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return uploadWithProgress<{ avatar_url: string }>('/api/profile/avatar', formData, () => {})
    },
  })

  const profileMutation = useMutation({
    mutationFn: async () => {
      return request<SessionUser>('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          current_password: currentPassword ? currentPassword : undefined,
          new_password: newPassword ? newPassword : undefined,
        }),
      })
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      setAvatarPreview(URL.createObjectURL(file))
    }
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors = validateProfileFields({ username, currentPassword, newPassword }, t)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      const updatedProfile = await profileMutation.mutateAsync()
      let finalAvatarUrl = updatedProfile.avatar_url

      if (avatarFile) {
        const res = await avatarMutation.mutateAsync(avatarFile)
        finalAvatarUrl = res.avatar_url
        if (finalAvatarUrl && !finalAvatarUrl.includes('?')) {
          finalAvatarUrl += `?v=${Date.now()}`
        }
      }

      showSnackbar(t('auth.profile.success'), 'success')
      setCurrentPassword('')
      setNewPassword('')
      setAvatarFile(null)
      setAvatarPreview(null)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(QUERY_KEYS.AUTH_ME, (old: any) => {
        if (!old || !old.user) return old
        return {
          ...old,
          user: {
            ...old.user,
            ...updatedProfile,
            avatar_url: finalAvatarUrl,
          },
        }
      })
    } catch (error) {
      if (error instanceof ApiError) {
        const code = error.code
        if (
          code === API_ERROR_CODES.INVALID_USERNAME ||
          code === API_ERROR_CODES.DUPLICATE_USERNAME
        ) {
          setErrors((prev) => ({
            ...prev,
            username: getApiErrorMessage(error, t('auth.profile.errors.invalidUsername')),
          }))
          return
        }
        if (
          code === API_ERROR_CODES.INVALID_PASSWORD ||
          code === API_ERROR_CODES.MISSING_CURRENT_PASSWORD
        ) {
          setErrors((prev) => ({
            ...prev,
            currentPassword: getApiErrorMessage(error, t('auth.profile.errors.invalidCurrent')),
          }))
          return
        }
        if (
          code === API_ERROR_CODES.WEAK_PASSWORD_TOO_SHORT ||
          code === API_ERROR_CODES.WEAK_PASSWORD_MISSING_LOWERCASE ||
          code === API_ERROR_CODES.WEAK_PASSWORD_MISSING_NUMBER ||
          code === API_ERROR_CODES.MISSING_NEW_PASSWORD
        ) {
          setErrors((prev) => ({
            ...prev,
            newPassword: getApiErrorMessage(error, t('auth.profile.errors.invalidNew')),
          }))
          return
        }
      }
      showSnackbar(
        t('auth.profile.fail', {
          message: getApiErrorMessage(error, t('auth.profile.errors.requestFailed')),
        }),
        'error',
      )
    }
  }

  const hasChanges =
    username !== user?.username ||
    Boolean(currentPassword) ||
    Boolean(newPassword) ||
    Boolean(avatarFile)

  return (
    <Stack spacing={4} sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography variant="h5">{t('auth.profile.title')}</Typography>

      <Paper sx={{ p: 4 }}>
        <Stack spacing={4}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box
              onClick={() => {
                if (!avatarMutation.isPending && !profileMutation.isPending) {
                  fileInputRef.current?.click()
                }
              }}
              sx={{
                position: 'relative',
                cursor:
                  avatarMutation.isPending || profileMutation.isPending ? 'default' : 'pointer',
                borderRadius: '50%',
                overflow: 'hidden',
                width: 100,
                height: 100,
                flexShrink: 0,
                '&:hover .avatar-overlay': {
                  opacity: avatarMutation.isPending || profileMutation.isPending ? 0 : 1,
                },
              }}
            >
              <Avatar
                src={avatarPreview || user?.avatar_url}
                sx={{
                  width: '100%',
                  height: '100%',
                  bgcolor: avatarPreview || user?.avatar_url ? 'transparent' : 'primary.main',
                  fontSize: '2.5rem',
                }}
              >
                {!(avatarPreview || user?.avatar_url) && user?.username?.charAt(0).toUpperCase()}
              </Avatar>

              <Box
                className="avatar-overlay"
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  bgcolor: 'rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                }}
              >
                <Edit />
              </Box>

              {(avatarMutation.isPending || profileMutation.isPending) && (
                <CircularProgress size={100} sx={{ position: 'absolute', top: 0, left: 0 }} />
              )}
            </Box>

            <Stack spacing={0.5} sx={{ justifyContent: 'center' }}>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                {user?.username}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', textTransform: 'capitalize' }}
              >
                {t('auth.profile.role', { role: user?.role })}
              </Typography>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileChange}
              />
            </Stack>
          </Box>

          <form onSubmit={handleSubmit} noValidate>
            <Stack spacing={3}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                {t('auth.profile.accountDetails')}
              </Typography>

              <TextField
                label={t('auth.profile.username')}
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (errors.username) {
                    setErrors((prev) => ({ ...prev, username: undefined }))
                  }
                }}
                error={Boolean(errors.username)}
                helperText={errors.username}
                fullWidth
              />

              <Typography variant="h6" sx={{ fontSize: '1.1rem', pt: 2 }}>
                {t('auth.profile.changePassword')}
              </Typography>

              <TextField
                label={t('auth.profile.currentPassword')}
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value)
                  if (errors.currentPassword || errors.newPassword) {
                    setErrors((prev) => ({
                      ...prev,
                      currentPassword: undefined,
                      newPassword: undefined,
                    }))
                  }
                }}
                error={Boolean(errors.currentPassword)}
                fullWidth
                helperText={errors.currentPassword ?? t('auth.profile.currentPasswordHelp')}
              />

              <TextField
                label={t('auth.profile.newPassword')}
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  if (errors.currentPassword || errors.newPassword) {
                    setErrors((prev) => ({
                      ...prev,
                      currentPassword: undefined,
                      newPassword: undefined,
                    }))
                  }
                }}
                error={Boolean(errors.newPassword)}
                helperText={errors.newPassword}
                fullWidth
              />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2 }}>
                <Button
                  type="submit"
                  variant="outlined"
                  startIcon={<Save />}
                  disabled={!hasChanges || profileMutation.isPending || avatarMutation.isPending}
                >
                  {t('common.save')}
                </Button>
              </Box>
            </Stack>
          </form>
        </Stack>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={SNACKBAR_DURATION_SHORT}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Stack>
  )
}

function validateProfileFields(
  {
    username,
    currentPassword,
    newPassword,
  }: {
    username: string
    currentPassword: string
    newPassword: string
  },
  t: import('i18next').TFunction,
): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {}
  const trimmedUsername = username.trim()
  const trimmedCurrentPassword = currentPassword.trim()
  const trimmedNewPassword = newPassword.trim()

  if (!trimmedUsername) {
    errors.username = t('auth.profile.errors.usernameRequired')
  }

  if (trimmedNewPassword) {
    if (!trimmedCurrentPassword) {
      errors.currentPassword = t('auth.profile.errors.currentRequired')
    }
    if (
      trimmedNewPassword.length < 8 ||
      !/[a-z]/.test(trimmedNewPassword) ||
      !/[0-9]/.test(trimmedNewPassword)
    ) {
      errors.newPassword = t('auth.profile.errors.passwordWeak')
    }
  }

  if (trimmedCurrentPassword && !trimmedNewPassword) {
    errors.newPassword = t('auth.profile.errors.newRequired')
  }

  return errors
}
