import { ExpandMore } from '@mui/icons-material'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t, i18n } = useTranslation()
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
    })),
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('settings.title')}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Accordion square disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">{t('settings.topBarButtons')}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, pb: 2 }}>
            <FormGroup row sx={{ px: 1 }}>
              {(
                [
                  'sort',
                  'layout',
                  'rating',
                  'favorites',
                  'selectMultiple',
                  'search',
                  'advancedSearch',
                  'themeToggle',
                ] as const
              ).map((key) => {
                const labelMap: Record<typeof key, string> = {
                  sort: t('settings.topBar.sort'),
                  layout: t('settings.topBar.layout'),
                  rating: t('settings.topBar.rating'),
                  favorites: t('settings.topBar.favorites'),
                  selectMultiple: t('settings.topBar.selectMultiple'),
                  search: t('settings.topBar.search'),
                  advancedSearch: t('settings.topBar.advancedSearch'),
                  themeToggle: t('settings.topBar.themeToggle'),
                }
                return (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        checked={topBarConfig[key]}
                        onChange={(e) =>
                          setTopBarConfig({ ...topBarConfig, [key]: e.target.checked })
                        }
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

        <Accordion
          square
          disableGutters
          elevation={0}
          sx={{ borderTop: 1, borderColor: 'divider', '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">{t('settings.masonryColumns')}</Typography>
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
            <Typography variant="subtitle2">{t('settings.gridColumns')}</Typography>
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
                {t('settings.display')}
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
                      {t('settings.displayOptions.showResultsCount')}
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
                      {t('settings.displayOptions.showMobileDetails')}
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
                      {t('settings.displayOptions.showLightboxTags')}
                    </Typography>
                  }
                />
              </FormGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('settings.hoverInfo')}
              </Typography>
              <FormGroup row>
                {(['name', 'resolution', 'tags', 'favorite', 'rating', 'download'] as const).map(
                  (key) => (
                    <FormControlLabel
                      key={key}
                      control={
                        <Checkbox
                          checked={hoverInfo[key]}
                          onChange={(e) => setHoverInfo({ ...hoverInfo, [key]: e.target.checked })}
                          size="small"
                        />
                      }
                      label={
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {t(`settings.hoverInfoOptions.${key}` as any)}
                        </Typography>
                      }
                    />
                  ),
                )}
              </FormGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('settings.galleryQuality')}
              </Typography>
              <RadioGroup
                row
                value={galleryImageQuality}
                onChange={(e) =>
                  setGalleryImageQuality(e.target.value as 'thumbnail' | 'sample' | 'original')
                }
              >
                <FormControlLabel
                  value="thumbnail"
                  control={<Radio size="small" />}
                  label={t('settings.quality.thumbnail')}
                />
                <FormControlLabel
                  value="sample"
                  control={<Radio size="small" />}
                  label={t('settings.quality.sample')}
                />
                <FormControlLabel
                  value="original"
                  control={<Radio size="small" />}
                  label={t('settings.quality.original')}
                />
              </RadioGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('settings.lightboxQuality')}
              </Typography>
              <RadioGroup
                row
                value={lightboxImageQuality}
                onChange={(e) =>
                  setLightboxImageQuality(e.target.value as 'thumbnail' | 'sample' | 'original')
                }
              >
                <FormControlLabel
                  value="thumbnail"
                  control={<Radio size="small" />}
                  label={t('settings.quality.thumbnail')}
                />
                <FormControlLabel
                  value="sample"
                  control={<Radio size="small" />}
                  label={t('settings.quality.sample')}
                />
                <FormControlLabel
                  value="original"
                  control={<Radio size="small" />}
                  label={t('settings.quality.original')}
                />
              </RadioGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('settings.downloadQuality')}
              </Typography>
              <RadioGroup
                row
                value={hoverDownloadQuality}
                onChange={(e) =>
                  setHoverDownloadQuality(e.target.value as 'thumbnail' | 'sample' | 'original')
                }
              >
                <FormControlLabel
                  value="thumbnail"
                  control={<Radio size="small" />}
                  label={t('settings.quality.thumbnail')}
                />
                <FormControlLabel
                  value="sample"
                  control={<Radio size="small" />}
                  label={t('settings.quality.sample')}
                />
                <FormControlLabel
                  value="original"
                  control={<Radio size="small" />}
                  label={t('settings.quality.original')}
                />
              </RadioGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('settings.language')}
              </Typography>
              <Select
                size="small"
                value={i18n.resolvedLanguage || 'en'}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                sx={{ width: 150 }}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="zh-CN">简体中文</MenuItem>
              </Select>
            </Box>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
