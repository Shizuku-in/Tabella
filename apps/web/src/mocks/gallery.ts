import type {
  GalleryItem,
  GalleryPageResult,
  GalleryQueryInput,
  GallerySort,
  ImportJobRow,
} from '../types.ts'

const mockGalleryItems: GalleryItem[] = [
  {
    id: 101,
    filename: 'summer-terrace-01.jpg',
    thumbnailSrc: '/mock-gallery/summer-terrace-01.jpg',
    width: 1600,
    height: 2000,
    rating: 'safe',
    tags: ['artist:ryohka', 'character:mio', 'general:terrace', 'general:summer'],
    favorite: true,
    importedAt: '2026-06-01 22:16',
  },
  {
    id: 102,
    filename: 'night-platform-02.jpg',
    thumbnailSrc: '/mock-gallery/night-platform-02.jpg',
    width: 1716,
    height: 1014,
    rating: 'safe',
    tags: ['artist:foo', 'general:platform', 'general:night', 'general:city'],
    favorite: false,
    importedAt: '2026-06-01 21:55',
  },
  {
    id: 103,
    filename: 'portrait-sheet-a.jpg',
    thumbnailSrc: '/mock-gallery/portrait-sheet-a.jpg',
    width: 849,
    height: 1200,
    rating: 'suggestive',
    tags: ['artist:anmi', 'character:hana', 'general:portrait', 'general:glasses'],
    favorite: false,
    importedAt: '2026-05-31 18:05',
  },
  {
    id: 104,
    filename: 'evening-river-walk.jpg',
    thumbnailSrc: '/mock-gallery/evening-river-walk.jpg',
    width: 905,
    height: 914,
    rating: 'safe',
    tags: ['artist:luna', 'general:river', 'general:walk', 'general:evening'],
    favorite: true,
    importedAt: '2026-05-31 17:42',
  },
  {
    id: 105,
    filename: 'white-room-study.jpg',
    thumbnailSrc: '/mock-gallery/white-room-study.jpg',
    width: 1600,
    height: 2000,
    rating: 'safe',
    tags: ['artist:umi', 'general:interior', 'general:window-light', 'general:soft'],
    favorite: false,
    importedAt: '2026-05-30 14:22',
  },
  {
    id: 106,
    filename: 'poster-square-01.jpg',
    thumbnailSrc: '/mock-gallery/poster-square-01.jpg',
    width: 959,
    height: 885,
    rating: 'explicit',
    tags: ['artist:kio', 'character:rei', 'general:poster', 'general:graphic'],
    favorite: false,
    importedAt: '2026-05-29 09:10',
  },
  {
    id: 107,
    filename: 'harbor-skyline-01.jpg',
    thumbnailSrc: '/mock-gallery/harbor-skyline-01.jpg',
    width: 1500,
    height: 750,
    rating: 'safe',
    tags: ['series:coast-route', 'general:harbor', 'general:sky', 'general:evening'],
    favorite: true,
    importedAt: '2026-05-28 20:36',
  },
  {
    id: 108,
    filename: 'closeup-study-b.jpg',
    thumbnailSrc: '/mock-gallery/closeup-study-b.jpg',
    width: 1144,
    height: 1600,
    rating: 'suggestive',
    tags: ['artist:anmi', 'character:mika', 'general:close-up', 'general:wet'],
    favorite: false,
    importedAt: '2026-05-28 11:58',
  },
  {
    id: 109,
    filename: 'window-light-portrait.jpg',
    thumbnailSrc: '/mock-gallery/window-light-portrait.jpg',
    width: 2480,
    height: 3509,
    rating: 'safe',
    tags: ['artist:ryohka', 'general:window-light', 'general:portrait', 'general:quiet'],
    favorite: false,
    importedAt: '2026-05-27 20:11',
  },
  {
    id: 110,
    filename: 'station-sign-evening.jpg',
    thumbnailSrc: '/mock-gallery/station-sign-evening.jpg',
    width: 3500,
    height: 2403,
    rating: 'safe',
    tags: ['series:coast-route', 'general:station', 'general:sign', 'general:evening'],
    favorite: true,
    importedAt: '2026-05-27 18:43',
  },
  {
    id: 111,
    filename: 'character-sheet-03.jpg',
    thumbnailSrc: '/mock-gallery/character-sheet-03.jpg',
    width: 1125,
    height: 1500,
    rating: 'suggestive',
    tags: ['artist:umi', 'character:hana', 'general:sheet', 'general:study'],
    favorite: false,
    importedAt: '2026-05-26 16:20',
  },
  {
    id: 112,
    filename: 'riverbank-morning.jpg',
    thumbnailSrc: '/mock-gallery/riverbank-morning.jpg',
    width: 1300,
    height: 1366,
    rating: 'safe',
    tags: ['artist:foo', 'general:river', 'general:morning', 'general:trees'],
    favorite: false,
    importedAt: '2026-05-25 09:12',
  },
  {
    id: 113,
    filename: 'festival-poster-b.jpg',
    thumbnailSrc: '/mock-gallery/festival-poster-b.jpg',
    width: 1748,
    height: 1889,
    rating: 'explicit',
    tags: ['character:rei', 'general:poster', 'general:typography', 'general:festival'],
    favorite: false,
    importedAt: '2026-05-24 23:08',
  },
  {
    id: 114,
    filename: 'tram-platform-empty.jpg',
    thumbnailSrc: '/mock-gallery/tram-platform-empty.jpg',
    width: 360,
    height: 505,
    rating: 'safe',
    tags: ['general:platform', 'general:city', 'general:night', 'general:tram'],
    favorite: true,
    importedAt: '2026-05-24 21:30',
  },
]

