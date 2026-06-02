# Tabella 🌟

Tabella is a modern, high-performance private image gallery designed for small, trusted groups. It provides a stunning, highly customizable masonry and grid UI on the frontend, backed by a blazing fast Rust-powered media processing and import engine.

## 🚀 Features

### Frontend (Web)
- **Stunning Gallery UI:** Switch seamlessly between Masonry, Grid, and Justified layout modes.
- **Advanced Configuration:** Customize columns for different breakpoints, toggle hover information, and select image viewing quality directly from a floating settings panel.
- **Dark / Light Mode:** Native dark mode support with automatic system preference detection and local persistence.
- **Modern Stack:** Built with React 19, TypeScript, Vite, Material UI (MUI), and TanStack Query.
- **Lightbox Viewer:** Fast, responsive lightbox for viewing high-res originals and sample images.
- **Real-time Admin Dashboard:** Monitor background import jobs with visual progress bars and real-time status updates (Supports direct File, Folder, ZIP, and 7Z uploads).

### Backend (API)
- **High-Performance Rust Backend:** Powered by `Axum`, `Tokio`, and `SQLx` for maximum throughput and memory safety.
- **Robust Import Engine:** Direct support for uploading `.zip` and `.7z` archive packages. Server-side automatic extraction and async background processing queues.
- **Media Processing:** Automatically generates highly-optimized WebP thumbnails and preview samples using the `image` crate.
- **PostgreSQL Database:** Reliable relational storage for images, tags, favorites, and job state tracking.

## 📁 Repository Layout

- `apps/web`: SPA frontend (React + Vite)
- `apps/api`: Rust API service (Axum)
- `docs`: Architecture and implementation notes
- `deploy`: Deployment samples for Caddy and systemd

## 🛠️ Quick Start

### Prerequisites
- Node.js (v18+)
- Rust (cargo)
- PostgreSQL database (running locally or remote)

### Setup

1. **Install dependencies and start the Frontend:**
```bash
pnpm install
pnpm run dev:web
```
*The frontend proxy is configured to forward `/api` requests to `http://127.0.0.1:8787` during local development.*

2. **Start the Backend:**
```bash
cargo run -p api
```
*The backend will automatically run database migrations upon startup.*

## 📝 Current Status

The Tabella 1.0 core foundation is fully established. It includes working user authentication, robust image import queues, gallery layout customization, search by tags, favorites, and archive extractions. 
