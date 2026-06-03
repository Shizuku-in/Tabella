import { Save } from '@mui/icons-material'
import {
  Box,
  Slide,
  Stack,
  Chip,
  Typography,
  Autocomplete,
  TextField,
  Divider,
  Select,
  MenuItem,
  FormControl,
  Button,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { GalleryItem, Rating } from '../types'

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography
        variant="body2"
        sx={{
          color: 'text.primary',
          wordBreak: 'break-all',
          ...(mono ? { fontFamily: 'monospace', fontSize: '0.7rem' } : {}),
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}

export interface LightboxViewerInfoProps {
  showInfoPanel: boolean
  infoPanelWidth: number | string
  isMobile: boolean
  item: GalleryItem
  formatSizeStr: (bytes: number) => string
  editRating: Rating
  handleRatingChange: (newRating: Rating) => void
  editTags: string[]
  setEditTags: (tags: string[]) => void
  tagSuggestions: string[]
  tagInput: string
  setTagInput: (val: string) => void
  hasChanges: boolean
  setHasChanges: (hasChanges: boolean) => void
  isSaving: boolean
  handleSave: () => void
}

export function LightboxViewerInfo({
  showInfoPanel,
  infoPanelWidth,
  isMobile,
  item,
  formatSizeStr,
  editRating,
  handleRatingChange,
  editTags,
  setEditTags,
  tagSuggestions,
  tagInput,
  setTagInput,
  hasChanges,
  setHasChanges,
  isSaving,
  handleSave,
}: LightboxViewerInfoProps) {
  const theme = useTheme()

  return (
    <Slide direction="left" in={showInfoPanel} mountOnEnter unmountOnExit>
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: infoPanelWidth,
          bgcolor: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderLeft: isMobile ? 'none' : `1px solid ${theme.palette.divider}`,
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, pt: 8 }}>
          <Typography variant="h6" color="text.primary" sx={{ fontWeight: 700 }}>
            Image Info
          </Typography>
        </Box>

        {/* Scrollable content */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
          {/* Metadata */}
          <Stack spacing={1} sx={{ mb: 3 }}>
            <MetaRow label="Filename" value={item.filename} />
            <MetaRow label="Dimensions" value={`${item.width} × ${item.height}`} />
            <MetaRow label="File size" value={formatSizeStr(item.fileSize || 0)} />
            {item.sha256 && <MetaRow label="SHA256" value={item.sha256} mono />}
            {item.importedAt && <MetaRow label="Imported" value={new Date(item.importedAt).toLocaleString()} />}
            {item.sourceUrl && <MetaRow label="Source" value={item.sourceUrl} />}
          </Stack>

          <Divider sx={{ borderColor: 'divider', mb: 2 }} />

          {/* Rating */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Rating
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 3 }}>
            <Select
              value={editRating}
              onChange={(e) => handleRatingChange(e.target.value as Rating)}
              sx={{
                color: 'text.primary',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(theme.palette.text.primary, 0.23) },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.text.primary },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                '& .MuiSvgIcon-root': { color: 'text.primary' },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    bgcolor: alpha(theme.palette.background.paper, 0.95),
                    backdropFilter: 'blur(10px)',
                    color: 'text.primary',
                  },
                },
              }}
            >
              <MenuItem value="safe">Safe</MenuItem>
              <MenuItem value="suggestive">Suggestive</MenuItem>
              <MenuItem value="explicit">Explicit</MenuItem>
            </Select>
          </FormControl>

          <Divider sx={{ borderColor: 'divider', mb: 2 }} />

          {/* Tags */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Tags
          </Typography>

          <Autocomplete
            multiple
            freeSolo
            options={tagSuggestions}
            filterOptions={(x) => x}
            value={editTags}
            inputValue={tagInput}
            onInputChange={(_, newValue) => setTagInput(newValue)}
            onChange={(_, newValue) => {
              const uniqueTags = Array.from(new Set(newValue as string[]))
              setEditTags(uniqueTags)
              setHasChanges(true)
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const { key, ...chipProps } = getTagProps({ index })
                return (
                  <Chip
                    {...chipProps}
                    key={key}
                    label={option}
                    size="small"
                    sx={{
                      bgcolor: alpha(theme.palette.text.primary, 0.1),
                      color: 'text.primary',
                      '& .MuiChip-deleteIcon': { color: alpha(theme.palette.text.primary, 0.5) },
                    }}
                  />
                )
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={editTags.length === 0 ? "Add tag (namespace:name)" : ""}
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'text.primary',
                    '& fieldset': { borderColor: alpha(theme.palette.text.primary, 0.23) },
                    '&:hover fieldset': { borderColor: theme.palette.text.primary },
                    '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                  },
                  '& .MuiInputBase-input::placeholder': { color: alpha(theme.palette.text.primary, 0.5) },
                }}
              />
            )}
            slotProps={{
              paper: {
                sx: {
                  bgcolor: alpha(theme.palette.background.paper, 0.95),
                  backdropFilter: 'blur(10px)',
                  color: 'text.primary',
                },
              },
            }}
          />
        </Box>

        {/* Save button */}
        <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button 
            variant="contained" 
            fullWidth 
            disabled={!hasChanges || isSaving} 
            onClick={handleSave}
            startIcon={<Save />}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>
    </Slide>
  )
}
