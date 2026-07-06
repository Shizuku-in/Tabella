//! Canonical error-code constants for the wire-format `error` field.
//!
//! These are the first of three layers that must stay in sync:
//! 1. This file (Rust `&'static str`)
//! 2. `apps/web/src/lib/api-error-codes.ts` (mirror constants)
//! 3. `apps/web/src/locales/en.json` / `zh-CN.json` / ... (`api.errors.*` keys)
//!
//! Breaking the chain causes a frontend build failure (the `ERROR_MESSAGE_MAP`
//! uses `satisfies Record<ApiErrorCode, string>`).

// --- Auth ---
pub const AUTHENTICATION_REQUIRED: &str = "authentication_required";
pub const ADMIN_REQUIRED: &str = "admin_required";
pub const EDITOR_REQUIRED: &str = "editor_required";
pub const MISSING_CREDENTIALS: &str = "missing_credentials";
pub const INVALID_CREDENTIALS: &str = "invalid_credentials";

// --- User management ---
pub const INVALID_USERNAME: &str = "invalid_username";
pub const DUPLICATE_USERNAME: &str = "duplicate_username";
pub const MISSING_NEW_PASSWORD: &str = "missing_new_password";
pub const MISSING_CURRENT_PASSWORD: &str = "missing_current_password";
pub const INVALID_PASSWORD: &str = "invalid_password";
pub const ROLE_CHANGE_NOT_ALLOWED: &str = "role_change_not_allowed";
pub const SELF_DELETE_NOT_ALLOWED: &str = "self_delete_not_allowed";
pub const USER_NOT_FOUND: &str = "user_not_found";

// --- Password strength ---
pub const WEAK_PASSWORD_TOO_SHORT: &str = "weak_password_too_short";
pub const WEAK_PASSWORD_MISSING_LOWERCASE: &str = "weak_password_missing_lowercase";
pub const WEAK_PASSWORD_MISSING_NUMBER: &str = "weak_password_missing_number";

// --- Upload ---
pub const NO_FILE_UPLOADED: &str = "no_file_uploaded";
pub const INVALID_MULTIPART: &str = "invalid_multipart";
pub const PAYLOAD_TOO_LARGE: &str = "payload_too_large";
pub const TOO_MANY_REQUESTS: &str = "too_many_requests";
pub const NO_FILES_UPLOADED: &str = "no_files_uploaded";
pub const INVALID_UPLOAD_PATH: &str = "invalid_upload_path";

// --- Settings ---
pub const INVALID_SETTINGS: &str = "invalid_settings";

// --- Images ---
pub const IMAGE_NOT_FOUND: &str = "image_not_found";
pub const INVALID_CURSOR: &str = "invalid_cursor";
/// Emitted when a keyset-pagination cursor is decoded but its `imported_at`
/// field is missing (backwards-compatibility guard).
pub const CURSOR_MISSING_IMPORTED_AT: &str = "cursor_missing_imported_at";
/// Emitted when a filename-sorted cursor is decoded without a `filename`
/// field (backwards-compatibility guard).
pub const CURSOR_MISSING_FILENAME: &str = "cursor_missing_filename";

// --- Import ---
pub const IMPORT_JOB_NOT_FOUND: &str = "import_job_not_found";
pub const NO_IMPORTABLE_FILES: &str = "no_importable_files";
pub const IMPORT_PROCESSING_FAILED: &str = "import_processing_failed";

// --- Downloads ---
pub const NO_IMAGES_SELECTED: &str = "no_images_selected";
pub const SELECTED_IMAGES_NOT_FOUND: &str = "selected_images_not_found";
pub const TOO_MANY_IMAGES_REQUESTED: &str = "too_many_images_requested";
pub const DOWNLOAD_SIZE_LIMIT_EXCEEDED: &str = "download_size_limit_exceeded";
pub const DOWNLOAD_JOB_NOT_FOUND: &str = "download_job_not_found";
pub const DOWNLOAD_JOB_ACCESS_DENIED: &str = "download_job_access_denied";
pub const DOWNLOAD_JOB_NOT_COMPLETED: &str = "download_job_not_completed";
pub const DOWNLOAD_ARCHIVE_MISSING: &str = "download_archive_missing";
pub const ARCHIVE_GENERATION_FAILED: &str = "archive_generation_failed";

// --- Internal ---
pub const INTERNAL_ERROR: &str = "internal_error";
