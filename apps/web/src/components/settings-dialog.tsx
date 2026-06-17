import {
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
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      style={{
        flexGrow: 1,
        overflowY: 'auto',
      }}
      {...other}
    >
      {value === index && <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>}
    </div>
  )
}

function a11yProps(index: number) {
  return {
    id: `settings-tab-${index}`,
    'aria-controls': `settings-tabpanel-${index}`,
  }
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [activeTab, setActiveTab] = useState(0)

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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('settings.title')}</DialogTitle>
      <DialogContent
        dividers
        sx={{
          p: 0,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          height: '61.8vh',
        }}
      >
        <Tabs
          orientation={isMobile ? 'horizontal' : 'vertical'}
          variant="scrollable"
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            borderRight: isMobile ? 0 : 1,
            borderBottom: isMobile ? 1 : 0,
            borderColor: 'divider',
            minWidth: 200,
            flexShrink: 0,
          }}
        >
          <Tab
            label={t('settings.categories.layout')}
            {...a11yProps(0)}
            sx={{ alignItems: isMobile ? 'center' : 'flex-start', textAlign: 'left' }}
          />
          <Tab
            label={t('settings.categories.display')}
            {...a11yProps(1)}
            sx={{ alignItems: isMobile ? 'center' : 'flex-start', textAlign: 'left' }}
          />
          <Tab
            label={t('settings.categories.quality')}
            {...a11yProps(2)}
            sx={{ alignItems: isMobile ? 'center' : 'flex-start', textAlign: 'left' }}
          />
          <Tab
            label={t('settings.categories.general')}
            {...a11yProps(3)}
            sx={{ alignItems: isMobile ? 'center' : 'flex-start', textAlign: 'left' }}
          />
        </Tabs>

        <TabPanel value={activeTab} index={0}>
          <Stack spacing={4}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('settings.topBarButtons')}
              </Typography>
              <FormGroup row>
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
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('settings.masonryColumns')}
              </Typography>
              <Stack spacing={2} sx={{ mt: 1 }}>
                {(['xs', 'sm', 'lg', 'xl'] as const).map((breakpoint) => (
                  <Stack key={breakpoint} direction="row" spacing={3} sx={{ alignItems: 'center' }}>
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
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('settings.gridColumns')}
              </Typography>
              <Stack spacing={2} sx={{ mt: 1 }}>
                {(['xs', 'sm', 'lg', 'xl'] as const).map((breakpoint) => (
                  <Stack key={breakpoint} direction="row" spacing={3} sx={{ alignItems: 'center' }}>
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
            </Box>
          </Stack>
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <Stack spacing={4}>
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
                      sx={{ width: '45%' }}
                    />
                  ),
                )}
              </FormGroup>
            </Box>
          </Stack>
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <Stack spacing={4}>
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
          </Stack>
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('settings.language')}
            </Typography>
            <Select
              size="small"
              value={i18n.resolvedLanguage || 'en'}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              sx={{ width: 150, mt: 1 }}
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="zh-CN">简体中文</MenuItem>
            </Select>
          </Box>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
