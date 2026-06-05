# Docker 部署指南

使用 [`docker-compose.yml`](../docker-compose.yml) 和 [`Dockerfile`](../Dockerfile) 通过 Docker Compose 部署 Tabella。

## 概览

当前 Docker 部署包含：

- `tabella`：同时运行 Rust API 和已构建前端的应用容器
- `db`：PostgreSQL 16
- `tabella-data`：用于持久化上传图片的 Docker volume
- `tabella-db-data`：用于持久化 PostgreSQL 数据的 Docker volume

应用在容器内监听 `8787` 端口，并通过 `8787:8787` 映射到宿主机。

## 前置要求

- Docker Engine
- Docker Compose v2

确认环境：

```bash
docker --version
docker compose version
```

## 快速开始

在仓库根目录执行：

```bash
docker compose up -d --build
```

然后访问：

- `http://127.0.0.1:8787`

当前 compose 文件中的默认管理员账号是：

- 用户名：`admin`
- 密码：`admin`

## 当前 Compose 文件的配置内容

当前 compose 文件会设置：

- `DATABASE_URL=postgres://tabella:tabella_secret@db/tabella`
- `TABELLA_LISTEN_ADDR=0.0.0.0:8787`
- `TABELLA_MEDIA_ROOT=/app/var/media`
- `TABELLA_TEMP_ROOT=/app/var/tmp`
- `TABELLA_SESSION_COOKIE_NAME=tabella_session`
- `TABELLA_SESSION_TTL_HOURS=720`
- `TABELLA_SECURE_COOKIES=false`
- `TABELLA_BOOTSTRAP_ADMIN_USERNAME=admin`
- `TABELLA_BOOTSTRAP_ADMIN_PASSWORD=admin`

媒体文件会持久化到命名 volume `tabella-data` 中。

## 生产环境建议

在对外提供服务之前，建议先修改 [`docker-compose.yml`](../docker-compose.yml)：

- 将 `tabella_secret` 替换为高强度 PostgreSQL 密码
- 将管理员初始密码替换为强密码
- 如果通过 HTTPS 提供服务，请设置 `TABELLA_SECURE_COOKIES=true`
- 建议绑定到 `localhost` 并加反向代理

示例：

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

## 更新 Tabella

```bash
git pull
docker compose up -d --build
```

应用启动时会自动执行数据库迁移。

## 反向代理与 HTTPS

如果需要公网访问，建议在 Tabella 前面加 Caddy、Nginx 或其他 TLS 终止代理。

典型结构：

- 反向代理监听 `443`
- 代理把请求转发到 `127.0.0.1:8787`
- 设置 `TABELLA_SECURE_COOKIES=true`

## 数据目录

容器内部目录：

- 媒体文件：`/app/var/media`
- 临时文件：`/app/var/tmp`
- 前端构建产物：`/app/dist`

由 Docker volume 持久化：

- `tabella-data`
- `tabella-db-data`