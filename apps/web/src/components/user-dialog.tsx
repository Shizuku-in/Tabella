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

export function UserDialog({ open, onClose, onSubmit, user }: UserDialogProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [loading, setLoading] = useState(false)

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
    }
  }, [open, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isEdit}
              required={!isEdit}
              fullWidth
            />
            <TextField
              label={isEdit ? "New Password" : "Password"}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEdit}
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
