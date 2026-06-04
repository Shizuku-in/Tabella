import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Fade, IconButton, Paper, Stack, Tooltip, Typography, Alert, Snackbar } from '@mui/material'
import { Close, Download, SelectAll } from '@mui/icons-material'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Masonry } from '@mui/lab'
import { useGalleryUi } from '../gallery/gallery-ui-provider.tsx'
import { LightboxViewer } from '../components/lightbox-viewer.tsx'
import { listImages, toggleFavorite } from '../lib/api.ts'
import type { GalleryItem, LayoutMode } from '../types.ts'
import { GalleryCard } from '../components/gallery-card.tsx'
import { ratingLabel } from '../lib/constants.ts'

const PAGE_SIZE = 50

export function GalleryPage() {
  const { layoutMode, searchTags, sort, ratingFilter, favoritesOnly, masonryColumns, gridColumns, showMobileDetails, hoverInfo, showResultsCount, galleryImageQuality, selectionMode, setSelectionMode, selectedIds, setSelectedIds, setActiveDownloadJobId, advancedIncludeTags, excludeTags, uploadedAfter, uploadedBefore, minWidth, minHeight, aspectRatioMin, aspectRatioMax, hoverDownloadQuality } = useGalleryUi()
  const queryClient = useQueryClient()
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }))
  }
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<number, boolean>>({})
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const hasBasicSearch = searchTags.length > 0

  const galleryQuery = useInfiniteQuery({
    queryKey: ['gallery', searchTags, advancedIncludeTags, excludeTags, sort, ratingFilter, favoritesOnly, uploadedAfter, uploadedBefore, minWidth, minHeight, aspectRatioMin, aspectRatioMax],
    queryFn: async ({ pageParam }) => {
      const tags = hasBasicSearch ? searchTags : advancedIncludeTags

      const response = await listImages({
        cursor: pageParam,
        limit: PAGE_SIZE,
        sort: sort,
        rating: ratingFilter === 'all' ? undefined : [ratingFilter],
        include_tags: tags,
        exclude_tags: hasBasicSearch ? undefined : excludeTags,
        favorites_only: favoritesOnly ? true : undefined,
        uploaded_after: hasBasicSearch ? undefined : uploadedAfter,
        uploaded_before: hasBasicSearch ? undefined : uploadedBefore,
        min_width: hasBasicSearch ? undefined : minWidth,
        min_height: hasBasicSearch ? undefined : minHeight,
        aspect_ratio_min: hasBasicSearch ? undefined : aspectRatioMin,
        aspect_ratio_max: hasBasicSearch ? undefined : aspectRatioMax,
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

    if (searchTags.length > 0) {
      labels.push(`Search: ${searchTags.join(', ')}`)
    }

    if (ratingFilter !== 'all') {
      labels.push(`Rating: ${ratingLabel[ratingFilter]}`)
    }

    labels.push(`Sort: ${sortLabel(sort)}`)

    return labels
  }, [ratingFilter, searchTags, sort])

  const handleToggleFavorite = async (id: number) => {
    const item = items.find((entry) => entry.id === id)
    if (!item) return

    const currentValue = favoriteOverrides[id] ?? item.favorite
    const newValue = !currentValue

    setFavoriteOverrides((currentOverrides) => ({
      ...currentOverrides,
      [id]: newValue,
    }))

    try {
      await toggleFavorite(id, newValue)
      await queryClient.invalidateQueries({ queryKey: ['gallery'] })
    } catch (error) {
      console.error('Failed to toggle favorite', error)
      // Revert optimistic update on failure
      setFavoriteOverrides((currentOverrides) => ({
        ...currentOverrides,
        [id]: currentValue,
      }))
    }
  }

  const handleImageClick = (index: number) => {
    const item = items[index]
    if (selectionMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) {
          next.delete(item.id)
        } else {
          next.add(item.id)
        }
        return next
      })
    } else {
      setSelectedImageIndex(index)
    }
  }

  const handleDelete = () => {
    // Invalidate the gallery query to refetch
    galleryQuery.refetch()
  }

  const handleUpdate = () => {
    galleryQuery.refetch()
  }

  const handleDownloadSelected = async () => {
    if (selectedIds.size === 0) return

    try {
      const response = await fetch('/api/download-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_ids: Array.from(selectedIds) }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        showSnackbar(`Failed to start download: ${err.message || response.statusText}`, 'error')
        return
      }

      const job = await response.json()
      setActiveDownloadJobId(job.id)
      setSelectionMode(false)
    } catch (error) {
      console.error('Download error:', error)
      showSnackbar('Network error while starting download', 'error')
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(item => item.id)))
    }
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

  const activeHoverInfo = selectionMode 
    ? { name: false, resolution: false, tags: false, loved: false, rating: false }
    : hoverInfo

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
                  hoverInfo={activeHoverInfo}
                  isFavorite={favoriteOverrides[item.id] ?? item.favorite}
                  onToggleFavorite={() => handleToggleFavorite(item.id)}
                  onClick={() => handleImageClick(index)}
                  imageQuality={galleryImageQuality}
                  isSelected={selectedIds.has(item.id)}
                  hoverDownloadQuality={hoverDownloadQuality}
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
                  hoverInfo={activeHoverInfo}
                  isFavorite={favoriteOverrides[item.id] ?? item.favorite}
                  onToggleFavorite={() => handleToggleFavorite(item.id)}
                  onClick={() => handleImageClick(index)}
                  imageQuality={galleryImageQuality}
                  isSelected={selectedIds.has(item.id)}
                  hoverDownloadQuality={hoverDownloadQuality}
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

      <LightboxViewer
        open={selectedImageIndex !== null}
        onClose={() => setSelectedImageIndex(null)}
        items={items}
        initialIndex={selectedImageIndex ?? 0}
        onIndexChange={(newIndex) => {
          // Load more if we are nearing the end (e.g. last 3 items)
          if (newIndex >= items.length - 3 && galleryQuery.hasNextPage && !galleryQuery.isFetchingNextPage) {
            galleryQuery.fetchNextPage()
          }
        }}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
      />

      <Fade in={selectionMode}>
        <Paper
          elevation={6}
          sx={{
            position: 'fixed',
            bottom: { xs: 16, sm: 24, md: 32 },
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1100,
            borderRadius: 8,
            overflow: 'hidden',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ px: 2, py: 1.5, minWidth: 280 }}
          >
            <IconButton size="small" onClick={() => setSelectionMode(false)} edge="start">
              <Close />
            </IconButton>
            
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, px: 1 }}>
              {selectedIds.size} Selected
            </Typography>

            <Tooltip title="Select all loaded items">
              <IconButton size="small" onClick={handleSelectAll}>
                <SelectAll />
              </IconButton>
            </Tooltip>

            <Button
              variant="outlined"
              size="small"
              startIcon={<Download />}
              disabled={selectedIds.size === 0}
              onClick={handleDownloadSelected}
              sx={{ borderRadius: 6, textTransform: 'none', px: 2 }}
            >
              Download
            </Button>
          </Stack>
        </Paper>
      </Fade>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={handleCloseSnackbar} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
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
