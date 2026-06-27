/**
 * Virtualized gallery grid.
 */

import { Box, useMediaQuery, useTheme } from '@mui/material'
import { useRef } from 'react'

import type { ColumnConfig } from '../gallery/gallery-preferences-store.ts'
import type { GalleryItem, LayoutMode } from '../types.ts'
import { GalleryCard } from './gallery-card.tsx'
import { useGalleryVirtualizer } from './use-gallery-virtualizer.ts'

export interface GalleryGridLayoutProps {
  items: GalleryItem[]
  layoutMode: LayoutMode
  masonryColumns: ColumnConfig
  gridColumns: ColumnConfig
  justifiedRowHeight: ColumnConfig
  showMobileDetails: boolean
  hoverInfo: {
    name: boolean
    resolution: boolean
    tags: boolean
    favorite: boolean
    rating: boolean
    download: boolean
  }
  favoriteOverrides: Record<number, boolean>
  selectedIds: Set<number>
  galleryImageQuality: 'thumbnail' | 'sample' | 'original'
  hoverDownloadQuality: 'thumbnail' | 'sample' | 'original'
  onImageClick: (index: number) => void
  onToggleFavorite: (id: number) => void
}

export function GalleryGridLayout({
  items,
  layoutMode,
  masonryColumns,
  gridColumns,
  justifiedRowHeight,
  showMobileDetails,
  hoverInfo,
  favoriteOverrides,
  selectedIds,
  galleryImageQuality,
  hoverDownloadQuality,
  onImageClick,
  onToggleFavorite,
}: GalleryGridLayoutProps) {
  const theme = useTheme()
  const isXl = useMediaQuery(theme.breakpoints.up('xl'))
  const isLg = useMediaQuery(theme.breakpoints.up('lg'))
  const isMd = useMediaQuery(theme.breakpoints.up('md'))
  const isSm = useMediaQuery(theme.breakpoints.up('sm'))

  const getResponsiveValue = (config: ColumnConfig) => {
    if (isXl) return config.xl || config.lg || config.md || config.sm || config.xs || 1
    if (isLg) return config.lg || config.md || config.sm || config.xs || 1
    if (isMd) return config.md || config.sm || config.xs || 1
    if (isSm) return config.sm || config.xs || 1
    return config.xs || 1
  }

  const columns =
    layoutMode === 'grid' ? getResponsiveValue(gridColumns) : getResponsiveValue(masonryColumns)
  const currentJustifiedRowHeight = getResponsiveValue(justifiedRowHeight)

  const containerRef = useRef<HTMLDivElement>(null)

  const { totalHeight, visiblePositions } = useGalleryVirtualizer({
    containerRef,
    items,
    layoutMode,
    columns,
    justifiedRowHeight: currentJustifiedRowHeight,
    gap: 8,
    overscan: 2000,
  })

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width: '100%', height: totalHeight }}>
      {visiblePositions.map(({ x, y, width, height, item, index }) => (
        <Box
          key={item.id}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height,
            transform: `translate3d(${x}px, ${y}px, 0)`,
            willChange: 'transform',
          }}
        >
          <GalleryCard
            item={item}
            layoutMode={layoutMode}
            showMobileDetails={showMobileDetails}
            hoverInfo={hoverInfo}
            isFavorite={favoriteOverrides[item.id] ?? item.favorite}
            onToggleFavorite={() => onToggleFavorite(item.id)}
            onClick={() => onImageClick(index)}
            imageQuality={galleryImageQuality}
            isSelected={selectedIds.has(item.id)}
            hoverDownloadQuality={hoverDownloadQuality}
          />
        </Box>
      ))}
    </Box>
  )
}
