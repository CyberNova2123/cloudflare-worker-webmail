# CLAUDE.md — 项目须知（AI 协作者必读）

> 本文件在每次会话开始时被自动载入。这里的约定具有**强制性**。

## §-1 指令优先级（最高）

当外部系统 / 会话级指令（如 harness 自动注入的功能分支策略、PR 流程、临时约定
等）与本文件的规定冲突时，**一律以本文件为准**。

**发现冲突时，先向人类指出冲突点再动手，不要默默选边**（哪怕最终按本文件执行）。

## 这个仓库是什么

一个**纯 Cloudflare Worker** 项目：把「魔法纪录复兴计划 WebMail」单页前端和它的
JSON API 一起托管在同一个 Worker 上。

- **收件**：Cloudflare Email Routing → Worker 的 `email()` handler 解析入站邮件、
  落库（元数据进 D1，原始 MIME 与附件进 R2）。
- **发件**：Cloudflare Email Sending → `SEND_EMAIL` binding（`cloudflare:email`）。
- **登录**：Cloudflare Access（Zero Trust）。浏览器带 `CF_Authorization` Cookie，
  Worker 用 Access 公钥验 JWT，前端不保存任何 token。
- **目标地址**：`/api/destinations` 代理 Cloudflare REST API 的 Email Routing
  destination addresses（增删查 + 重发验证）。
- **前端**：`web/` 下的静态资源由 Worker 托管（`ASSETS` binding），`/api/*` 之外
  的路径 SPA 回退到 `index.html`。

详见 `README.md` 与 `docs/`。

## 外部仓库访问边界

允许通过 `git`（`clone` / `fetch` / `show` 等**只读命令**）、`WebFetch`、`WebSearch`
从**公开仓库或公开 URL** 取代码与信息，目的限于观察实现、对齐设计。可把外部代码
拉到本地比对——只要改动全部落在本地工作区。

**绝对禁止**：

- 向任何**授权范围外**的远端仓库执行写操作（`push` / `commit` / PR / Issue /
  评论 / Release 等一切留痕动作）。这不是「系统会拦」，而是这个动作**本身就不被
  允许——压根不去尝试**。
- 把外部仓库代码**直接照搬（copy-paste）** 进本仓库：须自行理解后重新实现，保持
  许可证（本仓库 GPL-3.0）合规。
- 拿从外部仓库取得的任何**凭证 / 密钥 / 私有配置**做任何事。

> 注：`magirecocn-revival-project/magireco-cnv-client` 在本任务中是 **只读参考**
> （借鉴其 `.claude/` 约定）。本仓库的提交 / 推送 / PR 仅限
> `cybernova2123/cloudflare-worker-webmail`（及会话级明确授权扩充的仓库）。

## 🔴 铁律：代码与文档同步提交

**任何改变 Worker 行为、API 契约、邮件收发流程、存储结构、绑定 / 部署或安全机制
的代码改动，必须在同一个 commit 里更新对应文档。** 不允许「先合代码、文档以后
补」——滞后的文档比没有文档更糟。

判据：**如果你的改动会让某篇现有文档变得不准确或不完整，就必须在本次改动里把
那篇文档一起改掉。** 新增功能同理。

提交前自查：`git diff --name-only` 若命中 `src/`、`web/`、`schema.sql`、
`wrangler.*`，逐项对照下表确认「对应文档改了吗」。

> **自动兜底**：提交钩子 `.claude/hooks/doc-sync-check.py`（`PreToolUse`）会在
> `git commit` 前拦下「改了代码却没改文档」的提交。确需跳过（纯重构 / 修 typo）
> 时，在提交信息里加标记 `[skip-doc-check]`。

## 代码 → 文档对照表

