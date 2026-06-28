# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tabella is a private image gallery for small trusted groups. A Rust/Axum backend (`apps/api`) serves a JSON API, the media files, _and_ the built React SPA from a single binary. The frontend (`apps/web`) is React 19 + MUI + TanStack Query. A standalone Rust CLI (`crates/tagger-cli`) runs ONNX tagger models to produce sidecar JSON that the import pipeline consumes.

## Commands

Frontend (run from repo root; scripts proxy to the `@tabella/web` workspace):

```bash
pnpm install
pnpm run dev:web      # vite dev server on :5173, proxies /api and /media to 127.0.0.1:8787
pnpm run build:web    # tsc -b && vite build
pnpm run lint:web     # eslint
pnpm run format       # prettier --write .
```

Backend (from repo root):

```bash
cargo run -p api                          # runs migrations automatically on startup, then serves
cargo test --workspace                    # tests (config, cursor, import, downloads, etc.)
cargo fmt --all -- --check                # CI gate
cargo clippy --workspace --all-targets -- -D warnings   # CI gate; warnings are errors
```

A single backend test: `cargo test -p api <test_name>` (e.g. `cargo test -p api sanitize_upload_path_rejects_parent_traversal`).

Tagger CLI is a **separate Cargo workspace** (`crates/tagger-cli` has its own `[workspace]`, so it is _not_ built by root `cargo` commands). Build/run it from inside that directory:

```bash
cd crates/tagger-cli && cargo run -- tag ./images            # WD model (default)
cargo run -- tag ./images --model camie                       # Camie Tagger v2
```

It downloads models from Hugging Face on first run and writes `<image>.json` sidecars next to each image.

## Git Hooks

