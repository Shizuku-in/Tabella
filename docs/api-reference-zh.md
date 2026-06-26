# API 参考文档

Base URL：`http://localhost:8787`（开发环境）—— 所有 API 路由均以 `/api` 为前缀。

## 身份认证

除 `POST /api/auth/login` 和 `GET /healthz` 外，所有 API 路由均需要有效的 session cookie。调用登录接口即可获取；服务端会自动设置 `HttpOnly` cookie。

## 错误格式

所有错误响应使用统一的 JSON 结构：

```json
{ "error": "error_code", "message": "人类可读的回退消息", "params": null }
```

`params` 为 `null` 或包含插值参数的对象（例如 `{ "max_images": 200 }`）。

| HTTP 状态码 | 含义                         |
| ----------- | ---------------------------- |
| 400         | 请求错误 — 参见 `error` 代码 |
| 401         | 未认证                       |
| 403         | 权限不足                     |
| 404         | 资源不存在                   |
| 413         | 请求体过大                   |
| 500         | 服务器内部错误               |

## 角色

`admin` > `editor` > `viewer`。下文守卫标注：**any** = viewer 及以上、**editor** = editor 及以上、**admin** = 仅限 admin。

---

## 健康检查

### `GET /healthz`

无需认证。返回服务状态。

```json
{
  "status": "ok",
  "service": "tabella-api",
  "version": "0.1.4"
}
```

---

## 认证

### `POST /api/auth/login`

无需认证。

**请求体**

```json
{ "username": "alice", "password": "s3cr3t" }
```

