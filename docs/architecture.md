# 架构

本项目是**单个 Cloudflare Worker**，导出两个 handler：

```ts
export default {
  fetch,  // HTTP：托管 SPA + /api JSON 接口
  email,  // Email Routing：入站邮件摄取
} satisfies ExportedHandler<Env>;
```

## 请求生命周期

### HTTP（`fetch`，见 `src/index.ts`）

```
请求 ─▶ new URL(request.url)
      ├─ pathname 以 /api 开头？
      │    ├─ 是 → authenticate()（Access JWT）
      │    │        ├─ 失败 → 401 {error:"unauthenticated"}
      │    │        └─ 成功 → Router.handle() → 命中的 handler → Response
      │    │                   （HttpError → 对应状态码；其它异常 → 500）
      │    └─ 否 → serveAsset()
      │              ├─ ASSETS.fetch（命中 web/ 里的文件）
      │              ├─ 404 → SPA 回退到 index.html
      │              ├─ HTML → 注入 window.__WEBMAIL_LIVE__，content-type=text/html
      │              └─ .jsx → 修正 content-type=application/javascript
```

`wrangler.toml` 里 `[assets] run_worker_first = true`，因此**所有**请求都先进
Worker，由它决定是走 API 还是回退静态资源，并修正 `.jsx` 的 content-type、注入
live 标志、做 SPA 回退。

### 入站邮件（`email`，见 `src/email/inbound.ts`）

```
ForwardableEmailMessage
  ├─ 读取 raw（ReadableStream → ArrayBuffer）
  ├─ PostalMime.parse(raw)                     解析 MIME
  ├─ 解析 Authentication-Results 头            取 SPF/DKIM/DMARC
  ├─ sanitizeHtml(html)                        HTMLRewriter 净化正文
  ├─ R2: 原始 .eml + 各附件                    putRaw / putAttachment
  └─ D1: messages 行 + attachments 行          insertMessage / insertAttachment
```

`email()` 内部全程 `try/catch`，**绝不 reject**（reject 会给发信方退信）；失败仅
记日志，邮件可由 Email Routing 重试。

## 模块职责

| 模块 | 职责 |
|---|---|
| `src/index.ts` | 入口；装配路由；`fetch`/`email` handler；静态资源托管与 SPA 回退 |
| `src/router.ts` | 极简 METHOD + `/seg/:param` 路由，按注册顺序匹配 |
| `src/access.ts` | Cloudflare Access JWT 验签（JWKS 缓存、aud/iss/exp 校验、取 email） |
| `src/types.ts` | `Env`（绑定）、`AccessUser`、`ReqCtx` |
| `src/lib/http.ts` | `json` / `error` / `noContent` / `readJson` / `HttpError` |
| `src/lib/util.ts` | id、哈希、文本/HTML 处理、字节转换 |
| `src/store/db.ts` | 所有 D1 读写（messages/attachments/identities/profiles/notifications） |
| `src/store/r2.ts` | R2 读写（原始 .eml、附件） |
| `src/email/inbound.ts` | `email()` 摄取逻辑 |
| `src/email/outbound.ts` | `SEND_EMAIL` 发件 + 落「已发送」 |
| `src/email/sanitize.ts` | 基于 HTMLRewriter 的正文净化 |
| `src/api/*` | 各资源的 HTTP handler，调用 store/email，输出 `shapes.ts` 定义的线形状 |
| `src/api/shapes.ts` | D1 行 → 前端 JSON 形状的转换（契约面） |

## 数据存放

- **D1（`DB`）**：消息元数据、附件元数据、发件身份、用户档案、通知偏好。
- **R2（`MAIL_BUCKET`）**：原始 `.eml` 与附件二进制。
- **Cloudflare API**：转发目标地址（destinations）不落本地，实时代理。

线形状与表结构分别见 [api.md](api.md) 与 [storage.md](storage.md)。

## 鉴权边界

`/api/*` 的每个请求都必须带有效的 Access JWT（`authenticate()`），否则 401。静态
资源（应用外壳）本身可公开，真正的数据访问由 JWT 把守；也可用 Access 应用在边缘
把整个站点保护起来，见 [access.md](access.md)。
