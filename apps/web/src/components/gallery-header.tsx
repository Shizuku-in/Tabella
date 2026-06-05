import { Stack, Typography } from '@mui/material'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { useShallow } from 'zustand/react/shallow'
import { ratingLabel } from '../lib/constants.ts'
import { useMemo } from 'react'

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

export interface GalleryHeaderProps {
  itemCount: number
  isInitialLoading: boolean
  isFetchingNextPage: boolean
}

export function GalleryHeader({ itemCount, isInitialLoading, isFetchingNextPage }: GalleryHeaderProps) {
  const { searchTags, ratingFilter, sort } = useGallerySessionStore(
    useShallow((state) => ({
      searchTags: state.searchTags,
      ratingFilter: state.ratingFilter,
      sort: state.sort,
    }))
  )

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

  return (
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
        {isInitialLoading ? 'Loading gallery...' : `${itemCount} results`}
        {isFetchingNextPage ? ' · Loading more' : ''}
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
  )
}
