# 部署指南

端到端把本 Worker 上线所需的全部步骤。前置：一个已托管在 Cloudflare 的域名
（下文以 `magireco.app` 为例）、`wrangler` 已登录（`wrangler login`）。

## 0. 安装

```bash
npm install
npm install -g wrangler   # 或全程用 npx wrangler
```

## 1. D1 与 R2

```bash
wrangler d1 create webmail            # 记下输出的 database_id
wrangler r2 bucket create webmail-raw
```

把 `database_id` 填进 `wrangler.toml` 的 `[[d1_databases]]`。R2 桶名保持
`webmail-raw`（或同时改 `wrangler.toml`）。然后建表：

```bash
npm run db:init          # 对远程 D1 执行 schema.sql
# 本地开发用： npm run db:init:local
```

`schema.sql` 末尾**种子了几个示例发件身份**（`kasen@/support@/no-reply@magireco.app`）。
上线前请按你的域名改掉，或直接在 D1 中管理：

```bash
wrangler d1 execute webmail --remote --command \
 "UPDATE identities SET email='you@yourdomain.com', name='你', verified=1 WHERE id='idn_1'"
```

> `verified=1` 只给**域名已 onboard Email Sending** 的地址（见第 4 步），否则发信会被拒。

## 2. Cloudflare Access（登录网关）

1. Zero Trust 控制台 → **Access → Applications → Add → Self-hosted**。
2. 应用域名填 Worker 对外的主机名（如 `webmail.magireco.app`）。
3. 配置 Identity provider 与 Policy（谁可登录）。
4. 记下两项，填进 `wrangler.toml` 的 `[vars]`：
   - **Team domain** → `ACCESS_TEAM_DOMAIN`，形如 `yourteam.cloudflareaccess.com`；
   - **Application Audience (AUD) Tag** → `ACCESS_AUD`。

部署方式二选一（详见 [access.md](access.md)）：
- **保护整个站点**（推荐）：Access 应用覆盖整个主机名。用户先过 Access 才看到应用。
- **只保护 `/api`**：应用外壳公开，前端调用 `/api/auth/session` 收到 401 后展示
  「通过 Cloudflare Access 继续」按钮跳转登录。

Worker 始终会独立验签 JWT，两种方式都安全。

## 3. vars 与 secret

`wrangler.toml [vars]`（非敏感，可入库）：

| 变量 | 含义 |
|---|---|
| `ACCESS_TEAM_DOMAIN` | Access 团队域 |
| `ACCESS_AUD` | Access 应用 AUD |
| `CF_ACCOUNT_ID` | 账户 id（目标地址代理用） |
| `PRIMARY_DOMAIN` | 收发主域名 |
| `DEV_BYPASS_ACCESS` | 生产置 `"0"`；本地置 `"1"` 跳过验签 |

secret（敏感，**不入库**）：

```bash
wrangler secret put CF_API_TOKEN
# token 权限：Account » Email Routing Addresses » Edit
```

本地开发把同名值放进 `.dev.vars`（见 `.dev.vars.example`，已 gitignore）。

## 4. Email Sending（发件，出站）

在 Cloudflare 控制台为 `PRIMARY_DOMAIN` 启用 **Email Sending**，按提示添加它要求的
DNS 记录（SPF/DKIM/MX/return-path 等）完成域名 onboarding。只有 onboarding 完成的
发件地址才能成功发信——把对应 `identities.verified` 置 1。`wrangler.toml` 已声明
发件绑定：

```toml
[[send_email]]
name = "SEND_EMAIL"
```

如需把可发往的收件人限制在白名单，加 `allowed_destination_addresses=[...]`。详见
[outbound.md](outbound.md)。

## 5. 部署 Worker

```bash
npm run typecheck   # tsc --noEmit
npm run deploy      # wrangler deploy
```

## 6. Email Routing（收件，入站）

1. 控制台 → **Email → Email Routing**，为域名启用并按提示加 MX/TXT 记录。
2. 新建一条**路由规则**或 **catch-all**，动作选 **Send to a Worker**，目标选本
   Worker（`magireco-webmail`）。这样发往该（些）别名的邮件就会触发 `email()`。
3. （可选）若还想保留一份到真实邮箱，在 `src/email/inbound.ts` 里取消
   `message.forward("you@personal.example")` 的注释（该地址须是已验证的 destination）。

入站处理细节见 [inbound.md](inbound.md)。

## 7. 自检

- 访问 Worker 主机名 → 过 Access → 进入收件箱（live 模式）。
- 给某个路由别名发一封测试邮件 → 数秒后出现在收件箱，并显示收件别名与
  SPF/DKIM/DMARC 徽标。
- 回复它 → 对方应收到来自你域名、SPF+DKIM 通过的邮件，且「已发送」里留有副本。
- 设置 → 转发目标地址：添加一个邮箱 → 收到 Cloudflare 验证邮件。

## 前端：原型 vs 打包

默认 `wrangler.toml` 的 `assets.directory = "./web"`，直接托管原型（浏览器内
Babel，开箱即用）。要上生产打包版：

```bash
npm run build:web                 # 产出 web/dist/（app.js + index.html + css）
# 然后把 wrangler.toml 改为 assets.directory = "./web/dist"，重新 deploy
```

详见 [frontend.md](frontend.md)。

## 常见排查

- **进应用就 401 / 一直登录页**：`ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` 没配对，或
  Access 应用 AUD 不匹配。本地可临时 `DEV_BYPASS_ACCESS=1`。
- **发信 502**：发件身份 `verified=0`，或域名未完成 Email Sending onboarding，或
  收件人不在允许范围。
- **目标地址 500/502**：`CF_ACCOUNT_ID` 或 `CF_API_TOKEN` 缺失/权限不足。
- **收不到入站邮件**：Email Routing 规则没指向本 Worker，或 MX 记录未生效。
- **`.jsx` 报 MIME 错误**：确认走的是 Worker（`run_worker_first=true`），它会把
  `.jsx` 修正为 `application/javascript`。
