# 入站邮件（Email Routing）

当一条 **Email Routing 规则指向本 Worker** 时，每封发往对应别名的邮件都会触发
导出的 `email(message, env, ctx)`（`src/email/inbound.ts`）。

## 流程

```
ForwardableEmailMessage
  message.to            ← 邮件被投递到的别名（如 hi@example.com）= routedFrom
  message.from          ← 信封发件人
  message.headers       ← Headers（含 Authentication-Results）
  message.raw           ← 原始 MIME 流（只可消费一次）
```

1. **缓冲原始字节**：`await new Response(message.raw).arrayBuffer()`（流只能读一次，
   先缓冲再既存 R2 又交给解析器）。
2. **解析 MIME**：`PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" })` →
   `from / to / subject / text / html / attachments / date / headers`。
3. **鉴权结果**：从 `Authentication-Results` 头正则取 `spf= / dkim= / dmarc=` 裁决。
   Email Routing 会注入该头；缺失则记 `null`（前端显示 `—`，不展示徽标）。
4. **净化正文**：`sanitizeHtml(html)`（见下）；纯文本邮件用 `textToHtml` 包成安全段落。
5. **R2**：原始 `.eml` 存 `raw/<id>.eml`；每个**非 inline** 附件存 `att/<id>/<idx>`。
6. **D1**：写一行 `messages`（`folder='inbox'`、预览、日期、附件数、鉴权裁决、`raw_key`）
   及若干 `attachments` 行。

落库后，`/api/messages*` 即可列出/读取/下载它。键布局与表结构见 [storage.md](storage.md)。

## 绝不 reject

`email()` 全程 `try/catch`：**任何异常只记日志，不调用 `message.setReject()`**。
reject 会给发信方回永久性 SMTP 错误（退信）；我们宁可吞掉错误，让 Email Routing
按其策略重试，也不误伤正常邮件。

## 可选：同时转发到真实邮箱

如果你既想在本应用里看到邮件、又想保留一份到个人邮箱，取消注释：

```ts
// await message.forward("you@personal.example");
```

转发目标必须是该账户下**已验证的 Email Routing destination 地址**。

## 正文净化（`src/email/sanitize.ts`）

入站 HTML 在**落库前**就用 Workers 原生的流式 `HTMLRewriter` 净化（无 DOM、无依赖）：

- **整体删除**危险/结构性元素（连同内容）：`script` `style` `iframe` `object`
  `embed` `form` `input` `link` `meta` `base` `svg` `math` 等。
- **删除**事件处理属性（`on*`）与 `srcset`。
- **拦截**危险 URL 协议（`javascript:` / `vbscript:` / `data:`）于 `href/src/action/…`；
  仅放行 `src` 上的 `data:image/`。
- **加固**链接：`a` 一律加 `target="_blank"` + `rel="noopener noreferrer nofollow"`。

> 这是**尽力而为**的净化，足以挡住常见 XSS 向量，但不是形式化验证的过滤器。它**保留
> 内联 `style`**（仅剔除含 `javascript:`/`expression()` 的）以维持邮件排版；对高保障
> 场景，建议叠加严格 CSP，或在此基础上再过一遍受信任的成熟净化器。前端阅读页因此
> 可以直接渲染已净化的 `bodyHtml`（`web/mail.jsx`）。

## 设计取舍

- **收件箱是「域名级」共享**：消息不按用户分区——发往域名各别名的邮件进同一个收件箱，
  所有通过 Access 的人都能看到（符合「这是这个域名的邮箱」模型）。个性化的只有档案/通知
  （按 Access email 分区）。
- **`id` 近似时间有序**（`newId`：base36 时间戳 + 随机后缀），便于按 id 粗略排序、
  避免碰撞，且不引入 ULID 依赖。
