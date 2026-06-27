/**
 * Floating action bar shown during multi-selection mode for batch operations like downloads.
 */

import { Close, Download, SelectAll } from '@mui/icons-material'
import { Button, Fade, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

export interface SelectionActionBarProps {
  selectionMode: boolean
  selectedCount: number
  onClose: () => void
  onSelectAll: () => void
  onDownload: () => void
}

export function SelectionActionBar({
  selectionMode,
  selectedCount,
  onClose,
  onSelectAll,
  onDownload,
}: SelectionActionBarProps) {
  const { t } = useTranslation()
  return (
    <Fade in={selectionMode}>
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          bottom: { xs: 16, sm: 24, md: 32 },
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1100,
          borderRadius: 8,
          overflow: 'hidden',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ px: 2, py: 1.5, minWidth: 280, alignItems: 'center' }}
        >
          <IconButton size="small" onClick={onClose} edge="start">
            <Close />
          </IconButton>

          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, px: 1 }}>
            {t('gallery.selection.selected', { count: selectedCount })}
          </Typography>

          <Tooltip title={t('gallery.selection.selectAll')}>
            <IconButton size="small" onClick={onSelectAll}>
              <SelectAll />
            </IconButton>
          </Tooltip>

          <Button
            variant="outlined"
            size="small"
            startIcon={<Download />}
            disabled={selectedCount === 0}
            onClick={onDownload}
            sx={{ borderRadius: 6, textTransform: 'none', px: 2 }}
          >
            {t('gallery.selection.download')}
          </Button>
        </Stack>
      </Paper>
    </Fade>
  )
}
