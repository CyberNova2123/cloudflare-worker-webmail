# 前端（`web/`）

一个 React 单页应用，由 Worker 静态托管。源文件是上传的原型：UI 组件用 JSX，配置与
API 层是纯 JS。

| 文件 | 作用 |
|---|---|
| `index.html` | 入口；按顺序加载 React、（原型用）Babel、各脚本 |
| `config.jsx` | `window.CONFIG`：品牌、`api.endpoints`、Access URL、文件夹、特性开关 |
| `api.jsx` | API 层：`window.API.*`；**mock/live 切换**；内置 MOCK 假数据 |
| `ui.jsx` | 图标、头像、时间格式化、Toast、骨架屏等 UI kit |
| `auth.jsx` | 登录页（Access SSO 按钮） |
| `mail.jsx` | 侧栏、邮件列表、阅读页（含路由/鉴权检视、附件下载） |
| `compose.jsx` | 写信、命令面板、快捷键弹窗、账户菜单 |
| `settings.jsx` | 账户 / 发件身份与签名 / 转发目标地址 / 通知 |
| `app.jsx` | 根组件：视图路由、全局状态、快捷键、命令面板装配 |
| `styles.css` / `app.css` | 设计系统与组件样式 |

## mock ↔ live 切换

`api.jsx` 顶部：

```js
const USE_MOCK = !window.__WEBMAIL_LIVE__;
```

- **被 Worker 托管时**：`src/index.ts` 在返回 `index.html` 前注入
  `<script>window.__WEBMAIL_LIVE__=true;</script>` → `USE_MOCK=false` → 所有
  `API.*` 走真实 `fetch(/api/...)`（带 `credentials:"include"` 携带 Access Cookie）。
- **直接打开 `web/index.html`（file://）做预览时**：没有该标志 → `USE_MOCK=true` →
  用内置 MOCK 假数据，纯前端可独立运行、不依赖后端。

> 改 API 契约时，`web/api.jsx`（mock + live 两条路径）、`web/config.jsx` 的
> `endpoints`、`src/api/shapes.ts` 三处要一起改，保持线形状一致。

### 接线时做的改动（相对原型）

- 每个 `API.*` 在 `!USE_MOCK` 时调用对应 `/api` 端点（原型里这些 `fetch` 是注释）。
- 新增 `API.getCounts()` + `endpoints.counts`（`GET /messages/counts`），侧栏未读
  角标改为一次后端调用得出（不再扫 `__MOCK`）。
- `app.jsx` 的 `openMessage` 打开邮件后**再拉取完整邮件**（`getMessage`）以获得
  `bodyHtml`/`routing`/`attachments`——列表形状不含这些。
- `mail.jsx` 阅读页用真实 `attachments` 渲染文件名/大小并提供下载链接（mock 下回退到
  占位卡片）。
- 正文净化在**服务端**完成（`src/email/sanitize.ts`），阅读页直接渲染已净化的
  `bodyHtml`。

## Worker 如何托管

`wrangler.toml` 用 `[assets] directory="./web"`、`binding="ASSETS"`、
`run_worker_first=true`。`src/index.ts` 的 `serveAsset`：

- 非 `/api` 请求交给 `ASSETS.fetch`；
- 404 → SPA 回退到 `index.html`；
- HTML → 注入 live 标志并设 `content-type: text/html`；
- `.jsx` → 修正 `content-type: application/javascript`（Workers Assets 不识别该扩展名，
  而原型用 `<script src="*.jsx">` 加载，需要正确的 JS content-type）。

## 可选：生产打包（esbuild）

原型在浏览器里跑 Babel（方便改，运行时偏重）。要去掉 Babel：

```bash
npm run build:web
```

`scripts/build-web.mjs` 会把全部脚本按序打包压缩成 `web/dist/app.js`，并生成一个不带
Babel、从 CDN 引 React 的 `web/dist/index.html`（同时拷贝 CSS）。随后把
`wrangler.toml` 的 `assets.directory` 改为 `./web/dist` 再部署即可。`web/dist/` 已
gitignore。

## 重新换肤

改 `web/config.jsx` 的 `brand`（名称/缩写/标记字/标语）即可换品牌；整体强调色是
`styles.css` 里的 CSS 变量 `--accent`。
