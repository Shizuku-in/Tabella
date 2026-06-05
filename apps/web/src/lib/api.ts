import type { AuthUserResponse, GallerySort, Rating } from '../types.ts'

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
  authentication_required: 'Authentication required.',
  admin_required: 'Admin privileges required.',
  editor_required: 'Editor or admin privileges required.',
  missing_credentials: 'Username and password are required.',
  invalid_credentials: 'Invalid username or password.',
  invalid_username: 'Username cannot be empty.',
  duplicate_username: 'Username is already taken.',
  missing_new_password: 'New password is required when current password is provided.',
  missing_current_password: 'Current password is required to set a new password.',
  invalid_password: 'Current password is incorrect.',
  no_file_uploaded: 'No file was provided.',
  invalid_multipart: 'Uploaded data could not be processed.',
  payload_too_large: 'Uploaded payload is too large.',
  invalid_settings: 'Server settings are invalid.',
  role_change_not_allowed: 'You cannot change your own role.',
  self_delete_not_allowed: 'You cannot delete your own account.',
  user_not_found: 'User not found.',
  image_not_found: 'Image not found.',
  import_job_not_found: 'Import job not found.',
  no_importable_files: 'No supported image files were found in the import source.',
  no_files_uploaded: 'No files uploaded.',
  invalid_upload_path: 'Upload path is invalid.',
  invalid_cursor: 'Invalid image pagination cursor.',
  cursor_missing_imported_at: 'Image pagination cursor is missing imported_at.',
  cursor_missing_filename: 'Image pagination cursor is missing filename.',
  no_images_selected: 'No images selected.',
  selected_images_not_found: 'Selected images not found.',
  too_many_images_requested: (params) =>
    `Cannot download more than ${readNumericParam(params, 'max_images') ?? 'the allowed number of'} images at once.`,
  download_size_limit_exceeded: (params) =>
    `Total size exceeds the maximum limit of ${readNumericParam(params, 'max_total_bytes') ?? 'the allowed number of'} bytes.`,
  download_job_not_found: 'Download job not found.',
  download_job_access_denied: 'You can only access your own download jobs.',
  download_job_not_completed: 'The download job is not completed yet.',
  download_archive_missing: 'The archive file no longer exists.',
  archive_generation_failed: 'Download job failed.',
  import_processing_failed: 'Import job failed.',
  weak_password_too_short: 'Password must be at least 8 characters long.',
  weak_password_missing_lowercase: 'Password must contain at least one lowercase letter.',
  weak_password_missing_number: 'Password must contain at least one number.',
  internal_error: 'Internal server error.',
  network_error: 'Network error during upload.',
  upload_aborted: 'Upload aborted.',
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
      reject(new ApiError(0, 'Network error during upload', 'network_error'))
    })
    
    xhr.addEventListener('abort', () => {
      reject(new ApiError(0, 'Upload aborted', 'upload_aborted'))
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
