import { DownloadOutlined, Favorite, FavoriteBorder } from '@mui/icons-material'
import { Box, IconButton, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { LazyImage } from './lazy-image.tsx'
import type { GalleryItem, LayoutMode } from '../types.ts'

import { ratingLabel, ratingTone } from '../lib/constants.ts'

export interface GalleryCardProps {
  item: GalleryItem
  layoutMode: LayoutMode
  showMobileDetails: boolean
  hoverInfo: { name: boolean; resolution: boolean; tags: boolean; loved: boolean; rating: boolean; download: boolean }
  isFavorite: boolean
  onToggleFavorite: () => void
  onClick: () => void
  imageQuality: 'thumbnail' | 'sample' | 'original'
  hoverDownloadQuality: 'thumbnail' | 'sample' | 'original'
  isSelected?: boolean
}

export function GalleryCard({
  item,
  layoutMode,
  showMobileDetails,
  hoverInfo,
  isFavorite,
  onToggleFavorite,
  onClick,
  imageQuality,
  hoverDownloadQuality,
  isSelected,
}: GalleryCardProps) {
  const isJustified = layoutMode === 'justified'
  const isGrid = layoutMode === 'grid'

  return (
    <Box
      className="gallery-card"
      onClick={onClick}
      sx={{
        position: 'relative',
        display: 'inline-block',
        width: '100%',
        overflow: 'hidden',
        cursor: 'pointer',
        borderRadius: 0.75,
        maxHeight: isGrid ? 'none' : '60vh',
        breakInside: layoutMode === 'masonry' ? 'avoid' : 'auto',
        bgcolor: 'rgba(17, 20, 29, 0.04)',
        ...(isJustified
          ? {
              flexGrow: item.width / item.height,
              flexBasis: `${Math.max(220, Math.round((item.width / item.height) * 240))}px`,
              width: 'auto',
            }
          : null),
      }}
    >
      {isSelected && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            bgcolor: 'rgba(0, 0, 0, 0.4)',
            border: '2px solid',
            borderColor: 'primary.main',
            borderRadius: 'inherit',
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              width: 24,
              height: 24,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </Box>
        </Box>
      )}
      <LazyImage
        src={
          imageQuality === 'original' && item.originalSrc ? item.originalSrc :
          (imageQuality === 'original' || imageQuality === 'sample') && item.sampleSrc ? item.sampleSrc :
          item.thumbnailSrc
        }
        alt={item.filename}
        aspectRatio={isGrid ? '1' : `${item.width} / ${item.height}`}
      />

      {hoverInfo.rating && (
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          sx={{
            position: 'absolute',
            insetInline: 0,
            top: 0,
            p: 1,
            opacity: { xs: showMobileDetails ? 1 : 0, md: 0 },
            transition: 'opacity 0.18s ease',
            '.gallery-card:hover &': {
              opacity: 1,
            },
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 24,
              px: 1,
              borderRadius: 999,
              fontSize: '0.68rem',
              fontWeight: 700,
              color: 'rgba(18, 23, 35, 0.94)',
              bgcolor: ratingTone[item.rating],
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              transform: 'translateZ(0)',
            }}
          >
            {ratingLabel[item.rating]}
          </Box>
        </Stack>
      )}

      {(hoverInfo.name || hoverInfo.resolution || hoverInfo.tags || hoverInfo.loved) && (
        <Box
          sx={{
            position: 'absolute',
            insetInline: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 1,
            p: 1,
            color: 'common.white',
            background:
              'linear-gradient(180deg, rgba(6,9,14,0) 0%, rgba(6,9,14,0.28) 34%, rgba(6,9,14,0.78) 100%)',
            opacity: { xs: showMobileDetails ? 1 : 0, md: 0 },
            transform: { xs: 'translateY(0)', md: 'translateY(10px)' },
            transition: 'opacity 0.18s ease, transform 0.18s ease',
            willChange: 'opacity, transform',
            backfaceVisibility: 'hidden',
            '.gallery-card:hover &': {
              opacity: 1,
              transform: 'translateY(0)',
            },
          }}
        >
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            {hoverInfo.name && (
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  textShadow: '0 1px 6px rgba(0,0,0,0.45)',
                }}
                noWrap
              >
                {item.filename}
              </Typography>
            )}
            {(hoverInfo.resolution || hoverInfo.tags) && (
              <Typography
                variant="caption"
                sx={{
                  color: 'rgba(255,255,255,0.74)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }}
                noWrap
              >
                {[
                  hoverInfo.resolution ? `${item.width} × ${item.height}` : null,
                  hoverInfo.tags ? item.tags.slice(0, 2).join(' ') : null,
                ].filter(Boolean).join(' · ')}
              </Typography>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {hoverInfo.download && (
              <IconButton
                size="small"
                component="a"
                href={
                  hoverDownloadQuality === 'original' && item.originalSrc ? item.originalSrc :
                  (hoverDownloadQuality === 'original' || hoverDownloadQuality === 'sample') && item.sampleSrc ? item.sampleSrc :
                  item.thumbnailSrc
                }
                download={item.filename}
                onClick={(e) => {
                  e.stopPropagation()
                }}
                aria-label="download"
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  color: 'common.white',
                  bgcolor: alpha('#ffffff', 0.12),
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  transform: 'translateZ(0)',
                  '&:hover': {
                    bgcolor: alpha('#ffffff', 0.18),
                  },
                }}
              >
                <DownloadOutlined fontSize="small" />
              </IconButton>
            )}
            {hoverInfo.loved && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite()
                }}
                aria-label={isFavorite ? 'remove favorite' : 'add favorite'}
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  color: 'common.white',
                  bgcolor: alpha('#ffffff', 0.12),
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  transform: 'translateZ(0)',
                  '&:hover': {
                    bgcolor: alpha('#ffffff', 0.18),
                  },
                }}
              >
                {isFavorite ? <Favorite fontSize="small" /> : <FavoriteBorder fontSize="small" />}
              </IconButton>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  )
}
