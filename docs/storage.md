# 存储：D1 + R2

元数据进 **D1**（`DB`），原始邮件与附件二进制进 **R2**（`MAIL_BUCKET`）。所有 SQL
集中在 `src/store/db.ts`，R2 读写在 `src/store/r2.ts`。表结构源在 `schema.sql`。

## D1 表

### `messages`
单封邮件一行。入站行由 `email()` 写；`sent` 行由发件路径写。**不按用户分区**——这是
域名级共享收件箱（见 [inbound.md](inbound.md) 的设计取舍）。

| 列 | 说明 |
|---|---|
| `id` (PK) | `m_<base36时间戳><随机>`，近似时间有序 |
| `folder` | `inbox`/`sent`/`drafts`/`archive`/`spam`/`trash` |
| `from_name` / `from_email` | 发件人显示名 / 地址 |
| `to_email` | 主要 To 地址 |
| `routed_from` | **邮件被投递到的别名**（Email Routing），即列表里的 `routedFrom` |
| `routed_via` | 固定 `cloudflare` |
| `subject` / `preview` | 主题 / 列表预览片段 |
| `body_html` / `body_text` | **已净化**的 HTML / 纯文本正文 |
| `date` | epoch 毫秒（排序键） |
| `is_read` / `is_starred` | 0/1 |
| `has_attachment` / `attachment_count` | 0/1 与数量 |
| `spf` / `dkim` / `dmarc` | 鉴权裁决（`pass`/`fail`/`none`/NULL） |
| `raw_key` | 原始 `.eml` 的 R2 键（草稿/已发送可空） |
| `created_at` | 写入时间（epoch ms） |

索引：`(folder, date DESC)`、`(is_starred, date DESC)`。

### `attachments`
附件元数据，字节在 R2。主键 `(message_id, idx)`：`filename`、`mime_type`、`size`、
`r2_key`。

### `identities`
可发件的已验证别名（Email Sending）。`id`、`name`、`email`(唯一)、`is_default`、
`verified`、`signature`。由部署者种子/维护；应用只改签名与默认项。

### `profiles`
按 Access email 分区的 UI 偏好：`user_email`(PK)、`name`、`timezone`、`locale`、
`avatar_color`。首次访问 `getOrCreateProfile` 自动建行。

### `notifications`
按 Access email 分区的通知开关（布尔列）：`desktop`、`sound`、`new_mail`、
`mentions`、`digest_daily`、`routing_alerts`、`marketing`。对外 camelCase，列名
snake_case。

> 转发目标地址（destinations）**不入 D1**——实时代理 Cloudflare API（见
> [api.md](api.md)），以 Cloudflare 为唯一真相源。

## R2 键布局

| 键 | 内容 |
|---|---|
| `raw/<messageId>.eml` | 入站邮件的完整原始 MIME（`message/rfc822`） |
| `att/<messageId>/<idx>` | 第 `idx` 个附件的原始字节（content-type 取自附件） |

附件经 `GET /api/messages/:id/attachments/:idx` 流式下发（带
`Content-Disposition: attachment`）。原始 `.eml` 目前仅留存（未开放下载端点，可按需
加）。

## 初始化与迁移

```bash
npm run db:init          # 远程 D1 执行 schema.sql
npm run db:init:local    # 本地 wrangler dev 的 D1
```

`schema.sql` 全部用 `CREATE TABLE IF NOT EXISTS` / `INSERT OR IGNORE`，可重复执行。
改表结构时：同步更新本文件、`src/store/db.ts` 的行类型与查询，并按需写迁移脚本。
