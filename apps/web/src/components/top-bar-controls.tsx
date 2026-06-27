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
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'

import { useAuth } from '../auth/auth-provider.tsx'
import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { ROUTES } from '../lib/routes.ts'
import type { GallerySort, LayoutMode, RatingFilter } from '../types.ts'
import { AboutDialog } from './about-dialog.tsx'

export function SortControl() {
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const { sort, setSort } = useGallerySessionStore(
    useShallow((state) => ({ sort: state.sort, setSort: state.setSort })),
  )

  const sortOptions: Array<{ value: GallerySort; label: string }> = [
    { value: 'newest', label: t('gallery.sort.newest') },
    { value: 'oldest', label: t('gallery.sort.oldest') },
    { value: 'filename_asc', label: t('gallery.sort.filenameAsc') },
    { value: 'filename_desc', label: t('gallery.sort.filenameDesc') },
    { value: 'random', label: t('gallery.sort.random') },
  ]

  return (
    <>
      <Tooltip title={t('settings.topBar.sort')}>
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

export function LayoutControl() {
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const { layoutMode, setLayoutMode } = useGalleryPreferencesStore(
    useShallow((state) => ({ layoutMode: state.layoutMode, setLayoutMode: state.setLayoutMode })),
  )

  const layoutOptions: Array<{ value: LayoutMode; label: string }> = [
    { value: 'grid', label: t('gallery.layout.grid') },
    { value: 'masonry', label: t('gallery.layout.masonry') },
    { value: 'justified', label: t('gallery.layout.justified') },
  ]

  return (
    <>
      <Tooltip title={t('settings.topBar.layout')}>
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

export function RatingControl() {
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const { ratingFilter, setRatingFilter } = useGallerySessionStore(
    useShallow((state) => ({
      ratingFilter: state.ratingFilter,
      setRatingFilter: state.setRatingFilter,
    })),
  )

  const ratingOptions: Array<{ value: RatingFilter; label: string }> = [
    { value: 'all', label: t('gallery.ratingFilter.all') },
    { value: 'safe', label: t('gallery.ratingFilter.safe') },
    { value: 'suggestive', label: t('gallery.ratingFilter.suggestive') },
    { value: 'explicit', label: t('gallery.ratingFilter.explicit') },
  ]

  return (
    <>
      <Tooltip title={t('settings.topBar.rating')}>
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
  const { t } = useTranslation()
  const { favoritesOnly, setFavoritesOnly } = useGallerySessionStore(
    useShallow((state) => ({
      favoritesOnly: state.favoritesOnly,
      setFavoritesOnly: state.setFavoritesOnly,
    })),
  )

  return (
    <Tooltip title={t('settings.topBar.favorites')}>
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
  const { t } = useTranslation()
  const { selectionMode, setSelectionMode } = useGallerySessionStore(
    useShallow((state) => ({
      selectionMode: state.selectionMode,
      setSelectionMode: state.setSelectionMode,
    })),
  )

  return (
    <Tooltip title={t('settings.topBar.selectMultiple')}>
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
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  const isAdmin = user?.role === 'admin'
  const isEditor = user?.role === 'admin' || user?.role === 'editor'
  const userRoleDisplay = !user?.role
    ? t('nav.guest')
    : user.role === 'admin' || user.role === 'editor'
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : t('nav.viewer')

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
              {user?.username ?? t('nav.guest')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {userRoleDisplay}
            </Typography>
          </Stack>
        </MenuItem>

        <MenuItem
          component={RouterLink}
          to={ROUTES.PROFILE}
          selected={location.pathname === ROUTES.PROFILE}
          onClick={() => setAnchorEl(null)}
        >
          <PersonOutlined fontSize="small" sx={{ mr: 1 }} />
          {t('nav.menuProfile')}
        </MenuItem>

        {isAdmin && (
          <MenuItem
            component={RouterLink}
            to={ROUTES.ADMIN_USERS}
            selected={location.pathname.startsWith(ROUTES.ADMIN_USERS)}
            onClick={() => setAnchorEl(null)}
          >
            <GroupOutlined fontSize="small" sx={{ mr: 1 }} />
            {t('nav.menuUsers')}
          </MenuItem>
        )}

        {isEditor && (
          <MenuItem
            component={RouterLink}
            to={ROUTES.ADMIN_IMPORTS}
            selected={location.pathname.startsWith(ROUTES.ADMIN_IMPORTS)}
            onClick={() => setAnchorEl(null)}
          >
            <PlaylistAdd fontSize="small" sx={{ mr: 1 }} />
            {t('nav.menuImports')}
          </MenuItem>
        )}

        {isAdmin && (
          <MenuItem
            component={RouterLink}
            to={ROUTES.ADMIN_SERVER}
            selected={location.pathname.startsWith(ROUTES.ADMIN_SERVER)}
            onClick={() => setAnchorEl(null)}
          >
            <AdminPanelSettingsOutlined fontSize="small" sx={{ mr: 1 }} />
            {t('nav.menuServer')}
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            setAnchorEl(null)
            setAboutOpen(true)
          }}
        >
          <InfoOutlined fontSize="small" sx={{ mr: 1 }} />
          {t('nav.menuAbout')}
        </MenuItem>

        <MenuItem onClick={handleLogout}>
          <LogoutOutlined fontSize="small" sx={{ mr: 1 }} />
          {t('nav.menuSignOut')}
        </MenuItem>
      </Menu>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}
