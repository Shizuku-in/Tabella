# Docker Deployment Guide

Deploys _Tabella_ Docker Compose using the repository's existing [`docker-compose.yml`](../docker-compose.yml) and [`Dockerfile`](../Dockerfile).

## Overview

The Docker setup includes:

- `tabella`: the Rust API plus the built frontend in a single container
- `db`: PostgreSQL 16
- `tabella-data`: a Docker volume for uploaded media
- `tabella-db-data`: a Docker volume for PostgreSQL data

The application listens on port `8787` inside the container and is published to the host as `8787:8787`.

## Prerequisites

- Docker Engine
- Docker Compose v2

Verify your environment:

```bash
docker --version
docker compose version
```

## Quick Start

From the repository root:

```bash
docker compose up -d --build
```

Then open:

- `http://127.0.0.1:8787`

The default bootstrap admin in the current compose file is:

- Username: `admin`
- Password: `admin`

## What the Compose File Configures

The current compose file sets:

- `DATABASE_URL=postgres://tabella:tabella_secret@db/tabella`
- `TABELLA_LISTEN_ADDR=0.0.0.0:8787`
- `TABELLA_MEDIA_ROOT=/app/var/media`
- `TABELLA_TEMP_ROOT=/app/var/tmp`
- `TABELLA_SESSION_COOKIE_NAME=tabella_session`
- `TABELLA_SESSION_TTL_HOURS=720`
- `TABELLA_SECURE_COOKIES=false`
- `TABELLA_BOOTSTRAP_ADMIN_USERNAME=admin`
- `TABELLA_BOOTSTRAP_ADMIN_PASSWORD=admin`

The container stores media in the named volume `tabella-data`.

## Recommended Production Changes

Before exposing the service publicly, update [`docker-compose.yml`](../docker-compose.yml):

- Replace `tabella_secret` with a strong PostgreSQL password
- Replace the bootstrap admin password with a strong value
- Set `TABELLA_SECURE_COOKIES=true` when serving through HTTPS
- Consider binding to `localhost` and placing a reverse proxy.

Example:

```yaml
environment:
  - DATABASE_URL=postgres://tabella:REPLACE_ME@db/tabella
  - TABELLA_LISTEN_ADDR=0.0.0.0:8787
  - TABELLA_MEDIA_ROOT=/app/var/media
  - TABELLA_TEMP_ROOT=/app/var/tmp
  - TABELLA_SESSION_COOKIE_NAME=tabella_session
  - TABELLA_SESSION_TTL_HOURS=720
  - TABELLA_SECURE_COOKIES=true
  - TABELLA_BOOTSTRAP_ADMIN_USERNAME=admin
  - TABELLA_BOOTSTRAP_ADMIN_PASSWORD=REPLACE_ME
```

## Updating Tabella

When deploying a new version:

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically when the API starts.

## Reverse Proxy and HTTPS

For a public deployment, put Caddy, Nginx, or another TLS terminator in front of Tabella.

Typical layout:

- reverse proxy listens on `443`
- proxy forwards requests to `127.0.0.1:8787`
- `TABELLA_SECURE_COOKIES=true`

## Data Locations

Inside the container:

- media: `/app/var/media`
- temp files: `/app/var/tmp`
- frontend build: `/app/dist`

Persisted by Docker volumes:

- `tabella-data`
- `tabella-db-data`
