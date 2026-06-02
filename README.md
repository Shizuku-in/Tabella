# Tabella

Tabella is a private single-host image gallery for small trusted groups. This repository now contains:

- a V1 architecture document derived from the agreed product scope
- a Vite + React + TypeScript + MUI frontend shell
- an Axum + SQLx backend skeleton
- an initial PostgreSQL migration for the core V1 tables
- deployment examples for Caddy and systemd

## Repository layout

- `apps/web`: SPA frontend
- `apps/api`: Rust API service
- `docs`: architecture and implementation notes
- `deploy`: deployment samples for Caddy and systemd

## Current status

This commit is a project bootstrap, not a full implementation. The codebase is ready for incremental development of:

- auth and session persistence
- import job execution
- image search and pagination
- favorites and download jobs
- authenticated media delivery

## Quick start

```bash
npm install
npm run dev:web
cargo run -p api
```

The frontend is configured to proxy `/api` to `http://127.0.0.1:8787` during local development.

