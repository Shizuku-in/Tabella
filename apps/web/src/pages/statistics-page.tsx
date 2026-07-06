/**
 * Gallery statistics: total images, storage (originals), tag distribution.
 * Accessible to all authenticated users.
 */

import { CollectionsOutlined, StorageOutlined, TagOutlined } from '@mui/icons-material'
import {
  Box,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { alpha, useTheme } from '@mui/material/styles'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { request } from '../lib/api.ts'
import { CONTENT_MAX_WIDTH } from '../lib/constants.ts'
import { ROUTES } from '../lib/routes.ts'
import { getTagColor } from '../lib/tags.ts'

interface StatsData {
  totalImages: number
  totalTags: number
  totalSizeBytes: number
  ratingCounts: {
    safe: number
    suggestive: number
    explicit: number
  }
}

interface TagItem {
  tag: string
  count: number
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function StatisticsPage() {
  const { t } = useTranslation()
  const theme = useTheme<Theme>()
  const navigate = useNavigate()
  const setSearchTags = useGallerySessionStore((s) => s.setSearchTags)

  const handleTagClick = (tag: string) => {
    setSearchTags([tag])
    navigate(ROUTES.HOME)
  }

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: async () => request<StatsData>('/api/stats'),
  })

  const tagsQuery = useQuery({
    queryKey: ['statsTags'],
    queryFn: async () => request<{ items: TagItem[] }>('/api/tags?limit=500'),
  })

  const isLoading = statsQuery.isLoading || tagsQuery.isLoading

  if (isLoading) {
    return (
      <Stack sx={{ alignItems: 'center', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Stack>
    )
  }

  const stats = statsQuery.data
  const tags = tagsQuery.data?.items ?? []

  return (
    <Stack
      spacing={3}
      sx={{
        p: { xs: 2, sm: 4 },
        maxWidth: CONTENT_MAX_WIDTH,
        mx: 'auto',
        height: 'calc(100vh - 80px)',
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        {t('stats.title')}
      </Typography>

      {/* Summary cards */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Paper
          sx={{
            flex: 1,
            p: 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderRadius: 1,
          }}
        >
          <CollectionsOutlined sx={{ fontSize: 36, color: 'primary.main', opacity: 0.72 }} />
          <Stack>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              {stats?.totalImages ?? 0}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('stats.totalImages')}
            </Typography>
          </Stack>
        </Paper>

        <Paper
          sx={{
            flex: 1,
            p: 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderRadius: 1,
          }}
        >
          <StorageOutlined sx={{ fontSize: 36, color: 'primary.main', opacity: 0.72 }} />
          <Stack>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              {stats ? formatBytes(stats.totalSizeBytes) : '—'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('stats.totalStorage')}
            </Typography>
          </Stack>
        </Paper>
      </Stack>

      {/* Tags table */}
      <Paper
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            px: 2.5,
            py: 1.5,
            alignItems: 'center',
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
          }}
        >
          <TagOutlined sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t('stats.tagsTitle')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('stats.tagsCount', { count: stats?.totalTags ?? tags.length })}
          </Typography>
        </Stack>

        {tags.length > 0 ? (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <TableBody>
                {tags.map((item) => (
                  <TableRow key={item.tag} sx={{ '&:last-child td': { border: 0 } }}>
                    <TableCell
                      sx={{
                        fontFamily: '"Google Sans Code", monospace',
                        fontSize: '0.875rem',
                      }}
                    >
                      <Box
                        component="span"
                        onClick={() => handleTagClick(item.tag)}
                        sx={{
                          display: 'inline-block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: getTagColor(item.tag, theme),
                          cursor: 'pointer',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {item.tag}
                      </Box>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color: 'text.secondary',
                        fontVariantNumeric: 'tabular-nums',
                        width: 70,
                      }}
                    >
                      {item.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ p: 3, color: 'text.secondary', textAlign: 'center' }}>
            {t('stats.noData')}
          </Typography>
        )}
      </Paper>
    </Stack>
  )
}
