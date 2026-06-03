/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */
import {
  Box,
  Dialog,
  Fade,
  IconButton,
  Menu,
  MenuItem,
  Slide,
  Stack,
  Chip,
  alpha,
  CircularProgress,
  Tooltip,
  Typography,
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  ChevronLeft,
  ChevronRight,
  Close,
  Download,
  Tag,
  BrokenImage,
  InfoOutlined,
  DeleteOutline,
} from '@mui/icons-material'
import { forwardRef, useEffect, useState, useMemo } from 'react'
import type { ReactElement, Ref } from 'react'
import type { TransitionProps } from '@mui/material/transitions'
import type { GalleryItem, Rating } from '../types'
import { useGalleryUi } from '../gallery/gallery-ui-provider'
import { updateImage, deleteImage, suggestTags } from '../lib/api'
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
}

export function LightboxViewer({ open, onClose, items, initialIndex, onIndexChange, onDelete, onUpdate }: LightboxViewerProps) {
  const { lightboxImageQuality } = useGalleryUi()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const infoPanelWidth = isMobile ? '100%' : 360
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [showOverlays, setShowOverlays] = useState(true)
  const [downloadAnchorEl, setDownloadAnchorEl] = useState<null | HTMLElement>(null)
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [fileSizes, setFileSizes] = useState({ thumb: 0, sample: 0, original: 0 })

  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editRating, setEditRating] = useState<Rating>('safe')
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const item = items[currentIndex]

  useEffect(() => {
    if (item) {
      setEditRating(item.rating)
      setEditTags([...item.tags])
      setHasChanges(false)
    }
  }, [item])

  useEffect(() => {
    if (!tagInput.trim()) {
      setTagSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const suggestions = await suggestTags(tagInput.trim(), 20)
        setTagSuggestions(suggestions.filter(s => !editTags.includes(s)))
      } catch {
        setTagSuggestions([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [tagInput, editTags])

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
      fetch(item.thumbnailSrc, { method: 'HEAD' }).then(res => {
        const size = Number(res.headers.get('content-length'))
        if (!isNaN(size)) setFileSizes(s => ({ ...s, thumb: size }))
      }).catch(() => {})
    }
    
    if (item.sampleSrc) {
      fetch(item.sampleSrc, { method: 'HEAD' }).then(res => {
        const size = Number(res.headers.get('content-length'))
        if (!isNaN(size)) setFileSizes(s => ({ ...s, sample: size }))
      }).catch(() => {})
    }
  }, [item])

  const imgSrc = useMemo(() => {
    if (!item) return ''
    if (lightboxImageQuality === 'original' && item.originalSrc) return item.originalSrc
    if ((lightboxImageQuality === 'original' || lightboxImageQuality === 'sample') && item.sampleSrc) return item.sampleSrc
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

  const handleDownloadClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setDownloadAnchorEl(event.currentTarget)
  }

  const handleDownloadClose = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setDownloadAnchorEl(null)
  }

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
    if (!bytes) return '未知'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + 'KB'
    return (bytes / (1024 * 1024)).toFixed(2) + 'MB'
  }

  const getExt = (filename: string) => {
    const parts = filename.split('.')
    return parts.length > 1 ? parts.pop()?.toUpperCase() : 'UNKNOWN'
  }

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
        setCurrentIndex(prev => prev - 1)
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
      TransitionComponent={Transition}
      PaperProps={{
        sx: {
          bgcolor: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          overflow: 'hidden',
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
          <Tooltip title="Download" placement="bottom">
            <IconButton
              sx={{
                color: 'white',
                bgcolor: 'rgba(0, 0, 0, 0.25)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.4)' },
              }}
              onClick={handleDownloadClick}
            >
              <Download />
            </IconButton>
          </Tooltip>

          <Tooltip title="Info" placement="bottom">
            <IconButton
              sx={{
                color: showInfoPanel ? 'primary.main' : 'white',
                bgcolor: 'rgba(0, 0, 0, 0.25)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.4)' },
              }}
              onClick={(e) => {
                e.stopPropagation()
                setShowInfoPanel(prev => !prev)
              }}
            >
              <InfoOutlined />
            </IconButton>
          </Tooltip>

          <Tooltip title="Delete" placement="bottom">
            <IconButton
              sx={{
                color: 'white',
                bgcolor: 'rgba(0, 0, 0, 0.25)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                '&:hover': { bgcolor: 'rgba(180, 40, 40, 0.5)' },
              }}
              onClick={(e) => {
                e.stopPropagation()
                setShowDeleteDialog(true)
              }}
            >
              <DeleteOutline />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Exit" placement="bottom">
            <IconButton
              sx={{
                ml: 2,
                color: 'white',
                bgcolor: 'rgba(0, 0, 0, 0.25)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.4)' },
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
        <MenuItem onClick={() => {
          const baseName = item.filename.includes('.') ? item.filename.substring(0, item.filename.lastIndexOf('.')) : item.filename;
          triggerDownload(item.thumbnailSrc, `${baseName}_thumb.webp`)
        }}>
          <Stack>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>Thumbnail</Typography>
            <Typography variant="caption" color="text.secondary">
              {thumbWidth}×{thumbHeight} [{formatSizeStr(fileSizes.thumb)}] WEBP
            </Typography>
          </Stack>
        </MenuItem>
        
        <MenuItem onClick={() => {
          const baseName = item.filename.includes('.') ? item.filename.substring(0, item.filename.lastIndexOf('.')) : item.filename;
          triggerDownload(item.sampleSrc || item.thumbnailSrc, `${baseName}_sample.webp`)
        }}>
          <Stack>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>Sample</Typography>
            <Typography variant="caption" color="text.secondary">
              {item.width}×{item.height} [{formatSizeStr(fileSizes.sample)}] WEBP
            </Typography>
          </Stack>
        </MenuItem>
        
        <MenuItem onClick={() => triggerDownload(item.originalSrc || item.sampleSrc || item.thumbnailSrc, item.filename)}>
          <Stack>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>Original</Typography>
            <Typography variant="caption" color="text.secondary">
              {item.width}×{item.height} [{formatSizeStr(fileSizes.original)}] {getExt(item.filename)}
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
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onClick={(e) => e.stopPropagation()}
        PaperProps={{
          sx: {
            bgcolor: 'rgba(20, 20, 20, 0.95)',
            backdropFilter: 'blur(20px)',
            color: 'white',
          },
        }}
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Delete Image</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 3 }}>
            This action cannot be undone. The image and all associated data will be permanently deleted.
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setShowDeleteDialog(false)} sx={{ color: 'white' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
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
            color: 'white',
            bgcolor: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.4)' },
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
            transition: 'right 0.3s ease',
            ...(isMobile && showInfoPanel ? { display: 'none' } : {}),
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'white',
            bgcolor: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.4)' },
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
            backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            pointerEvents: 'none',
          }}
        >
          {item.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              icon={<Tag fontSize="small" />}
              sx={{
                bgcolor: alpha('#ffffff', 0.15),
                color: 'white',
                pointerEvents: 'auto',
                backdropFilter: 'blur(10px)',
              }}
            />
          ))}
        </Box>
      </Slide>
    </Dialog>
  )
}
