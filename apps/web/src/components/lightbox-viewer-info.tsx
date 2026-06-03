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
import type { GalleryItem, Rating } from '../types'

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{label}</Typography>
      <Typography
        variant="body2"
        sx={{
          color: 'white',
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
          bgcolor: 'rgba(0, 0, 0, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderLeft: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, pt: 8 }}>
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>
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

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 2 }} />

          {/* Rating */}
          <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
            Rating
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 3 }}>
            <Select
              value={editRating}
              onChange={(e) => handleRatingChange(e.target.value as Rating)}
              sx={{
                color: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                '& .MuiSvgIcon-root': { color: 'white' },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    bgcolor: 'rgba(30,30,30,0.95)',
                    backdropFilter: 'blur(10px)',
                    color: 'white',
                  },
                },
              }}
            >
              <MenuItem value="safe">Safe</MenuItem>
              <MenuItem value="suggestive">Suggestive</MenuItem>
              <MenuItem value="explicit">Explicit</MenuItem>
            </Select>
          </FormControl>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 2 }} />

          {/* Tags */}
          <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
            Tags
          </Typography>

          <Autocomplete
            multiple
            freeSolo
            options={tagSuggestions}
            value={editTags}
            inputValue={tagInput}
            onInputChange={(_, newValue) => setTagInput(newValue)}
            onChange={(_, newValue) => {
              setEditTags(newValue as string[])
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
                      bgcolor: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.5)' },
                    }}
                  />
                )
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Add tag (namespace:name)"
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
                    '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                  },
                  '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.4)' },
                }}
              />
            )}
            slotProps={{
              paper: {
                sx: {
                  bgcolor: 'rgba(30,30,30,0.95)',
                  backdropFilter: 'blur(10px)',
                  color: 'white',
                },
              },
            }}
          />
        </Box>

        {/* Save button */}
        <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
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
