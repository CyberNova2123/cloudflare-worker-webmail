# WebMail

> 一个**纯 Cloudflare Worker** 的域名邮箱客户端：用 **Email Routing** 收信、用
> **Email Sending** 发信、用 **Cloudflare Access** 守护登录，全程无需自管服务器。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/CyberNova2123/cloudflare-worker-webmail)

> 一键部署会克隆本仓库、创建 Worker，并按 `wrangler.toml` 自动 provision D1 / R2
> 等资源。部署后仍需**手动**完成：Cloudflare Access 应用、Email Routing 规则、
> Email Sending 域名 onboarding，以及 secret（`CF_API_TOKEN`）——详见
> [docs/deployment.md](docs/deployment.md)。

前端是一个 React 单页应用，后端是同一个 Worker —— 它既托管静态资源，又在
`/api/*` 下提供 JSON API，并通过 `email()` handler 接收入站邮件。

## 它能做什么

- **收件**：发往你域名各别名（`hi@`、`dev@`、`team@`…）的邮件经 Email Routing
  进入 Worker，解析后统一落到一个收件箱，并标注**收件别名**与 **SPF/DKIM/DMARC**
  鉴权结果。
- **发件**：从已验证的发件身份直接发信（Email Sending 自动配置 SPF + DKIM），
  支持回复 / 全部回复 / 转发、抄送、签名。
- **登录**：Cloudflare Access 零信任 SSO；浏览器携带 `CF_Authorization` JWT，
  Worker 用 Access 公钥验签，客户端不保存任何密码或 token。
- **转发目标管理**：在「设置」里增删/验证 Email Routing 的 destination 地址
  （代理 Cloudflare API）。
- **附件**：入站附件存入 R2，可在阅读页直接下载。
- **体验**：命令面板（⌘K）、全键盘操作、深/浅色、搜索、桌面通知。

## 架构一览

```
                 ┌──────────────── Cloudflare Worker ─────────────────┐
  浏览器 ──────▶ │  fetch()                                            │
   (Access JWT)  │   ├── /api/*  → 验 Access JWT → Router → 各 handler  │
                 │   │              └─ D1（元数据）/ R2（原始+附件）      │
                 │   │              └─ SEND_EMAIL（发件）/ CF API（目标） │
                 │   └── 其它路径 → ASSETS 静态资源（web/，SPA 回退）     │
  入站邮件 ─────▶ │  email()  → postal-mime 解析 → 净化 → 存 D1 + R2      │
 (Email Routing) └─────────────────────────────────────────────────────┘
```

绑定（`wrangler.toml`）：`ASSETS`(静态资源) · `DB`(D1) · `MAIL_BUCKET`(R2) ·
`SEND_EMAIL`(Email Sending) · vars/secrets。

## 快速开始

前置：Node ≥ 18、一个已接入 Cloudflare 的域名、已开启 **Email Routing** 与
**Email Sending**、一个 **Cloudflare Access** 应用。

```bash
npm install
npm install -g wrangler   # 或用 npx wrangler

# 1) 建 D1 + R2，并把 id 填进 wrangler.toml
wrangler d1 create webmail
wrangler r2 bucket create webmail-raw

# 2) 初始化表结构
npm run db:init                 # 远程 D1

# 3) 配置 vars（wrangler.toml [vars]）：
#    ACCESS_TEAM_DOMAIN / ACCESS_AUD / CF_ACCOUNT_ID / PRIMARY_DOMAIN

# 4) 配置 secret（代理目标地址 API 用）
wrangler secret put CF_API_TOKEN

# 5) 部署
npm run deploy
```

部署后，再到 Cloudflare 控制台把一条 **Email Routing 规则（或 catch-all）指向本
Worker**，入站邮件即会触发 `email()`。完整步骤见 **[docs/deployment.md](docs/deployment.md)**。

## 本地开发

```bash
cp .dev.vars.example .dev.vars   # 内含 DEV_BYPASS_ACCESS=1，跳过 Access 验签
npm run dev
```

- 纯前端预览：直接用浏览器打开 `web/index.html` 即进入 **mock 模式**（内置假数据，
  不依赖后端）。被 Worker 托管时，Worker 注入 `window.__WEBMAIL_LIVE__` 自动切到
  **live 模式**。详见 [docs/frontend.md](docs/frontend.md)。

## 目录结构

```
src/                Worker（TypeScript）
  index.ts          入口：fetch + email 两个 handler、路由装配、静态资源托管
  access.ts         Cloudflare Access JWT 验签（纯 Web Crypto）
  router.ts         极简路由
  types.ts          Env 绑定类型 / 共享类型
  lib/              http 助手、工具函数
  store/            db.ts（D1）· r2.ts（R2）
  email/            inbound.ts（收）· outbound.ts（发）· sanitize.ts（净化）
  api/              session/messages/identities/destinations/profile/notifications
web/                前端 SPA（原型用浏览器内 Babel；可选 esbuild 打包到 web/dist）
schema.sql          D1 表结构 + 种子发件身份
scripts/build-web.mjs  可选的前端生产打包
docs/               技术文档（见下）
```

## 文档

| 文档 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 请求生命周期、模块职责、数据流 |
| [docs/deployment.md](docs/deployment.md) | 端到端部署：Access / D1 / R2 / Email Routing / Email Sending / secrets |
| [docs/api.md](docs/api.md) | 全部 `/api` 端点：方法、入参、返回形状、错误 |
| [docs/access.md](docs/access.md) | Access JWT 验签与两种网关部署方式 |
| [docs/inbound.md](docs/inbound.md) | 入站 `email()`：解析、鉴权结果、净化、落库、转发 |
| [docs/outbound.md](docs/outbound.md) | 出站发件：`SEND_EMAIL` builder、身份验证、限制 |
| [docs/storage.md](docs/storage.md) | D1 表结构与 R2 键布局 |
| [docs/frontend.md](docs/frontend.md) | 前端结构、mock/live 切换、托管与可选打包 |

> 协作约定（提交 / 文档同步 / 技术约束）见 [`.claude/CLAUDE.md`](.claude/CLAUDE.md)。

## 许可

GPL-3.0（见 [LICENSE](LICENSE)）。
