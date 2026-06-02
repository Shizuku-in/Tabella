import { CloudUploadOutlined, DownloadOutlined } from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { importJobRows } from '../mocks/gallery.ts'

const statusColorMap = {
  queued: 'default',
  running: 'primary',
  completed: 'success',
  completed_with_errors: 'warning',
} as const

export function AdminImportsPage() {
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

      <Paper sx={{ overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Job ID</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="right">总数</TableCell>
              <TableCell align="right">已处理</TableCell>
              <TableCell align="right">成功</TableCell>
              <TableCell align="right">失败</TableCell>
              <TableCell>创建时间</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {importJobRows.map((job) => (
              <TableRow key={job.id} hover>
                <TableCell sx={{ fontFamily: 'monospace' }}>{job.id}</TableCell>
                <TableCell>
                  <Chip
                    label={job.status}
                    color={statusColorMap[job.status]}
                    variant={job.status === 'queued' ? 'outlined' : 'filled'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">{job.totalItems}</TableCell>
                <TableCell align="right">{job.processedItems}</TableCell>
                <TableCell align="right">{job.succeededItems}</TableCell>
                <TableCell align="right">{job.failedItems}</TableCell>
                <TableCell>{job.createdAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  )
}
