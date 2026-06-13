-- D1 schema for 魔法纪录复兴计划 WebMail.
-- Apply with:  npm run db:init        (remote / production D1)
--              npm run db:init:local  (local wrangler dev)
-- See docs/storage.md for the R2 key layout that complements these tables.

-- ── messages ──────────────────────────────────────────────────────────────
-- One row per stored mail. Inbound rows are written by the email() handler;
-- 'sent'/'drafts' rows are written by the send/compose path. The mailbox is
-- shared across everyone allowed through the Access app (it is the *domain's*
-- mailbox, not per-user), so messages are NOT partitioned by user.
CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,         -- e.g. 'm_<ulid>'
  folder           TEXT NOT NULL DEFAULT 'inbox',
  from_name        TEXT,
  from_email       TEXT,
  to_email         TEXT,                     -- primary To: as received/sent
  routed_from      TEXT,                     -- alias the mail was addressed to (Email Routing)
  routed_via       TEXT NOT NULL DEFAULT 'cloudflare',
  subject          TEXT,
  preview          TEXT,                     -- short text snippet for the list
  body_html        TEXT,                     -- sanitized HTML body
  body_text        TEXT,                     -- plaintext body (reply quoting)
  date             INTEGER NOT NULL,         -- epoch ms (sort key)
  is_read          INTEGER NOT NULL DEFAULT 0,
  is_starred       INTEGER NOT NULL DEFAULT 0,
  has_attachment   INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  spf              TEXT,                      -- 'pass' | 'fail' | 'none' | NULL
  dkim             TEXT,
  dmarc            TEXT,
  raw_key          TEXT,                      -- R2 key of the raw .eml (NULL for drafts)
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_folder  ON messages(folder, date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_starred ON messages(is_starred, date DESC);

-- ── attachments ───────────────────────────────────────────────────────────
-- Metadata for each attachment; the bytes live in R2 under r2_key.
CREATE TABLE IF NOT EXISTS attachments (
  message_id TEXT NOT NULL,
  idx        INTEGER NOT NULL,
  filename   TEXT,
  mime_type  TEXT,
  size       INTEGER,
  r2_key     TEXT,
  PRIMARY KEY (message_id, idx)
);

-- ── identities ────────────────────────────────────────────────────────────
-- Verified "send from" aliases (Email Sending). Seeded by the deployer; the app
-- only edits signature / default. An identity must be verified (its domain
-- onboarded to Email Sending) before the Worker will let you send from it.
CREATE TABLE IF NOT EXISTS identities (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  verified   INTEGER NOT NULL DEFAULT 0,
  signature  TEXT NOT NULL DEFAULT ''
);

-- ── profiles ──────────────────────────────────────────────────────────────
-- Per-user UI preferences, keyed by the Access identity (email).
CREATE TABLE IF NOT EXISTS profiles (
  user_email   TEXT PRIMARY KEY,
  name         TEXT,
  timezone     TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  locale       TEXT NOT NULL DEFAULT 'zh-CN',
  avatar_color TEXT
);

-- ── notifications ─────────────────────────────────────────────────────────
-- Per-user notification prefs, keyed by the Access identity (email).
CREATE TABLE IF NOT EXISTS notifications (
  user_email     TEXT PRIMARY KEY,
  desktop        INTEGER NOT NULL DEFAULT 1,
  sound          INTEGER NOT NULL DEFAULT 0,
  new_mail       INTEGER NOT NULL DEFAULT 1,
  mentions       INTEGER NOT NULL DEFAULT 1,
  digest_daily   INTEGER NOT NULL DEFAULT 0,
  routing_alerts INTEGER NOT NULL DEFAULT 1,
  marketing      INTEGER NOT NULL DEFAULT 0
);

-- ── seed identities ───────────────────────────────────────────────────────
-- Edit these for your own domain before going live (or manage via D1 directly).
-- `verified=1` only for aliases whose domain is actually onboarded to Email
-- Sending; an unverified alias shows greyed-out in the compose "from" picker.
INSERT OR IGNORE INTO identities (id, name, email, is_default, verified, signature) VALUES
  ('idn_1', '调查员 Kasen', 'kasen@magireco.app',    1, 1, '— Kasen' || char(10) || '魔法纪录复兴计划 · 神浜调查部'),
  ('idn_2', '复兴计划支援',  'support@magireco.app',  0, 1, '魔法纪录复兴计划 · 支援窗口'),
  ('idn_3', '活动通知',      'no-reply@magireco.app', 0, 0, '');
