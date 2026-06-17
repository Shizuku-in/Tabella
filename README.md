# Tabella

A modern, high-performance private image gallery designed for small, trusted groups. Features a stunning UI backed by a blazing-fast Rust engine.

## 🛠️ Stack

- **Frontend:** React 19, TypeScript, Vite, MUI, TanStack Query
- **Backend:** Rust, Axum, SQLx, PostgreSQL, Tokio

## 🚀 Quick Start

**Prerequisites:** Node.js (v18+), Rust, PostgreSQL.

### 1. Start Frontend

```bash
pnpm install
pnpm run dev:web
```

_(Proxy routes `/api` to `http://127.0.0.1:8787`)_

### 2. Start Backend

```bash
cargo run -p api
```

_(Database migrations run automatically on startup)_

## 🧑‍💻 Development

This project uses [Lefthook](https://github.com/evilmartians/lefthook) for automated code quality checks:

- **Pre-commit**: Format checks (prettier, cargo fmt) + linting (eslint, clippy) + error-code contract validation
- **Pre-push**: Test suite (cargo test)

Lefthook installs automatically after `pnpm install` (via the `prepare` script). If checks fail, fix the issues manually and re-commit.

**Escape hatches** (use sparingly):

```bash
git commit --no-verify          # skip all hooks
LEFTHOOK=0 git commit           # disable lefthook entirely
LEFTHOOK_EXCLUDE=cargo-clippy git commit  # skip specific check
```
