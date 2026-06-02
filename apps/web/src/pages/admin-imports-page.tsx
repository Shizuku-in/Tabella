import { CloudOutlined, UploadOutlined, FolderOutlined, InsertDriveFileOutlined, PlayArrowOutlined } from '@mui/icons-material'
import {
  Button,
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
  Chip,
} from '@mui/material'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { request } from '../lib/api.ts'
import type { ImportJobRow } from '../lib/api.ts'

export function AdminImportsPage() {
  const [serverDialogOpen, setServerDialogOpen] = useState(false)
  const [serverPath, setServerPath] = useState('d:/Tabella/demopic')
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
    mutationFn: async (files: FileList) => {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // Use webkitRelativePath to preserve directory structure, fallback to file.name
        const path = file.webkitRelativePath || file.name
        formData.append('files', file, path)
      }
      return request<{ id: string; status: string }>('/api/admin/imports/upload', {
        method: 'POST',
        body: formData,
      })
    },
    onSuccess: (data) => {
      alert('Upload successful. Job ID: ' + data.id)
      jobsQuery.refetch()
    },
    onError: (err) => {
      alert('Failed to upload: ' + err.message)
    }
  })

  const handlePackageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadMutation.mutate(e.target.files)
    }
    e.target.value = ''
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadMutation.mutate(e.target.files)
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
            {...{ webkitdirectory: "true", directory: "true" } as any}
            style={{ display: 'none' }} 
            onChange={handleFolderSelect}
            multiple
          />
          <Button 
            variant="outlined" 
            startIcon={<UploadOutlined />}
            onClick={() => packageInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            Package
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<UploadOutlined />}
            onClick={() => folderInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            Folder
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<CloudOutlined />}
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
              <TableCell>Job ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Progress</TableCell>
              <TableCell>Created At</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobsQuery.data?.items.map((job) => (
              <TableRow key={job.id}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{job.id.substring(0, 8)}</TableCell>
                <TableCell>
                  <Chip 
                    label={job.status} 
                    size="small" 
                    color={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : 'primary'}
                  />
                </TableCell>
                <TableCell>
                  {job.processedItems} / {job.totalItems} 
                  {job.totalItems > 0 && ` (${Math.round((job.processedItems / job.totalItems) * 100)}%)`}
                </TableCell>
                <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {jobsQuery.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
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
