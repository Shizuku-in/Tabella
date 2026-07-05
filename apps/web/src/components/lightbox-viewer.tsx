/**
 * Full-screen image lightbox with keyboard and gallery navigation.
 */

/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */
import {
  BrokenImage,
  ChevronLeft,
  ChevronRight,
  Close,
  DeleteOutlined,
  Download,
  FavoriteBorderOutlined,
  FavoriteOutlined,
  InfoOutlined,
  LocalOfferOutlined,
  Tag,
} from '@mui/icons-material'
import {
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  Fade,
  IconButton,
  Menu,
  MenuItem,
  Slide,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import type { TransitionProps } from '@mui/material/transitions'
import type { ReactElement, Ref } from 'react'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { useAuth } from '../auth/auth-provider.tsx'
import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { useTagSuggestions } from '../hooks/use-tag-suggestions.ts'
import { deleteImage, updateImage } from '../lib/api'
import { getTagColor } from '../lib/tags'
import type { GalleryItem, Rating } from '../types'
import { LightboxViewerInfo } from './lightbox-viewer-info'

const Transition = forwardRef(function Transition(
  props: TransitionProps & {
    children: ReactElement<any, any>
  },
  ref: Ref<unknown>,
) {
  return <Fade ref={ref} {...props} />
})

interface LightboxViewerProps {
  open: boolean
  onClose: () => void
  items: GalleryItem[]
  initialIndex: number
  onIndexChange?: (newIndex: number) => void
  onDelete?: (imageId: number) => void
  onUpdate?: () => void
  favoriteOverrides?: Record<number, boolean>
  onToggleFavorite?: (imageId: number) => void
}

/**
 * Full-screen image viewer with keyboard/gallery navigation, tag editing,
 * rating changes, and image deletion. State transitions: idle → navigating
 * (ArrowLeft/Right) → editing (rating/tags panel) → deleting (confirm dialog).
 */
export function LightboxViewer({
  open,
  onClose,
  items,
  initialIndex,
  onIndexChange,
  onDelete,
  onUpdate,
  favoriteOverrides,
  onToggleFavorite,
}: LightboxViewerProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'editor'
  const { lightboxImageQuality, showLightboxTags } = useGalleryPreferencesStore(
    useShallow((state) => ({
      lightboxImageQuality: state.lightboxImageQuality,
      showLightboxTags: state.showLightboxTags,
    })),
  )
  const setSearchTags = useGallerySessionStore((state) => state.setSearchTags)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const infoPanelWidth = isMobile ? '100%' : 360
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [showOverlays, setShowOverlays] = useState(true)
  const [isTagsExpanded, setIsTagsExpanded] = useState(showLightboxTags)
  const [downloadAnchorEl, setDownloadAnchorEl] = useState<null | HTMLElement>(null)
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [fileSizes, setFileSizes] = useState({ thumb: 0, sample: 0, original: 0 })

  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editRating, setEditRating] = useState<Rating>('safe')
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const tagSuggestions = useTagSuggestions(tagInput, editTags)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const item = items[currentIndex]
  const isFavorite = item ? (favoriteOverrides?.[item.id] ?? item.favorite) : false

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex)
      setShowOverlays(true)
      setShowInfoPanel(false)
      setShowDeleteDialog(false)
      setIsTagsExpanded(showLightboxTags)
    }
  }, [open, initialIndex, showLightboxTags])
  useEffect(() => {
    if (item) {
      setEditRating(item.rating)
      setEditTags([...item.tags])
      setHasChanges(false)
    }
    // Depend on item.id, not the whole item object — otherwise the edit state
    // resets whenever the parent re-creates the items array (e.g. cache update).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex)
      setShowOverlays(true)
    }
  }, [open, initialIndex])

  useEffect(() => {
    if (!item) return
    setFileSizes({ thumb: 0, sample: 0, original: item.fileSize || 0 })

    if (item.thumbnailSrc) {
      fetch(item.thumbnailSrc, { method: 'HEAD' })
        .then((res) => {
          const size = Number(res.headers.get('content-length'))
          if (!isNaN(size)) setFileSizes((s) => ({ ...s, thumb: size }))
        })
        .catch(() => {})
    }

    if (item.sampleSrc) {
      fetch(item.sampleSrc, { method: 'HEAD' })
        .then((res) => {
          const size = Number(res.headers.get('content-length'))
          if (!isNaN(size)) setFileSizes((s) => ({ ...s, sample: size }))
        })
        .catch(() => {})
    }
    // Depend on item.id, not the whole item object — the thumbnail/sample URLs
    // don't change for the same image, so we only need to fetch sizes on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  const imgSrc = useMemo(() => {
    if (!item) return ''
    if (lightboxImageQuality === 'original' && item.originalSrc) return item.originalSrc
    if (
      (lightboxImageQuality === 'original' || lightboxImageQuality === 'sample') &&
      item.sampleSrc
    )
      return item.sampleSrc
    return item.thumbnailSrc
  }, [item, lightboxImageQuality])

  useEffect(() => {
    setImgStatus('loading')
  }, [imgSrc])

  // Call onIndexChange when navigating near the end so the parent can load more items
  useEffect(() => {
    if (open && onIndexChange) {
      onIndexChange(currentIndex)
    }
  }, [currentIndex, open, onIndexChange])

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentIndex < items.length - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Ignore if user is interacting with an input, chip, or dropdown menu
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('.MuiAutocomplete-root') ||
        target.closest('.MuiInputBase-root') ||
        target.closest('[role="listbox"]') ||
        target.closest('[role="menu"]')
      ) {
        return
      }

      if (e.key === 'ArrowRight') {
        if (currentIndex < items.length - 1) {
          setCurrentIndex((prev) => prev + 1)
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, currentIndex, items.length])

  const handleDownloadClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setDownloadAnchorEl(event.currentTarget)
  }

  const handleDownloadClose = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setDownloadAnchorEl(null)
  }

  /**
   * Triggers a programmatic download by creating and clicking a temporary anchor tag.
   *
   * @param url - The source URL of the image to download
   * @param filename - The target filename
   */
  const triggerDownload = (url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    handleDownloadClose()
  }

  const formatSizeStr = (bytes: number) => {
    if (!bytes) return 'Unknown'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(2) + 'MB'
  }

  const getExt = (filename: string) => {
    const parts = filename.split('.')
    return parts.length > 1 ? parts.pop()?.toUpperCase() : 'UNKNOWN'
  }

  /**
   * Submits the updated rating and tags to the backend.
   * Defers the UI state update by calling `onUpdate()` so the parent can refresh.
   */
  const handleSave = async () => {
    if (!item) return
    setIsSaving(true)
    try {
      await updateImage(item.id, {
        rating: editRating,
        tags: editTags,
      })
      // Defer state update to onUpdate
      setHasChanges(false)
      onUpdate?.()
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Deletes the current image and attempts to navigate seamlessly to the next
   * or previous image to prevent the viewer from closing abruptly, unless
   * it is the last image in the gallery.
   */
  const handleDeleteConfirm = async () => {
    if (!item) return
    setIsDeleting(true)
    try {
      await deleteImage(item.id)
      setShowDeleteDialog(false)

      // Navigate: try next, then previous, then close
      if (currentIndex < items.length - 1) {
        // Next item exists, stay at same index (items will shift)
        onDelete?.(item.id)
      } else if (currentIndex > 0) {
        // Go to previous
        setCurrentIndex((prev) => prev - 1)
        onDelete?.(item.id)
      } else {
        // No more items
        onDelete?.(item.id)
        onClose()
      }
    } catch (error) {
      console.error('Failed to delete:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRatingChange = (newRating: Rating) => {
    setEditRating(newRating)
    setHasChanges(true)
  }

  if (!item) return null

  const thumbRatio = Math.min(500 / item.width, 500 / item.height)
  const thumbWidth = Math.round(item.width * thumbRatio)
  const thumbHeight = Math.round(item.height * thumbRatio)

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      slots={{ transition: Transition }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: alpha(theme.palette.background.default, 0.9),
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            overflow: 'hidden',
          },
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          ...(!isMobile && showInfoPanel ? { right: 360 } : {}),
          transition: 'right 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          userSelect: 'none',
          ...(isMobile && showInfoPanel ? { visibility: 'hidden' } : {}),
        }}
        onClick={() => {
          setShowOverlays(!showOverlays)
        }}
      >
        {imgStatus === 'loading' && (
          <CircularProgress size={48} sx={{ color: 'text.secondary', position: 'absolute' }} />
        )}

        {imgStatus === 'error' && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'action.disabledBackground',
            }}
          >
            <BrokenImage sx={{ color: 'text.disabled', fontSize: 64 }} />
          </Box>
        )}

        <Box
          component="img"
          src={imgSrc}
          alt={item.filename}
          onLoad={() => setImgStatus('loaded')}
          onError={() => setImgStatus('error')}
          sx={{
            display: imgStatus === 'error' ? 'none' : 'block',
            opacity: imgStatus === 'loaded' ? 1 : 0,
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transition: 'opacity 0.3s ease',
          }}
        />
      </Box>

      {/* Top Icons */}
      <Slide direction="down" in={showOverlays}>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 3,
          }}
        >
          <Tooltip title={t('gallery.viewer.download')} placement="bottom">
            <IconButton
              sx={{
                color: 'action.active',
                bgcolor: 'background.paper',
                '&:hover': { bgcolor: 'background.default' },
              }}
              onClick={handleDownloadClick}
            >
              <Download />
            </IconButton>
          </Tooltip>

          <Tooltip
            title={isFavorite ? t('gallery.viewer.removeFavorite') : t('gallery.viewer.favorite')}
            placement="bottom"
          >
            <IconButton
              sx={{
                color: isFavorite ? 'primary.main' : 'action.active',
                bgcolor: 'background.paper',
                '&:hover': { bgcolor: 'background.default' },
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (item) {
                  onToggleFavorite?.(item.id)
                }
              }}
            >
              {isFavorite ? <FavoriteOutlined /> : <FavoriteBorderOutlined />}
            </IconButton>
          </Tooltip>

          <Tooltip title={t('gallery.viewer.info')} placement="bottom">
            <IconButton
              sx={{
                color: showInfoPanel ? 'primary.main' : 'action.active',
                bgcolor: 'background.paper',
                '&:hover': { bgcolor: 'background.default' },
              }}
              onClick={(e) => {
                e.stopPropagation()
                setShowInfoPanel((prev) => !prev)
              }}
            >
              <InfoOutlined />
            </IconButton>
          </Tooltip>

          {canEdit && (
            <Tooltip title={t('gallery.viewer.delete')} placement="bottom">
              <IconButton
                sx={{
                  color: 'action.active',
                  bgcolor: 'background.paper',
                  '&:hover': { bgcolor: 'error.main', color: 'error.contrastText' },
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteDialog(true)
                }}
              >
                <DeleteOutlined />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title={t('gallery.viewer.exit')} placement="bottom">
            <IconButton
              sx={{
                ml: 2,
                color: 'action.active',
                bgcolor: 'background.paper',
                '&:hover': { bgcolor: 'background.default' },
              }}
              onClick={onClose}
            >
              <Close />
            </IconButton>
          </Tooltip>
        </Stack>
      </Slide>

      <Menu
        anchorEl={downloadAnchorEl}
        open={Boolean(downloadAnchorEl)}
        onClose={() => handleDownloadClose()}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            const baseName = item.filename.includes('.')
              ? item.filename.substring(0, item.filename.lastIndexOf('.'))
              : item.filename
            triggerDownload(item.thumbnailSrc, `${baseName}_thumb.webp`)
          }}
        >
          <Stack>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {t('gallery.quality.thumbnail')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {thumbWidth}×{thumbHeight} [{formatSizeStr(fileSizes.thumb)}] WEBP
            </Typography>
          </Stack>
        </MenuItem>

        <MenuItem
          onClick={() => {
            const baseName = item.filename.includes('.')
              ? item.filename.substring(0, item.filename.lastIndexOf('.'))
              : item.filename
            triggerDownload(item.sampleSrc || item.thumbnailSrc, `${baseName}_sample.webp`)
          }}
        >
          <Stack>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {t('gallery.quality.sample')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {item.width}×{item.height} [{formatSizeStr(fileSizes.sample)}] WEBP
            </Typography>
          </Stack>
        </MenuItem>

        <MenuItem
          onClick={() =>
            triggerDownload(item.originalSrc || item.sampleSrc || item.thumbnailSrc, item.filename)
          }
        >
          <Stack>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {t('gallery.quality.original')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {item.width}×{item.height} [{formatSizeStr(fileSizes.original)}]{' '}
              {getExt(item.filename)}
            </Typography>
          </Stack>
        </MenuItem>
      </Menu>

      {/* Info Panel */}
      <LightboxViewerInfo
        showInfoPanel={showInfoPanel}
        infoPanelWidth={infoPanelWidth}
        isMobile={isMobile}
        item={item}
        formatSizeStr={formatSizeStr}
        editRating={editRating}
        handleRatingChange={handleRatingChange}
        editTags={editTags}
        setEditTags={setEditTags}
        tagSuggestions={tagSuggestions}
        tagInput={tagInput}
        setTagInput={setTagInput}
        hasChanges={hasChanges}
        setHasChanges={setHasChanges}
        isSaving={isSaving}
        handleSave={handleSave}
        canEdit={canEdit}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            {t('gallery.viewer.deleteTitle')}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', mb: 3, whiteSpace: 'pre-line' }}
          >
            {t('gallery.viewer.deleteWarning')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowDeleteDialog(false)} sx={{ color: 'text.primary' }}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
            >
              {isDeleting ? t('gallery.viewer.deleting') : t('gallery.viewer.delete')}
            </Button>
          </Stack>
        </Box>
      </Dialog>

      {/* Navigation Arrows */}
      <Fade in={showOverlays && currentIndex > 0 && !(isMobile && showInfoPanel)}>
        <IconButton
          onClick={handlePrev}
          sx={{
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'action.active',
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'background.default' },
          }}
        >
          <ChevronLeft fontSize="large" />
        </IconButton>
      </Fade>

      <Fade in={showOverlays && currentIndex < items.length - 1}>
        <IconButton
          onClick={handleNext}
          sx={{
            position: 'absolute',
            right: !isMobile && showInfoPanel ? 376 : 16,
            transition: theme.transitions.create('right', {
              easing: showInfoPanel
                ? theme.transitions.easing.easeOut
                : theme.transitions.easing.sharp,
              duration: showInfoPanel
                ? theme.transitions.duration.enteringScreen
                : theme.transitions.duration.leavingScreen,
            }),
            ...(isMobile && showInfoPanel ? { display: 'none' } : {}),
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'action.active',
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'background.default' },
          }}
        >
          <ChevronRight fontSize="large" />
        </IconButton>
      </Fade>

      {/* Bottom Tags */}
      <Slide direction="up" in={showOverlays && !showInfoPanel}>
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            p: 2,
            pt: 6,
            backgroundImage: `linear-gradient(0deg, ${alpha(theme.palette.background.default, 0.9)} 0%, ${alpha(theme.palette.background.default, 0)} 100%)`,
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              maxWidth: { xs: 'calc(100vw - 80px)', md: '70%', lg: '50%' },
              pointerEvents: 'auto',
            }}
          >
            <Tooltip
              title={isTagsExpanded ? t('gallery.viewer.hideTags') : t('gallery.viewer.showTags')}
              placement="right"
            >
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsTagsExpanded((prev) => !prev)
                }}
                sx={{
                  color: isTagsExpanded ? 'primary.main' : 'text.secondary',
                  mb: 1,
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                  backdropFilter: 'blur(10px)',
                  border: '1px solid',
                  borderColor: isTagsExpanded ? alpha(theme.palette.primary.main, 0.5) : 'divider',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.background.default, 0.8),
                  },
                }}
              >
                <LocalOfferOutlined fontSize="small" />
              </IconButton>
            </Tooltip>

            <Collapse in={isTagsExpanded}>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                  maxHeight: '25vh',
                  overflowY: 'auto',
                  // Hide scrollbar but keep functionality
                  msOverflowStyle: 'none',
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': { display: 'none' },
                }}
              >
                {item.tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    icon={<Tag fontSize="small" />}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSearchTags([tag])
                      onClose()
                    }}
                    sx={{
                      bgcolor: alpha(getTagColor(tag, theme), 0.2),
                      color: getTagColor(tag, theme),
                      backdropFilter: 'blur(10px)',
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: getTagColor(tag, theme),
                        color: theme.palette.getContrastText(getTagColor(tag, theme)),
                      },
                    }}
                  />
                ))}
              </Box>
            </Collapse>
          </Box>
        </Box>
      </Slide>
    </Dialog>
  )
}
