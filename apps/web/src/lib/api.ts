import type { AuthUserResponse, GallerySort, Rating } from '../types.ts'

import { API_ERROR_CODES } from './api-error-codes.ts'

export type ApiErrorParams = Record<string, unknown> | null

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly params: ApiErrorParams
  readonly fallbackMessage: string

  constructor(status: number, fallbackMessage: string, code?: string, params: ApiErrorParams = null) {
    super(fallbackMessage)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.params = params
    this.fallbackMessage = fallbackMessage
  }
}

type ErrorMessageFormatter = string | ((params: Record<string, unknown> | undefined) => string)

const ERROR_MESSAGE_MAP: Record<string, ErrorMessageFormatter> = {
  [API_ERROR_CODES.AUTHENTICATION_REQUIRED]: 'Authentication required.',
  [API_ERROR_CODES.ADMIN_REQUIRED]: 'Admin privileges required.',
  [API_ERROR_CODES.EDITOR_REQUIRED]: 'Editor or admin privileges required.',
  [API_ERROR_CODES.MISSING_CREDENTIALS]: 'Username and password are required.',
  [API_ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid username or password.',
  [API_ERROR_CODES.INVALID_USERNAME]: 'Username cannot be empty.',
  [API_ERROR_CODES.DUPLICATE_USERNAME]: 'Username is already taken.',
  [API_ERROR_CODES.MISSING_NEW_PASSWORD]: 'New password is required when current password is provided.',
  [API_ERROR_CODES.MISSING_CURRENT_PASSWORD]: 'Current password is required to set a new password.',
  [API_ERROR_CODES.INVALID_PASSWORD]: 'Current password is incorrect.',
  [API_ERROR_CODES.NO_FILE_UPLOADED]: 'No file was provided.',
  [API_ERROR_CODES.INVALID_MULTIPART]: 'Uploaded data could not be processed.',
  [API_ERROR_CODES.PAYLOAD_TOO_LARGE]: 'Uploaded payload is too large.',
  [API_ERROR_CODES.INVALID_SETTINGS]: 'Server settings are invalid.',
  [API_ERROR_CODES.ROLE_CHANGE_NOT_ALLOWED]: 'You cannot change your own role.',
  [API_ERROR_CODES.SELF_DELETE_NOT_ALLOWED]: 'You cannot delete your own account.',
  [API_ERROR_CODES.USER_NOT_FOUND]: 'User not found.',
  [API_ERROR_CODES.IMAGE_NOT_FOUND]: 'Image not found.',
  [API_ERROR_CODES.IMPORT_JOB_NOT_FOUND]: 'Import job not found.',
  [API_ERROR_CODES.NO_IMPORTABLE_FILES]: 'No supported image files were found in the import source.',
  [API_ERROR_CODES.NO_FILES_UPLOADED]: 'No files uploaded.',
  [API_ERROR_CODES.INVALID_UPLOAD_PATH]: 'Upload path is invalid.',
  [API_ERROR_CODES.INVALID_CURSOR]: 'Invalid image pagination cursor.',
  [API_ERROR_CODES.CURSOR_MISSING_IMPORTED_AT]: 'Image pagination cursor is missing imported_at.',
  [API_ERROR_CODES.CURSOR_MISSING_FILENAME]: 'Image pagination cursor is missing filename.',
  [API_ERROR_CODES.NO_IMAGES_SELECTED]: 'No images selected.',
  [API_ERROR_CODES.SELECTED_IMAGES_NOT_FOUND]: 'Selected images not found.',
  [API_ERROR_CODES.TOO_MANY_IMAGES_REQUESTED]: (params) =>
    `Cannot download more than ${readNumericParam(params, 'max_images') ?? 'the allowed number of'} images at once.`,
  [API_ERROR_CODES.DOWNLOAD_SIZE_LIMIT_EXCEEDED]: (params) =>
    `Total size exceeds the maximum limit of ${readNumericParam(params, 'max_total_bytes') ?? 'the allowed number of'} bytes.`,
  [API_ERROR_CODES.DOWNLOAD_JOB_NOT_FOUND]: 'Download job not found.',
  [API_ERROR_CODES.DOWNLOAD_JOB_ACCESS_DENIED]: 'You can only access your own download jobs.',
  [API_ERROR_CODES.DOWNLOAD_JOB_NOT_COMPLETED]: 'The download job is not completed yet.',
  [API_ERROR_CODES.DOWNLOAD_ARCHIVE_MISSING]: 'The archive file no longer exists.',
  [API_ERROR_CODES.ARCHIVE_GENERATION_FAILED]: 'Download job failed.',
  [API_ERROR_CODES.IMPORT_PROCESSING_FAILED]: 'Import job failed.',
  [API_ERROR_CODES.WEAK_PASSWORD_TOO_SHORT]: 'Password must be at least 8 characters long.',
  [API_ERROR_CODES.WEAK_PASSWORD_MISSING_LOWERCASE]: 'Password must contain at least one lowercase letter.',
  [API_ERROR_CODES.WEAK_PASSWORD_MISSING_NUMBER]: 'Password must contain at least one number.',
  [API_ERROR_CODES.INTERNAL_ERROR]: 'Internal server error.',
  [API_ERROR_CODES.NETWORK_ERROR]: 'Network error during upload.',
  [API_ERROR_CODES.UPLOAD_ABORTED]: 'Upload aborted.',
}

function readNumericParam(
  params: Record<string, unknown> | undefined,
  key: string
): string | number | null {
  const value = params?.[key]
  return typeof value === 'number' || typeof value === 'string' ? value : null
}

function normalizeErrorParams(value: unknown): ApiErrorParams {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

export function formatApiErrorMessage(
  code?: string,
  params?: ApiErrorParams,
  fallbackMessage = 'Request failed.'
): string {
  if (!code) return fallbackMessage
  const formatter = ERROR_MESSAGE_MAP[code]
  if (!formatter) return fallbackMessage
  if (typeof formatter === 'function') {
    return formatter(params ?? undefined)
  }
  return formatter
}

export function getApiErrorMessage(
  error: unknown,
  fallbackMessage = 'Request failed.'
): string {
  if (error instanceof ApiError) {
    return formatApiErrorMessage(error.code, error.params, error.fallbackMessage || fallbackMessage)
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallbackMessage
}

export async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData
  const headers = new Headers(init?.headers)
  
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await response.json() : null

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.message ?? 'Request failed.',
      body?.error,
      normalizeErrorParams(body?.params)
    )
  }

  return body as T
}

