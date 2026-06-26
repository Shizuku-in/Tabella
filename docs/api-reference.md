# API Reference

Base URL: `http://localhost:8787` (dev) — all API routes are prefixed with `/api`.

## Authentication

All API routes except `POST /api/auth/login` and `GET /healthz` require a valid session cookie. Obtain it by calling the login endpoint; the server sets a `HttpOnly` cookie automatically.

## Error format

Every error response uses the same JSON shape:

```json
{ "error": "error_code", "message": "human-readable fallback", "params": null }
```

`params` is `null` or an object with interpolation values (e.g. `{ "max_images": 200 }`).

| HTTP status | meaning                        |
| ----------- | ------------------------------ |
| 400         | Bad request — see `error` code |
| 401         | Not authenticated              |
| 403         | Insufficient role              |
| 404         | Resource not found             |
| 413         | Payload too large              |
| 500         | Internal server error          |

## Roles

`admin` > `editor` > `viewer`. Guard notation below: **any** = viewer+, **editor** = editor+, **admin** = admin only.

---

## Health

### `GET /healthz`

No auth. Returns service status.

```json
{
  "status": "ok",
  "service": "tabella-api",
  "version": "0.1.4",
  "max_download_images": 200,
  "download_retention_hours": 24
}
```

---

## Auth

### `POST /api/auth/login`

No auth.

**Body**

```json
{ "username": "alice", "password": "s3cr3t" }
```