export async function queryGalleryPage(
  input: GalleryQueryInput,
): Promise<GalleryPageResult> {
  const { cursor, limit, ratingFilter, searchText, sort } = input
  const normalizedSearch = searchText.trim().toLowerCase()

  const filteredItems = sortGalleryItems(
    mockGalleryItems.filter((item) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        item.filename.toLowerCase().includes(normalizedSearch) ||
        item.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch))

      const matchesRating = ratingFilter === 'all' || item.rating === ratingFilter

      return matchesSearch && matchesRating
    }),
    sort,
  )

  const startIndex = decodeCursor(cursor)
  const items = filteredItems.slice(startIndex, startIndex + limit)
  const nextCursor =
    startIndex + items.length < filteredItems.length ? String(startIndex + items.length) : null

  await delay(120)

  return {
    items,
    nextCursor,
  }
}

function sortGalleryItems(items: GalleryItem[], sort: GallerySort) {
  const nextItems = [...items]

  nextItems.sort((left, right) => {
    if (sort === 'filename_asc') {
      return left.filename.localeCompare(right.filename)
    }

    if (sort === 'filename_desc') {
      return right.filename.localeCompare(left.filename)
    }

    const leftTime = Date.parse(left.importedAt.replace(' ', 'T'))
    const rightTime = Date.parse(right.importedAt.replace(' ', 'T'))

    return sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime
  })

  return nextItems
}

function decodeCursor(cursor: string | null) {
  if (!cursor) {
    return 0
  }

  const parsed = Number.parseInt(cursor, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export const importJobRows: ImportJobRow[] = [
  {
    id: '0f501728-ff99-4c29-a799-11b6d4e6250f',
    status: 'completed',
    totalItems: 264,
    processedItems: 264,
    succeededItems: 262,
    failedItems: 2,
    createdAt: '2026-06-01 22:04',
  },
  {
    id: '68a87536-b06d-4a22-a570-4cfabd7dd777',
    status: 'running',
    totalItems: 481,
    processedItems: 129,
    succeededItems: 127,
    failedItems: 2,
    createdAt: '2026-06-02 09:42',
  },
  {
    id: '57eb84ff-3cee-4c45-b8ef-e112a13baf2c',
    status: 'queued',
    totalItems: 96,
    processedItems: 0,
    succeededItems: 0,
    failedItems: 0,
    createdAt: '2026-06-02 10:03',
  },
]
