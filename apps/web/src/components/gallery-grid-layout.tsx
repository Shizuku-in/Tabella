import { Box } from '@mui/material'
import { Masonry } from '@mui/lab'
import { GalleryCard } from './gallery-card.tsx'
import type { GalleryItem, LayoutMode } from '../types.ts'
import type { ColumnConfig } from '../gallery/gallery-preferences-store.ts'

const galleryLayoutStyles: Record<LayoutMode, object> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      xs: 'repeat(2, minmax(0, 1fr))',
      sm: 'repeat(3, minmax(0, 1fr))',
      lg: 'repeat(4, minmax(0, 1fr))',
      xl: 'repeat(5, minmax(0, 1fr))',
    },
    gap: 1,
  },
  masonry: {},
  justified: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    alignItems: 'flex-start',
    '&::after': {
      content: '""',
      flexGrow: 99999,
      minWidth: '220px',
    },
  },
}

export interface GalleryGridLayoutProps {
  items: GalleryItem[]
  layoutMode: LayoutMode
  masonryColumns: ColumnConfig
  gridColumns: ColumnConfig
  showMobileDetails: boolean
  hoverInfo: { name: boolean; resolution: boolean; tags: boolean; loved: boolean; rating: boolean; download: boolean }
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
  showMobileDetails,
  hoverInfo,
  favoriteOverrides,
  selectedIds,
  galleryImageQuality,
  hoverDownloadQuality,
  onImageClick,
  onToggleFavorite,
}: GalleryGridLayoutProps) {
  if (layoutMode === 'masonry') {
    return (
      <Masonry columns={masonryColumns} spacing={1.25}>
        {items.map((item, index) => (
          <GalleryCard
            key={item.id}
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
        ))}
      </Masonry>
    )
  }

  return (
    <Box
      sx={{
        ...galleryLayoutStyles[layoutMode],
        ...(layoutMode === 'grid' && {
          gridTemplateColumns: {
            xs: `repeat(${gridColumns.xs}, minmax(0, 1fr))`,
            sm: `repeat(${gridColumns.sm}, minmax(0, 1fr))`,
            lg: `repeat(${gridColumns.lg}, minmax(0, 1fr))`,
            xl: `repeat(${gridColumns.xl}, minmax(0, 1fr))`,
          },
        }),
      }}
    >
      {items.map((item, index) => (
        <GalleryCard
          key={item.id}
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
      ))}
    </Box>
  )
}
