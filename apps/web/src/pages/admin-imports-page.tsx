import { CloudUploadOutlined, Done, Error as ErrorIcon, PlayArrowOutlined, WarningAmberOutlined } from '@mui/icons-material'
import {
  Button,
  type LinearProgressProps,
  Paper,
  Stack,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  LinearProgress,
} from '@mui/material'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { request, uploadWithProgress } from '../lib/api.ts'
import type { ImportJobRow, ImportJobStatus } from '../types.ts'

interface LocalUploadJob {
  id: string
  status: string
  sourceType: string
  progress: number
  totalItems: number
  processedItems: number
  createdAt: string
}

export function AdminImportsPage() {
  const [serverDialogOpen, setServerDialogOpen] = useState(false)
  const [serverPath, setServerPath] = useState('')
  const [activeUploads, setActiveUploads] = useState<Record<string, LocalUploadJob>>({})
  const packageInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const jobsQuery = useQuery({
    queryKey: ['importJobs'],
    queryFn: async () => {
      return request<{ items: ImportJobRow[] }>('/api/admin/imports')
    },
    refetchInterval: 5000,
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
      alert('Job started. Job ID: ' + data.id)
      setServerDialogOpen(false)
      jobsQuery.refetch()
    },
    onError: (err) => {
      alert('Failed to start job: ' + err.message)
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ files, sourceType }: { files: File[], sourceType: string }) => {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = file.webkitRelativePath || file.name
        formData.append('files', file, path)
      }
      
      const tempId = 'upload_' + Date.now() + Math.floor(Math.random() * 1000)
      setActiveUploads(prev => ({
        ...prev,
        [tempId]: {
          id: tempId,
          status: 'uploading',
          sourceType,
          progress: 0,
          totalItems: files.length,
          processedItems: 0,
          createdAt: new Date().toISOString()
        }
      }))

      try {
        const result = await uploadWithProgress<{ id: string; status: string }>(
          `/api/admin/imports/upload?type=${sourceType}`,
          formData,
          (percent: number) => {
            setActiveUploads(prev => ({
              ...prev,
              [tempId]: { ...prev[tempId], progress: percent }
            }))
          }
        )
        return { tempId, data: result }
      } catch (err) {
        setActiveUploads(prev => {
          const newState = { ...prev }
          delete newState[tempId]
          return newState
        })
        throw err
      }
    },
    onSuccess: (res) => {
      setActiveUploads(prev => {
        const newState = { ...prev }
        delete newState[res.tempId]
        return newState
      })
      jobsQuery.refetch()
    },
    onError: (err) => {
      alert('Failed to upload: ' + err.message)
    }
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
        justifyContent="flex-start"
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
            {...{ webkitdirectory: "true", directory: "true" } as any}
            style={{ display: 'none' }} 
            onChange={handleFolderSelect}
            multiple
          />
          <Button 
            variant="outlined" 
            startIcon={<CloudUploadOutlined />}
            onClick={() => packageInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            Package
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<CloudUploadOutlined />}
            onClick={() => folderInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            Folder
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<CloudUploadOutlined />}
            onClick={() => setServerDialogOpen(true)}
          >
            Server
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '100px' }}>Job ID</TableCell>
              <TableCell sx={{ width: '180px' }}>Date</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.values(activeUploads).reverse().map((job) => (
              <TableRow key={job.id}>
                <TableCell>Uploading...</TableCell>
                <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%', maxWidth: 500 }}>
                    <CircularProgress variant="determinate" value={job.progress} size={24} color="info" />
                    <Stack sx={{ flex: 1 }}>
                      <Stack direction="row" justifyContent="space-between" flexWrap="wrap" columnGap={1} sx={{ mb: 0.5 }}>
                        <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 500 }}>
                          Uploading ({job.progress}%)
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {job.sourceType === 'package' ? 'Archive file' : `${job.totalItems} files`}
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
              const isCompleted = job.status === 'completed' || job.status === 'completed_with_errors'
              const label = formatImportJobStatus(job.status)

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
              const showProgressBar = job.status !== 'queued' && job.status !== 'failed'
              const progressVariant = isCompleted || job.totalItems > 0 ? 'determinate' : 'indeterminate'

              return (
                <TableRow key={job.id}>
                  <TableCell>{job.id.substring(0, 8)}</TableCell>
                  <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%', maxWidth: 500 }}>
                      {icon}
                      <Stack sx={{ flex: 1 }}>
                        <Stack direction="row" justifyContent="space-between" flexWrap="wrap" columnGap={1} sx={{ mb: 0.5 }}>
                          <Typography variant="body2" sx={{ color, textTransform: 'capitalize', fontWeight: 500 }}>
                            {label}
                          </Typography>
                          {job.totalItems > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                              {job.status === 'extracting' && job.sourceType === 'package' ? (
                                `Extracted ${job.processedItems} / ${job.totalItems}`
                              ) : (
                                `${job.processedItems} / ${job.totalItems} (${progressPercent}%)`
                              )}
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
                  No import jobs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={serverDialogOpen} onClose={() => setServerDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Server Import</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Scan a directory directly on the server's filesystem.
          </Typography>
          <TextField 
            label="Server Directory Path" 
            variant="outlined" 
            size="small" 
            fullWidth
            value={serverPath}
            onChange={(e) => setServerPath(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setServerDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            color="secondary"
            startIcon={<PlayArrowOutlined />}
            onClick={() => startJobMutation.mutate(serverPath)}
            disabled={startJobMutation.isPending}
          >
            Scan & Import
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

function formatImportJobStatus(status: ImportJobStatus) {
  return status.replaceAll('_', ' ')
}