export async function getMe(): Promise<AuthUserResponse | null> {
  try {
    return await request<AuthUserResponse>('/api/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }

    throw error
  }
}

export async function login(credentials: {
  username: string
  password: string
}): Promise<AuthUserResponse> {
  return request<AuthUserResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export async function uploadWithProgress<T>(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100)
        onProgress(percent)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          resolve(response)
        } catch {
          resolve(xhr.responseText as unknown as T)
        }
      } else {
        let errorMsg = 'Upload failed'
        let errorCode: string | undefined
        let errorParams: ApiErrorParams = null
        try {
          const errRes = JSON.parse(xhr.responseText)
          errorMsg = errRes.message || errorMsg
          errorCode = errRes.error
          errorParams = normalizeErrorParams(errRes.params)
        } catch {
          // ignore
        }
        reject(new ApiError(xhr.status, errorMsg, errorCode, errorParams))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new ApiError(0, 'Network error during upload', API_ERROR_CODES.NETWORK_ERROR))
    })
    
    xhr.addEventListener('abort', () => {
      reject(new ApiError(0, 'Upload aborted', API_ERROR_CODES.UPLOAD_ABORTED))
    })

    xhr.open('POST', url)
    xhr.withCredentials = true
    // Do not set Content-Type, let the browser set it to multipart/form-data with boundary
    xhr.send(formData)
  })
}

