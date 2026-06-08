/* eslint-disable react-hooks/set-state-in-effect */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CreateUserDto, UpdateUserDto, UserRole, UserRow } from '../types.ts'

interface UserDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CreateUserDto | UpdateUserDto) => Promise<void>
  user: UserRow | null
}

interface FieldErrors {
  username?: string
  password?: string
}

export function UserDialog({ open, onClose, onSubmit, user }: UserDialogProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})

  const isEdit = !!user

  useEffect(() => {
    if (open) {
      if (user) {
        setUsername(user.username)
        setPassword('')
        setRole(user.role)
      } else {
        setUsername('')
        setPassword('')
        setRole('viewer')
      }
      setLoading(false)
      setErrors({})
    }
  }, [open, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors = validateFields({ username, password, isEdit }, t)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setLoading(true)
    try {
      if (isEdit) {
        await onSubmit({
          role,
          password: password ? password : undefined,
        } as UpdateUserDto)
      } else {
        await onSubmit({
          username,
          password,
          role,
        } as CreateUserDto)
      }
      onClose()
    } catch (err) {
      console.error('Failed to save user', err)
    } finally {
      setLoading(false)
    }
  }

  const isDirty = user
    ? password !== '' || role !== user.role
    : username !== '' || password !== '' || role !== 'viewer'

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {isEdit ? t('admin.users.dialog.editUser') : t('admin.users.dialog.createUser')}
      </DialogTitle>
      <form onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t('admin.users.dialog.username')}
              required={!isEdit}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                if (errors.username) {
                  setErrors((prev) => ({ ...prev, username: undefined }))
                }
              }}
              disabled={isEdit}
              error={Boolean(errors.username)}
              helperText={errors.username}
              fullWidth
            />
            <TextField
              label={
                isEdit ? t('admin.users.dialog.newPassword') : t('admin.users.dialog.password')
              }
              type="password"
              required={!isEdit}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }))
                }
              }}
              error={Boolean(errors.password)}
              helperText={
                errors.password ?? (isEdit ? t('admin.users.dialog.passwordHelp') : undefined)
              }
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>{t('admin.users.dialog.role')}</InputLabel>
              <Select
                value={role}
                label={t('admin.users.dialog.role')}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <MenuItem value="viewer">{t('admin.users.dialog.roles.viewer')}</MenuItem>
                <MenuItem value="editor">{t('admin.users.dialog.roles.editor')}</MenuItem>
                <MenuItem value="admin">{t('admin.users.dialog.roles.admin')}</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="outlined" disabled={loading || !isDirty}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function validateFields(
  {
    username,
    password,
    isEdit,
  }: {
    username: string
    password: string
    isEdit: boolean
  },
  t: import('i18next').TFunction,
): FieldErrors {
  const errors: FieldErrors = {}

  if (!isEdit && !username.trim()) {
    errors.username = t('admin.users.dialog.errors.usernameRequired')
  }

  if (!isEdit && !password.trim()) {
    errors.password = t('admin.users.dialog.errors.passwordRequired')
  } else if (password) {
    if (password.length < 8 || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = t('admin.users.dialog.errors.passwordWeak')
    }
  }

  return errors
}
