# Manual Deployment Guide

This guide covers a non-Docker deployment on a Linux server using:

- PostgreSQL
- a compiled `api` binary
- a built frontend
- `systemd` for process management
- optional Caddy for TLS and reverse proxying

It is based on the repository's existing deployment samples in [`deploy/env`](../deploy/env), [`deploy/systemd`](../deploy/systemd), and [`deploy/Caddyfile.example`](../deploy/Caddyfile.example).

## Deployment Layout

The sample files imply a layout like this:

```text
/srv/tabella/
  app/
    dist/
  bin/
    tabella-api
  data/
    media/
    tmp/
```

You can choose a different layout, but then update the env file and systemd unit accordingly.

## Prerequisites

- Linux server with `systemd`
- PostgreSQL 16 or compatible PostgreSQL server
- Node.js 20+
- `pnpm`
- Rust toolchain
- A reverse proxy if you want HTTPS

## 1. Install Dependencies

On Debian or Ubuntu, a typical setup looks like:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev postgresql postgresql-client caddy
```

Install Node.js and pnpm using your preferred method, then verify:

```bash
node --version
pnpm --version
rustc --version
cargo --version
psql --version
```

## 2. Create the Application User and Directories

```bash
sudo useradd --system --home /srv/tabella --shell /usr/sbin/nologin tabella
sudo mkdir -p /srv/tabella/app /srv/tabella/bin /srv/tabella/data/media /srv/tabella/data/tmp
sudo mkdir -p /etc/tabella
sudo chown -R tabella:tabella /srv/tabella
```

## 3. Prepare PostgreSQL

Create the database and user:

```bash
sudo -u postgres psql
```

Inside `psql`:

```sql
CREATE USER tabella WITH PASSWORD 'change-me';
CREATE DATABASE tabella OWNER tabella;
\q
```

## 4. Build the Frontend

From the repository root:

```bash
pnpm install
pnpm run build:web
```

This produces the frontend in:

- `apps/web/dist` relative to the repo root on Linux

Copy the built frontend to the server layout:

```bash
sudo rsync -a apps/web/dist/ /srv/tabella/app/dist/
sudo chown -R tabella:tabella /srv/tabella/app/dist
```

## 5. Build the Backend

From the repository root:

```bash
cargo build --release --manifest-path apps/api/Cargo.toml
```

The resulting binary is:

- `target/release/api`

Install it to the path expected by the sample unit:

```bash
sudo install -m 0755 target/release/api /srv/tabella/bin/tabella-api
sudo chown tabella:tabella /srv/tabella/bin/tabella-api
```

## 6. Create the Environment File

Use [`deploy/env/tabella-api.env.example`](../deploy/env/tabella-api.env.example) as the starting point:

```bash
sudo cp deploy/env/tabella-api.env.example /etc/tabella/tabella-api.env
sudo chmod 600 /etc/tabella/tabella-api.env
```

Edit `/etc/tabella/tabella-api.env` and set at least:

```env
DATABASE_URL=postgres://tabella:change-me@127.0.0.1:5432/tabella
TABELLA_LISTEN_ADDR=127.0.0.1:8787
TABELLA_MEDIA_ROOT=/srv/tabella/data/media
TABELLA_TEMP_ROOT=/srv/tabella/data/tmp
TABELLA_SESSION_COOKIE_NAME=tabella_session
TABELLA_SESSION_TTL_HOURS=720
TABELLA_SECURE_COOKIES=true
TABELLA_BOOTSTRAP_ADMIN_USERNAME=admin
TABELLA_BOOTSTRAP_ADMIN_PASSWORD=change-me
TABELLA_MAX_DOWNLOAD_IMAGES=500
TABELLA_MAX_DOWNLOAD_TOTAL_BYTES=2147483648
TABELLA_DOWNLOAD_RETENTION_HOURS=24
TABELLA_FRONTEND_DIR=/srv/tabella/app/dist
```

Notes:

- `DATABASE_URL` is required
- `TABELLA_FRONTEND_DIR` tells the API where to find the built frontend
- `TABELLA_SECURE_COOKIES=true` is recommended when using HTTPS
- the bootstrap admin account is created automatically on startup if needed

## 7. Install the systemd Service

Copy the sample unit:

```bash
sudo cp deploy/systemd/tabella-api.service /etc/systemd/system/tabella-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now tabella-api
```

Check status:

```bash
sudo systemctl status tabella-api
sudo journalctl -u tabella-api -f
```

The API runs database migrations automatically during startup.

## 8. (Optional) Configure Caddy

If you want HTTPS and a public hostname, use [`deploy/Caddyfile.example`](../deploy/Caddyfile.example) as a reference.

Example `/etc/caddy/Caddyfile`:

```caddyfile
tabella.example.com {
    encode zstd gzip

    reverse_proxy 127.0.0.1:8787
}
```

Then reload Caddy:

```bash
sudo systemctl reload caddy
```

This is the simplest setup because the Rust API can serve both:

- the `/api/*` routes
- the built SPA from `TABELLA_FRONTEND_DIR`

If you want Caddy to serve static frontend files directly instead, you can adapt the repository's example Caddyfile and point `root` at the built `dist` directory.

## 9. Updating Tabella

When you deploy a new version:

```bash
git pull
pnpm install
pnpm run build:web
cargo build --release --manifest-path apps/api/Cargo.toml
sudo rsync -a apps/web/dist/ /srv/tabella/app/dist/
sudo install -m 0755 target/release/api /srv/tabella/bin/tabella-api
sudo systemctl restart tabella-api
```

## Key Configuration Variables

The backend currently reads these important variables:

- `DATABASE_URL`
- `TABELLA_LISTEN_ADDR`
- `TABELLA_MEDIA_ROOT`
- `TABELLA_TEMP_ROOT`
- `TABELLA_SESSION_COOKIE_NAME`
- `TABELLA_SESSION_TTL_HOURS`
- `TABELLA_SECURE_COOKIES`
- `TABELLA_BOOTSTRAP_ADMIN_USERNAME`
- `TABELLA_BOOTSTRAP_ADMIN_PASSWORD`
- `TABELLA_MAX_DOWNLOAD_IMAGES`
- `TABELLA_MAX_DOWNLOAD_TOTAL_BYTES`
- `TABELLA_DOWNLOAD_RETENTION_HOURS`
- `TABELLA_IMPORT_PROGRESS_BATCH_SIZE`
- `TABELLA_FRONTEND_DIR`