export async function logout(): Promise<void> {
  await request<void>('/api/auth/logout', {
    method: 'POST',
  })
}

// ----- Gallery API -----

export interface ImageDetails {
  id: string
  hash: string
  width: number
  height: number
  format: string
  file_size: number
  createdAt: string
  tags: string[]
  sourceUrl?: string
  rating: 'safe' | 'suggestive' | 'explicit'
}

export interface BackendImageListItem {
  id: number
  original_filename: string
  thumbnail_url: string
  preview_url: string
  original_url: string | null
  width: number
  height: number
  rating: 'safe' | 'suggestive' | 'explicit'
  is_favorite: boolean
  tags: string[]
  file_size: number
  sha256: string
  source_url: string | null
  note: string | null
  imported_at: string
  uploader?: {
    id: number
    username: string
    avatar_url?: string
  } | null
}

export interface BackendListImagesResponse {
  items: BackendImageListItem[]
  next_cursor: string | null
}

export type DownloadQuality = 'thumbnail' | 'sample' | 'original'

export interface DownloadJobResponse {
  id: string
  status: string
  total_images: number
  total_bytes: number
  error_message: string | null
  error_code?: string | null
  error_params?: ApiErrorParams
  error_detail?: string | null
}

export async function listImages(query: {
  cursor?: string | null
  limit?: number
  sort?: GallerySort
  rating?: Rating[]
  include_tags?: string[]
  exclude_tags?: string[]
  favorites_only?: boolean
  uploaded_after?: string | null
  uploaded_before?: string | null
  min_width?: number | null
  min_height?: number | null
  aspect_ratio_min?: number | null
  aspect_ratio_max?: number | null
}): Promise<BackendListImagesResponse> {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', query.limit.toString())
  if (query.sort) params.set('sort', query.sort)
  if (query.favorites_only) params.set('favorites_only', 'true')
  if (query.rating && query.rating.length > 0) {
    params.set('rating', query.rating.join(','))
  }
  if (query.include_tags && query.include_tags.length > 0) {
    params.set('include_tags', query.include_tags.join(','))
  }
  if (query.exclude_tags && query.exclude_tags.length > 0) {
    params.set('exclude_tags', query.exclude_tags.join(','))
  }
  if (query.uploaded_after) params.set('uploaded_after', query.uploaded_after)
  if (query.uploaded_before) params.set('uploaded_before', query.uploaded_before)
  if (query.min_width) params.set('min_width', query.min_width.toString())
  if (query.min_height) params.set('min_height', query.min_height.toString())
  if (query.aspect_ratio_min) params.set('aspect_ratio_min', query.aspect_ratio_min.toString())
  if (query.aspect_ratio_max) params.set('aspect_ratio_max', query.aspect_ratio_max.toString())

  return request<BackendListImagesResponse>(`/api/images?${params.toString()}`)
}

export async function toggleFavorite(imageId: number, isFavorite: boolean): Promise<void> {
  await request<void>(`/api/favorites/${imageId}`, {
    method: isFavorite ? 'POST' : 'DELETE',
  })
}

// Update image rating and tags
export async function updateImage(imageId: number, data: {
  rating?: Rating
  tags?: string[]
}): Promise<void> {
  await request<void>(`/api/images/${imageId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// Delete an image
export async function deleteImage(imageId: number): Promise<void> {
  await request<void>(`/api/images/${imageId}`, {
    method: 'DELETE',
  })
}

// Suggest tags for autocomplete
export async function suggestTags(query: string, limit?: number): Promise<string[]> {
  const params = new URLSearchParams({ q: query })
  if (limit) params.set('limit', limit.toString())
  const res = await request<{ items: string[] }>(`/api/tags/suggest?${params}`)
  return res.items
}

export async function createDownloadJob(data: {
  image_ids: number[]
  quality: DownloadQuality
}): Promise<DownloadJobResponse> {
  return request<DownloadJobResponse>('/api/download-jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
