import i18n from '../i18n.ts'
import type { AuthUserResponse, GallerySort, Rating } from '../types.ts'
import { API_ERROR_CODES } from './api-error-codes.ts'

export type ApiErrorParams = Record<string, unknown> | null

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly params: ApiErrorParams
  readonly fallbackMessage: string

  constructor(
    status: number,
    fallbackMessage: string,
    code?: string,
    params: ApiErrorParams = null,
  ) {
    super(fallbackMessage)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.params = params
    this.fallbackMessage = fallbackMessage
  }
}

const ERROR_MESSAGE_MAP: Record<string, string> = {
  [API_ERROR_CODES.AUTHENTICATION_REQUIRED]: 'api.errors.authenticationRequired',
  [API_ERROR_CODES.ADMIN_REQUIRED]: 'api.errors.adminRequired',
  [API_ERROR_CODES.EDITOR_REQUIRED]: 'api.errors.editorRequired',
  [API_ERROR_CODES.MISSING_CREDENTIALS]: 'api.errors.missingCredentials',
  [API_ERROR_CODES.INVALID_CREDENTIALS]: 'api.errors.invalidCredentials',
  [API_ERROR_CODES.INVALID_USERNAME]: 'api.errors.invalidUsername',
  [API_ERROR_CODES.DUPLICATE_USERNAME]: 'api.errors.duplicateUsername',
  [API_ERROR_CODES.MISSING_NEW_PASSWORD]: 'api.errors.missingNewPassword',
  [API_ERROR_CODES.MISSING_CURRENT_PASSWORD]: 'api.errors.missingCurrentPassword',
  [API_ERROR_CODES.INVALID_PASSWORD]: 'api.errors.invalidPassword',
  [API_ERROR_CODES.NO_FILE_UPLOADED]: 'api.errors.noFileUploaded',
  [API_ERROR_CODES.INVALID_MULTIPART]: 'api.errors.invalidMultipart',
  [API_ERROR_CODES.PAYLOAD_TOO_LARGE]: 'api.errors.payloadTooLarge',
  [API_ERROR_CODES.INVALID_SETTINGS]: 'api.errors.invalidSettings',
  [API_ERROR_CODES.ROLE_CHANGE_NOT_ALLOWED]: 'api.errors.roleChangeNotAllowed',
  [API_ERROR_CODES.SELF_DELETE_NOT_ALLOWED]: 'api.errors.selfDeleteNotAllowed',
  [API_ERROR_CODES.USER_NOT_FOUND]: 'api.errors.userNotFound',
  [API_ERROR_CODES.IMAGE_NOT_FOUND]: 'api.errors.imageNotFound',
  [API_ERROR_CODES.IMPORT_JOB_NOT_FOUND]: 'api.errors.importJobNotFound',
  [API_ERROR_CODES.NO_IMPORTABLE_FILES]: 'api.errors.noImportableFiles',
  [API_ERROR_CODES.NO_FILES_UPLOADED]: 'api.errors.noFilesUploaded',
  [API_ERROR_CODES.INVALID_UPLOAD_PATH]: 'api.errors.invalidUploadPath',
  [API_ERROR_CODES.INVALID_CURSOR]: 'api.errors.invalidCursor',
  [API_ERROR_CODES.CURSOR_MISSING_IMPORTED_AT]: 'api.errors.cursorMissingImportedAt',
  [API_ERROR_CODES.CURSOR_MISSING_FILENAME]: 'api.errors.cursorMissingFilename',
  [API_ERROR_CODES.NO_IMAGES_SELECTED]: 'api.errors.noImagesSelected',
  [API_ERROR_CODES.SELECTED_IMAGES_NOT_FOUND]: 'api.errors.selectedImagesNotFound',
  [API_ERROR_CODES.TOO_MANY_IMAGES_REQUESTED]: 'api.errors.tooManyImagesRequested',
  [API_ERROR_CODES.DOWNLOAD_SIZE_LIMIT_EXCEEDED]: 'api.errors.downloadSizeLimitExceeded',
  [API_ERROR_CODES.DOWNLOAD_JOB_NOT_FOUND]: 'api.errors.downloadJobNotFound',
  [API_ERROR_CODES.DOWNLOAD_JOB_ACCESS_DENIED]: 'api.errors.downloadJobAccessDenied',
  [API_ERROR_CODES.DOWNLOAD_JOB_NOT_COMPLETED]: 'api.errors.downloadJobNotCompleted',
  [API_ERROR_CODES.DOWNLOAD_ARCHIVE_MISSING]: 'api.errors.downloadArchiveMissing',
  [API_ERROR_CODES.ARCHIVE_GENERATION_FAILED]: 'api.errors.archiveGenerationFailed',
  [API_ERROR_CODES.IMPORT_PROCESSING_FAILED]: 'api.errors.importProcessingFailed',
  [API_ERROR_CODES.WEAK_PASSWORD_TOO_SHORT]: 'api.errors.weakPasswordTooShort',
  [API_ERROR_CODES.WEAK_PASSWORD_MISSING_LOWERCASE]: 'api.errors.weakPasswordMissingLowercase',
  [API_ERROR_CODES.WEAK_PASSWORD_MISSING_NUMBER]: 'api.errors.weakPasswordMissingNumber',
  [API_ERROR_CODES.INTERNAL_ERROR]: 'api.errors.internalError',
  [API_ERROR_CODES.NETWORK_ERROR]: 'api.errors.networkError',
  [API_ERROR_CODES.UPLOAD_ABORTED]: 'api.errors.uploadAborted',
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
  fallbackMessage = 'Request failed.',
): string {
  if (!code) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return i18n.t('api.errors.defaultRequestFailed' as any, { defaultValue: fallbackMessage })
  }

  const translationKey = ERROR_MESSAGE_MAP[code]
  if (translationKey) {
    const interpParams = { ...params }
    if (code === API_ERROR_CODES.TOO_MANY_IMAGES_REQUESTED && !interpParams.max_images) {
      interpParams.max_images = i18n.t('api.errors.fallbackAllowedNumber')
    }
    if (code === API_ERROR_CODES.DOWNLOAD_SIZE_LIMIT_EXCEEDED && !interpParams.max_total_bytes) {
      interpParams.max_total_bytes = i18n.t('api.errors.fallbackAllowedNumber')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return i18n.t(translationKey as any, interpParams as any)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return i18n.t('api.errors.defaultRequestFailed' as any, { defaultValue: fallbackMessage })
}

export function getApiErrorMessage(error: unknown, fallbackMessage = 'Request failed.'): string {
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
      normalizeErrorParams(body?.params),
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
  onProgress: (percent: number) => void,
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
export async function updateImage(
  imageId: number,
  data: {
    rating?: Rating
    tags?: string[]
  },
): Promise<void> {
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
