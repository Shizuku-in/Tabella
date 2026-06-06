import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Radio,
  RadioGroup,
  Slider,
  Switch,
  Stack,
  Typography,
} from '@mui/material'
import { ExpandMore } from '@mui/icons-material'
import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'
import { useShallow } from 'zustand/react/shallow'

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const {
    masonryColumns,
    setMasonryColumns,
    gridColumns,
    setGridColumns,
    showMobileDetails,
    setShowMobileDetails,
    hoverInfo,
    setHoverInfo,
    showResultsCount,
    setShowResultsCount,
    galleryImageQuality,
    setGalleryImageQuality,
    lightboxImageQuality,
    setLightboxImageQuality,
    showLightboxTags,
    setShowLightboxTags,
    hoverDownloadQuality,
    setHoverDownloadQuality,
    topBarConfig,
    setTopBarConfig,
  } = useGalleryPreferencesStore(
    useShallow((state) => ({
      masonryColumns: state.masonryColumns,
      setMasonryColumns: state.setMasonryColumns,
      gridColumns: state.gridColumns,
      setGridColumns: state.setGridColumns,
      showMobileDetails: state.showMobileDetails,
      setShowMobileDetails: state.setShowMobileDetails,
      hoverInfo: state.hoverInfo,
      setHoverInfo: state.setHoverInfo,
      showResultsCount: state.showResultsCount,
      setShowResultsCount: state.setShowResultsCount,
      galleryImageQuality: state.galleryImageQuality,
      setGalleryImageQuality: state.setGalleryImageQuality,
      lightboxImageQuality: state.lightboxImageQuality,
      setLightboxImageQuality: state.setLightboxImageQuality,
      showLightboxTags: state.showLightboxTags,
      setShowLightboxTags: state.setShowLightboxTags,
      hoverDownloadQuality: state.hoverDownloadQuality,
      setHoverDownloadQuality: state.setHoverDownloadQuality,
      topBarConfig: state.topBarConfig,
      setTopBarConfig: state.setTopBarConfig,
    }))
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Gallery Settings</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Accordion square disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">TopBar Buttons</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, pb: 2 }}>
            <FormGroup row sx={{ px: 1 }}>
              {(['sort', 'layout', 'rating', 'favorites', 'selectMultiple', 'search', 'advancedSearch', 'themeToggle'] as const).map((key) => {
                const labelMap: Record<typeof key, string> = {
                  sort: 'Sort',
                  layout: 'Layout',
                  rating: 'Rating',
                  favorites: 'Favorites Only',
                  selectMultiple: 'Select Multiple',
                  search: 'Search',
                  advancedSearch: 'Advanced Search',
                  themeToggle: 'Dark/Light Mode',
                }
                return (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        checked={topBarConfig[key]}
                        onChange={(e) => setTopBarConfig({ ...topBarConfig, [key]: e.target.checked })}
                        size="small"
                      />
                    }
                    label={<Typography variant="body2">{labelMap[key]}</Typography>}
                    sx={{ width: '45%' }}
                  />
                )
              })}
            </FormGroup>
          </AccordionDetails>
        </Accordion>

        <Accordion square disableGutters elevation={0} sx={{ borderTop: 1, borderColor: 'divider', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">Masonry Columns</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, pb: 2 }}>
            <Stack spacing={2} sx={{ px: 1 }}>
              {(['xs', 'sm', 'lg', 'xl'] as const).map((breakpoint) => (
                <Stack key={breakpoint} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ width: 24, fontWeight: 700 }}>
                    {breakpoint.toUpperCase()}
                  </Typography>
                  <Slider
                    value={masonryColumns[breakpoint]}
                    onChange={(_, value) =>
                      setMasonryColumns({ ...masonryColumns, [breakpoint]: value as number })
                    }
                    step={1}
                    marks
                    min={1}
                    max={10}
                    valueLabelDisplay="auto"
                    size="small"
                  />
                </Stack>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>

        <Accordion square disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">Grid Columns</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, pb: 2 }}>
            <Stack spacing={2} sx={{ px: 1 }}>
              {(['xs', 'sm', 'lg', 'xl'] as const).map((breakpoint) => (
                <Stack key={breakpoint} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ width: 24, fontWeight: 700 }}>
                    {breakpoint.toUpperCase()}
                  </Typography>
                  <Slider
                    value={gridColumns[breakpoint]}
                    onChange={(_, value) =>
                      setGridColumns({ ...gridColumns, [breakpoint]: value as number })
                    }
                    step={1}
                    marks
                    min={1}
                    max={10}
                    valueLabelDisplay="auto"
                    size="small"
                  />
                </Stack>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>

        <Box sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
          <Stack spacing={3}>
            <Box>
            <Typography variant="subtitle2" gutterBottom>
              Display
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={showResultsCount}
                    onChange={(e) => setShowResultsCount(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2">
                    Show results count and sort
                  </Typography>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={showMobileDetails}
                    onChange={(e) => setShowMobileDetails(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2">
                    Show image details on mobile
                  </Typography>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={showLightboxTags}
                    onChange={(e) => setShowLightboxTags(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2">
                    Show tags in lightbox by default
                  </Typography>
                }
              />
            </FormGroup>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Hover Info
            </Typography>
            <FormGroup row>
              {(['name', 'resolution', 'tags', 'favorite', 'rating', 'download'] as const).map((key) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      checked={hoverInfo[key]}
                      onChange={(e) => setHoverInfo({ ...hoverInfo, [key]: e.target.checked })}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{key}</Typography>}
                />
              ))}
            </FormGroup>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Image Quality (Gallery)
            </Typography>
            <RadioGroup
              row
              value={galleryImageQuality}
              onChange={(e) => setGalleryImageQuality(e.target.value as 'thumbnail' | 'sample' | 'original')}
            >
              <FormControlLabel value="thumbnail" control={<Radio size="small" />} label="Thumbnail" />
              <FormControlLabel value="sample" control={<Radio size="small" />} label="Sample" />
              <FormControlLabel value="original" control={<Radio size="small" />} label="Original" />
            </RadioGroup>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Image Quality (Lightbox)
            </Typography>
            <RadioGroup
              row
              value={lightboxImageQuality}
              onChange={(e) => setLightboxImageQuality(e.target.value as 'thumbnail' | 'sample' | 'original')}
            >
              <FormControlLabel value="thumbnail" control={<Radio size="small" />} label="Thumbnail" />
              <FormControlLabel value="sample" control={<Radio size="small" />} label="Sample" />
              <FormControlLabel value="original" control={<Radio size="small" />} label="Original" />
            </RadioGroup>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Download Quality (Bulk & Batch)
            </Typography>
            <RadioGroup
              row
              value={hoverDownloadQuality}
              onChange={(e) => setHoverDownloadQuality(e.target.value as 'thumbnail' | 'sample' | 'original')}
            >
              <FormControlLabel value="thumbnail" control={<Radio size="small" />} label="Thumbnail" />
              <FormControlLabel value="sample" control={<Radio size="small" />} label="Sample" />
              <FormControlLabel value="original" control={<Radio size="small" />} label="Original" />
            </RadioGroup>
          </Box>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
