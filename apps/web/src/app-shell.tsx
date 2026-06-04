/* eslint-disable react-hooks/set-state-in-effect */
import { startTransition, useEffect, useRef, useState } from 'react'
import {
  PlaylistAdd,
  GroupOutlined,
  ArtTrack,
  DarkModeOutlined,
  LightModeOutlined,
  LogoutOutlined,
  Search,
  SettingsOutlined,
  Sort,
  Storage,
  StarBorderOutlined,
  StarOutlined,
  PersonOutline,
  FavoriteBorderOutlined,
  FavoriteOutlined,
} from '@mui/icons-material'
import {
  AppBar,
  Autocomplete,
  Avatar,
  Box,
  Chip,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Toolbar,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { PaletteMode } from '@mui/material'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { SettingsDialog } from './components/settings-dialog.tsx'
import { useAuth } from './auth/auth-provider.tsx'
import { useGalleryUi } from './gallery/gallery-ui-provider.tsx'
import type { GallerySort, LayoutMode, RatingFilter } from './types.ts'
import { suggestTags } from './lib/api.ts'
import { getTagColor } from './lib/tags.ts'

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
    searchTags,
    setSearchTags,
    sort,
    setSort,
    ratingFilter,
    setRatingFilter,
    favoritesOnly,
    setFavoritesOnly,
  } = useGalleryUi()
  const [searchVisible, setSearchVisible] = useState(() => searchTags.length > 0)
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null)
  const [layoutAnchor, setLayoutAnchor] = useState<HTMLElement | null>(null)
  const [ratingAnchor, setRatingAnchor] = useState<HTMLElement | null>(null)
  const [userAnchor, setUserAnchor] = useState<HTMLElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isGalleryRoute = location.pathname === '/'
  const isAdminImportsRoute = location.pathname.startsWith('/admin/imports')
  const isAdminServerRoute = location.pathname.startsWith('/admin/server')
  const isAdminUsersRoute = location.pathname.startsWith('/admin/users')
  const isProfileRoute = location.pathname.startsWith('/profile')
  const isAdmin = user?.role === 'admin'
  const userRoleDisplay = !user?.role
    ? 'Viewer'
    : user.role.charAt(0).toUpperCase() + user.role.slice(1)

  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!tagInput.trim()) {
      setTagSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const suggestions = await suggestTags(tagInput.trim(), 20)
        const currentTags = searchTags
        setTagSuggestions(suggestions.filter(s => !currentTags.includes(s)))
      } catch {
        setTagSuggestions([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [tagInput, searchTags])

  useEffect(() => {
    if (searchVisible) {
      searchInputRef.current?.focus()
    }
  }, [searchVisible])

  useEffect(() => {
    if (searchTags.length > 0) {
      setSearchVisible(true)
    }
  }, [searchTags])

  const handleLayoutSelect = (next: LayoutMode) => {
    setLayoutAnchor(null)
    startTransition(() => {
      setLayoutMode(next)
    })
  }



  const handleSearchBlur = () => {
    if (searchTags.length === 0) {
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
                    {ratingFilter !== 'all' ? <StarOutlined fontSize="small" /> : <StarBorderOutlined fontSize="small" />}
                  </IconButton>
                </Tooltip>

                <Tooltip title="Favorites Only">
                  <IconButton
                    color={favoritesOnly ? 'primary' : 'default'}
                    aria-label="toggle favorites only"
                    onClick={() => setFavoritesOnly(!favoritesOnly)}
                    sx={{ p: 0.75, borderRadius: '50%' }}
                  >
                    {favoritesOnly ? <FavoriteOutlined fontSize="small" /> : <FavoriteBorderOutlined fontSize="small" />}
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
                  <Autocomplete
                    multiple
                    freeSolo
                    options={tagSuggestions}
                    filterOptions={(x) => x}
                    value={searchTags}
                    inputValue={tagInput}
                    onInputChange={(_, newValue) => setTagInput(newValue)}
                    onChange={(_, newValue) => {
                      const uniqueTags = Array.from(new Set(newValue as string[]))
                      setSearchTags(uniqueTags)
                    }}
                    onBlur={handleSearchBlur}
                    size="small"
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
                              height: 20,
                              fontSize: '0.75rem',
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
                        inputRef={searchInputRef}
                        variant="standard"
                        placeholder={searchTags.length === 0 ? "Search" : ""}
                        fullWidth
                        onKeyDown={(event) => {
                          if (event.key === 'Escape' && searchTags.length === 0) {
                            setSearchVisible(false)
                          }
                        }}
                        sx={{
                          '& .MuiInput-root': {
                            minHeight: 30,
                            fontSize: '0.9rem',
                            color: 'text.primary',
                            '&:before': { borderBottomColor: 'divider' },
                            '&:after': { borderBottomWidth: '2px' },
                            '&:hover:not(.Mui-disabled, .Mui-error):before': { borderBottomColor: 'text.secondary' },
                            pt: 0,
                            pb: 0.5,
                            flexWrap: 'nowrap',
                            overflowX: 'auto',
                            scrollbarWidth: 'none',
                            '&::-webkit-scrollbar': { display: 'none' },
                          },
                          '& .MuiInputBase-input': {
                            py: 0.25,
                            px: 0,
                          },
                        }}
                      />
                    )}
                  />
                </Box>

                <Tooltip title="Search">
                  <IconButton
                    color={searchVisible || searchTags.length > 0 ? 'primary' : 'default'}
                    aria-label="toggle search"
                    onClick={() => {
                      if (searchVisible && searchTags.length === 0) {
                        setSearchVisible(false)
                      } else {
                        setSearchVisible(true)
                        setTimeout(() => searchInputRef.current?.focus(), 100)
                      }
                    }}
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
                src={user?.avatar_url}
                sx={{
                  width: 30,
                  height: 30,
                  bgcolor: user?.avatar_url ? 'transparent' : 'primary.main',
                  color: 'primary.contrastText',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {!user?.avatar_url && (user?.username?.slice(0, 1).toUpperCase() ?? 'U')}
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
        <MenuItem disabled sx={{ opacity: '1 !important', pb: 1.5, pt: 1 }}>
          <Stack spacing={0}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {user?.username ?? 'Guest'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {userRoleDisplay}
            </Typography>
          </Stack>
        </MenuItem>

        <MenuItem
          component={RouterLink}
          to="/profile"
          selected={location.pathname === '/profile'}
          onClick={() => setUserAnchor(null)}
        >
          <PersonOutline fontSize="small" sx={{ mr: 1 }} />
          Profile
        </MenuItem>

        {isAdmin ? (
          <MenuItem
            component={RouterLink}
            to="/admin/users"
            selected={isAdminUsersRoute}
            onClick={() => setUserAnchor(null)}
          >
            <GroupOutlined fontSize="small" sx={{ mr: 1 }} />
            Users
          </MenuItem>
        ) : null}

        {isAdmin ? (
          <MenuItem
            component={RouterLink}
            to="/admin/imports"
            selected={isAdminImportsRoute}
            onClick={() => setUserAnchor(null)}
          >
            <PlaylistAdd fontSize="small" sx={{ mr: 1 }} />
            Import Jobs
          </MenuItem>
        ) : null}

        {isAdmin ? (
          <MenuItem
            component={RouterLink}
            to="/admin/server"
            selected={isAdminServerRoute}
            onClick={() => setUserAnchor(null)}
          >
            <Storage fontSize="small" sx={{ mr: 1 }} />
            Server Manage
          </MenuItem>
        ) : null}

        <MenuItem onClick={handleLogout}>
          <LogoutOutlined fontSize="small" sx={{ mr: 1 }} />
          Sign out
        </MenuItem>
      </Menu>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

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
