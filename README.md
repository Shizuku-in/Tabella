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
