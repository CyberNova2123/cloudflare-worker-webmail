# API 参考

所有接口挂在 `CONFIG.api.baseUrl`（默认 `/api`）下，**同源**调用，依赖
`CF_Authorization` Cookie（Access JWT）。无有效 JWT 一律返回：

```http
401 { "error": "unauthenticated" }
```

错误统一为 `{ "error": "<消息>" }` + 对应状态码（由 `HttpError` 抛出）。

> 线形状（字段名/类型）必须与 `web/api.jsx`、`src/api/shapes.ts` 保持一致。

## 认证

### `GET /api/auth/session`
当前登录用户（由 Access JWT 的 `email` 推导，合并 D1 档案）。

```json
{ "id": "usr_ab12cd34ef", "name": "Alex Morgan", "email": "alex@example.com",
  "avatarColor": "230", "primaryDomain": "example.com" }
```
未认证 → 401（前端据此显示登录页）。

### `POST /api/auth/logout`
`204`。会话只存在于 Access Cookie，服务端无状态可清；前端随后跳转
`CONFIG.auth.logoutUrl`（Access 登出）。

## 邮件

### `GET /api/messages?folder=&q=`
列出某文件夹（`inbox`/`sent`/`drafts`/`archive`/`spam`/`trash`，或 `starred`）的
邮件；`q` 在主题/发件人/预览/收件别名上模糊匹配。

```json
{ "items": [ {
  "id":"m_...", "folder":"inbox",
  "from":{"name":"Sarah Lee","email":"sarah@example.org"}, "to":"contact@example.com",
  "subject":"…", "preview":"…", "date":"2026-06-13T03:00:00.000Z",
  "read":false, "starred":false, "hasAttachment":true, "attachmentCount":2,
  "routedFrom":"contact@example.com", "routedVia":"cloudflare", "labels":[]
} ], "nextCursor": null }
```

### `GET /api/messages/counts`
侧栏未读角标：`{ "inbox": 2, "spam": 1 }`（仅含未读数 > 0 的文件夹）。

### `GET /api/messages/:id`
单封完整邮件 = 列表形状 + 正文/路由/附件：

```json
{ "...列表字段": "...",
  "bodyHtml":"<p>已净化的正文</p>", "bodyText":"…",
  "routing":{ "to":"contact@example.com", "spf":"pass", "dkim":"pass", "dmarc":"pass" },
  "attachments":[ {"idx":0,"filename":"map.pdf","mimeType":"application/pdf","size":184320,
                   "url":"/api/messages/m_.../attachments/0"} ],
  "headers":{ "subject":"…","from":"…","to":"…","date":"…" } }
```
`routing.*` 为 `pass`/`fail`/`none`/`—`（`—` 表示无该信号，前端不显示对应徽标）。
不存在 → `404`。

### `PATCH /api/messages/:id/state`
改读取/星标/所属文件夹（移动 = 改 `folder`，归档/删除即移到 `archive`/`trash`）。

```http
PATCH  { "read": true }            // 或 { "starred": true } / { "folder": "archive" }
→ 200  更新后的完整邮件
```

### `POST /api/messages/send`
经 Email Sending 发信，详见 [outbound.md](outbound.md)。

```http
POST { "fromIdentityId":"idn_1", "to":["a@x.com"], "cc":[], "bcc":[],
       "subject":"…", "bodyText":"…", "bodyHtml":"…(可选)" }
→ 200 { "id": "<messageId>" }
```
发件身份不存在 → `400`；未验证 → `403`；无收件人 → `400`；邮件服务拒绝 → `502`。

### `GET /api/messages/:id/attachments/:idx`
下载附件原始字节（`Content-Disposition: attachment`，从 R2 取）。不存在 → `404`。

## 发件身份（Email Sending）

### `GET /api/identities`
```json
[ { "id":"idn_1","name":"Alex Morgan","email":"alex@example.com",
    "isDefault":true,"verified":true,"signature":"— Alex\n…" } ]
```

### `POST /api/identities`
`{ name, email, signature? }` → 新建一个**未验证**身份（`201`）。验证需在
Cloudflare 控制台为域名 onboard Email Sending，然后把 D1 里该行 `verified` 置 1。

### `PATCH /api/identities/:id`
`{ name?, signature?, isDefault? }`；`isDefault:true` 会把其它身份取消默认。

## 转发目标地址（Email Routing destinations）

代理 Cloudflare REST API（需 `CF_ACCOUNT_ID` + `CF_API_TOKEN`，token 权限
**Account » Email Routing Addresses » Edit**）。`id` 用 Cloudflare 的 `tag`。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/destinations` | 列出：`[{id,email,verified,created}]` |
| `POST` | `/api/destinations` | `{email}` → 新增并触发验证邮件（`201`） |
| `DELETE` | `/api/destinations/:id` | 删除（`204`） |
| `POST` | `/api/destinations/:id/resend` | 重发验证邮件 |

> **重发的注意**：Cloudflare 没有独立的「重发验证」端点。本实现是「查出该地址 →
> 删除 → 用同一邮箱重新创建」来再次触发验证邮件，因此**返回的 `id` 会变化**，前端
> 应在重发后重新拉取列表。仅对未验证地址使用。

## 账户与通知

| 方法 | 路径 | 形状 |
|---|---|---|
| `GET`/`PATCH` | `/api/profile` | `{ name, email, timezone, locale, avatarColor }`（`email` 只读，来自 Access） |
| `GET`/`PATCH` | `/api/settings/notifications` | `{ desktop, sound, newMail, mentions, digestDaily, routingAlerts, marketing }`（布尔） |

> 通知字段对外是 camelCase，D1 列是 snake_case，转换在 `src/api/notifications.ts`。
