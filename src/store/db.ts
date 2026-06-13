// D1 data access. Every SQL touch lives here; handlers stay storage-agnostic.
// Keep row shapes in sync with schema.sql and docs/storage.md.
import type { AccessUser, Env } from "../types";
import { hueFor, newId } from "../lib/util";

export interface MessageRow {
  id: string;
  folder: string;
  from_name: string | null;
  from_email: string | null;
  to_email: string | null;
  routed_from: string | null;
  routed_via: string;
  subject: string | null;
  preview: string | null;
  body_html: string | null;
  body_text: string | null;
  date: number;
  is_read: number;
  is_starred: number;
  has_attachment: number;
  attachment_count: number;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  raw_key: string | null;
  created_at: number;
}

export interface AttachmentRow {
  message_id: string;
  idx: number;
  filename: string | null;
  mime_type: string | null;
  size: number | null;
  r2_key: string | null;
}

export interface IdentityRow {
  id: string;
  name: string;
  email: string;
  is_default: number;
  verified: number;
  signature: string;
}

export interface ProfileRow {
  user_email: string;
  name: string | null;
  timezone: string;
  locale: string;
  avatar_color: string | null;
}

export interface NotifRow {
  user_email: string;
  desktop: number;
  sound: number;
  new_mail: number;
  mentions: number;
  digest_daily: number;
  routing_alerts: number;
  marketing: number;
}

/* ----------------------------------------------------------------- messages */

const MSG_COLS =
  "id,folder,from_name,from_email,to_email,routed_from,routed_via,subject,preview," +
  "body_html,body_text,date,is_read,is_starred,has_attachment,attachment_count," +
  "spf,dkim,dmarc,raw_key,created_at";

export async function insertMessage(env: Env, m: MessageRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO messages (${MSG_COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      m.id, m.folder, m.from_name, m.from_email, m.to_email, m.routed_from, m.routed_via,
      m.subject, m.preview, m.body_html, m.body_text, m.date, m.is_read, m.is_starred,
      m.has_attachment, m.attachment_count, m.spf, m.dkim, m.dmarc, m.raw_key, m.created_at,
    )
    .run();
}

const SEARCH_COLS = ["subject", "from_name", "from_email", "preview", "routed_from"];

export async function listMessages(env: Env, folder: string, q: string): Promise<MessageRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (folder === "starred") {
    where.push("is_starred = 1");
  } else {
    where.push("folder = ?");
    binds.push(folder);
  }
  if (q) {
    where.push("(" + SEARCH_COLS.map((c) => `${c} LIKE ?`).join(" OR ") + ")");
    const like = `%${q}%`;
    for (let i = 0; i < SEARCH_COLS.length; i++) binds.push(like);
  }
  const sql = `SELECT ${MSG_COLS} FROM messages WHERE ${where.join(" AND ")} ORDER BY date DESC LIMIT 200`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all<MessageRow>();
  return results;
}

export async function getMessage(env: Env, id: string): Promise<MessageRow | null> {
  return env.DB.prepare(`SELECT ${MSG_COLS} FROM messages WHERE id = ?`).bind(id).first<MessageRow>();
}

export interface StatePatch {
  read?: boolean;
  starred?: boolean;
  folder?: string;
}

export async function setMessageState(env: Env, id: string, patch: StatePatch): Promise<MessageRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof patch.read === "boolean") { sets.push("is_read = ?"); binds.push(patch.read ? 1 : 0); }
  if (typeof patch.starred === "boolean") { sets.push("is_starred = ?"); binds.push(patch.starred ? 1 : 0); }
  if (typeof patch.folder === "string" && patch.folder) { sets.push("folder = ?"); binds.push(patch.folder); }
  if (sets.length) {
    binds.push(id);
    await env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  }
  return getMessage(env, id);
}

// Unread counts per folder, for the sidebar badges.
export async function unreadCounts(env: Env): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare(
    "SELECT folder, COUNT(*) AS n FROM messages WHERE is_read = 0 GROUP BY folder",
  ).all<{ folder: string; n: number }>();
  const out: Record<string, number> = {};
  for (const r of results) out[r.folder] = r.n;
  return out;
}

/* -------------------------------------------------------------- attachments */

export async function insertAttachment(env: Env, a: AttachmentRow): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO attachments (message_id, idx, filename, mime_type, size, r2_key) VALUES (?,?,?,?,?,?)",
  )
    .bind(a.message_id, a.idx, a.filename, a.mime_type, a.size, a.r2_key)
    .run();
}

export async function listAttachments(env: Env, messageId: string): Promise<AttachmentRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT message_id, idx, filename, mime_type, size, r2_key FROM attachments WHERE message_id = ? ORDER BY idx",
  )
    .bind(messageId)
    .all<AttachmentRow>();
  return results;
}