**Response 200** — sets session cookie, returns user object (see [User object](#user-object)).

**Errors** — `missing_credentials`, `invalid_credentials`

---

### `POST /api/auth/logout`

**any** — Destroys the current session and clears the cookie. `204 No Content`.

---

### `GET /api/me`

**any** — Returns the currently authenticated user.

```json
{ "user": { <user object> } }
```

---

## Images

### `GET /api/images`

**any** — Paginated image list.

**Query parameters**

| param              | type                                                          | description                                                 |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `sort`             | `newest`\|`oldest`\|`filename_asc`\|`filename_desc`\|`random` | default `newest`                                            |
| `seed`             | integer                                                       | seed for `random` sort; kept stable across pages via cursor |
| `limit`            | 1–100                                                         | page size, default 50                                       |
| `cursor`           | string                                                        | opaque token from previous response's `next_cursor`         |
| `rating`           | CSV or repeated                                               | filter to exact set: `safe`, `suggestive`, `explicit`       |
| `include_tags`     | CSV or repeated                                               | AND-filter: images must have all listed tags                |
| `exclude_tags`     | CSV or repeated                                               | AND-filter: images must not have any listed tags            |
| `favorites_only`   | boolean                                                       | only return the caller's favorites                          |
| `uploaded_after`   | ISO 8601                                                      |                                                             |
| `uploaded_before`  | ISO 8601                                                      |                                                             |
| `min_width`        | integer                                                       | pixels                                                      |
| `min_height`       | integer                                                       | pixels                                                      |
| `aspect_ratio_min` | float                                                         | width/height                                                |
| `aspect_ratio_max` | float                                                         | width/height                                                |

**Response 200**

```json
{
  "items": [ { <image list item> } ],
  "next_cursor": "…"
}
```

`next_cursor` is absent or `null` when there are no more pages.

**Errors** — `invalid_cursor`, `cursor_missing_imported_at`, `cursor_missing_filename`

---

### `GET /api/images/random`

**any** — Returns a single randomly selected image.

**Query parameters**

| param        | type                              | description                                                                  |
| ------------ | --------------------------------- | ---------------------------------------------------------------------------- |
| `rating`     | CSV or repeated                   | exact set to pick from                                                       |
| `max_rating` | `safe`\|`suggestive`\|`explicit`  | inclusive ceiling; default behaviour when _neither_ param is given is `safe` |
| `quality`    | `thumbnail`\|`sample`\|`original` | which URL to return as `url`; default `original`                             |

When both `rating` and `max_rating` are supplied they are ANDed (intersection). Providing `max_rating=explicit` lifts the ceiling; providing `rating=explicit` picks from an exact set.

**Response 200**

```json
{
  "id": 42,
  "url": "/media/originals/…",
  "quality": "original",
  "width": 3541,
  "height": 5016,
  "rating": "suggestive",
  "original_filename": "artwork.png",
  "tags": ["artist:foo", "1girl"]
}
```

**Errors** — `image_not_found` (no image matches the filters or the gallery is empty)

---

### `GET /api/images/{id}`

**any** — Fetch a single image's full metadata by ID. Returns the same [image list item](#image-list-item) shape as `GET /api/images`, including `is_favorite`, `tags`, and `uploader` for the calling user.

**Response 200** — [image list item](#image-list-item).

**Errors** — `image_not_found`

---

### `PATCH /api/images/{id}`

**editor** — Update an image's rating and/or tags.

**Body** (all fields optional)

```json
{ "rating": "safe", "tags": ["artist:foo", "1girl"] }
```

Response: `204 No Content`.

---

### `DELETE /api/images/{id}`

**editor** — Permanently delete an image and its media files. `204 No Content`.

**Errors** — `image_not_found`

---

### `GET /api/tags`

**any** — Browse all tags with usage counts, sorted by frequency (most-used first, then alphabetically). Useful for tag clouds and filter sidebars.

**Query parameters**

| param       | description                                                |
| ----------- | ---------------------------------------------------------- |
| `namespace` | filter to a single namespace (e.g. `artist`); omit for all |
| `limit`     | 1–500, default 100                                         |

**Response 200**

```json
{
  "items": [
    { "tag": "1girl", "count": 1280 },
    { "tag": "artist:foo", "count": 42 }
  ]
}
```

`count` is the number of images carrying the tag (0 for unused tags).

---

### `GET /api/tags/suggest`

**any** — Autocomplete tag names.

**Query parameters**

| param   | description                         |
| ------- | ----------------------------------- |
| `q`     | prefix to search (case-insensitive) |
| `limit` | 1–50, default 20                    |

**Response 200**

```json
{ "items": ["artist:alice", "1girl", "landscape"] }
```

---

### `POST /api/favorites/{id}`

**any** — Add an image to the caller's favorites. `204 No Content` (idempotent).

---

### `DELETE /api/favorites/{id}`

**any** — Remove an image from favorites. `204 No Content`.

---

## Downloads

### `POST /api/download-jobs`

**any** — Create an archive of selected images. The job runs in the background.

**Body**

```json
{ "image_ids": [1, 2, 3], "quality": "original" }
```

`quality`: `thumbnail` | `sample` | `original` (default `original`).

**Response 200** — [Download job object](#download-job-object).

**Errors** — `no_images_selected`, `selected_images_not_found`, `too_many_images_requested` (params: `max_images`), `download_size_limit_exceeded` (params: `max_total_bytes`)

---

### `GET /api/download-jobs/{id}`

**any** — Poll job status. Only the job's creator can access it.

**Response 200** — [Download job object](#download-job-object).

**Errors** — `download_job_not_found`, `download_job_access_denied`

---

### `GET /api/download-jobs/{id}/file`

**any** — Download the completed zip archive (streamed). Sets `Content-Disposition: attachment`.

**Errors** — `download_job_not_found`, `download_job_access_denied`, `download_job_not_completed`, `download_archive_missing`

---

## Imports

### `GET /api/admin/imports`

**editor** — List the 50 most recent import jobs (newest first).

**Response 200**

```json
{ "items": [ { <import job> } ] }
```

---

### `POST /api/admin/imports`

**admin** — Create an import job from a server-side file path (folder, zip, or 7z).

**Body**

```json
{ "source_path": "/srv/media/batch.zip" }
```

**Response 200** — `{ "id": "<uuid>", "status": "queued" }`

---

### `POST /api/admin/imports/upload`

**editor** — Upload image files or archives directly from a browser. No body-size limit; respects the `max_upload_bytes` dynamic setting enforced mid-stream.

**Query parameters** — `type=folder` (default) | `zip` | `7z`

**Content-Type** — `multipart/form-data`; each file is a field with its filename set.

**Response 200** — `{ "id": "<uuid>", "status": "queued" }`

**Errors** — `no_files_uploaded`, `invalid_upload_path`, `payload_too_large`

---

### `GET /api/admin/imports/{job_id}`

**editor** — Fetch a single import job.

```json
{
  "id": "<uuid>",
  "status": "processing",
  "total_items": 120,
  "processed_items": 60,
  "succeeded_items": 58,
  "failed_items": 2,
  "created_at": "…",
  "finished_at": null,
  "last_error": null,
  "error_code": null,
  "error_params": null
}
```

Import job statuses: `queued` → `extracting` → `processing` → `completed` | `failed`.

**Errors** — `import_job_not_found`

---

## Profile

### `GET /api/profile`

**any** — Returns the caller's full [user object](#user-object).

---

### `PUT /api/profile`

**any** — Update username and/or password. All fields are optional; omit to leave unchanged.

**Body**

```json
{
  "username": "new_name",
  "current_password": "old_pass",
  "new_password": "n3w_pass1"
}
```

Password change requires both `current_password` and `new_password`. All other active sessions are invalidated on password change.

**Response 200** — updated [user object](#user-object).

**Errors** — `invalid_username`, `duplicate_username`, `missing_current_password`, `missing_new_password`, `invalid_password`, `weak_password_*`

---

### `POST /api/profile/avatar`

**any** — Upload a new avatar image (PNG, JPEG, GIF, or WebP). Max 5 MB.

**Content-Type** — `multipart/form-data`, field name `file`.

**Response 200** — `{ "avatar_url": "/media/avatars/7.png?v=1234567890" }`

---

## Settings

### `GET /api/settings`

**admin** — Returns the current dynamic server configuration.

### `PUT /api/settings`

**admin** — Overwrite the dynamic configuration. Send the full object (merge is not supported).

**Body / response**

```json
{
  "max_download_images": 200,
  "max_download_total_bytes": 2147483648,
  "download_retention_hours": 24,
  "session_ttl_hours": 720,
  "secure_cookies": false,
  "import_progress_batch_size": 10,
  "thumbnail_size": 400,
  "thumbnail_quality": 0.8,
  "sample_size": 1280,
  "sample_quality": 0.85,
  "max_upload_bytes": 536870912
}
```

`sample_size = 0` means "no downscaling — use the original dimensions". All numeric values must be > 0.

**Errors** — `invalid_settings`

---

## Users (admin)

### `GET /api/admin/users`

**admin** — List all users ordered by creation date (newest first).

**Response 200** — `[ { <user object> } ]`

---

### `POST /api/admin/users`

**admin** — Create a new user.

**Body**

```json
{ "username": "bob", "password": "s3cr3t1", "role": "viewer" }
```

**Response 201** — [user object](#user-object).

**Errors** — `invalid_username`, `duplicate_username`, `weak_password_too_short`, `weak_password_missing_lowercase`, `weak_password_missing_number`

---

### `PUT /api/admin/users/{id}`

**admin** — Update a user's role and/or password (both optional). Changes invalidate the user's existing sessions (except the current admin session when editing self).

**Body**

```json
{ "password": "n3wpass1", "role": "editor" }
```

**Response 200** (when changed) or `204` (nothing changed).

**Errors** — `user_not_found`, `role_change_not_allowed` (admin cannot change their own role)

---

### `DELETE /api/admin/users/{id}`

**admin** — Delete a user. Cannot delete the currently authenticated admin. `204 No Content`.

**Errors** — `user_not_found`, `self_delete_not_allowed`

---

## Real-time events

### `GET /api/events`

**any** — Server-Sent Events stream. Connect once per session; the frontend uses exponential-backoff reconnect with a `HEAD` probe to detect 401.

Each event has an `event` name and a JSON `data` payload:

| event name             | emitted when                |
| ---------------------- | --------------------------- |
| `import_job_updated`   | import job status changes   |
| `download_job_updated` | download job status changes |

The stream terminates when the server shuts down.

---

## Shared object shapes

### User object

```json
{
  "id": 1,
  "username": "alice",
  "role": "admin",
  "created_at": "2024-01-01T00:00:00Z",
  "avatar_url": "/media/avatars/1.png?v=1234567890"
}
```

`role`: `admin` | `editor` | `viewer`. `avatar_url` is `null` when no avatar has been set.

### Image list item

```json
{
  "id": 42,
  "original_filename": "artwork.png",
  "thumbnail_url": "/media/thumbnails/…",
  "preview_url": "/media/samples/…",
  "original_url": "/media/originals/…",
  "width": 3541,
  "height": 5016,
  "sha256": "d392f2…",
  "source_url": null,
  "note": null,
  "imported_at": "2024-06-01T12:00:00Z",
  "rating": "safe",
  "is_favorite": false,
  "tags": ["artist:foo", "1girl"],
  "file_size": 4194304,
  "uploader": { "id": 1, "username": "alice", "avatar_url": null }
}
```

`original_url` is `null` when the original was not retained. `uploader` is `null` for legacy imports.

### Download job object

```json
{
  "id": "<uuid>",
  "status": "completed",
  "total_images": 3,
  "total_bytes": 12582912,
  "error_message": null,
  "error_code": null,
  "error_params": null
}
```

Job statuses: `pending` → `completed` | `failed`.
