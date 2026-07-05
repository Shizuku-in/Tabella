# Stage 1: Build the React frontend
FROM node:24.15.0-slim AS frontend-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

# Install dependencies first — only invalidates when lockfile changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy web app source after install so dependency layer stays cached
COPY apps/web apps/web/
RUN pnpm --filter @tabella/web build

# Stage 2: Build the Rust backend
FROM rust:1.96-slim AS backend-builder
WORKDIR /app
# Install system dependencies required for compilation
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY .sqlx .sqlx/
COPY apps/api apps/api/

# Use the pre-generated sqlx offline data
ENV SQLX_OFFLINE=true

RUN cargo build --release --manifest-path apps/api/Cargo.toml

# Stage 3: Final runtime image
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y ca-certificates libssl3 curl && rm -rf /var/lib/apt/lists/*

# Copy built artifacts
COPY --from=backend-builder /app/target/release/api /usr/local/bin/tabella-server
COPY --from=frontend-builder /app/apps/web/dist /app/dist

# Set environment variables
ENV TABELLA_FRONTEND_DIR=/app/dist
ENV TABELLA_LISTEN_ADDR=0.0.0.0:8787

# Create necessary directories
RUN mkdir -p /app/var/media /app/var/tmp

EXPOSE 8787

CMD ["tabella-server"]
