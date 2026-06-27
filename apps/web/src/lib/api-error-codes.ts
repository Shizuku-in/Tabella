/**
 * Mirror of the backend's error-code constants for the wire-format `error`
 * field.
 *
 * These are the second of three layers that must stay in sync:
 * 1. `apps/api/src/api/error_codes.rs` (Rust `&'static str`)
 * 2. This file (TypeScript mirror)
 * 3. `apps/web/src/locales/en.json` / `zh-CN.json` / ... (`api.errors.*` keys)
 *
 * Breaking the chain causes a build failure (the `ERROR_MESSAGE_MAP`
 * uses `satisfies Record<ApiErrorCode, string>`).
 *
 * `NETWORK_ERROR` and `UPLOAD_ABORTED` are frontend-only
 * (no corresponding Rust constant).
 */
export const API_ERROR_CODES = {
  AUTHENTICATION_REQUIRED: 'authentication_required',
  ADMIN_REQUIRED: 'admin_required',
  EDITOR_REQUIRED: 'editor_required',
  MISSING_CREDENTIALS: 'missing_credentials',
  INVALID_CREDENTIALS: 'invalid_credentials',
  INVALID_USERNAME: 'invalid_username',
  DUPLICATE_USERNAME: 'duplicate_username',
  MISSING_NEW_PASSWORD: 'missing_new_password',
  MISSING_CURRENT_PASSWORD: 'missing_current_password',
  INVALID_PASSWORD: 'invalid_password',
  NO_FILE_UPLOADED: 'no_file_uploaded',
  INVALID_MULTIPART: 'invalid_multipart',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
  INVALID_SETTINGS: 'invalid_settings',
  ROLE_CHANGE_NOT_ALLOWED: 'role_change_not_allowed',
  SELF_DELETE_NOT_ALLOWED: 'self_delete_not_allowed',
  USER_NOT_FOUND: 'user_not_found',
  IMAGE_NOT_FOUND: 'image_not_found',
  IMPORT_JOB_NOT_FOUND: 'import_job_not_found',
  NO_IMPORTABLE_FILES: 'no_importable_files',
  NO_FILES_UPLOADED: 'no_files_uploaded',
  INVALID_UPLOAD_PATH: 'invalid_upload_path',
  INVALID_CURSOR: 'invalid_cursor',
  CURSOR_MISSING_IMPORTED_AT: 'cursor_missing_imported_at',
  CURSOR_MISSING_FILENAME: 'cursor_missing_filename',
  NO_IMAGES_SELECTED: 'no_images_selected',
  SELECTED_IMAGES_NOT_FOUND: 'selected_images_not_found',
  TOO_MANY_IMAGES_REQUESTED: 'too_many_images_requested',
  DOWNLOAD_SIZE_LIMIT_EXCEEDED: 'download_size_limit_exceeded',
  DOWNLOAD_JOB_NOT_FOUND: 'download_job_not_found',
  DOWNLOAD_JOB_ACCESS_DENIED: 'download_job_access_denied',
  DOWNLOAD_JOB_NOT_COMPLETED: 'download_job_not_completed',
  DOWNLOAD_ARCHIVE_MISSING: 'download_archive_missing',
  ARCHIVE_GENERATION_FAILED: 'archive_generation_failed',
  IMPORT_PROCESSING_FAILED: 'import_processing_failed',
  WEAK_PASSWORD_TOO_SHORT: 'weak_password_too_short',
  WEAK_PASSWORD_MISSING_LOWERCASE: 'weak_password_missing_lowercase',
  WEAK_PASSWORD_MISSING_NUMBER: 'weak_password_missing_number',
  INTERNAL_ERROR: 'internal_error',
  NETWORK_ERROR: 'network_error',
  UPLOAD_ABORTED: 'upload_aborted',
} as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]
