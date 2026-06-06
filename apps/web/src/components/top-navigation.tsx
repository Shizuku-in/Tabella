import {
  AppBar,
  Toolbar,
  Typography,
  Stack,
  Tooltip,
  IconButton,
  Badge,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material'
import {
  Troubleshoot,
  DownloadOutlined,
  DarkModeOutlined,
  LightModeOutlined,
  SettingsOutlined,
} from '@mui/icons-material'
import { alpha } from '@mui/material/styles'
import type { PaletteMode } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { useShallow } from 'zustand/react/shallow'
import { SearchBar } from './search-bar.tsx'
import {
  SortControl,
  LayoutControl,
  RatingControl,
  FavoritesControl,
  SelectMultipleControl,
  UserControl,
} from './top-bar-controls.tsx'
import { useDownloadTracker } from '../hooks/use-download-tracker.ts'

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
    }))
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
  const showAdvancedSearchControl = !hasBasicSearch && (topBarConfig.advancedSearch || Boolean(isAdvancedSearchActive))

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
              /Imports
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
              /Users
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
              /Server
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
              /Profile
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
                <Tooltip title="Advanced Search">
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
            <Tooltip title="Downloading archive...">
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
            <Tooltip title={mode === 'light' ? 'Dark mode' : 'Light mode'}>
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

          <Tooltip title="Settings">
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
        autoHideDuration={6000}
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
