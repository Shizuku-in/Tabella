# 常规部署指南

本文档介绍如何在非 Docker 环境下部署 Tabella，目标环境为 Linux 服务器，使用：

- PostgreSQL
- 编译后的 `api` 产物
- 已构建前端
- `systemd` 管理进程
- 可选的 Caddy 作为 HTTPS 与反向代理

内容基于仓库现有部署样例：

- [`deploy/env`](../deploy/env)
- [`deploy/systemd`](../deploy/systemd)
- [`deploy/Caddyfile.example`](../deploy/Caddyfile.example)

## 部署目录结构

样例文件默认对应如下目录结构：

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

你也可以使用其他目录结构，但要同步修改环境变量文件和 systemd unit。

## 前置要求

- 带 `systemd` 的 Linux 服务器
- PostgreSQL 16 或兼容版本
- Node.js 20+
- `pnpm`
- Rust 工具链
- 如果需要 HTTPS，准备一个反向代理

## 1. 安装依赖

在 Debian 或 Ubuntu 上，一个常见安装方式如下：

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev postgresql postgresql-client caddy
```

再用你偏好的方式安装 Node.js 和 pnpm，然后确认版本：

```bash
node --version
pnpm --version
rustc --version
cargo --version
psql --version
```

## 2. 创建应用用户和目录

```bash
sudo useradd --system --home /srv/tabella --shell /usr/sbin/nologin tabella
sudo mkdir -p /srv/tabella/app /srv/tabella/bin /srv/tabella/data/media /srv/tabella/data/tmp
sudo mkdir -p /etc/tabella
sudo chown -R tabella:tabella /srv/tabella
```

## 3. 准备 PostgreSQL

创建数据库和用户：

```bash
sudo -u postgres psql
```

在 `psql` 里执行：

```sql
CREATE USER tabella WITH PASSWORD 'change-me';
CREATE DATABASE tabella OWNER tabella;
\q
```

## 4. 构建前端

在仓库根目录执行：

```bash
pnpm install
pnpm run build:web
```

前端构建产物位于：

- `apps/web/dist`

将构建结果复制到部署目录：

```bash
sudo rsync -a apps/web/dist/ /srv/tabella/app/dist/
sudo chown -R tabella:tabella /srv/tabella/app/dist
```

## 5. 构建后端

在仓库根目录执行：

```bash
cargo build --release --manifest-path apps/api/Cargo.toml
```

生成的二进制文件位于：

- `target/release/api`

安装到样例 unit 期望的位置：

```bash
sudo install -m 0755 target/release/api /srv/tabella/bin/tabella-api
sudo chown tabella:tabella /srv/tabella/bin/tabella-api
```

## 6. 创建环境变量文件

以 [`deploy/env/tabella-api.env.example`](../deploy/env/tabella-api.env.example) 为模板：

```bash
sudo cp deploy/env/tabella-api.env.example /etc/tabella/tabella-api.env
sudo chmod 600 /etc/tabella/tabella-api.env
```

编辑 `/etc/tabella/tabella-api.env`，至少设置以下内容：

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

说明：

- `DATABASE_URL` 是必填项
- `TABELLA_FRONTEND_DIR` 用于告诉 API 前端构建产物在哪里
- 如果站点通过 HTTPS 提供服务，建议设置 `TABELLA_SECURE_COOKIES=true`
- 初始管理员账号会在启动时按配置自动创建（如果尚不存在）

## 7. 安装 systemd 服务

复制样例 unit：

```bash
sudo cp deploy/systemd/tabella-api.service /etc/systemd/system/tabella-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now tabella-api
```

检查状态：

```bash
sudo systemctl status tabella-api
sudo journalctl -u tabella-api -f
```

API 启动时会自动执行数据库迁移。

## 8. （可选）配置 Caddy

如果你需要 HTTPS 和公网域名，可以参考 [`deploy/Caddyfile.example`](../deploy/Caddyfile.example)。

一个更简单的 `/etc/caddy/Caddyfile` 示例：

```caddyfile
tabella.example.com {
    encode zstd gzip

    reverse_proxy 127.0.0.1:8787
}
```

然后重载 Caddy：

```bash
sudo systemctl reload caddy
```

这是最简单的方式，因为 Rust API 本身就可以同时提供：

- `/api/*` 接口
- `TABELLA_FRONTEND_DIR` 下的 SPA 前端

如果你更希望由 Caddy 直接提供静态前端文件，也可以基于仓库里的示例 Caddyfile 进行调整，把 `root` 指向构建后的 `dist` 目录。

## 9. 更新 Tabella

部署新版本时：

```bash
git pull
pnpm install
pnpm run build:web
cargo build --release --manifest-path apps/api/Cargo.toml
sudo rsync -a apps/web/dist/ /srv/tabella/app/dist/
sudo install -m 0755 target/release/api /srv/tabella/bin/tabella-api
sudo systemctl restart tabella-api
```

## 关键环境变量

当前后端会读取这些重要配置：

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