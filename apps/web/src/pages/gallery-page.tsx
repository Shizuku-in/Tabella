import { Alert, Box, CircularProgress, Snackbar, Stack, Typography } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { GalleryGridLayout } from '../components/gallery-grid-layout.tsx'
import { GalleryHeader } from '../components/gallery-header.tsx'
import { LightboxViewer } from '../components/lightbox-viewer.tsx'
import { SelectionActionBar } from '../components/selection-action-bar.tsx'
import { useGalleryPreferencesStore } from '../gallery/gallery-preferences-store.ts'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { useGalleryQuery } from '../hooks/use-gallery-query.ts'
import { createDownloadJob, getApiErrorMessage, toggleFavorite } from '../lib/api.ts'

export function GalleryPage() {
  const { t } = useTranslation()
  const {
    layoutMode,
    masonryColumns,
    gridColumns,
    showMobileDetails,
    hoverInfo,
    showResultsCount,
    galleryImageQuality,
    hoverDownloadQuality,
  } = useGalleryPreferencesStore(
    useShallow((state) => ({
      layoutMode: state.layoutMode,
      masonryColumns: state.masonryColumns,
      gridColumns: state.gridColumns,
      showMobileDetails: state.showMobileDetails,
      hoverInfo: state.hoverInfo,
      showResultsCount: state.showResultsCount,
      galleryImageQuality: state.galleryImageQuality,
      hoverDownloadQuality: state.hoverDownloadQuality,
    })),
  )

  const { selectionMode, setSelectionMode, selectedIds, setSelectedIds, setActiveDownloadJobId } =
    useGallerySessionStore(
      useShallow((state) => ({
        selectionMode: state.selectionMode,
        setSelectionMode: state.setSelectionMode,
        selectedIds: state.selectedIds,
        setSelectedIds: state.setSelectedIds,
        setActiveDownloadJobId: state.setActiveDownloadJobId,
      })),
    )

  const queryClient = useQueryClient()
  const { items, galleryQuery, loadMoreRef } = useGalleryQuery()

  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error'
  }>({
    open: false,
    message: '',
    severity: 'success',
  })
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<number, boolean>>({})
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)

  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }))
  }

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
    void galleryQuery.refetch()
  }

  const handleUpdate = () => {
    void galleryQuery.refetch()
  }

  const handleDownloadSelected = async () => {
    if (selectedIds.size === 0) return

    try {
      const job = await createDownloadJob({
        image_ids: Array.from(selectedIds),
        quality: hoverDownloadQuality,
      })
      setActiveDownloadJobId(job.id)
      setSelectionMode(false)
    } catch (error) {
      console.error('Download error:', error)
      const message = getApiErrorMessage(error, t('gallery.errors.downloadNetwork'))
      showSnackbar(t('gallery.errors.downloadFail', { message }), 'error')
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)))
    }
  }

  if (galleryQuery.status === 'error') {
    return (
      <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
        <Stack spacing={0.75} sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {t('gallery.errors.loadFailed')}
          </Typography>
          <Typography variant="body2">{t('gallery.errors.refresh')}</Typography>
        </Stack>
      </Box>
    )
  }

  const showInitialLoading = galleryQuery.isPending && items.length === 0
  const isEmpty = !showInitialLoading && items.length === 0

  const activeHoverInfo = selectionMode
    ? {
        name: false,
        resolution: false,
        tags: false,
        favorite: false,
        rating: false,
        download: false,
      }
    : hoverInfo

  return (
    <Stack spacing={1.5}>
      {showResultsCount && (
        <GalleryHeader
          itemCount={items.length}
          isInitialLoading={showInitialLoading}
          isFetchingNextPage={galleryQuery.isFetchingNextPage}
        />
      )}

      {showInitialLoading ? (
        <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : isEmpty ? (
        <Box
          sx={{ minHeight: 320, display: 'grid', placeItems: 'center', color: 'text.secondary' }}
        >
          <Stack spacing={0.75} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {t('gallery.errors.noMatching')}
            </Typography>
            <Typography variant="body2">
              {t('gallery.errors.noMatchingDesc')}
            </Typography>
          </Stack>
        </Box>
      ) : (
        <>
          <GalleryGridLayout
            items={items}
            layoutMode={layoutMode}
            masonryColumns={masonryColumns}
            gridColumns={gridColumns}
            showMobileDetails={showMobileDetails}
            hoverInfo={activeHoverInfo}
            favoriteOverrides={favoriteOverrides}
            selectedIds={selectedIds}
            galleryImageQuality={galleryImageQuality}
            hoverDownloadQuality={hoverDownloadQuality}
            onImageClick={handleImageClick}
            onToggleFavorite={handleToggleFavorite}
          />

          <Box
            ref={loadMoreRef}
            sx={{ minHeight: 42, display: 'grid', placeItems: 'center', color: 'text.secondary' }}
          >
            {galleryQuery.isFetchingNextPage ? (
              <CircularProgress size={22} />
            ) : galleryQuery.hasNextPage ? (
              <Typography variant="caption">{t('gallery.errors.scrollMore')}</Typography>
            ) : (
              <Typography variant="caption">{t('gallery.errors.end')}</Typography>
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
          if (
            newIndex >= items.length - 3 &&
            galleryQuery.hasNextPage &&
            !galleryQuery.isFetchingNextPage
          ) {
            void galleryQuery.fetchNextPage()
          }
        }}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
        favoriteOverrides={favoriteOverrides}
        onToggleFavorite={handleToggleFavorite}
      />

      <SelectionActionBar
        selectionMode={selectionMode}
        selectedCount={selectedIds.size}
        onClose={() => setSelectionMode(false)}
        onSelectAll={handleSelectAll}
        onDownload={handleDownloadSelected}
      />

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
