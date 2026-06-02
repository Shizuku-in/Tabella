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
import { useGalleryUi } from '../gallery/gallery-ui-provider.tsx'

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
  } = useGalleryUi()

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Gallery Settings</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Accordion square disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">Masonry Columns</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, pb: 2 }}>
            <Stack spacing={2} sx={{ px: 1 }}>
              {(['xs', 'sm', 'lg', 'xl'] as const).map((breakpoint) => (
                <Stack key={breakpoint} direction="row" spacing={2} alignItems="center">
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
                <Stack key={breakpoint} direction="row" spacing={2} alignItems="center">
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
            </FormGroup>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Hover Info
            </Typography>
            <FormGroup row>
              {(['name', 'resolution', 'tags', 'loved', 'rating'] as const).map((key) => (
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
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
