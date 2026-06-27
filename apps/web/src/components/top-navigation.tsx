import {
  DarkModeOutlined,
  DownloadOutlined,
  LightModeOutlined,
  SettingsOutlined,
  Troubleshoot,
} from '@mui/icons-material'
import type { PaletteMode } from '@mui/material'
import {
  Alert,
  AppBar,
  Badge,
  CircularProgress,
  IconButton,
  Snackbar,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'

import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { useDownloadTracker } from '../hooks/use-download-tracker.ts'
import { SNACKBAR_DURATION_LONG } from '../lib/constants.ts'
import { SearchBar } from './search-bar.tsx'
import {
  FavoritesControl,
  LayoutControl,
  RatingControl,
  SelectMultipleControl,
  SortControl,
  UserControl,
} from './top-bar-controls.tsx'

export interface TopNavigationProps {
  mode: PaletteMode
  onToggleMode: () => void
  onOpenSettings: () => void
  onOpenAdvancedSearch: () => void
}

export function TopNavigation({
  mode,
  onToggleMode,
  onOpenSettings,
  onOpenAdvancedSearch,
}: TopNavigationProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const isGalleryRoute = location.pathname === '/'
  const isAdminImportsRoute = location.pathname.startsWith('/admin/imports')
  const isAdminServerRoute = location.pathname.startsWith('/admin/server')
  const isAdminUsersRoute = location.pathname.startsWith('/admin/users')
  const isProfileRoute = location.pathname.startsWith('/profile')

  const topBarConfig = useGalleryPreferencesStore((state) => state.topBarConfig)

  const {
    searchTags,
    advancedIncludeTags,
    excludeTags,
    uploadedAfter,
    uploadedBefore,
    minWidth,
    minHeight,
    aspectRatioMin,
    aspectRatioMax,
  } = useGallerySessionStore(
    useShallow((state) => ({
      searchTags: state.searchTags,
      advancedIncludeTags: state.advancedIncludeTags,
      excludeTags: state.excludeTags,
      uploadedAfter: state.uploadedAfter,
      uploadedBefore: state.uploadedBefore,
      minWidth: state.minWidth,
      minHeight: state.minHeight,
      aspectRatioMin: state.aspectRatioMin,
      aspectRatioMax: state.aspectRatioMax,
    })),
  )

  const { isDownloading, error, clearError } = useDownloadTracker()

  const isAdvancedSearchActive =
    advancedIncludeTags.length > 0 ||
    excludeTags.length > 0 ||
    uploadedAfter ||
    uploadedBefore ||
    minWidth ||
    minHeight ||
    aspectRatioMin ||
    aspectRatioMax

  const hasBasicSearch = searchTags.length > 0
  const showSearchControl = !isAdvancedSearchActive && (topBarConfig.search || hasBasicSearch)
  const showAdvancedSearchControl =
    !hasBasicSearch && (topBarConfig.advancedSearch || Boolean(isAdvancedSearchActive))

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: (theme) => alpha(theme.palette.background.paper, 0.86),
          color: 'text.primary',
        }}
      >
        <Toolbar
          sx={{
            minHeight: { xs: 50, sm: 52 },
            py: 0,
            px: { xs: 1, sm: 1.5 },
            gap: 1,
            justifyContent: 'space-between',
          }}
        >
          <Stack
            direction="row"
            spacing={0.25}
            sx={{ minWidth: 0, flex: 1, overflow: 'hidden', alignItems: 'center' }}
          >
            <Typography
              component={RouterLink}
              to="/"
              variant="h5"
              sx={{
                flexShrink: 0,
                color: 'text.primary',
                fontFamily: '"Google Sans Code", monospace',
                fontStyle: 'italic',
                fontWeight: 700,
                textDecoration: 'none',
                mr: 0.75,
                fontSize: { xs: '1.08rem', md: '1.18rem' },
                lineHeight: 1,
              }}
            >
              Tabella
            </Typography>

            {isAdminImportsRoute && (
              <Typography
                sx={{
                  color: 'text.secondary',
                  fontFamily: '"Google Sans Code", monospace',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  ml: 0.5,
                  mr: 1,
                  fontStyle: 'italic',
                }}
              >
                {t('nav.imports')}
              </Typography>
            )}

            {isAdminUsersRoute && (
              <Typography
                sx={{
                  color: 'text.secondary',
                  fontFamily: '"Google Sans Code", monospace',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  ml: 0.5,
                  mr: 1,
                  fontStyle: 'italic',
                }}
              >
                {t('nav.users')}
              </Typography>
            )}

            {isAdminServerRoute && (
              <Typography
                sx={{
                  color: 'text.secondary',
                  fontFamily: '"Google Sans Code", monospace',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  ml: 0.5,
                  mr: 1,
                  fontStyle: 'italic',
                }}
              >
                {t('nav.server')}
              </Typography>
            )}

            {isProfileRoute && (
              <Typography
                sx={{
                  color: 'text.secondary',
                  fontFamily: '"Google Sans Code", monospace',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  ml: 0.5,
                  mr: 1,
                  fontStyle: 'italic',
                }}
              >
                {t('nav.profile')}
              </Typography>
            )}

            {isGalleryRoute ? (
              <>
                {topBarConfig.sort && <SortControl />}
                {topBarConfig.layout && <LayoutControl />}
                {topBarConfig.rating && <RatingControl />}
                {topBarConfig.favorites && <FavoritesControl />}
                {topBarConfig.selectMultiple && <SelectMultipleControl />}

                {showSearchControl && <SearchBar />}

                {showAdvancedSearchControl && (
                  <Tooltip title={t('nav.advancedSearch')}>
                    <IconButton
                      color={isAdvancedSearchActive ? 'primary' : 'default'}
                      onClick={onOpenAdvancedSearch}
                      sx={{ p: 0.75, borderRadius: '50%' }}
                    >
                      <Troubleshoot fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            ) : null}
          </Stack>

          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, alignItems: 'center' }}>
            {isDownloading && (
              <Tooltip title={t('nav.downloading')}>
                <IconButton color="primary" sx={{ p: 0.75, borderRadius: '50%' }}>
                  <Badge
                    overlap="circular"
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    badgeContent={
                      <CircularProgress
                        size={12}
                        thickness={5}
                        sx={{ color: 'primary.main', position: 'absolute', right: -2, bottom: -2 }}
                      />
                    }
                  >
                    <DownloadOutlined fontSize="small" />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}

            {topBarConfig.themeToggle && (
              <Tooltip title={mode === 'light' ? t('nav.darkMode') : t('nav.lightMode')}>
                <IconButton
                  color="default"
                  onClick={onToggleMode}
                  aria-label="toggle color mode"
                  sx={{ p: 0.75, borderRadius: '50%' }}
                >
                  {mode === 'light' ? (
                    <LightModeOutlined fontSize="small" />
                  ) : (
                    <DarkModeOutlined fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            )}

            <Tooltip title={t('nav.settings')}>
              <IconButton
                color="default"
                onClick={onOpenSettings}
                aria-label="settings"
                sx={{ p: 0.75, borderRadius: '50%' }}
              >
                <SettingsOutlined fontSize="small" />
              </IconButton>
            </Tooltip>

            <UserControl />
          </Stack>
        </Toolbar>
      </AppBar>

      <Snackbar
        open={error !== null}
        autoHideDuration={SNACKBAR_DURATION_LONG}
        onClose={clearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={clearError} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  )
}
