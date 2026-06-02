# Tabella V1 Architecture

## Goal

Build a single-host private gallery for roughly 20,000 static images and 2 to 5 authenticated users. The system is same-domain, login-gated, and optimized for low-ops deployment on one machine.

## Fixed stack

- Frontend: Vite + React + TypeScript + MUI
- Backend: Rust + Axum + SQLx
- Database: PostgreSQL
- Media storage: local filesystem
- Deployment: systemd + Caddy + PostgreSQL

## Runtime topology

1. Caddy serves the built SPA from disk.
2. Caddy reverse proxies `/api/*` to the Axum service.
3. PostgreSQL stores application state, session state, and job state.
4. Original images and generated WebP derivatives live on the same host filesystem.
5. Long-running work is processed in-process by the API service through DB-backed job tables plus periodic polling.

## V1 capabilities

- Authenticated browsing only
- Grid, Masonry, and Justified list layouts
- Structured tag include and exclude filters
- Namespace-aware tag suggestions
- Rating, favorites, and basic sort filters
- Admin-only import, light metadata overwrite, and delete
- User batch download with zip generation and expiry cleanup

## Deliberate non-goals

- Public sharing and SEO
- OAuth or third-party login
- Object storage
- GIF, APNG, video, or animated assets
- Full booru query syntax
- Tag aliases or collaborative tag editing

## Added implementation decisions

These details were not fully fixed in the original summary, so this repo normalizes them for implementation:

- `users`, `images`, and `tags` use `bigint` primary keys.
- `sessions`, `import_jobs`, and `download_jobs` use `uuid` primary keys.
- All media remains behind authenticated API handlers; Caddy must not expose the media root directly.
- Session cookies should be `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Mutating requests should also enforce `Origin` or `Referer` checks because the app uses cookie auth.
- Cursor pagination should be opaque and keyset-based, encoded from the sort tuple rather than using offsets.
- Two extra indexes are worth treating as V1 baseline:
  - `image_tags(tag_id, image_id)` for tag-to-image lookups
  - `images(lower(original_filename), id)` for filename sorts

## Repository shape

- `apps/web`: SPA shell, route structure, shared theme, and query client
- `apps/api`: route tree, config loading, SQL migrations, and task orchestration
- `deploy`: Caddy and systemd examples
- `docs`: evolving product and implementation docs

## Data model

### users

- local username and Argon2id password hash
- role enum constrained to `admin` or `viewer`

### sessions

- server-side sessions with expiry and last-seen timestamps
- owned by a single user

### images

- unique by `sha256`
- stores original path, preview path, thumbnail path
- stores original filename, mime, width, height, file size
- stores imported metadata fields: `rating`, `source_url`, `note`
- uses `imported_at` and `updated_at` for default sort and housekeeping

### tags

- namespace and name stored alongside normalized fields
- uniqueness is enforced on normalized namespace plus normalized name

### image_tags

- many-to-many join
- uniqueness on `(image_id, tag_id)`

### favorites

- user-specific favorites
- uniqueness on `(user_id, image_id)`

### import_jobs

- persisted queue state for zip import processing
- stores counters plus JSON result payload for per-file issues

### download_jobs

- persisted queue state for archive generation
- stores selected image snapshot, archive path, expiry, and result metadata

## Media layout

Use content-addressed directories:

- `media/originals/ab/cd/<sha256>.<ext>`
- `media/previews/ab/cd/<sha256>.webp`
- `media/thumbnails/ab/cd/<sha256>.webp`
- `media/jobs/imports/<job-id>.zip`
- `media/jobs/downloads/<job-id>.zip`
- `media/tmp/<job-id>/...`

The first four hex characters determine the directory fan-out. This keeps each directory small and makes file GC predictable.

## Import pipeline

1. Admin uploads a zip package.
2. API stores the zip in a spool path and inserts an `import_jobs` row with `queued` status.
3. Background poller claims the next import job.
4. The job enumerates supported images and same-directory sidecar JSON files.
5. The service validates JSON, hashes the image, reads image dimensions and mime, and rejects unsupported or malformed items individually.
6. If the image is new, the original file is persisted and derivatives are generated.
7. If the image already exists, imported fields are overwritten from the newest package according to V1 rules.
8. Tags are normalized, upserted, and synchronized onto the image.
9. The job writes counters and per-item failures into `result_json`.

Partial failures are expected and should not roll back the entire job.

## Download pipeline

1. User submits up to 500 image IDs with an estimated original-size total capped at 2 GiB.
2. API inserts a `download_jobs` row with a snapshot of the requested image IDs.
3. Background poller creates a zip archive in the download spool.
4. Completed archives are served through an authenticated file endpoint.
5. After 24 hours, a cleanup pass deletes the archive and marks the job `expired`.

## Query model

### List images

Filtering supports:

- included tags
- excluded tags
- namespace-aware suggestions
- rating filters
- favorites-only filter
- sort by `newest`, `oldest`, `filename_asc`, `filename_desc`

### Pagination

Use keyset pagination only.

- `newest`: `(imported_at desc, id desc)`
- `oldest`: `(imported_at asc, id asc)`
- `filename_asc`: `(lower(original_filename) asc, id asc)`
- `filename_desc`: `(lower(original_filename) desc, id desc)`

Cursor payloads should include the applied sort and the last tuple values so mismatched cursors can be rejected safely.

## Frontend shape

### App shell

- React Router for route ownership
- TanStack Query for server state
- MUI for layout and inputs
- simple white and charcoal surfaces with indigo accents only

### Routes

- `/login`
- `/`
- `/admin/imports`

### Gallery UX

- structured tag chips with include or exclude state
- namespace filter support
- favorites and rating toggles
- layout switcher for Grid, Masonry, and Justified
- infinite scroll everywhere

### Rendering strategy

- Grid: CSS Grid plus virtualization
- Masonry: mature virtualized masonry library
- Justified: mature justified layout algorithm plus virtualization

The layout adapters should expose a consistent card contract so search, selection, and favorite overlays stay shared.

## API surface

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/images`
- `GET /api/tags/suggest`
- `POST /api/favorites/{image_id}`
- `DELETE /api/favorites/{image_id}`
- `POST /api/admin/imports`
- `GET /api/admin/imports/{job_id}`
- `POST /api/download-jobs`
- `GET /api/download-jobs/{job_id}`
- `GET /api/download-jobs/{job_id}/file`

## Security notes

- Media files must not be directly web-accessible outside authenticated handlers.
- Viewer users should receive authorization failures on all admin routes.
- Because the SPA and API share a domain, cookie auth is acceptable, but origin checks remain important on write routes.
- Uploaded import archives should be extracted into job-specific temp directories with zip-slip protection.

## Suggested build order

1. Implement configuration loading, database pool wiring, and migration startup.
2. Implement auth, seeded admin user bootstrap, and session middleware.
3. Implement import job enqueueing and background claim loop.
4. Implement image list query, tag suggestion, and favorites.
5. Implement authenticated preview and original media delivery.
6. Implement download job creation, polling, and expiry cleanup.
7. Replace mock frontend data with real query hooks and layout adapters.

