// /api/messages* — list, counts, read, state, send, attachment download.
import type { ReqCtx } from "../types";
import { HttpError, json, readJson } from "../lib/http";
import {
  getAttachment,
  getMessage,
  listAttachments,
  listMessages,
  setMessageState,
  unreadCounts,
  type StatePatch,
} from "../store/db";
import { getObject } from "../store/r2";
import { sendDraft, type Draft } from "../email/outbound";
import { fullMessageShape, listMessageShape } from "./shapes";

// GET /api/messages?folder=&q=
export async function list(c: ReqCtx): Promise<Response> {
  const folder = c.url.searchParams.get("folder") || "inbox";
  const q = c.url.searchParams.get("q") || "";
  const rows = await listMessages(c.env, folder, q);
  return json({ items: rows.map(listMessageShape), nextCursor: null });
}

// GET /api/messages/counts -> { folderId: unreadCount }
export async function counts(c: ReqCtx): Promise<Response> {
  return json(await unreadCounts(c.env));
}

// GET /api/messages/:id
export async function get(c: ReqCtx): Promise<Response> {
  const row = await getMessage(c.env, c.params.id);
  if (!row) throw new HttpError(404, "邮件不存在");
  const atts = await listAttachments(c.env, row.id);
  return json(fullMessageShape(row, atts));
}

// PATCH /api/messages/:id/state { read?, starred?, folder? }
export async function patchState(c: ReqCtx): Promise<Response> {
  const patch = await readJson<StatePatch>(c.request);
  const row = await setMessageState(c.env, c.params.id, patch);
  if (!row) throw new HttpError(404, "邮件不存在");
  const atts = await listAttachments(c.env, row.id);
  return json(fullMessageShape(row, atts));
}

// POST /api/messages/send
export async function send(c: ReqCtx): Promise<Response> {
  const draft = await readJson<Draft>(c.request);
  return json(await sendDraft(c.env, draft));
}

// GET /api/messages/:id/attachments/:idx -> raw bytes (download)
export async function attachment(c: ReqCtx): Promise<Response> {
  const idx = Number(c.params.idx);
  if (!Number.isInteger(idx) || idx < 0) throw new HttpError(400, "无效的附件序号");
  const meta = await getAttachment(c.env, c.params.id, idx);
  if (!meta || !meta.r2_key) throw new HttpError(404, "附件不存在");
  const obj = await getObject(c.env, meta.r2_key);
  if (!obj) throw new HttpError(404, "附件内容缺失");
  const headers = new Headers();
  headers.set("content-type", meta.mime_type || "application/octet-stream");
  const fname = encodeURIComponent(meta.filename || `attachment-${idx + 1}`);
  headers.set("content-disposition", `attachment; filename*=UTF-8''${fname}`);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(obj.body, { headers });
}