export async function getAttachment(env: Env, messageId: string, idx: number): Promise<AttachmentRow | null> {
  return env.DB.prepare(
    "SELECT message_id, idx, filename, mime_type, size, r2_key FROM attachments WHERE message_id = ? AND idx = ?",
  )
    .bind(messageId, idx)
    .first<AttachmentRow>();
}

/* --------------------------------------------------------------- identities */

export async function listIdentities(env: Env): Promise<IdentityRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, email, is_default, verified, signature FROM identities ORDER BY is_default DESC, email ASC",
  ).all<IdentityRow>();
  return results;
}

export async function getIdentity(env: Env, id: string): Promise<IdentityRow | null> {
  return env.DB.prepare(
    "SELECT id, name, email, is_default, verified, signature FROM identities WHERE id = ?",
  )
    .bind(id)
    .first<IdentityRow>();
}

export async function createIdentity(
  env: Env,
  data: { name: string; email: string; signature?: string },
): Promise<IdentityRow> {
  const id = newId("idn");
  await env.DB.prepare(
    "INSERT INTO identities (id, name, email, is_default, verified, signature) VALUES (?,?,?,0,0,?)",
  )
    .bind(id, data.name, data.email, data.signature ?? "")
    .run();
  return (await getIdentity(env, id))!;
}

export async function updateIdentity(
  env: Env,
  id: string,
  patch: { name?: string; signature?: string; isDefault?: boolean },
): Promise<IdentityRow | null> {
  if (patch.isDefault === true) {
    await env.DB.prepare("UPDATE identities SET is_default = 0").run();
    await env.DB.prepare("UPDATE identities SET is_default = 1 WHERE id = ?").bind(id).run();
  }
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof patch.name === "string") { sets.push("name = ?"); binds.push(patch.name); }
  if (typeof patch.signature === "string") { sets.push("signature = ?"); binds.push(patch.signature); }
  if (sets.length) {
    binds.push(id);
    await env.DB.prepare(`UPDATE identities SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  }
  return getIdentity(env, id);
}

/* ----------------------------------------------------------------- profiles */

export async function getOrCreateProfile(env: Env, user: AccessUser): Promise<ProfileRow> {
  const existing = await env.DB.prepare(
    "SELECT user_email, name, timezone, locale, avatar_color FROM profiles WHERE user_email = ?",
  )
    .bind(user.email)
    .first<ProfileRow>();
  if (existing) return existing;
  const row: ProfileRow = {
    user_email: user.email,
    name: user.name,
    timezone: "Asia/Shanghai",
    locale: "zh-CN",
    avatar_color: hueFor(user.email),
  };
  await env.DB.prepare(
    "INSERT INTO profiles (user_email, name, timezone, locale, avatar_color) VALUES (?,?,?,?,?)",
  )
    .bind(row.user_email, row.name, row.timezone, row.locale, row.avatar_color)
    .run();
  return row;
}

export async function saveProfile(
  env: Env,
  email: string,
  patch: { name?: string; timezone?: string; locale?: string; avatar_color?: string },
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const k of ["name", "timezone", "locale", "avatar_color"] as const) {
    const v = patch[k];
    if (typeof v === "string") { sets.push(`${k} = ?`); binds.push(v); }
  }
  if (!sets.length) return;
  binds.push(email);
  await env.DB.prepare(`UPDATE profiles SET ${sets.join(", ")} WHERE user_email = ?`).bind(...binds).run();
}

/* ------------------------------------------------------------- notifications */

const NOTIF_KEYS = [
  "desktop", "sound", "new_mail", "mentions", "digest_daily", "routing_alerts", "marketing",
] as const;

export async function getOrCreateNotifications(env: Env, email: string): Promise<NotifRow> {
  const existing = await env.DB.prepare(
    "SELECT user_email, desktop, sound, new_mail, mentions, digest_daily, routing_alerts, marketing FROM notifications WHERE user_email = ?",
  )
    .bind(email)
    .first<NotifRow>();
  if (existing) return existing;
  const row: NotifRow = {
    user_email: email, desktop: 1, sound: 0, new_mail: 1, mentions: 1,
    digest_daily: 0, routing_alerts: 1, marketing: 0,
  };
  await env.DB.prepare(
    "INSERT INTO notifications (user_email, desktop, sound, new_mail, mentions, digest_daily, routing_alerts, marketing) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(row.user_email, row.desktop, row.sound, row.new_mail, row.mentions, row.digest_daily, row.routing_alerts, row.marketing)
    .run();
  return row;
}

export async function saveNotifications(env: Env, email: string, patch: Record<string, unknown>): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const k of NOTIF_KEYS) {
    if (k in patch) { sets.push(`${k} = ?`); binds.push(patch[k] ? 1 : 0); }
  }
  if (!sets.length) return;
  binds.push(email);
  await env.DB.prepare(`UPDATE notifications SET ${sets.join(", ")} WHERE user_email = ?`).bind(...binds).run();
}
