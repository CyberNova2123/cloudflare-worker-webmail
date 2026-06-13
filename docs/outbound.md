# 出站邮件（Email Sending）

发信走 **Email Sending** 的 `SEND_EMAIL` 绑定（`src/email/outbound.ts`，由
`POST /api/messages/send` 调用）。

## 为什么用 builder 形式

`@cloudflare/workers-types` 的 `SendEmail.send` 有两种重载：

```ts
send(message: EmailMessage): Promise<EmailSendResult>           // 自己拼原始 MIME
send(builder: { from, to, subject, cc?, bcc?, text?, html?,     // 由绑定拼 MIME
                replyTo?, headers?, attachments? }): Promise<EmailSendResult>
```

本项目用 **builder 形式**：

- 绑定**自己负责 MIME 组装与编码**——中日文主题/正文的 RFC 2047 / quoted-printable
  这类容易踩坑的事不用我们手写，天然正确；
- **省掉一个依赖**（不需要 mimetext），契合「依赖最小化」约束；
- 多收件人、cc/bcc 原生支持。

## 流程

```
POST /api/messages/send
  { fromIdentityId, to[], cc[], bcc[], subject, bodyText, bodyHtml? }
        │
        ├─ 取发件身份 getIdentity(fromIdentityId)
        │     ├─ 不存在 → 400
        │     └─ verified=0 → 403（域名未 onboard Email Sending，不能发）
        ├─ 收件人去重/清洗；全空 → 400
        ├─ env.SEND_EMAIL.send({ from:{name,email}, to, cc, bcc, subject, text, html })
        │     └─ 绑定拒绝 → 502（把原因透传给前端）
        └─ 落一份到「已发送」（D1 messages, folder='sent'）
  → 200 { id: <EmailSendResult.messageId 或本地 id> }
```

`bodyHtml` 省略时由 `textToHtml(bodyText)` 生成安全 HTML 版本。签名在前端
（`web/compose.jsx`）已拼进 `bodyText` 再提交。

## 发件身份必须「已验证」

`from` 必须是 D1 `identities` 里 `verified=1` 的地址，且其域名已在 Cloudflare 完成
**Email Sending onboarding**（加齐 SPF/DKIM 等 DNS 记录）。未验证身份在前端「发件人」
下拉里是禁用态；即便绕过，后端也会 `403`。新增身份见 [api.md](api.md)（创建后到控制台
onboarding，再把 `verified` 置 1）。

## 收件人范围限制（可选）

`wrangler.toml`：

```toml
[[send_email]]
name = "SEND_EMAIL"
# 仅允许发往这些地址（留空=不限制，可回复任意往来对象）：
# allowed_destination_addresses = ["ok@example.com"]
```

> 历史上 Workers 的 `send_email` 绑定只能发往**已验证的 Email Routing destination**；
> 启用较新的 **Email Sending**（本前端叙事里提到的 public beta）后才可发往任意收件人。
> 若你的账户仍受旧限制，请把对方加为已验证 destination，或改用允许列表。

## 「已发送」副本

每次成功发送都会在 D1 写一行 `folder='sent'`（已读、无鉴权徽标、`raw_key=null`），
因此「已发送」文件夹能看到发出的邮件。当前不持久化出站附件（compose 的附件按钮仍是
占位）。
