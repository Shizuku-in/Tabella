import React, { useRef, useState, useEffect } from 'react'
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
import { CloudUploadOutlined } from '@mui/icons-material'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/auth-provider.tsx'
import { request, uploadWithProgress } from '../lib/api.ts'
import type { SessionUser } from '../types.ts'

export function ProfilePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  
  const [snackbar, setSnackbar] = useState<{ open: boolean, message: string, severity: 'success' | 'error' }>({ 
    open: false, 
    message: '', 
    severity: 'success' 
  })

  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCloseSnackbar = () => setSnackbar(prev => ({ ...prev, open: false }))

  useEffect(() => {
    if (user) {
      setUsername(user.username)
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
    }
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
        })
      })
    }
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

      showSnackbar('Profile updated successfully!', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setAvatarFile(null)
      setAvatarPreview(null)
      
      queryClient.setQueryData(['auth', 'me'], (old: any) => {
        if (!old || !old.user) return old
        return {
          ...old,
          user: {
            ...old.user,
            ...updatedProfile,
            avatar_url: finalAvatarUrl
          }
        }
      })
    } catch (err: any) {
      showSnackbar('Failed to update profile: ' + err.message, 'error')
    }
  }

  return (
    <Stack spacing={4} sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography variant="h5">Profile Settings</Typography>
      
      <Paper sx={{ p: 4 }}>
        <Stack spacing={4}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box position="relative">
              <Avatar
                src={avatarPreview || user?.avatar_url}
                sx={{
                  width: 100,
                  height: 100,
                  bgcolor: (avatarPreview || user?.avatar_url) ? 'transparent' : 'primary.main',
                  fontSize: '2.5rem'
                }}
              >
                {!(avatarPreview || user?.avatar_url) && user?.username?.charAt(0).toUpperCase()}
              </Avatar>
              {(avatarMutation.isPending || profileMutation.isPending) && (
                <CircularProgress
                  size={100}
                  sx={{ position: 'absolute', top: 0, left: 0 }}
                />
              )}
            </Box>
            
            <Stack spacing={1}>
              <Typography variant="h6">{user?.username}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                Role: {user?.role}
              </Typography>
              <Button
                variant="outlined"
                startIcon={<CloudUploadOutlined />}
                size="small"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarMutation.isPending}
                sx={{ mt: 1, alignSelf: 'flex-start' }}
              >
                Change Avatar
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileChange}
              />
            </Stack>
          </Box>

          <form onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                Account Details
              </Typography>
              
              <TextField
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                fullWidth
              />

              <Typography variant="h6" sx={{ fontSize: '1.1rem', pt: 2 }}>
                Change Password
              </Typography>

              <TextField
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                fullWidth
                helperText="Required if you want to set a new password"
              />

              <TextField
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                fullWidth
              />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2 }}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={profileMutation.isPending || avatarMutation.isPending || (!!newPassword && !currentPassword)}
                >
                  Save Changes
                </Button>
              </Box>
            </Stack>
          </form>
        </Stack>
      </Paper>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
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
