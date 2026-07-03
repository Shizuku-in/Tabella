/**
 * Page for managing user accounts, roles, and creation of new users (admin only).
 */

import { AddOutlined, DeleteOutlined, EditOutlined } from '@mui/icons-material'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../auth/auth-provider.tsx'
import { UserDialog } from '../components/user-dialog.tsx'
import { getApiErrorMessage, request } from '../lib/api.ts'
import { SNACKBAR_DURATION_SHORT } from '../lib/constants.ts'
import { QUERY_KEYS } from '../lib/query-keys.ts'
import type { CreateUserDto, UpdateUserDto, UserRow } from '../types.ts'

export function AdminUsersPage() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null)
  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function showSnackbar(message: string, severity: 'success' | 'error') {
    setSnackbar({ open: true, message, severity })
  }

  const usersQuery = useQuery({
    queryKey: QUERY_KEYS.ADMIN_USERS,
    queryFn: async () => {
      return request<UserRow[]>('/api/admin/users')
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: CreateUserDto) => {
      return request<UserRow>('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_USERS })
      showSnackbar(t('admin.users.createSuccess'), 'success')
    },
    onError: (err) => {
      showSnackbar(
        t('admin.users.createFail', {
          message: getApiErrorMessage(err, t('admin.users.dialog.errors.requestFailed')),
        }),
        'error',
      )
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateUserDto }) => {
      return request(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_USERS })
      showSnackbar(t('admin.users.updateSuccess'), 'success')
    },
    onError: (err) => {
      showSnackbar(
        t('admin.users.updateFail', {
          message: getApiErrorMessage(err, t('admin.users.dialog.errors.requestFailed')),
        }),
        'error',
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return request(`/api/admin/users/${id}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_USERS })
      showSnackbar(t('admin.users.deleteSuccess'), 'success')
    },
    onError: (err) => {
      showSnackbar(
        t('admin.users.deleteFail', {
          message: getApiErrorMessage(err, t('admin.users.dialog.errors.requestFailed')),
        }),
        'error',
      )
    },
  })

  const handleCreateClick = () => {
    setEditingUser(null)
    setDialogOpen(true)
  }

  const handleEditClick = (user: UserRow) => {
    setEditingUser(user)
    setDialogOpen(true)
  }

  const handleDeleteClick = (user: UserRow) => {
    setUserToDelete(user)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (userToDelete) {
      deleteMutation.mutate(userToDelete.id)
    }
    setDeleteConfirmOpen(false)
  }

  const handleDialogSubmit = async (data: CreateUserDto | UpdateUserDto) => {
    if (editingUser) {
      await updateMutation.mutateAsync({ id: editingUser.id, data: data as UpdateUserDto })
    } else {
      await createMutation.mutateAsync(data as CreateUserDto)
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ display: 'none' }}>
          {t('admin.users.title')}
        </Typography>
        <Button variant="outlined" startIcon={<AddOutlined />} onClick={handleCreateClick}>
          {t('admin.users.create')}
        </Button>
      </Stack>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '80px' }}>{t('admin.users.id')}</TableCell>
              <TableCell>{t('admin.users.username')}</TableCell>
              <TableCell>{t('admin.users.role')}</TableCell>
              <TableCell>{t('admin.users.createdAt')}</TableCell>
              <TableCell align="right">{t('admin.users.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {usersQuery.data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.id}</TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{u.role}</TableCell>
                <TableCell>{new Date(u.created_at).toLocaleString()}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                    <IconButton size="small" color="primary" onClick={() => handleEditClick(u)}>
                      <EditOutlined fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteClick(u)}
                      disabled={u.id === currentUser?.id}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {usersQuery.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  {t('admin.users.noUsers')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <UserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        user={editingUser}
      />

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        slotProps={{ transition: { onExited: () => setUserToDelete(null) } }}
      >
        <DialogTitle>{t('admin.users.confirmDeleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ whiteSpace: 'pre-line' }}>
            {t('admin.users.confirmDeleteWarning', { username: userToDelete?.username })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDelete}>
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={SNACKBAR_DURATION_SHORT}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
