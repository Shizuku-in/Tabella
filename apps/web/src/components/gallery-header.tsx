import { Stack, Typography } from '@mui/material'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { ratingLabel } from '../lib/constants.ts'

function useSortLabel() {
  const { t } = useTranslation()
  return (sort: string) => {
    switch (sort) {
      case 'oldest':
        return t('gallery.sort.oldest')
      case 'filename_asc':
        return t('gallery.sort.filenameAsc')
      case 'filename_desc':
        return t('gallery.sort.filenameDesc')
      default:
        return t('gallery.sort.newest')
    }
  }
}
export interface GalleryHeaderProps {
  itemCount: number
  isInitialLoading: boolean
  isFetchingNextPage: boolean
}

export function GalleryHeader({
  itemCount,
  isInitialLoading,
  isFetchingNextPage,
}: GalleryHeaderProps) {
  const { t } = useTranslation()
  const sortLabel = useSortLabel()
  const { searchTags, ratingFilter, sort } = useGallerySessionStore(
    useShallow((state) => ({
      searchTags: state.searchTags,
      ratingFilter: state.ratingFilter,
      sort: state.sort,
    })),
  )

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []

    if (searchTags.length > 0) {
      labels.push(t('gallery.filters.search', { tags: searchTags.join(', ') }))
    }

    if (ratingFilter !== 'all') {
      labels.push(t('gallery.filters.rating', { rating: ratingLabel[ratingFilter] }))
    }

    labels.push(t('gallery.filters.sort', { sort: sortLabel(sort) }))

    return labels
  }, [ratingFilter, searchTags, sort, t, sortLabel])

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={0.5}
      sx={{
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        px: { xs: 0.25, md: 0.5 },
        minHeight: 24,
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {isInitialLoading
          ? t('gallery.loading')
          : t('gallery.resultsCount', { count: itemCount })}
        {isFetchingNextPage ? t('gallery.loadingMore') : ''}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
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
  )
}
