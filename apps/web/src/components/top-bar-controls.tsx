import {
  AdminPanelSettingsOutlined,
  ArtTrack,
  CheckCircle,
  CheckCircleOutlined,
  FavoriteBorderOutlined,
  FavoriteOutlined,
  GroupOutlined,
  InfoOutlined,
  LogoutOutlined,
  PersonOutlined,
  PlaylistAdd,
  Sort,
  StarBorderOutlined,
  StarOutlined,
} from '@mui/icons-material'
import { Avatar, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material'
import { startTransition, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'

import { useAuth } from '../auth/auth-provider.tsx'
import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import type { GallerySort, LayoutMode, RatingFilter } from '../types.ts'
import { AboutDialog } from './about-dialog.tsx'

const sortOptions: Array<{ value: GallerySort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'filename_asc', label: 'Filename A-Z' },
  { value: 'filename_desc', label: 'Filename Z-A' },
]

export function SortControl() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const { sort, setSort } = useGallerySessionStore(
    useShallow((state) => ({ sort: state.sort, setSort: state.setSort })),
  )

  return (
    <>
      <Tooltip title="Sort">
        <IconButton
          color={anchorEl ? 'primary' : 'default'}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          sx={{ p: 0.75, borderRadius: '50%' }}
        >
          <Sort fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {sortOptions.map((option) => (
          <MenuItem
            key={option.value}
            selected={sort === option.value}
            onClick={() => {
              setSort(option.value)
              setAnchorEl(null)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

const layoutOptions: Array<{ value: LayoutMode; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'justified', label: 'Justified' },
]

export function LayoutControl() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const { layoutMode, setLayoutMode } = useGalleryPreferencesStore(
    useShallow((state) => ({ layoutMode: state.layoutMode, setLayoutMode: state.setLayoutMode })),
  )

  return (
    <>
      <Tooltip title="Layout">
        <IconButton
          color={anchorEl ? 'primary' : 'default'}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          sx={{ p: 0.75, borderRadius: '50%' }}
        >
          <ArtTrack fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {layoutOptions.map((option) => (
          <MenuItem
            key={option.value}
            selected={layoutMode === option.value}
            onClick={() => {
              startTransition(() => {
                setLayoutMode(option.value)
              })
              setAnchorEl(null)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

const ratingOptions: Array<{ value: RatingFilter; label: string }> = [
  { value: 'all', label: 'All ratings' },
  { value: 'safe', label: 'Safe' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'explicit', label: 'Explicit' },
]

export function RatingControl() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const { ratingFilter, setRatingFilter } = useGallerySessionStore(
    useShallow((state) => ({
      ratingFilter: state.ratingFilter,
      setRatingFilter: state.setRatingFilter,
    })),
  )

  return (
    <>
      <Tooltip title="Rating">
        <IconButton
          color={ratingFilter !== 'all' || anchorEl ? 'primary' : 'default'}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          sx={{ p: 0.75, borderRadius: '50%' }}
        >
          {ratingFilter !== 'all' ? (
            <StarOutlined fontSize="small" />
          ) : (
            <StarBorderOutlined fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {ratingOptions.map((option) => (
          <MenuItem
            key={option.value}
            selected={ratingFilter === option.value}
            onClick={() => {
              setRatingFilter(option.value)
              setAnchorEl(null)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

export function FavoritesControl() {
  const { favoritesOnly, setFavoritesOnly } = useGallerySessionStore(
    useShallow((state) => ({
      favoritesOnly: state.favoritesOnly,
      setFavoritesOnly: state.setFavoritesOnly,
    })),
  )

  return (
    <Tooltip title="Favorites Only">
      <IconButton
        color={favoritesOnly ? 'primary' : 'default'}
        onClick={() => setFavoritesOnly(!favoritesOnly)}
        sx={{ p: 0.75, borderRadius: '50%' }}
      >
        {favoritesOnly ? (
          <FavoriteOutlined fontSize="small" />
        ) : (
          <FavoriteBorderOutlined fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  )
}

export function SelectMultipleControl() {
  const { selectionMode, setSelectionMode } = useGallerySessionStore(
    useShallow((state) => ({
      selectionMode: state.selectionMode,
      setSelectionMode: state.setSelectionMode,
    })),
  )

  return (
    <Tooltip title="Select Multiple">
      <IconButton
        color={selectionMode ? 'primary' : 'default'}
        onClick={() => setSelectionMode(!selectionMode)}
        sx={{ p: 0.75, borderRadius: '50%' }}
      >
        {selectionMode ? (
          <CheckCircle fontSize="small" />
        ) : (
          <CheckCircleOutlined fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  )
}

export function UserControl() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  const isAdmin = user?.role === 'admin'
  const isEditor = user?.role === 'admin' || user?.role === 'editor'
  const userRoleDisplay = !user?.role
    ? 'Viewer'
    : user.role.charAt(0).toUpperCase() + user.role.slice(1)

  const handleLogout = async () => {
    setAnchorEl(null)
    await logout()
  }

  return (
    <>
      <IconButton
        onClick={(event) => setAnchorEl(event.currentTarget)}
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

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem disabled sx={{ opacity: '1 !important', pb: 1.5, pt: 1 }}>
          <Stack spacing={0}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {user?.username ?? 'Guest'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {userRoleDisplay}
            </Typography>
          </Stack>
        </MenuItem>

        <MenuItem
          component={RouterLink}
          to="/profile"
          selected={location.pathname === '/profile'}
          onClick={() => setAnchorEl(null)}
        >
          <PersonOutlined fontSize="small" sx={{ mr: 1 }} />
          Profile
        </MenuItem>

        {isAdmin && (
          <MenuItem
            component={RouterLink}
            to="/admin/users"
            selected={location.pathname.startsWith('/admin/users')}
            onClick={() => setAnchorEl(null)}
          >
            <GroupOutlined fontSize="small" sx={{ mr: 1 }} />
            Users
          </MenuItem>
        )}

        {isEditor && (
          <MenuItem
            component={RouterLink}
            to="/admin/imports"
            selected={location.pathname.startsWith('/admin/imports')}
            onClick={() => setAnchorEl(null)}
          >
            <PlaylistAdd fontSize="small" sx={{ mr: 1 }} />
            Import Jobs
          </MenuItem>
        )}

        {isAdmin && (
          <MenuItem
            component={RouterLink}
            to="/admin/server"
            selected={location.pathname.startsWith('/admin/server')}
            onClick={() => setAnchorEl(null)}
          >
            <AdminPanelSettingsOutlined fontSize="small" sx={{ mr: 1 }} />
            Server Manage
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            setAnchorEl(null)
            setAboutOpen(true)
          }}
        >
          <InfoOutlined fontSize="small" sx={{ mr: 1 }} />
          About
        </MenuItem>

        <MenuItem onClick={handleLogout}>
          <LogoutOutlined fontSize="small" sx={{ mr: 1 }} />
          Sign out
        </MenuItem>
      </Menu>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}
