import type {
  GalleryItem,
  GalleryPageResult,
  GalleryQueryInput,
  GallerySort,
  ImportJobRow,
} from '../types.ts'

const mockGalleryItems: GalleryItem[] = [
  {
    id: 1,
    filename: '001 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/001 - Copy.jpg',
    width: 500,
    height: 607,
    rating: 'suggestive',
    tags: ['artist:umi', 'character:alice', 'general:illustration', 'general:nature', 'general:colorful'],
    favorite: false,
    importedAt: '2026-05-19 00:03',
  },
  {
    id: 2,
    filename: '0289287C31F622F80EA787579EE8D982 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/0289287C31F622F80EA787579EE8D982 - Copy.jpg',
    width: 1600,
    height: 2000,
    rating: 'suggestive',
    tags: ['artist:kantoku', 'general:portrait', 'general:illustration'],
    favorite: false,
    importedAt: '2026-05-18 17:12',
  },
  {
    id: 3,
    filename: '1080_1920_ryohka_139-576x1024 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/1080_1920_ryohka_139-576x1024 - Copy.jpg',
    width: 576,
    height: 1024,
    rating: 'suggestive',
    tags: ['artist:kio', 'general:scenic', 'general:nature'],
    favorite: true,
    importedAt: '2026-05-27 15:46',
  },
  {
    id: 4,
    filename: '123 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/123 - Copy.jpg',
    width: 1716,
    height: 1014,
    rating: 'safe',
    tags: ['artist:foo', 'general:photography', 'general:landscape'],
    favorite: false,
    importedAt: '2026-05-07 11:29',
  },
  {
    id: 5,
    filename: '129087f8-0c8e-4c6f-a84e-5bec6bbe82fe - Copy.jpeg',
    thumbnailSrc: '/mock-gallery/129087f8-0c8e-4c6f-a84e-5bec6bbe82fe - Copy.jpeg',
    width: 4608,
    height: 6144,
    rating: 'suggestive',
    tags: ['artist:kantoku', 'general:portrait', 'general:vertical', 'general:photography'],
    favorite: false,
    importedAt: '2026-06-01 00:04',
  },
  {
    id: 6,
    filename: '464526_5 - Copy.png',
    thumbnailSrc: '/mock-gallery/464526_5 - Copy.png',
    width: 1748,
    height: 1889,
    rating: 'safe',
    tags: ['artist:kio', 'general:landscape', 'general:illustration'],
    favorite: true,
    importedAt: '2026-05-13 00:53',
  },
  {
    id: 7,
    filename: '479229 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/479229 - Copy.jpg',
    width: 360,
    height: 505,
    rating: 'safe',
    tags: ['artist:kantoku', 'general:soft', 'general:dress'],
    favorite: false,
    importedAt: '2026-05-03 14:11',
  },
  {
    id: 8,
    filename: '67881947_p0_master1200 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/67881947_p0_master1200 - Copy.jpg',
    width: 849,
    height: 1200,
    rating: 'safe',
    tags: ['artist:kantoku', 'general:scenic', 'general:vertical', 'general:nature'],
    favorite: false,
    importedAt: '2026-05-10 12:26',
  },
  {
    id: 9,
    filename: '6f9449d84753cb6d13c6b1c8dcca9baa36f1053f - Copy.jpg',
    thumbnailSrc: '/mock-gallery/6f9449d84753cb6d13c6b1c8dcca9baa36f1053f - Copy.jpg',
    width: 1924,
    height: 2660,
    rating: 'suggestive',
    tags: ['artist:ryohka', 'character:alice', 'general:illustration', 'general:photography', 'general:vertical'],
    favorite: false,
    importedAt: '2026-06-01 23:04',
  },
  {
    id: 10,
    filename: '7D781CFEB6211F70FB4A3BCF83FF689D - Copy.jpg',
    thumbnailSrc: '/mock-gallery/7D781CFEB6211F70FB4A3BCF83FF689D - Copy.jpg',
    width: 1144,
    height: 1600,
    rating: 'suggestive',
    tags: ['artist:ryohka', 'character:hana', 'general:scenic', 'general:illustration', 'general:mature'],
    favorite: false,
    importedAt: '2026-05-18 13:49',
  },
  {
    id: 11,
    filename: '90465806_p0 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/90465806_p0 - Copy.jpg',
    width: 2480,
    height: 3509,
    rating: 'safe',
    tags: ['artist:kantoku', 'character:hana', 'general:nature', 'general:photography'],
    favorite: true,
    importedAt: '2026-05-24 12:49',
  },
  {
    id: 12,
    filename: '94647006_p0_master1200 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/94647006_p0_master1200 - Copy.jpg',
    width: 849,
    height: 1200,
    rating: 'suggestive',
    tags: ['artist:anmi', 'character:shizuku', 'general:illustration', 'general:colorful', 'general:portrait'],
    favorite: false,
    importedAt: '2026-05-23 11:24',
  },
  {
    id: 13,
    filename: '95684ACF41889233D18BC3F330949D5B - Copy.png',
    thumbnailSrc: '/mock-gallery/95684ACF41889233D18BC3F330949D5B - Copy.png',
    width: 1125,
    height: 1500,
    rating: 'suggestive',
    tags: ['artist:anmi', 'general:scenic', 'general:nature', 'general:vertical'],
    favorite: false,
    importedAt: '2026-05-04 09:34',
  },
  {
    id: 14,
    filename: '9b48abb646f8e428589403c2c55904094b97b946 - Copy.jpg',
    thumbnailSrc: '/mock-gallery/9b48abb646f8e428589403c2c55904094b97b946 - Copy.jpg',
    width: 905,
    height: 914,
    rating: 'suggestive',
    tags: ['artist:kio', 'general:scenic', 'general:soft'],
    favorite: false,
    importedAt: '2026-05-05 05:28',
  },
  {
    id: 15,
    filename: 'bkgrd - Copy.jpg',
    thumbnailSrc: '/mock-gallery/bkgrd - Copy.jpg',
    width: 3500,
    height: 2403,
    rating: 'explicit',
    tags: ['artist:kio', 'general:colorful', 'general:vertical', 'general:dress'],
    favorite: false,
    importedAt: '2026-05-30 07:25',
  },
  {
    id: 16,
    filename: 'c4a66f5367a7079fe676eb9b49e527fdc5e1717e - Copy.jpg',
    thumbnailSrc: '/mock-gallery/c4a66f5367a7079fe676eb9b49e527fdc5e1717e - Copy.jpg',
    width: 519,
    height: 960,
    rating: 'explicit',
    tags: ['artist:umi', 'character:mika', 'general:scenic', 'general:vertical'],
    favorite: true,
    importedAt: '2026-05-30 11:07',
  },
  {
    id: 17,
    filename: 'character-sheet-03.jpg',
    thumbnailSrc: '/mock-gallery/character-sheet-03.jpg',
    width: 570,
    height: 760,
    rating: 'safe',
    tags: ['artist:anmi', 'general:scenic', 'general:nature', 'general:soft'],
    favorite: true,
    importedAt: '2026-05-03 06:43',
  },
  {
    id: 18,
    filename: 'closeup-study-b.jpg',
    thumbnailSrc: '/mock-gallery/closeup-study-b.jpg',
    width: 543,
    height: 760,
    rating: 'safe',
    tags: ['artist:foo', 'general:vertical', 'general:colorful', 'general:photography'],
    favorite: false,
    importedAt: '2026-05-25 02:38',
  },
  {
    id: 19,
    filename: 'evening-river-walk.jpg',
    thumbnailSrc: '/mock-gallery/evening-river-walk.jpg',
    width: 753,
    height: 760,
    rating: 'explicit',
    tags: ['artist:anmi', 'character:mika', 'general:vertical', 'general:colorful'],
    favorite: true,
    importedAt: '2026-05-06 16:14',
  },
  {
    id: 20,
    filename: 'festival-poster-b.jpg',
    thumbnailSrc: '/mock-gallery/festival-poster-b.jpg',
    width: 759,
    height: 820,
    rating: 'explicit',
    tags: ['artist:ryohka', 'general:portrait', 'general:nature', 'general:soft'],
    favorite: true,
    importedAt: '2026-05-29 13:10',
  },
  {
    id: 21,
    filename: 'harbor-skyline-01.jpg',
    thumbnailSrc: '/mock-gallery/harbor-skyline-01.jpg',
    width: 960,
    height: 480,
    rating: 'safe',
    tags: ['artist:kantoku', 'character:shizuku', 'general:portrait', 'general:nature'],
    favorite: true,
    importedAt: '2026-05-27 03:16',
  },
  {
    id: 22,
    filename: 'night-platform-02.jpg',
    thumbnailSrc: '/mock-gallery/night-platform-02.jpg',
    width: 900,
    height: 532,
    rating: 'safe',
    tags: ['artist:kio', 'general:vertical', 'general:mature', 'general:colorful'],
    favorite: true,
    importedAt: '2026-05-30 04:23',
  },
  {
    id: 23,
    filename: 'portrait-sheet-a.jpg',
    thumbnailSrc: '/mock-gallery/portrait-sheet-a.jpg',
    width: 509,
    height: 720,
    rating: 'safe',
    tags: ['artist:kantoku', 'general:illustration', 'general:colorful', 'general:soft'],
    favorite: false,
    importedAt: '2026-05-15 05:10',
  },
  {
    id: 24,
    filename: 'poster-square-01.jpg',
    thumbnailSrc: '/mock-gallery/poster-square-01.jpg',
    width: 760,
    height: 701,
    rating: 'safe',
    tags: ['artist:kantoku', 'character:shizuku', 'general:soft', 'general:dress', 'general:nature'],
    favorite: true,
    importedAt: '2026-05-16 20:41',
  },
  {
    id: 25,
    filename: 'riverbank-morning.jpg',
    thumbnailSrc: '/mock-gallery/riverbank-morning.jpg',
    width: 723,
    height: 760,
    rating: 'explicit',
    tags: ['artist:ryohka', 'general:nature', 'general:scenic', 'general:dress'],
    favorite: false,
    importedAt: '2026-05-28 23:21',
  },
  {
    id: 26,
    filename: 'station-sign-evening.jpg',
    thumbnailSrc: '/mock-gallery/station-sign-evening.jpg',
    width: 960,
    height: 659,
    rating: 'explicit',
    tags: ['artist:umi', 'general:soft', 'general:nature'],
    favorite: true,
    importedAt: '2026-05-23 17:35',
  },
  {
    id: 27,
    filename: 'summer-terrace-01.jpg',
    thumbnailSrc: '/mock-gallery/summer-terrace-01.jpg',
    width: 720,
    height: 900,
    rating: 'explicit',
    tags: ['artist:ryohka', 'character:hana', 'general:dress', 'general:illustration'],
    favorite: false,
    importedAt: '2026-06-02 09:39',
  },
  {
    id: 28,
    filename: 'tram-platform-empty.jpg',
    thumbnailSrc: '/mock-gallery/tram-platform-empty.jpg',
    width: 360,
    height: 505,
    rating: 'suggestive',
    tags: ['artist:anmi', 'general:portrait', 'general:scenic', 'general:colorful'],
    favorite: false,
    importedAt: '2026-05-26 02:29',
  },
  {
    id: 29,
    filename: 'white-room-study.jpg',
    thumbnailSrc: '/mock-gallery/white-room-study.jpg',
    width: 688,
    height: 860,
    rating: 'safe',
    tags: ['artist:kantoku', 'general:vertical', 'general:landscape', 'general:portrait'],
    favorite: false,
    importedAt: '2026-05-15 03:47',
  },
  {
    id: 30,
    filename: 'window-light-portrait.jpg',
    thumbnailSrc: '/mock-gallery/window-light-portrait.jpg',
    width: 636,
    height: 900,
    rating: 'safe',
    tags: ['artist:kio', 'character:mika', 'general:portrait', 'general:mature'],
    favorite: true,
    importedAt: '2026-05-17 21:37',
  },
  {
    id: 31,
    filename: 'yande.re 1167505 sample angel dress skirt_lift tatekawa_mako wet wings - Copy - Copy.jpg',
    thumbnailSrc: '/mock-gallery/yande.re 1167505 sample angel dress skirt_lift tatekawa_mako wet wings - Copy - Copy.jpg',
    width: 1500,
    height: 750,
    rating: 'safe',
    tags: ['artist:anmi', 'general:portrait', 'general:scenic', 'general:illustration'],
    favorite: true,
    importedAt: '2026-05-27 22:31',
  },
  {
    id: 32,
    filename: '_background - Copy.jpg',
    thumbnailSrc: '/mock-gallery/_background - Copy.jpg',
    width: 4500,
    height: 3175,
    rating: 'suggestive',
    tags: ['artist:kantoku', 'general:landscape', 'general:dress'],
    favorite: false,
    importedAt: '2026-05-19 03:17',
  },
  {
    id: 33,
    filename: '{0B5BA7E0-C4F2-8FEA-B865-57322BFDCF01} - Copy.jpg',
    thumbnailSrc: '/mock-gallery/{0B5BA7E0-C4F2-8FEA-B865-57322BFDCF01} - Copy.jpg',
    width: 959,
    height: 885,
    rating: 'safe',
    tags: ['artist:kantoku', 'character:mika', 'general:scenic', 'general:photography'],
    favorite: true,
    importedAt: '2026-05-28 13:51',
  },
  {
    id: 34,
    filename: '{AA2893B1-DC28-FFBB-D9C8-5BE2F625C6B7} - Copy.jpg',
    thumbnailSrc: '/mock-gallery/{AA2893B1-DC28-FFBB-D9C8-5BE2F625C6B7} - Copy.jpg',
    width: 1300,
    height: 1366,
    rating: 'suggestive',
    tags: ['artist:ryohka', 'character:mika', 'general:dress', 'general:scenic'],
    favorite: true,
    importedAt: '2026-05-08 06:51',
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
    sourceType: 'server',
    totalItems: 264,
    processedItems: 264,
    succeededItems: 262,
    failedItems: 2,
    createdAt: '2026-06-01 22:04',
  },
  {
    id: '68a87536-b06d-4a22-a570-4cfabd7dd777',
    status: 'running',
    sourceType: 'package',
    totalItems: 481,
    processedItems: 129,
    succeededItems: 127,
    failedItems: 2,
    createdAt: '2026-06-02 09:42',
  },
  {
    id: '57eb84ff-3cee-4c45-b8ef-e112a13baf2c',
    status: 'queued',
    sourceType: 'folder',
    totalItems: 96,
    processedItems: 0,
    succeededItems: 0,
    failedItems: 0,
    createdAt: '2026-06-02 10:03',
  },
]
