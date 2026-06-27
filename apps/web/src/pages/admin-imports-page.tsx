/**
 * Page for managing image imports (editor+).
 */

import {
  Close as CloseIcon,
  CloudUploadOutlined,
  Done,
  Error as ErrorIcon,
  PlayArrowOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material'
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined'
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  type LinearProgressProps,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../auth/auth-provider.tsx'
import { useServerEvents } from '../hooks/use-server-events.ts'
import {
  ApiError,
  formatApiErrorMessage,
  getApiErrorMessage,
  request,
  uploadWithProgress,
} from '../lib/api.ts'
import { SNACKBAR_DURATION_LONG } from '../lib/constants.ts'
import { QUERY_KEYS } from '../lib/query-keys.ts'
import type { ImportJobRow, ImportJobStatus } from '../types.ts'

interface LocalUploadJob {
  id: string
  status: string
  sourceType: string
  progress: number
  loadedBytes: number
  totalBytes: number
  totalItems: number
  processedItems: number
  createdAt: string
  abortController?: AbortController
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function AdminImportsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [serverDialogOpen, setServerDialogOpen] = useState(false)
  const [serverPath, setServerPath] = useState('')
  const [activeUploads, setActiveUploads] = useState<Record<string, LocalUploadJob>>({})
  const packageInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }))
  }

  useServerEvents(
    'import_job_updated',
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.IMPORT_JOBS })
    }, [queryClient]),
  )

  const jobsQuery = useQuery({
    queryKey: QUERY_KEYS.IMPORT_JOBS,
    queryFn: async () => {
      return request<{ items: ImportJobRow[] }>('/api/admin/imports')
    },
  })

  const startJobMutation = useMutation({
    mutationFn: async (path: string) => {
      return request<{ id: string; status: string }>('/api/admin/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: path }),
      })
    },
    onSuccess: (data) => {
      showSnackbar(t('admin.imports.startSuccess', { id: data.id }), 'success')
      setServerDialogOpen(false)
      jobsQuery.refetch()
    },
    onError: (err) => {
      showSnackbar(
        t('admin.imports.startFail', {
          message: getApiErrorMessage(err, t('admin.users.dialog.errors.requestFailed')),
        }),
        'error',
      )
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ files, sourceType }: { files: File[]; sourceType: string }) => {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = file.webkitRelativePath || file.name
        formData.append('files', file, path)
      }

      const tempId = 'upload_' + Date.now() + Math.floor(Math.random() * 1000)
      const abortController = new AbortController()
      setActiveUploads((prev) => ({
        ...prev,
        [tempId]: {
          id: tempId,
          status: 'uploading',
          sourceType,
          progress: 0,
          loadedBytes: 0,
          totalBytes: 0,
          totalItems: files.length,
          processedItems: 0,
          createdAt: new Date().toISOString(),
          abortController,
        },
      }))

      try {
        const result = await uploadWithProgress<{ id: string; status: string }>(
          `/api/admin/imports/upload?type=${sourceType}`,
          formData,
          (percent: number, loaded: number, total: number) => {
            setActiveUploads((prev) => ({
              ...prev,
              [tempId]: {
                ...prev[tempId],
                progress: percent,
                loadedBytes: loaded,
                totalBytes: total,
              },
            }))
          },
          abortController.signal,
        )
        return { tempId, data: result }
      } catch (err) {
        setActiveUploads((prev) => {
          const newState = { ...prev }
          delete newState[tempId]
          return newState
        })
        throw err
      }
    },
    onSuccess: (res) => {
      setActiveUploads((prev) => {
        const newState = { ...prev }
        delete newState[res.tempId]
        return newState
      })
      jobsQuery.refetch()
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.code === 'UPLOAD_ABORTED') {
        showSnackbar('Upload cancelled', 'success')
      } else {
        showSnackbar(
          t('admin.imports.uploadFail', {
            message: getApiErrorMessage(err, t('admin.users.dialog.errors.requestFailed')),
          }),
          'error',
        )
      }
    },
  })

  const handlePackageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileArray = Array.from(e.target.files)
      uploadMutation.mutate({ files: fileArray, sourceType: 'package' })
    }
    e.target.value = ''
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileArray = Array.from(e.target.files)
      uploadMutation.mutate({ files: fileArray, sourceType: 'folder' })
    }
    e.target.value = ''
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'flex-start' }}
      >
        <Stack direction="row" spacing={1}>
          <input
            type="file"
            ref={packageInputRef}
            accept=".zip,.7z"
            style={{ display: 'none' }}
            onChange={handlePackageSelect}
          />
          <input
            type="file"
            ref={folderInputRef}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ webkitdirectory: 'true', directory: 'true' } as any)}
            style={{ display: 'none' }}
            onChange={handleFolderSelect}
            multiple
          />
          <Button
            variant="outlined"
            startIcon={<UploadOutlinedIcon />}
            onClick={() => packageInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {t('admin.imports.buttons.package')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<UploadOutlinedIcon />}
            onClick={() => folderInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {t('admin.imports.buttons.folder')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<CloudUploadOutlined />}
            onClick={() => setServerDialogOpen(true)}
            disabled={user?.role !== 'admin'}
          >
            {t('admin.imports.buttons.server')}
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '100px' }}>{t('admin.imports.columns.jobId')}</TableCell>
              <TableCell sx={{ width: '180px' }}>{t('admin.imports.columns.date')}</TableCell>
              <TableCell>{t('admin.imports.columns.status')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.values(activeUploads)
              .reverse()
              .map((job) => (
                <TableRow key={job.id}>
                  <TableCell>Uploading...</TableCell>
                  <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{ width: '100%', maxWidth: 500, alignItems: 'center' }}
                    >
                      {job.abortController ? (
                        <IconButton
                          onClick={() => job.abortController?.abort()}
                          sx={{ position: 'relative', p: 0, width: 24, height: 24 }}
                        >
                          <CircularProgress
                            variant="determinate"
                            value={job.progress}
                            size={24}
                            color="info"
                            sx={{ position: 'absolute', top: 0, left: 0 }}
                          />
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      ) : (
                        <CircularProgress
                          variant="determinate"
                          value={job.progress}
                          size={24}
                          color="info"
                        />
                      )}
                      <Stack sx={{ flex: 1 }}>
                        <Stack
                          direction="row"
                          sx={{
                            mb: 0.5,
                            columnGap: 1,
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 500 }}>
                            {t('admin.imports.uploading', { progress: job.progress })}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
                          >
                            {job.sourceType === 'package'
                              ? `${job.totalBytes > 0 ? `${formatBytes(job.loadedBytes)} / ${formatBytes(job.totalBytes)}` : t('admin.imports.archiveFile')}`
                              : t('admin.imports.filesCount', { count: job.totalItems })}
                          </Typography>
                        </Stack>
                        <LinearProgress variant="determinate" value={job.progress} color="info" />
                      </Stack>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            {jobsQuery.data?.items.map((job) => {
              let icon = <CircularProgress size={24} color="secondary" />
              let color = 'secondary.main'
              let progressColor: LinearProgressProps['color'] = 'secondary'
              const isCompleted =
                job.status === 'completed' || job.status === 'completed_with_errors'
              const hasStructuredError =
                (job.status === 'failed' || job.status === 'completed_with_errors') &&
                Boolean(job.errorCode || job.lastError)
              let label = formatImportJobStatus(job.status)
              if (hasStructuredError) {
                label = formatApiErrorMessage(
                  job.errorCode ?? undefined,
                  job.errorParams ?? null,
                  job.lastError ?? label,
                )
              }

              if (job.status === 'completed') {
                icon = <Done color="success" />
                color = 'success.main'
                progressColor = 'success'
              } else if (job.status === 'completed_with_errors') {
                icon = <WarningAmberOutlined color="warning" />
                color = 'warning.main'
                progressColor = 'warning'
              } else if (job.status === 'failed') {
                icon = <ErrorIcon color="error" />
                color = 'error.main'
                progressColor = 'error'
              }

              let progressPercent = 0
              if (isCompleted) {
                progressPercent = 100
              } else if (job.totalItems > 0) {
                progressPercent = Math.round((job.processedItems / job.totalItems) * 100)
              }
              const showProgressBar =
                !hasStructuredError && job.status !== 'queued' && job.status !== 'failed'
              const progressVariant =
                isCompleted || job.totalItems > 0 ? 'determinate' : 'indeterminate'

              return (
                <TableRow key={job.id}>
                  <TableCell>{job.id.substring(0, 8)}</TableCell>
                  <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{ width: '100%', maxWidth: 500, alignItems: 'center' }}
                    >
                      {icon}
                      <Stack sx={{ flex: 1 }}>
                        <Stack
                          direction="row"
                          sx={{
                            mb: 0.5,
                            columnGap: 1,
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ color, textTransform: 'capitalize', fontWeight: 500 }}
                          >
                            {label}
                          </Typography>
                          {!hasStructuredError && job.totalItems > 0 && (
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
                            >
                              {job.status === 'extracting' && job.sourceType === 'package'
                                ? t('admin.imports.progressExtracted', {
                                    processed: job.processedItems,
                                    total: job.totalItems,
                                  })
                                : t('admin.imports.progressCount', {
                                    processed: job.processedItems,
                                    total: job.totalItems,
                                    percent: progressPercent,
                                  })}
                            </Typography>
                          )}
                        </Stack>
                        {showProgressBar && (
                          <LinearProgress
                            variant={progressVariant}
                            value={progressPercent}
                            color={progressColor}
                          />
                        )}
                      </Stack>
                    </Stack>
                  </TableCell>
                </TableRow>
              )
            })}
            {Object.keys(activeUploads).length === 0 && jobsQuery.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  {t('admin.imports.noJobs')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog
        open={serverDialogOpen}
        onClose={() => setServerDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('admin.imports.serverDialog.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {t('admin.imports.serverDialog.description')}
          </Typography>
          <TextField
            label={t('admin.imports.serverDialog.pathLabel')}
            variant="outlined"
            size="small"
            fullWidth
            value={serverPath}
            onChange={(e) => setServerPath(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setServerDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayArrowOutlined />}
            onClick={() => startJobMutation.mutate(serverPath)}
            disabled={startJobMutation.isPending}
          >
            {t('admin.imports.serverDialog.import')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={SNACKBAR_DURATION_LONG}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={handleCloseSnackbar} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Stack>
  )
}

function formatImportJobStatus(status: ImportJobStatus) {
  return status.replaceAll('_', ' ')
}
