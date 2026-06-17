export type LayoutMode = 'grid' | 'masonry' | 'justified'
export type GallerySort = 'newest' | 'oldest' | 'filename_asc' | 'filename_desc' | 'random'
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type Rating = 'safe' | 'suggestive' | 'explicit'
export type RatingFilter = 'all' | Rating
export type UserRole = 'admin' | 'editor' | 'viewer'
export type ImportJobStatus =
  | 'queued'
  | 'running'
  | 'extracting'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
export type ImportSourceType = 'server' | 'folder' | 'package'

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
  sha256?: string
  sourceUrl?: string
  note?: string
  uploader?: {
    id: number
    username: string
    avatar_url?: string
  }
}

export interface GalleryPageResult {
  items: GalleryItem[]
  nextCursor: string | null
}

export interface SessionUser {
  id: number
  username: string
  role: UserRole
  avatar_url?: string
}

export interface AuthUserResponse {
  user: SessionUser
}

export interface ImportJobRow {
  id: string
  status: ImportJobStatus
  sourceType: ImportSourceType
  totalItems: number
  processedItems: number
  succeededItems: number
  failedItems: number
  lastError?: string | null
  errorCode?: string | null
  errorParams?: Record<string, unknown> | null
  errorDetail?: string | null
  createdAt: string
}

export interface UserRow {
  id: number
  username: string
  role: UserRole
  created_at: string
  avatar_url?: string
}

export interface CreateUserDto {
  username: string
  password: string
  role: UserRole
}

export interface UpdateUserDto {
  password?: string
  role?: UserRole
}
