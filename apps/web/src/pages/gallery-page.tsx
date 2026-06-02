import { useEffect, useMemo, useRef, useState } from 'react'
import { Favorite, FavoriteBorder } from '@mui/icons-material'
import { Box, CircularProgress, IconButton, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Masonry } from '@mui/lab'
import { useGalleryUi } from '../gallery/gallery-ui-provider.tsx'
import { LazyImage } from '../components/lazy-image.tsx'
import { LightboxViewer } from '../components/lightbox-viewer.tsx'
import { listImages, toggleFavorite } from '../lib/api.ts'
import type { GalleryItem, LayoutMode, Rating } from '../types.ts'

const PAGE_SIZE = 50

const ratingTone: Record<Rating, string> = {
  safe: 'rgba(238, 241, 248, 0.86)',
  suggestive: 'rgba(255, 238, 196, 0.88)',
  explicit: 'rgba(255, 215, 215, 0.9)',
}

const ratingLabel: Record<Rating, string> = {
  safe: 'Safe',
  suggestive: 'Suggestive',
  explicit: 'Explicit',
}

export function GalleryPage() {
  const { layoutMode, searchText, sort, ratingFilter, masonryColumns, gridColumns, showMobileDetails, hoverInfo, showResultsCount, galleryImageQuality } = useGalleryUi()
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<number, boolean>>({})
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const galleryQuery = useInfiniteQuery({
    queryKey: ['gallery', searchText, sort, ratingFilter],
    queryFn: async ({ pageParam }) => {
      // Split search text by spaces into tags
      const tags = searchText.trim() ? searchText.trim().split(/\s+/) : []

      const response = await listImages({
        cursor: pageParam,
        limit: PAGE_SIZE,
        sort: sort,
        rating: ratingFilter === 'all' ? undefined : [ratingFilter],
        include_tags: tags,
      })

      return {
        items: response.items.map((item) => ({
          id: item.id,
          filename: item.original_filename,
          thumbnailSrc: item.thumbnail_url,
          sampleSrc: item.preview_url,
          originalSrc: item.original_url || undefined,
          width: item.width,
          height: item.height,
          rating: item.rating,
          tags: item.tags,
          favorite: item.is_favorite,
          importedAt: '', // We don't have importedAt in ImageListItem right now
          fileSize: item.file_size,
        }) as GalleryItem),
        nextCursor: response.next_cursor,
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const items = useMemo(
    () => galleryQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [galleryQuery.data],
  )

  useEffect(() => {
    const target = loadMoreRef.current

    if (!target || !galleryQuery.hasNextPage) {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries

        if (entry?.isIntersecting && !galleryQuery.isFetchingNextPage) {
          void galleryQuery.fetchNextPage()
        }
      },
      {
        rootMargin: '960px 0px 960px 0px',
      },
    )

    observer.observe(target)

    return () => {
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryQuery.fetchNextPage, galleryQuery.hasNextPage, galleryQuery.isFetchingNextPage])

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []

    if (searchText.trim()) {
      labels.push(`Search: ${searchText.trim()}`)
    }

    if (ratingFilter !== 'all') {
      labels.push(`Rating: ${ratingLabel[ratingFilter]}`)
    }

    labels.push(`Sort: ${sortLabel(sort)}`)

    return labels
  }, [ratingFilter, searchText, sort])

  const handleToggleFavorite = (id: number) => {
    const item = items.find((entry) => entry.id === id)
    if (!item) return

    const currentValue = favoriteOverrides[id] ?? item.favorite
    const newValue = !currentValue

    setFavoriteOverrides((currentOverrides) => ({
      ...currentOverrides,
      [id]: newValue,
    }))

    toggleFavorite(id, newValue).catch((error) => {
      console.error('Failed to toggle favorite', error)
      // Revert optimistic update on failure
      setFavoriteOverrides((currentOverrides) => ({
        ...currentOverrides,
        [id]: currentValue,
      }))
    })
  }

  if (galleryQuery.status === 'error') {
    return (
      <Box
        sx={{
          minHeight: 320,
          display: 'grid',
          placeItems: 'center',
          color: 'text.secondary',
        }}
      >
        <Stack spacing={0.75} alignItems="center" textAlign="center">
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Unable to load gallery
          </Typography>
          <Typography variant="body2">
            Please refresh and try again.
          </Typography>
        </Stack>
      </Box>
    )
  }

  const showInitialLoading = galleryQuery.isPending && items.length === 0
  const isEmpty = !showInitialLoading && items.length === 0

  return (
    <Stack spacing={1.5}>
      {showResultsCount && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          spacing={0.5}
          sx={{
            px: { xs: 0.25, md: 0.5 },
            minHeight: 24,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {showInitialLoading ? 'Loading gallery...' : `${items.length} results`}
            {galleryQuery.isFetchingNextPage ? ' · Loading more' : ''}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeFilterLabels.join(' · ')}
          </Typography>
        </Stack>
      )}

      {showInitialLoading ? (
        <Box
          sx={{
            minHeight: 360,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CircularProgress size={28} />
        </Box>
      ) : isEmpty ? (
        <Box
          sx={{
            minHeight: 320,
            display: 'grid',
            placeItems: 'center',
            color: 'text.secondary',
          }}
        >
          <Stack spacing={0.75} alignItems="center" textAlign="center">
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
              No matching images
            </Typography>
            <Typography variant="body2">
              Try clearing the search or relaxing the rating filter.
            </Typography>
          </Stack>
        </Box>
      ) : (
        <>
          {layoutMode === 'masonry' ? (
            <Masonry columns={masonryColumns} spacing={1.25}>
              {items.map((item, index) => (
                <GalleryCard
                  key={item.id}
                  item={item}
                  layoutMode={layoutMode}
                  showMobileDetails={showMobileDetails}
                  hoverInfo={hoverInfo}
                  isFavorite={favoriteOverrides[item.id] ?? item.favorite}
                  onToggleFavorite={() => handleToggleFavorite(item.id)}
                  onClick={() => setSelectedImageIndex(index)}
                  imageQuality={galleryImageQuality}
                />
              ))}
            </Masonry>
          ) : (
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
                  onToggleFavorite={() => handleToggleFavorite(item.id)}
                  onClick={() => setSelectedImageIndex(index)}
                  imageQuality={galleryImageQuality}
                />
              ))}
            </Box>
          )}

          <Box
            ref={loadMoreRef}
            sx={{
              minHeight: 42,
              display: 'grid',
              placeItems: 'center',
              color: 'text.secondary',
            }}
          >
            {galleryQuery.isFetchingNextPage ? (
              <CircularProgress size={22} />
            ) : galleryQuery.hasNextPage ? (
              <Typography variant="caption">Scroll for more</Typography>
            ) : (
              <Typography variant="caption">End of gallery</Typography>
            )}
          </Box>
        </>
      )}

      {selectedImageIndex !== null && (
        <LightboxViewer
          open={true}
          onClose={() => setSelectedImageIndex(null)}
          items={items}
          initialIndex={selectedImageIndex}
          onIndexChange={(newIndex) => {
            // Load more if we are nearing the end (e.g. last 3 items)
            if (newIndex >= items.length - 3 && galleryQuery.hasNextPage && !galleryQuery.isFetchingNextPage) {
              galleryQuery.fetchNextPage()
            }
          }}
        />
      )}
    </Stack>
  )
}

function GalleryCard({
  item,
  layoutMode,
  showMobileDetails,
  hoverInfo,
  isFavorite,
  onToggleFavorite,
  onClick,
  imageQuality,
}: {
  item: GalleryItem
  layoutMode: LayoutMode
  showMobileDetails: boolean
  hoverInfo: { name: boolean; resolution: boolean; tags: boolean; loved: boolean; rating: boolean }
  isFavorite: boolean
  onToggleFavorite: () => void
  onClick: () => void
  imageQuality: 'thumbnail' | 'sample' | 'original'
}) {
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
      <LazyImage
        src={
          imageQuality === 'original' && item.originalSrc ? item.originalSrc :
          (imageQuality === 'original' || imageQuality === 'sample') && item.sampleSrc ? item.sampleSrc :
          item.thumbnailSrc
        }
        alt={item.filename}
        aspectRatio={isGrid ? '1' : `${item.width} / ${item.height}`}
      />

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
        {hoverInfo.rating && (
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
        )}
      </Stack>

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
      </Box>
    </Box>
  )
}

function sortLabel(sort: string) {
  switch (sort) {
    case 'oldest':
      return 'Oldest'
    case 'filename_asc':
      return 'Filename A-Z'
    case 'filename_desc':
      return 'Filename Z-A'
    default:
      return 'Newest'
  }
}

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
