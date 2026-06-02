/* eslint-disable react-hooks/set-state-in-effect */
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import {
  PlaylistAdd,
  ArtTrack,
  DarkModeOutlined,
  LightModeOutlined,
  LogoutOutlined,
  Search,
  SettingsOutlined,
  Sort,
  Star,
  ExpandMore,
} from '@mui/icons-material'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  FormGroup,
  IconButton,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Slider,
  Switch,
  Stack,
  TextField,
  Tooltip,
  Toolbar,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { PaletteMode } from '@mui/material'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth/auth-provider.tsx'
import { useGalleryUi } from './gallery/gallery-ui-provider.tsx'
import type { GallerySort, LayoutMode, RatingFilter } from './types.ts'

interface AppShellProps {
  mode: PaletteMode
  onToggleMode: () => void
}

const sortOptions: Array<{ value: GallerySort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'filename_asc', label: 'Filename A-Z' },
  { value: 'filename_desc', label: 'Filename Z-A' },
]

const layoutOptions: Array<{ value: LayoutMode; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'justified', label: 'Justified' },
]

const ratingOptions: Array<{ value: RatingFilter; label: string }> = [
  { value: 'all', label: 'All ratings' },
  { value: 'safe', label: 'Safe' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'explicit', label: 'Explicit' },
]