**响应 200** — 设置 session cookie，返回用户对象（参见[用户对象](#用户对象)）。

**错误** — `missing_credentials`、`invalid_credentials`

---

### `POST /api/auth/logout`

**any** — 销毁当前 session 并清除 cookie。返回 `204 No Content`。

---

### `GET /api/me`

**any** — 返回当前已认证用户的信息。

```json
{ "user": { <用户对象> } }
```

---

## 图片

### `GET /api/images`

**any** — 分页获取图片列表。

**查询参数**

| 参数               | 类型                                                          | 说明                                           |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| `sort`             | `newest`\|`oldest`\|`filename_asc`\|`filename_desc`\|`random` | 默认 `newest`（最新优先）                      |
| `seed`             | integer                                                       | `random` 排序的种子值；通过游标跨页保持稳定    |
| `limit`            | 1–100                                                         | 每页数量，默认 50                              |
| `cursor`           | string                                                        | 上次响应中 `next_cursor` 透传的不透明 token    |
| `rating`           | CSV 或重复参数                                                | 精确集合过滤：`safe`、`suggestive`、`explicit` |
| `include_tags`     | CSV 或重复参数                                                | AND 过滤：图片必须包含所有列出的标签           |
| `exclude_tags`     | CSV 或重复参数                                                | AND 过滤：图片不得包含任一列出的标签           |
| `favorites_only`   | boolean                                                       | 仅返回当前用户的收藏                           |
| `uploaded_after`   | ISO 8601                                                      | 上传时间不早于                                 |
| `uploaded_before`  | ISO 8601                                                      | 上传时间不晚于                                 |
| `min_width`        | integer                                                       | 最小宽度（像素）                               |
| `min_height`       | integer                                                       | 最小高度（像素）                               |
| `aspect_ratio_min` | float                                                         | 最小宽高比（width/height）                     |
| `aspect_ratio_max` | float                                                         | 最大宽高比（width/height）                     |

**响应 200**

```json
{
  "items": [ { <图片列表项> } ],
  "next_cursor": "…"
}
```

没有更多数据时，`next_cursor` 字段不存在或为 `null`。

**错误** — `invalid_cursor`、`cursor_missing_imported_at`、`cursor_missing_filename`

---

### `GET /api/images/random`

**any** — 返回单张随机图片。

**查询参数**

| 参数         | 类型                              | 说明                                                    |
| ------------ | --------------------------------- | ------------------------------------------------------- |
| `rating`     | CSV 或重复参数                    | 从中随机选取的精确评级集合                              |
| `max_rating` | `safe`\|`suggestive`\|`explicit`  | 评级上限（含）；两个参数均不传时默认行为为仅限于 `safe` |
| `quality`    | `thumbnail`\|`sample`\|`original` | 返回的 `url` 使用哪种质量；默认 `original`              |

同时提供 `rating` 和 `max_rating` 时，二者取交集（AND）。提供 `max_rating=explicit` 可放宽上限；提供 `rating=explicit` 则从指定的精确集合中选取。

**响应 200**

```json
{
  "id": 42,
  "url": "/media/originals/…",
  "quality": "original",
  "width": 3541,
  "height": 5016,
  "rating": "suggestive",
  "original_filename": "artwork.png",
  "tags": ["artist:foo", "1girl"]
}
```

**错误** — `image_not_found`（无图片匹配过滤条件，或图库为空）

---

### `GET /api/images/{id}`

**any** — 根据 ID 获取单张图片的完整元数据。返回结构与 `GET /api/images` 中的[图片列表项](#图片列表项)一致，包含当前用户的 `is_favorite`、`tags` 以及 `uploader` 信息。

**响应 200** — [图片列表项](#图片列表项)。

**错误** — `image_not_found`

---

### `PATCH /api/images/{id}`

**editor** — 更新图片元数据。所有字段均为可选；未提供的字段保持不变。

**请求体**

```json
{
  "rating": "safe",
  "tags": ["artist:foo", "1girl"],
  "note": "可选的备注",
  "source_url": "https://example.com/source"
}
```

- `note` / `source_url` — `Some("text")` 设为指定值，`Some("")` 清除字段，`None`（或不传）保持原值不变。

响应：`204 No Content`。

---

### `DELETE /api/images/{id}`

**editor** — 永久删除图片及其媒体文件。返回 `204 No Content`。

**错误** — `image_not_found`

---

### `GET /api/tags`

**any** — 浏览所有标签及其使用次数，按频次降序、同频次按字母排序。适用于标签云和筛选侧栏。

**查询参数**

| 参数        | 说明                                          |
| ----------- | --------------------------------------------- |
| `namespace` | 按命名空间过滤（如 `artist`）；不传则返回全部 |
| `limit`     | 1–500，默认 100                               |

**响应 200**

```json
{
  "items": [
    { "tag": "1girl", "count": 1280 },
    { "tag": "artist:foo", "count": 42 }
  ]
}
```

`count` 为携带该标签的图片数量（未使用的标签为 0）。

---

### `GET /api/stats`

**any** — 图库汇总统计信息。

**响应 200**

```json
{
  "totalImages": 5120,
  "totalTags": 230,
  "totalSizeBytes": 8589934592,
  "ratingCounts": {
    "safe": 3200,
    "suggestive": 1800,
    "explicit": 120
  }
}
```

- `totalTags` 仅统计至少关联到一张图片的标签。
- `totalSizeBytes` 为所有图片原始文件大小之和。

---

### `GET /api/tags/suggest`

**any** — 标签名称自动补全。

**查询参数**

| 参数    | 说明                     |
| ------- | ------------------------ |
| `q`     | 前缀搜索（不区分大小写） |
| `limit` | 1–50，默认 20            |

**响应 200**

```json
{ "items": ["artist:alice", "1girl", "landscape"] }
```

---

### `POST /api/favorites/{id}`

**any** — 将图片添加到当前用户的收藏。返回 `204 No Content`（幂等操作）。

---

### `DELETE /api/favorites/{id}`

**any** — 从收藏中移除图片。返回 `204 No Content`。

---

## 下载

### `POST /api/download-jobs`

**any** — 创建选中图片的打包下载任务。任务在后台异步执行。

**请求体**

```json
{ "image_ids": [1, 2, 3], "quality": "original" }
```

`quality`：`thumbnail` | `sample` | `original`（默认为 `original`）。

**响应 200** — [下载任务对象](#下载任务对象)。

**错误** — `no_images_selected`、`selected_images_not_found`、`too_many_images_requested`（参数：`max_images`）、`download_size_limit_exceeded`（参数：`max_total_bytes`）

---

### `GET /api/download-jobs/{id}`

**any** — 轮询任务状态。仅任务创建者可以访问。

**响应 200** — [下载任务对象](#下载任务对象)。

**错误** — `download_job_not_found`、`download_job_access_denied`

---

### `GET /api/download-jobs/{id}/file`

**any** — 下载已完成打包的 zip 文件（流式传输）。设置 `Content-Disposition: attachment`。

**错误** — `download_job_not_found`、`download_job_access_denied`、`download_job_not_completed`、`download_archive_missing`

---

## 导入

### `GET /api/admin/imports`

**editor** — 列出最近 50 条导入任务（最新优先）。

**响应 200**

```json
{ "items": [ { <导入任务> } ] }
```

---

### `POST /api/admin/imports`

**admin** — 通过服务端文件路径创建导入任务（支持文件夹、zip 或 7z）。

**请求体**

```json
{ "source_path": "/srv/media/batch.zip" }
```

**响应 200** — `{ "id": "<uuid>", "status": "queued" }`

---

### `POST /api/admin/imports/upload`

**editor** — 从浏览器直接上传图片文件或归档文件。无请求体大小限制；传输过程中会动态检查 `max_upload_bytes` 设置并强制中止。

**查询参数** — `type=folder`（默认） | `zip` | `7z`

**Content-Type** — `multipart/form-data`；每个文件作为一个字段，文件名设置在字段中。

**响应 200** — `{ "id": "<uuid>", "status": "queued" }`

**错误** — `no_files_uploaded`、`invalid_upload_path`、`payload_too_large`

---

### `GET /api/admin/imports/{job_id}`

**editor** — 获取单个导入任务的详细信息。

```json
{
  "id": "<uuid>",
  "status": "processing",
  "total_items": 120,
  "processed_items": 60,
  "succeeded_items": 58,
  "failed_items": 2,
  "created_at": "…",
  "finished_at": null,
  "last_error": null,
  "error_code": null,
  "error_params": null
}
```

导入任务状态流转：`queued` → `extracting` → `processing` → `completed` | `failed`。

**错误** — `import_job_not_found`

---

## 个人资料

### `GET /api/profile`

**any** — 返回当前用户的完整[用户对象](#用户对象)。

---

### `PUT /api/profile`

**any** — 更新用户名和/或密码。所有字段均为可选；不传则保持不变。

**请求体**

```json
{
  "username": "new_name",
  "current_password": "old_pass",
  "new_password": "n3w_pass1"
}
```

修改密码需同时提供 `current_password` 和 `new_password`。修改密码后，该用户的其他活跃 session 将全部失效。

**响应 200** — 更新后的[用户对象](#用户对象)。

**错误** — `invalid_username`、`duplicate_username`、`missing_current_password`、`missing_new_password`、`invalid_password`、`weak_password_*`

---

### `POST /api/profile/avatar`

**any** — 上传新头像（PNG、JPEG、GIF 或 WebP）。最大 5 MB。

**Content-Type** — `multipart/form-data`，字段名为 `file`。

**响应 200** — `{ "avatar_url": "/media/avatars/7.png?v=1234567890" }`

---

## 设置

### `GET /api/settings`

**admin** — 返回当前动态服务端配置。

### `PUT /api/settings`

**admin** — 覆写动态配置。需要发送完整对象（不支持部分合并更新）。

**请求体 / 响应**

```json
{
  "max_download_images": 200,
  "max_download_total_bytes": 2147483648,
  "download_retention_hours": 24,
  "session_ttl_hours": 720,
  "secure_cookies": false,
  "import_progress_batch_size": 10,
  "thumbnail_size": 400,
  "thumbnail_quality": 0.8,
  "sample_size": 1280,
  "sample_quality": 0.85,
  "max_upload_bytes": 536870912
}
```

`sample_size = 0` 表示"不缩小 — 使用原始尺寸"。所有数值必须大于 0。

**错误** — `invalid_settings`

---

## 用户管理（管理员）

### `GET /api/admin/users`

**admin** — 列出所有用户，按创建时间降序排列（最新优先）。

**响应 200** — `[ { <用户对象> } ]`

---

### `POST /api/admin/users`

**admin** — 创建新用户。

**请求体**

```json
{ "username": "bob", "password": "s3cr3t1", "role": "viewer" }
```

**响应 201** — [用户对象](#用户对象)。

**错误** — `invalid_username`、`duplicate_username`、`weak_password_too_short`、`weak_password_missing_lowercase`、`weak_password_missing_number`

---

### `PUT /api/admin/users/{id}`

**admin** — 更新用户的角色和/或密码（均可选）。修改后该用户的现有 session 将全部失效（编辑自身时，当前 admin session 除外）。

**请求体**

```json
{ "password": "n3wpass1", "role": "editor" }
```

**响应 200**（有变更时）或 `204`（无任何变更）。

**错误** — `user_not_found`、`role_change_not_allowed`（管理员不能修改自己的角色）

---

### `DELETE /api/admin/users/{id}`

**admin** — 删除用户。不能删除当前已认证的管理员自身。返回 `204 No Content`。

**错误** — `user_not_found`、`self_delete_not_allowed`

---

## 实时事件

### `GET /api/events`

**any** — Server-Sent Events 流。每个会话只需连接一次；前端使用指数退避重连机制，并通过 `HEAD` 探测来检测 401。

每个事件包含 `event` 名称和 JSON 格式的 `data` 负载：

| 事件名称               | 触发时机         |
| ---------------------- | ---------------- |
| `import_job_updated`   | 导入任务状态变更 |
| `download_job_updated` | 下载任务状态变更 |

流在服务端关闭时终止。

---

## 共用对象结构

### 用户对象

```json
{
  "id": 1,
  "username": "alice",
  "role": "admin",
  "created_at": "2024-01-01T00:00:00Z",
  "avatar_url": "/media/avatars/1.png?v=1234567890"
}
```

`role`：`admin` | `editor` | `viewer`。未设置头像时 `avatar_url` 为 `null`。

### 图片列表项

```json
{
  "id": 42,
  "original_filename": "artwork.png",
  "thumbnail_url": "/media/thumbnails/…",
  "preview_url": "/media/samples/…",
  "original_url": "/media/originals/…",
  "width": 3541,
  "height": 5016,
  "sha256": "d392f2…",
  "source_url": null,
  "note": null,
  "imported_at": "2024-06-01T12:00:00Z",
  "rating": "safe",
  "is_favorite": false,
  "tags": ["artist:foo", "1girl"],
  "file_size": 4194304,
  "uploader": { "id": 1, "username": "alice", "avatar_url": null }
}
```

未保留原始文件时 `original_url` 为 `null`。历史导入的图片 `uploader` 为 `null`。

### 下载任务对象

```json
{
  "id": "<uuid>",
  "status": "completed",
  "total_images": 3,
  "total_bytes": 12582912,
  "error_message": null,
  "error_code": null,
  "error_params": null
}
```

任务状态：`pending` → `completed` | `failed`。
