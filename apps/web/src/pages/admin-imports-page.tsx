import { CloudUploadOutlined, DownloadOutlined, PlayArrowOutlined } from '@mui/icons-material'
import {
  Box,
  Button,
  Paper,
  Stack,
  Typography,
  TextField,
} from '@mui/material'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { request } from '../lib/api.ts'

export function AdminImportsPage() {
  const [sourcePath, setSourcePath] = useState('d:/Tabella/demopic')

  const startJobMutation = useMutation({
    mutationFn: async () => {
      return request<{ id: string; status: string }>('/api/admin/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath }),
      })
    },
    onSuccess: (data) => {
      // In a real app we would refetch the list of jobs, but for now we just 
      // add it to a local list or trigger a refetch of a specific job
      alert('任务已创建，Job ID: ' + data.id)
    },
    onError: (err) => {
      alert('创建失败: ' + err.message)
    }
  })

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
            导入任务
          </Typography>
          <Typography color="text.secondary">
            管理员可以在这里查看 zip 导入任务、处理进度和逐项失败结果。
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<DownloadOutlined />}>
            下载模板
          </Button>
          <Button variant="contained" startIcon={<CloudUploadOutlined />}>
            上传导入包
          </Button>
        </Stack>
      </Stack>

      <Paper sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField 
          label="本地文件夹路径" 
          variant="outlined" 
          size="small" 
          fullWidth
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
        />
        <Button 
          variant="contained" 
          color="secondary"
          startIcon={<PlayArrowOutlined />}
          onClick={() => startJobMutation.mutate()}
          disabled={startJobMutation.isPending}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {startJobMutation.isPending ? '提交中...' : '一键扫描入库'}
        </Button>
      </Paper>

      <Paper sx={{ overflow: 'hidden', p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          （历史任务列表表格暂未对接 API，可以通过刷新主页查看新图是否入库）
        </Typography>
      </Paper>
    </Stack>
  )
}
