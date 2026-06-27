/**
 * Advanced search dialog with date range, dimensions, and aspect-ratio filters.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { suggestTags } from '../lib/api.ts'
import { TAG_SUGGEST_DEBOUNCE_MS, TAG_SUGGEST_LIMIT } from '../lib/constants.ts'
import { getTagColor } from '../lib/tags.ts'

export interface AdvancedSearchDialogProps {
  open: boolean
  onClose: () => void
}

interface AdvancedSearchFieldErrors {
  minWidth?: string
  minHeight?: string
  aspectRatioMin?: string
  aspectRatioMax?: string
}

type NumericFieldMode = 'integer' | 'decimal'

const hideSpinButton = {
  '& input[type=number]': {
    MozAppearance: 'textfield',
  },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
    {
      WebkitAppearance: 'none',
      margin: 0,
    },
}

/**
 * Advanced search dialog with include/exclude tags, rating filter, date range,
 * dimensions, and aspect-ratio filters. Reads from and writes to
 * {@link useGallerySessionStore}; activating basic search clears these filters
 * (mutual exclusion enforced in the store).
 */
export function AdvancedSearchDialog({ open, onClose }: AdvancedSearchDialogProps) {
  const { t } = useTranslation()
  const {
    searchTags,
    setSearchTags,
    advancedIncludeTags,
    setAdvancedIncludeTags,
    excludeTags,
    setExcludeTags,
    uploadedAfter,
    setUploadedAfter,
    uploadedBefore,
    setUploadedBefore,
    minWidth,
    setMinWidth,
    minHeight,
    setMinHeight,
    aspectRatioMin,
    setAspectRatioMin,
    aspectRatioMax,
    setAspectRatioMax,
  } = useGallerySessionStore(
    useShallow((state) => ({
      searchTags: state.searchTags,
      setSearchTags: state.setSearchTags,
      advancedIncludeTags: state.advancedIncludeTags,
      setAdvancedIncludeTags: state.setAdvancedIncludeTags,
      excludeTags: state.excludeTags,
      setExcludeTags: state.setExcludeTags,
      uploadedAfter: state.uploadedAfter,
      setUploadedAfter: state.setUploadedAfter,
      uploadedBefore: state.uploadedBefore,
      setUploadedBefore: state.setUploadedBefore,
      minWidth: state.minWidth,
      setMinWidth: state.setMinWidth,
      minHeight: state.minHeight,
      setMinHeight: state.setMinHeight,
      aspectRatioMin: state.aspectRatioMin,
      setAspectRatioMin: state.setAspectRatioMin,
      aspectRatioMax: state.aspectRatioMax,
      setAspectRatioMax: state.setAspectRatioMax,
    })),
  )

  // Local state for the dialog form
  const [localIncludeTags, setLocalIncludeTags] = useState<string[]>([])
  const [tagInputInclude, setTagInputInclude] = useState('')
  const [tagSuggestionsInclude, setTagSuggestionsInclude] = useState<string[]>([])

  const [localExcludeTags, setLocalExcludeTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])

  const [localUploadedAfter, setLocalUploadedAfter] = useState<Dayjs | null>(null)
  const [localUploadedBefore, setLocalUploadedBefore] = useState<Dayjs | null>(null)
  const [localMinWidth, setLocalMinWidth] = useState<string>('')
  const [localMinHeight, setLocalMinHeight] = useState<string>('')
  const [localArMin, setLocalArMin] = useState<string>('')
  const [localArMax, setLocalArMax] = useState<string>('')
  const [errors, setErrors] = useState<AdvancedSearchFieldErrors>({})

  // Sync from context when opened
  useEffect(() => {
    if (open) {
      setLocalIncludeTags(advancedIncludeTags)
      setLocalExcludeTags(excludeTags)
      setLocalUploadedAfter(uploadedAfter ? dayjs(uploadedAfter) : null)
      setLocalUploadedBefore(uploadedBefore ? dayjs(uploadedBefore) : null)
      setLocalMinWidth(minWidth ? minWidth.toString() : '')
      setLocalMinHeight(minHeight ? minHeight.toString() : '')
      setLocalArMin(aspectRatioMin ? aspectRatioMin.toString() : '')
      setLocalArMax(aspectRatioMax ? aspectRatioMax.toString() : '')
      setErrors({})
    }
  }, [
    open,
    advancedIncludeTags,
    excludeTags,
    uploadedAfter,
    uploadedBefore,
    minWidth,
    minHeight,
    aspectRatioMin,
    aspectRatioMax,
  ])

  // Fetch tag suggestions for includeTags
  useEffect(() => {
    if (!tagInputInclude.trim()) {
      setTagSuggestionsInclude([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const suggestions = await suggestTags(tagInputInclude.trim(), TAG_SUGGEST_LIMIT)
        setTagSuggestionsInclude(suggestions.filter((s) => !localIncludeTags.includes(s)))
      } catch {
        setTagSuggestionsInclude([])
      }
    }, TAG_SUGGEST_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [tagInputInclude, localIncludeTags])

  // Fetch tag suggestions for excludeTags
  useEffect(() => {
    if (!tagInput.trim()) {
      setTagSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const suggestions = await suggestTags(tagInput.trim(), TAG_SUGGEST_LIMIT)
        setTagSuggestions(suggestions.filter((s) => !localExcludeTags.includes(s)))
      } catch {
        setTagSuggestions([])
      }
    }, TAG_SUGGEST_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [tagInput, localExcludeTags])

  /**
   * Filters and restricts numeric inputs according to the specified mode, ensuring only
   * valid numbers or integers are recorded in state. Clears relevant errors upon change.
   */
  const handleNumericFieldChange = (
    field: keyof AdvancedSearchFieldErrors,
    setter: (value: string) => void,
    value: string,
    mode: NumericFieldMode,
  ) => {
    const pattern = mode === 'integer' ? /^\d*$/ : /^\d*\.?\d*$/
    if (!pattern.test(value)) {
      return
    }

    setter(value)
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  /**
   * Validates all numeric constraints, converts local dates to ISO strings,
   * updates the global search session state, and closes the dialog.
   * If advanced filters are activated, basic search tags are cleared to enforce mutual exclusion.
   */
  const handleApply = () => {
    const nextErrors = validateAdvancedSearchFields(
      {
        minWidth: localMinWidth,
        minHeight: localMinHeight,
        aspectRatioMin: localArMin,
        aspectRatioMax: localArMax,
      },
      t,
    )
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    const nextAdvancedSearchActive =
      localIncludeTags.length > 0 ||
      localExcludeTags.length > 0 ||
      localUploadedAfter !== null ||
      localUploadedBefore !== null ||
      localMinWidth.trim() !== '' ||
      localMinHeight.trim() !== '' ||
      localArMin.trim() !== '' ||
      localArMax.trim() !== ''

    if (nextAdvancedSearchActive && searchTags.length > 0) {
      setSearchTags([])
    }

    setAdvancedIncludeTags(localIncludeTags)
    setExcludeTags(localExcludeTags)

    // OffsetDateTime requires UTC or timezone
    setUploadedAfter(localUploadedAfter ? localUploadedAfter.startOf('day').toISOString() : null)
    setUploadedBefore(localUploadedBefore ? localUploadedBefore.endOf('day').toISOString() : null)

    setMinWidth(localMinWidth ? parseInt(localMinWidth, 10) : null)
    setMinHeight(localMinHeight ? parseInt(localMinHeight, 10) : null)
    setAspectRatioMin(localArMin ? parseFloat(localArMin) : null)
    setAspectRatioMax(localArMax ? parseFloat(localArMax) : null)

    onClose()
  }

  /**
   * Clears all local form state. (Does not apply to global state until saved)
   */
  const handleClearAll = () => {
    setLocalIncludeTags([])
    setLocalExcludeTags([])
    setLocalUploadedAfter(null)
    setLocalUploadedBefore(null)
    setLocalMinWidth('')
    setLocalMinHeight('')
    setLocalArMin('')
    setLocalArMax('')
    setErrors({})
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('gallery.advancedSearch.title')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3} sx={{ py: 1 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('gallery.advancedSearch.includeTags')}
            </Typography>
            <Autocomplete
              multiple
              freeSolo
              options={tagSuggestionsInclude}
              filterOptions={(x) => x}
              value={localIncludeTags}
              inputValue={tagInputInclude}
              onInputChange={(_, newValue) => setTagInputInclude(newValue)}
              onChange={(_, newValue) => {
                const uniqueTags = Array.from(new Set(newValue as string[]))
                setLocalIncludeTags(uniqueTags)
              }}
              renderValue={(value, getItemProps) =>
                value.map((option, index) => {
                  const { key, ...chipProps } = getItemProps({ index })
                  return (
                    <Chip
                      {...chipProps}
                      key={key}
                      label={option}
                      size="small"
                      sx={{
                        bgcolor: (theme) => alpha(getTagColor(option, theme), 0.15),
                        color: (theme) => getTagColor(option, theme),
                      }}
                    />
                  )
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={
                    localIncludeTags.length === 0 ? t('gallery.advancedSearch.tagPlaceholder') : ''
                  }
                  size="small"
                  fullWidth
                />
              )}
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('gallery.advancedSearch.excludeTags')}
            </Typography>
            <Autocomplete
              multiple
              freeSolo
              options={tagSuggestions}
              filterOptions={(x) => x}
              value={localExcludeTags}
              inputValue={tagInput}
              onInputChange={(_, newValue) => setTagInput(newValue)}
              onChange={(_, newValue) => {
                const uniqueTags = Array.from(new Set(newValue as string[]))
                setLocalExcludeTags(uniqueTags)
              }}
              renderValue={(value, getItemProps) =>
                value.map((option, index) => {
                  const { key, ...chipProps } = getItemProps({ index })
                  return (
                    <Chip
                      {...chipProps}
                      key={key}
                      label={option}
                      size="small"
                      sx={{
                        bgcolor: (theme) => alpha(getTagColor(option, theme), 0.15),
                        color: (theme) => getTagColor(option, theme),
                      }}
                    />
                  )
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={
                    localExcludeTags.length === 0 ? t('gallery.advancedSearch.tagPlaceholder') : ''
                  }
                  size="small"
                  fullWidth
                />
              )}
            />
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('gallery.advancedSearch.uploadedAfter')}
              </Typography>
              <DatePicker
                value={localUploadedAfter}
                onChange={(newValue) => setLocalUploadedAfter(newValue)}
                slotProps={{
                  textField: {
                    size: 'small',
                    fullWidth: true,
                  },
                  openPickerButton: {
                    size: 'small',
                  } as any,
                  openPickerIcon: {
                    fontSize: 'small',
                  } as any,
                }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('gallery.advancedSearch.uploadedBefore')}
              </Typography>
              <DatePicker
                value={localUploadedBefore}
                onChange={(newValue) => setLocalUploadedBefore(newValue)}
                slotProps={{
                  textField: {
                    size: 'small',
                    fullWidth: true,
                  },
                  openPickerButton: {
                    size: 'small',
                  } as any,
                  openPickerIcon: {
                    fontSize: 'small',
                  } as any,
                }}
              />
            </Box>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('gallery.advancedSearch.minWidth')}
              </Typography>
              <TextField
                type="text"
                placeholder={t('gallery.advancedSearch.minWidthPlaceholder')}
                fullWidth
                size="small"
                value={localMinWidth}
                onChange={(e) =>
                  handleNumericFieldChange('minWidth', setLocalMinWidth, e.target.value, 'integer')
                }
                error={Boolean(errors.minWidth)}
                helperText={errors.minWidth}
                slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '\\d*' } }}
                sx={hideSpinButton}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('gallery.advancedSearch.minHeight')}
              </Typography>
              <TextField
                type="text"
                placeholder={t('gallery.advancedSearch.minHeightPlaceholder')}
                fullWidth
                size="small"
                value={localMinHeight}
                onChange={(e) =>
                  handleNumericFieldChange(
                    'minHeight',
                    setLocalMinHeight,
                    e.target.value,
                    'integer',
                  )
                }
                error={Boolean(errors.minHeight)}
                helperText={errors.minHeight}
                slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '\\d*' } }}
                sx={hideSpinButton}
              />
            </Box>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('gallery.advancedSearch.minAspect')}
              </Typography>
              <TextField
                type="text"
                placeholder={t('gallery.advancedSearch.minAspectPlaceholder')}
                fullWidth
                size="small"
                value={localArMin}
                onChange={(e) =>
                  handleNumericFieldChange(
                    'aspectRatioMin',
                    setLocalArMin,
                    e.target.value,
                    'decimal',
                  )
                }
                error={Boolean(errors.aspectRatioMin)}
                helperText={errors.aspectRatioMin}
                slotProps={{ htmlInput: { inputMode: 'decimal', pattern: '\\d*\\.?\\d*' } }}
                sx={hideSpinButton}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('gallery.advancedSearch.maxAspect')}
              </Typography>
              <TextField
                type="text"
                placeholder={t('gallery.advancedSearch.maxAspectPlaceholder')}
                fullWidth
                size="small"
                value={localArMax}
                onChange={(e) =>
                  handleNumericFieldChange(
                    'aspectRatioMax',
                    setLocalArMax,
                    e.target.value,
                    'decimal',
                  )
                }
                error={Boolean(errors.aspectRatioMax)}
                helperText={errors.aspectRatioMax}
                slotProps={{ htmlInput: { inputMode: 'decimal', pattern: '\\d*\\.?\\d*' } }}
                sx={hideSpinButton}
              />
            </Box>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Button onClick={handleClearAll} color="error" variant="text">
          {t('gallery.advancedSearch.clearAll')}
        </Button>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleApply} variant="contained" color="primary">
            {t('gallery.advancedSearch.apply')}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  )
}

