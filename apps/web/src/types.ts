export type LayoutMode = 'grid' | 'masonry' | 'justified'
export type GallerySort = 'newest' | 'oldest' | 'filename_asc' | 'filename_desc'
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type Rating = 'safe' | 'suggestive' | 'explicit'
export type RatingFilter = 'all' | Rating
export type UserRole = 'admin' | 'viewer'

export interface GalleryItem {
  id: number
  filename: string
  thumbnailSrc: string
  sampleSrc?: string
  originalSrc?: string
  width: number
  height: number
  rating: Rating
  tags: string[]
  favorite: boolean
  importedAt: string
  fileSize?: number
}

export interface GalleryQueryInput {
  searchText: string
  sort: GallerySort
  ratingFilter: RatingFilter
  cursor: string | null
  limit: number
}

export interface GalleryPageResult {
  items: GalleryItem[]
  nextCursor: string | null
}

export interface SessionUser {
  id: number
  username: string
  role: UserRole
}

export interface AuthUserResponse {
  user: SessionUser
}

export interface ImportJobRow {
  id: string
  status: 'queued' | 'running' | 'completed' | 'completed_with_errors'
  totalItems: number
  processedItems: number
  succeededItems: number
  failedItems: number
  createdAt: string
}