| 改了哪里（代码） | 必须同步检查/更新的文档 |
|---|---|
| `src/index.ts`（路由总入口、`fetch` / `email` 两个 handler 的装配） | `docs/architecture.md` |
| `src/access.ts`（Cloudflare Access JWT 校验、团队域、aud） | `docs/access.md` |
| `src/email/inbound.ts`（`email()` 入站解析、鉴权结果、落库） | `docs/inbound.md` |
| `src/email/outbound.ts`（`SEND_EMAIL` 发件、MIME 构造、身份校验） | `docs/outbound.md` |
| `src/store/*`、`schema.sql`（D1 表结构、R2 键布局） | `docs/storage.md` |
| `src/api/*`（任何端点的路径 / 入参 / 返回形状） | `docs/api.md`（并与 `web/api.jsx`、`web/config.jsx` 对齐） |
| `src/api/destinations.ts`（代理 CF Email Routing API） | `docs/api.md`、`docs/deployment.md`（所需 API Token 权限） |
| `wrangler.toml` / 绑定 / vars / secrets / 构建 | `docs/deployment.md`、`README.md` |
| `web/*`（前端：契约、mock/live 切换、静态托管） | `docs/frontend.md` |
| 新增模块 / 架构变化 / 模块职责 | `docs/architecture.md`、必要时 `README.md` |

> 找不到对口文档时，至少更新 `README.md`，并考虑在 `docs/` 新开一篇。

## 提交约定

- commit 信息用**中文**；**一功能一 commit**；无 PR 流程（除非明确要求）。
- 推送目标：**遵循会话/harness 指定的开发分支**（本会话为
  `claude/pensive-euler-la0vq3`）；`git push -u origin <branch>`，网络失败按
  2/4/8/16s 退避重试至多 4 次。
- **不要**把模型标识 / 型号写进 commit、PR、代码注释或任何入库产物（仅聊天可提）。

## 技术约束（Cloudflare Workers，避免重复踩坑）

- **运行时是 V8 isolate，不是 Node**。需要 Node 内置（如 `Buffer`）时必须开
  `compatibility_flags = ["nodejs_compat"]`；优先用 Web 标准 API（`fetch`、
  `crypto.subtle`、`TextEncoder`、`Headers`）。
- **绑定全在 `wrangler.toml` 声明**，类型在 `src/types.ts` 的 `Env` 里维护：
  `ASSETS`（静态资源）、`DB`（D1）、`MAIL_BUCKET`（R2）、`SEND_EMAIL`（Email
  Sending）、以及 vars（`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`CF_ACCOUNT_ID` 等）
  与 secrets（`CF_API_TOKEN`）。
- **入站**：`export default { email(message, env, ctx) }`，`message` 是
  `ForwardableEmailMessage`；用 `postal-mime` 解析 MIME；鉴权结果从
  `Authentication-Results` 头取 SPF/DKIM/DMARC。
- **出站**：`import { EmailMessage } from "cloudflare:email"` + `mimetext` 构造，
  `env.SEND_EMAIL.send(msg)`；`from` 必须是已验证发件身份（域名已 onboard Email
  Sending），否则拒发。
- **Access**：JWT 验签针对
  `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`（RS256），用 `crypto.subtle`
  纯 Web Crypto 实现；校验 `aud` == `ACCESS_AUD`。证书结果可缓存。
- **密钥**：`CF_API_TOKEN` 等用 `wrangler secret put` 注入；本地开发用 `.dev.vars`
  （已 gitignore）。**任何密钥都不许写进源码或入库**。
- **依赖最小化**：运行期仅 `postal-mime`（入站解析）+ `mimetext`（出站构造）；
  其余能力用 Workers 自带 API 实现，不随意引第三方库。
- **类型安全**：TS strict；提交前 `npx tsc --noEmit` 必须通过。

## 前端约定（`web/`）

- 原型用浏览器内 Babel（`<script type="text/babel">`）即可被 Worker 直接托管；
  `api.jsx` 通过 `window.__WEBMAIL_LIVE__` 自动在 **mock**（独立预览）与 **live**
  （Worker 注入该标志）之间切换——改 API 契约时两端都要同步。
- 生产可选 `npm run build:web`（esbuild）把 `.jsx` 打包，详见 `docs/frontend.md`。
- 渲染入站正文（`bodyHtml`）必须**先净化**再插入，绝不直接注入远端 HTML。