/**
 * Validates the dimension and aspect ratio inputs for the advanced search form.
 * Ensures values are positive numbers/integers where applicable.
 */
function validateAdvancedSearchFields(
  values: {
    minWidth: string
    minHeight: string
    aspectRatioMin: string
    aspectRatioMax: string
  },
  t: any,
): AdvancedSearchFieldErrors {
  const errors: AdvancedSearchFieldErrors = {}

  /** Validates that the input is a safe integer greater than zero. */
  const validatePositiveInteger = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (!/^\d+$/.test(trimmed)) {
      return t('gallery.advancedSearch.errors.positiveInteger', { label })
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return t('gallery.advancedSearch.errors.greaterThanZero', { label })
    }
    return undefined
  }

  /** Validates that the input is a finite float/number greater than zero. */
  const validatePositiveNumber = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      return t('gallery.advancedSearch.errors.validNumber', { label })
    }
    if (parsed <= 0) {
      return t('gallery.advancedSearch.errors.greaterThanZero', { label })
    }
    return undefined
  }

  const minWidth = validatePositiveInteger(values.minWidth, 'Min width')
  if (minWidth) errors.minWidth = minWidth

  const minHeight = validatePositiveInteger(values.minHeight, 'Min height')
  if (minHeight) errors.minHeight = minHeight

  const aspectRatioMin = validatePositiveNumber(values.aspectRatioMin, 'Min aspect ratio')
  if (aspectRatioMin) errors.aspectRatioMin = aspectRatioMin

  const aspectRatioMax = validatePositiveNumber(values.aspectRatioMax, 'Max aspect ratio')
  if (aspectRatioMax) errors.aspectRatioMax = aspectRatioMax

  return errors
}
