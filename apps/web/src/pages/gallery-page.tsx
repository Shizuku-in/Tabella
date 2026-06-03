import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Masonry } from '@mui/lab'
import { useGalleryUi } from '../gallery/gallery-ui-provider.tsx'
import { LightboxViewer } from '../components/lightbox-viewer.tsx'
import { listImages, toggleFavorite, deleteImage } from '../lib/api.ts'
import type { GalleryItem, LayoutMode } from '../types.ts'
import { GalleryCard, ratingLabel } from '../components/gallery-card.tsx'

const PAGE_SIZE = 50

export function GalleryPage() {
  const { layoutMode, searchText, sort, ratingFilter, favoritesOnly, masonryColumns, gridColumns, showMobileDetails, hoverInfo, showResultsCount, galleryImageQuality } = useGalleryUi()
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<number, boolean>>({})
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const galleryQuery = useInfiniteQuery({
    queryKey: ['gallery', searchText, sort, ratingFilter, favoritesOnly],
    queryFn: async ({ pageParam }) => {
      // Split search text by spaces into tags
      const tags = searchText.trim() ? searchText.trim().split(/\s+/) : []

      const response = await listImages({
        cursor: pageParam,
        limit: PAGE_SIZE,
        sort: sort,
        rating: ratingFilter === 'all' ? undefined : [ratingFilter],
        include_tags: tags,
        favorites_only: favoritesOnly ? true : undefined,
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
          importedAt: item.imported_at,
          fileSize: item.file_size,
          sha256: item.sha256,
          sourceUrl: item.source_url || undefined,
          note: item.note || undefined,
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

  const handleDelete = (imageId: number) => {
    // Invalidate the gallery query to refetch
    galleryQuery.refetch()
  }

  const handleUpdate = () => {
    galleryQuery.refetch()
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
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}
    </Stack>
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
