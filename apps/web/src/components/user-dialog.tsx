/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
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
  TextField,
  Stack,
} from '@mui/material'
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
    const nextErrors = validateFields({ username, password, isEdit })
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit User' : 'Create User'}</DialogTitle>
      <form onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Username"
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
              label={isEdit ? "New Password" : "Password"}
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
              helperText={errors.password ?? (isEdit ? 'Leave blank to keep the current password.' : undefined)}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={role}
                label="Role"
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <MenuItem value="viewer">Viewer</MenuItem>
                <MenuItem value="editor">Editor</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function validateFields({
  username,
  password,
  isEdit,
}: {
  username: string
  password: string
  isEdit: boolean
}): FieldErrors {
  const errors: FieldErrors = {}

  if (!isEdit && !username.trim()) {
    errors.username = 'Username is required.'
  }

  if (!isEdit && !password.trim()) {
    errors.password = 'Password is required.'
  } else if (password) {
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'Password must be at least 8 characters, and include an uppercase letter, lowercase letter, and a number.'
    }
  }

  return errors
}
