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
} from '@mui/material'
import {
  ChevronLeft,
  ChevronRight,
  Close,
  Download,
  Tag,
  BrokenImage,
} from '@mui/icons-material'
import { forwardRef, useEffect, useState, useMemo } from 'react'
import type { ReactElement, Ref } from 'react'
import type { TransitionProps } from '@mui/material/transitions'
import type { GalleryItem } from '../types'
import { useGalleryUi } from '../gallery/gallery-ui-provider'

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
}

export function LightboxViewer({ open, onClose, items, initialIndex, onIndexChange }: LightboxViewerProps) {
  const { lightboxImageQuality } = useGalleryUi()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [showOverlays, setShowOverlays] = useState(true)
  const [downloadAnchorEl, setDownloadAnchorEl] = useState<null | HTMLElement>(null)
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [fileSizes, setFileSizes] = useState({ thumb: 0, sample: 0, original: 0 })

  const item = items[currentIndex]

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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          userSelect: 'none',
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
            zIndex: 1,
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
            <Typography variant="body1" sx={{ fontWeight: 600 }}>下载缩略图</Typography>
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
            <Typography variant="body1" sx={{ fontWeight: 600 }}>下载预览图</Typography>
            <Typography variant="caption" color="text.secondary">
              {item.width}×{item.height} [{formatSizeStr(fileSizes.sample)}] WEBP
            </Typography>
          </Stack>
        </MenuItem>
        
        <MenuItem onClick={() => triggerDownload(item.originalSrc || item.sampleSrc || item.thumbnailSrc, item.filename)}>
          <Stack>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>下载原文件</Typography>
            <Typography variant="caption" color="text.secondary">
              {item.width}×{item.height} [{formatSizeStr(fileSizes.original)}] {getExt(item.filename)}
            </Typography>
          </Stack>
        </MenuItem>
      </Menu>

      {/* Navigation Arrows */}
      <Fade in={showOverlays && currentIndex > 0}>
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
            right: 16,
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
      <Slide direction="up" in={showOverlays}>
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