export default function AppShell({ mode, onToggleMode }: AppShellProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const {
    layoutMode,
    setLayoutMode,
    searchText,
    setSearchText,
    sort,
    setSort,
    ratingFilter,
    setRatingFilter,
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
  const [searchVisible, setSearchVisible] = useState(() => searchText.length > 0)
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null)
  const [layoutAnchor, setLayoutAnchor] = useState<HTMLElement | null>(null)
  const [ratingAnchor, setRatingAnchor] = useState<HTMLElement | null>(null)
  const [userAnchor, setUserAnchor] = useState<HTMLElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isGalleryRoute = location.pathname === '/'
  const isAdminRoute = location.pathname.startsWith('/admin/imports')
  const isAdmin = user?.role === 'admin'
  const userSummary = useMemo(
    () => `${user?.username ?? 'User'} · ${user?.role === 'admin' ? 'Admin' : 'Viewer'}`,
    [user?.role, user?.username],
  )

  useEffect(() => {
    if (searchVisible) {
      searchInputRef.current?.focus()
    }
  }, [searchVisible])

  useEffect(() => {
    if (searchText.length > 0) {
      setSearchVisible(true)
    }
  }, [searchText])

  const handleLayoutSelect = (next: LayoutMode) => {
    setLayoutAnchor(null)
    startTransition(() => {
      setLayoutMode(next)
    })
  }

  const handleSearchToggle = () => {
    setSearchVisible((current) => !current)
  }

  const handleSearchBlur = () => {
    if (searchText.trim().length === 0) {
      setSearchVisible(false)
    }
  }

  const handleLogout = async () => {
    setUserAnchor(null)
    await logout()
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
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
            alignItems="center"
            sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}
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

            {isAdminRoute && (
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
                / Imports
              </Typography>
            )}

            {isGalleryRoute ? (
              <>
                <Tooltip title="Sort">
                  <IconButton
                    color={sortAnchor ? 'primary' : 'default'}
                    aria-label="sort options"
                    onClick={(event) => setSortAnchor(event.currentTarget)}
                    sx={{ p: 0.75, borderRadius: '50%' }}
                  >
                    <Sort fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Layout">
                  <IconButton
                    color={layoutAnchor ? 'primary' : 'default'}
                    aria-label="layout options"
                    onClick={(event) => setLayoutAnchor(event.currentTarget)}
                    sx={{ p: 0.75, borderRadius: '50%' }}
                  >
                    <ArtTrack fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Rating">
                  <IconButton
                    color={ratingFilter !== 'all' || ratingAnchor ? 'primary' : 'default'}
                    aria-label="rating options"
                    onClick={(event) => setRatingAnchor(event.currentTarget)}
                    sx={{ p: 0.75, borderRadius: '50%' }}
                  >
                    <Star fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Box
                  sx={{
                    width: searchVisible ? { xs: 150, sm: 184, md: 212 } : 0,
                    opacity: searchVisible ? 1 : 0,
                    transform: searchVisible ? 'translateX(0)' : 'translateX(14px)',
                    transformOrigin: 'right center',
                    overflow: 'hidden',
                    pointerEvents: searchVisible ? 'auto' : 'none',
                    transition:
                      'width 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms ease, transform 180ms cubic-bezier(0.4, 0, 0.2, 1), margin 180ms cubic-bezier(0.4, 0, 0.2, 1)',
                    ml: searchVisible ? 1.25 : 0,
                    mr: searchVisible ? 0.25 : 0,
                  }}
                >
                  <TextField
                    inputRef={searchInputRef}
                    variant="standard"
                    size="small"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    onBlur={handleSearchBlur}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && searchText.trim().length === 0) {
                        setSearchVisible(false)
                      }
                    }}
                    placeholder="Search"
                    fullWidth
                    InputProps={{
                      disableUnderline: false,
                    }}
                    sx={{
                      '& .MuiInput-root': {
                        height: 30,
                        fontSize: '0.9rem',
                        color: 'text.primary',
                        '&:before': {
                          borderBottomColor: 'divider',
                        },
                        '&:after': {
                          borderBottomWidth: '2px',
                        },
                        '&:hover:not(.Mui-disabled, .Mui-error):before': {
                          borderBottomColor: 'text.secondary',
                        },
                      },
                      '& .MuiInput-input': {
                        py: 0.25,
                        px: 0,
                        '&::placeholder': {
                          opacity: 0.66,
                        },
                      },
                    }}
                  />
                </Box>

                <Tooltip title="Search">
                  <IconButton
                    color={searchVisible || searchText ? 'primary' : 'default'}
                    aria-label="toggle search"
                    onClick={handleSearchToggle}
                    sx={{ p: 0.75, borderRadius: '50%' }}
                  >
                    <Search fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : null}
          </Stack>

          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
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

            <Tooltip title="Settings">
              <IconButton
                color="default"
                onClick={() => setSettingsOpen(true)}
                aria-label="settings"
                sx={{ p: 0.75, borderRadius: '50%' }}
              >
                <SettingsOutlined fontSize="small" />
              </IconButton>
            </Tooltip>

            <IconButton
              onClick={(event) => setUserAnchor(event.currentTarget)}
              aria-label="user menu"
              sx={{ p: 0.25 }}
            >
              <Avatar
                sx={{
                  width: 30,
                  height: 30,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {user?.username?.slice(0, 1).toUpperCase() ?? 'U'}
              </Avatar>
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={sortAnchor}
        open={Boolean(sortAnchor)}
        onClose={() => setSortAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {sortOptions.map((option) => (
          <MenuItem
            key={option.value}
            selected={sort === option.value}
            onClick={() => {
              setSort(option.value)
              setSortAnchor(null)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={layoutAnchor}
        open={Boolean(layoutAnchor)}
        onClose={() => setLayoutAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {layoutOptions.map((option) => (
          <MenuItem
            key={option.value}
            selected={layoutMode === option.value}
            onClick={() => handleLayoutSelect(option.value)}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={ratingAnchor}
        open={Boolean(ratingAnchor)}
        onClose={() => setRatingAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {ratingOptions.map((option) => (
          <MenuItem
            key={option.value}
            selected={ratingFilter === option.value}
            onClick={() => {
              setRatingFilter(option.value)
              setRatingAnchor(null)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={userAnchor}
        open={Boolean(userAnchor)}
        onClose={() => setUserAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem disabled>
          <Stack spacing={0.25}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {user?.username ?? 'Guest'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {userSummary}
            </Typography>
          </Stack>
        </MenuItem>

        {isAdmin ? (
          <MenuItem
            component={RouterLink}
            to="/admin/imports"
            selected={isAdminRoute}
            onClick={() => setUserAnchor(null)}
          >
            <PlaylistAdd fontSize="small" sx={{ mr: 1 }} />
            Import Jobs
          </MenuItem>
        ) : null}

        <MenuItem onClick={handleLogout}>
          <LogoutOutlined fontSize="small" sx={{ mr: 1 }} />
          Sign out
        </MenuItem>
      </Menu>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
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
          <Button onClick={() => setSettingsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Container
        maxWidth={false}
        sx={{
          px: { xs: 1, sm: 1.5, lg: 2 },
          py: { xs: 1, sm: 1.25, lg: 1.5 },
        }}
      >
        <Outlet />
      </Container>
    </Box>
  )
}
