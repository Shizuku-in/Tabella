import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import type { BackendImageListItem } from '../lib/api.ts'
import { listImages } from '../lib/api.ts'
import type { GalleryItem } from '../types.ts'

const PAGE_SIZE = 50

function toGalleryItem(item: BackendImageListItem): GalleryItem {
  return {
    id: item.id,
    filename: item.original_filename,
    thumbnailSrc: item.thumbnail_url,
    sampleSrc: item.preview_url,
    originalSrc: item.original_url ?? undefined,
    width: item.width,
    height: item.height,
    rating: item.rating,
    tags: item.tags,
    favorite: item.is_favorite,
    importedAt: item.imported_at,
    fileSize: item.file_size,
    sha256: item.sha256,
    sourceUrl: item.source_url ?? undefined,
    note: item.note ?? undefined,
    uploader: item.uploader ?? undefined,
  }
}

export function useGalleryQuery() {
  const {
    searchTags,
    advancedIncludeTags,
    excludeTags,
    sort,
    ratingFilter,
    favoritesOnly,
    randomSeed,
    uploadedAfter,
    uploadedBefore,
    minWidth,
    minHeight,
    aspectRatioMin,
    aspectRatioMax,
  } = useGallerySessionStore(
    useShallow((state) => ({
      searchTags: state.searchTags,
      advancedIncludeTags: state.advancedIncludeTags,
      excludeTags: state.excludeTags,
      sort: state.sort,
      ratingFilter: state.ratingFilter,
      favoritesOnly: state.favoritesOnly,
      randomSeed: state.randomSeed,
      uploadedAfter: state.uploadedAfter,
      uploadedBefore: state.uploadedBefore,
      minWidth: state.minWidth,
      minHeight: state.minHeight,
      aspectRatioMin: state.aspectRatioMin,
      aspectRatioMax: state.aspectRatioMax,
    })),
  )

  const hasBasicSearch = searchTags.length > 0

  const galleryQuery = useInfiniteQuery({
    queryKey: [
      'gallery',
      searchTags,
      advancedIncludeTags,
      excludeTags,
      sort,
      ratingFilter,
      favoritesOnly,
      randomSeed,
      uploadedAfter,
      uploadedBefore,
      minWidth,
      minHeight,
      aspectRatioMin,
      aspectRatioMax,
    ],
    queryFn: async ({ pageParam }) => {
      const tags = hasBasicSearch ? searchTags : advancedIncludeTags

      const response = await listImages({
        cursor: pageParam,
        limit: PAGE_SIZE,
        sort: sort,
        seed: sort === 'random' ? randomSeed : undefined,
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
        items: response.items.map(toGalleryItem),
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

  const loadMoreRef = useRef<HTMLDivElement | null>(null)

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

  return {
    items,
    galleryQuery,
    loadMoreRef,
  }
}
