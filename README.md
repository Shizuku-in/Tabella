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

### Common Commands

```bash
# Frontend
pnpm install              # install dependencies
pnpm run dev:web          # start vite dev server (port 5173, proxies /api → 127.0.0.1:8787)
pnpm run build:web        # type-check + production build
pnpm run lint:web         # eslint
pnpm run format           # prettier --write .

# Backend
cargo run -p api                        # start server (runs migrations on startup)
cargo test --workspace                  # run all tests
cargo test -p api <test_name>           # run a single test
cargo fmt                               # format
cargo fmt --all -- --check              # format check (CI gate)
cargo clippy --workspace --all-targets -- -D warnings  # lint check (CI gate)

# SQLx (required after changing checked queries)
cargo sqlx prepare --workspace          # regenerate offline query cache

# Tagger CLI (standalone workspace — run from crates/tagger-cli)
cd crates/tagger-cli && cargo run -- tag ./images              # WD model (default)
cd crates/tagger-cli && cargo run -- tag ./images --model camie # Camie Tagger v2

# Lefthook (manual invocation)
lefthook run pre-commit                 # run all pre-commit checks
lefthook run pre-commit --tags frontend # frontend-only checks
```

### Git Hooks

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