This project uses [Lefthook](https://github.com/evilmartians/lefthook) to enforce code quality before commit/push. Configuration lives in `lefthook.yml`.

**Pre-commit** (runs in parallel, ~10-15s on clean code):

- `prettier --check` on staged `.ts/.tsx/.json/.md/.yml` files
- `eslint` on staged web files
- Error-code contract check (`apps/web/scripts/check-error-codes.mjs`)
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`

**Pre-push**:

- `cargo test --workspace`

Hooks install automatically after `pnpm install` (via `prepare` script in root `package.json`). Failures block the commit/push; fix manually and retry.

**Escape hatches**:

```bash
git commit --no-verify                        # skip all hooks
LEFTHOOK=0 git commit                         # disable lefthook
LEFTHOOK_EXCLUDE=cargo-clippy git commit      # skip specific check
lefthook run pre-commit --tags frontend       # test only frontend checks
```

**Troubleshooting**: If hooks aren't firing after a fresh clone, run `npx lefthook install` manually.

## SQLx offline mode (important)

The API uses **compile-time-checked SQL** via SQLx with offline metadata cached in `.sqlx/`. CI and the Docker build set `SQLX_OFFLINE=true`, so they compile against the cached query data, not a live database. If you add or change any `sqlx::query!`-style checked query, you must regenerate the cache or the build breaks:

```bash
cargo sqlx prepare --workspace   # requires a reachable DATABASE_URL; commit the .sqlx/ changes
```

Note most queries here use the _unchecked_ string-builder forms (`sqlx::query`, `query_as`, `QueryBuilder`), which don't need offline data — but the checked ones in `.sqlx/` do.

## Error-code contract (keep in sync across 3 layers)

API errors flow through a stable string `code` that the frontend translates. When adding an error you must touch all of:

1. `apps/api/src/api/error_codes.rs` — the canonical `&'static str` constants.
2. `apps/web/src/lib/api-error-codes.ts` — mirror constant, and `apps/web/src/lib/api.ts` `ERROR_MESSAGE_MAP` (typed `satisfies Record<ApiErrorCode, string>`, so a missing entry fails the build).
3. `apps/web/src/locales/en.json` and `zh-CN.json` — the `api.errors.*` translation keys.

The wire shape is always `{ "error": <code>, "message": <fallback>, "params": <obj|null> }` (see `apps/api/src/api/error.rs`). The frontend prefers the translated message keyed by `code`; `params` feed i18n interpolation (e.g. `max_images`).

## Backend architecture

`apps/api/src/main.rs` wires everything:

- **`AppState`** = `{ config, pool: PgPool, tx: broadcast::Sender<ServerEvent> }`, cloned into every handler.
- **Routing layers** (order matters): authenticated media router (`ServeDir` for `/media/{originals,samples,thumbnails,avatars}` behind `require_media_session` middleware) → a blocklist that 404s private dirs (`/tmp`, `/media/temp`, `/media/downloads`, …) → `api::router` → SPA fallback (`ServeDir` on `TABELLA_FRONTEND_DIR` with `index.html` not-found fallback for client-side routing).
- **API router** (`api/mod.rs`) merges per-feature route modules: `auth_handlers`, `images`, `imports`, `downloads`, `profile`, `settings`, `users`, `health`, plus the `/api/events` SSE endpoint.

**Auth** (`auth.rs`, `api/guards.rs`): cookie-session based. Argon2 password hashing; sessions stored in Postgres with TTL. Guards are plain async fns called at the top of handlers — `require_user`, `require_editor`, `require_admin` (roles: `admin` > `editor` > `viewer`). A default admin is bootstrapped on startup from `TABELLA_BOOTSTRAP_ADMIN_*` if no admin exists.

**Two-tier config** (`config.rs`):

- `Config` — static, loaded once from env (`DATABASE_URL` required; `TABELLA_*` optional). Holds paths, listen addr, cookie settings, fallback limits.
- `DynamicConfig` — runtime-editable, persisted as a single JSON row in the `settings` table (key `'global'`), edited via `/api/settings` (admin only). Controls download limits, thumbnail/sample size & quality, import batch size. Always loaded fresh per operation via `DynamicConfig::load(pool, &config)`, falling back to `Config` values.

**Background work** (no external queue — Postgres _is_ the queue):

- `import_worker` (spawned once): polls `import_jobs` with `SELECT … FOR UPDATE SKIP LOCKED`, processes one job at a time, sleeps 5s when idle. On startup it marks any `running`/`extracting`/`processing` jobs as `failed` (crash recovery). Handles folder uploads, zip, and 7z; extracts to `temp_root/temp_extract/<job_id>` (outside the auth-served media tree), then dedups by SHA256, generates derivatives, and inserts rows.
- `cleanup` worker (spawned once): hourly; deletes expired `download_jobs` + their zips and prunes orphaned temp dirs older than 24h.
- Archive (download) jobs: spawned per-request via `tokio::spawn(process_archive_job)`, zips selected images into `temp_root/downloads/<job_id>.zip` (stored/uncompressed). Streamed back through `/api/download-jobs/{id}/file`, owner-checked.

**Real-time updates**: a single `tokio::sync::broadcast` channel. Workers `tx.send(ServerEvent { event, data })` (e.g. `import_job_updated`, `download_job_updated`); `/api/events` (`api/events.rs`) is an authenticated SSE endpoint that forwards them. Frontend `use-server-events.ts` is a singleton `EventSource` manager with reference counting, exponential-backoff reconnect, and an explicit `HEAD` probe to detect 401 (since `EventSource` hides status codes).

**Image pipeline** (`image_processor.rs`, `import_worker.rs`): SHA256 is the dedup key and the on-disk filename stem. Originals copied (not moved) to `media/originals/<sha>.<ext>`; thumbnail + sample re-encoded to WebP (`media/thumbnails`, `media/samples`). `sample_size = 0` means "full-size sample." Tags come from an optional `<image>.json` sidecar (`{ "tags": ["artist:name", "1girl", …], "rating": "safe|suggestive|explicit" }`).

**Tags** (`tags.rs`): a tag is `namespace:name` (empty namespace allowed, e.g. bare `1girl`). Stored normalized (lowercased) for uniqueness/lookup while preserving display case. Image listing supports include/exclude tag filters, rating filter, dimension/aspect-ratio filters, favorites, and **keyset (cursor) pagination** — the cursor encodes the sort key, so changing `push_image_sort_order` requires matching `push_image_cursor_filter`/`encode_image_cursor` in `api/images.rs`.

## Frontend architecture

- `App.tsx` sets up providers (MUI theme with light/dark in `localStorage`, dayjs localization, TanStack Query, `AuthProvider`) and routes. `RequireAuth` + `RequireRole` guards gate `/admin/*` pages.
- **Server state** = TanStack Query; the gallery uses `useInfiniteQuery` (`hooks/use-gallery-query.ts`) driven by an `IntersectionObserver` sentinel for infinite scroll. **UI/session state** = Zustand (`gallery/gallery-session-store.ts` for search/filters/selection, `gallery-preferences-store.ts` for persisted prefs). Note the basic-search vs advanced-search filters are mutually exclusive and the store clears one when the other activates.
- All HTTP goes through `lib/api.ts` `request()` (credentials included, JSON by default, throws typed `ApiError`). File uploads use `uploadWithProgress` (raw `XMLHttpRequest` for progress events). Backend `snake_case` field names are mapped to camelCase `GalleryItem` in the query hook.
- i18n via i18next (`locales/en.json`, `zh-CN.json`). PWA via `vite-plugin-pwa` (manual `ReloadPrompt`); manual vendor chunk splitting (`mui-vendor`, `react-vendor`) in `vite.config.ts`.

## Database

Plain SQLx migrations in `apps/api/migrations/` (`NNNN_name.sql`), embedded via `sqlx::migrate!()` and run automatically at startup. Core tables: `users`, `sessions`, `images`, `tags` + `image_tags` (M2M), `favorites`, `import_jobs`, `download_jobs`, `settings`. Note `download_jobs` was redefined in `0007_create_download_jobs.sql` (drops and recreates with a different column set than `0001`) — trust the latest migration for its actual schema.

## Conventions

- Prettier: no semicolons, single quotes, width 100, trailing commas (`.prettierrc`). Imports are sorted by `eslint-plugin-simple-import-sort`.
- Rust edition 2024; handlers return `Result<_, ApiError>`; errors wrapped with `anyhow::Context` and surfaced via `ApiError::internal`.
- Conventional-commit messages, often Chinese (`fix(web):`, `chore:`). Match the existing style.

### Comments

Comments are written in English and explain _why_, not _what_. Match the surrounding density.

Backend (Rust):

- Every module opens with a `//!` inner doc comment — one line for simple modules, or a multi-section markdown block (with `# Heading`s and ` ```text ` diagrams) for the complex ones (`import_worker.rs`).
- Public items (`fn`, `struct`, `enum`, variants) get `///` outer doc comments. Use markdown: backtick cross-references like [`upsert_tag`], `**bold**` for emphasis, and note concurrency/transaction contracts where relevant.
- In-body `//` comments explain non-obvious decisions (race guards, ordering constraints, why a query is shaped a certain way) — not line-by-line narration.
- No `TODO`/`FIXME` markers and no `#[allow(...)]` lint suppressions in committed code; fix the underlying issue instead.

Frontend (TypeScript):

- Every `.ts`/`.tsx` file opens with a `/** */` JSDoc header describing its purpose, key behaviors, and `{@link Symbol}` cross-references.
- Exported constants, types, and standalone functions get a single-line `/** ... */` JSDoc. Zustand setters get a one-line `/** */` describing side-effects, placed directly above the method inside the `create(...)` block.
- In-body `//` comments explain mutually-exclusive state, derived values, and other non-obvious logic.
- Lint suppressions are always rule-scoped and never bare: `// eslint-disable-next-line <rule>` for a single line, or a file-top `/* eslint-disable <rule> */` block (after the JSDoc header) when a whole file needs it. No `@ts-ignore`/`@ts-expect-error`.

## Deployment

Multi-stage `Dockerfile` (pnpm build → cargo `--release` with `SQLX_OFFLINE=true` → debian-slim runtime serving frontend from `/app/dist`). `docker-compose.yml` adds Postgres 16. Manual/systemd deploy docs and a Caddyfile example live in `deploy/` and `docs/`. The full HTTP API reference (all routes, parameters, and response shapes) is at `docs/api-reference.md`.
