// Outbound mail — Cloudflare Email Sending via the SEND_EMAIL binding's builder
// form (it assembles the MIME, incl. correct encoding for CJK subjects/bodies).
// The `from` MUST be a verified identity (its domain onboarded to Email
// Sending) or the binding rejects the send. See docs/outbound.md.
import type { Env } from "../types";
import { HttpError } from "../lib/http";
import { getIdentity, insertMessage } from "../store/db";
import { makePreview, newId, textToHtml, uniqEmails } from "../lib/util";

export interface Draft {
  fromIdentityId?: string;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
}

export async function sendDraft(env: Env, draft: Draft): Promise<{ id: string }> {
  const ident = draft.fromIdentityId ? await getIdentity(env, draft.fromIdentityId) : null;
  if (!ident) throw new HttpError(400, "发件身份不存在");
  if (!ident.verified) throw new HttpError(403, "该发件身份尚未验证，无法发信");

  const to = uniqEmails(draft.to);
  const cc = uniqEmails(draft.cc);
  const bcc = uniqEmails(draft.bcc);
  if (!to.length && !cc.length && !bcc.length) throw new HttpError(400, "请至少填写一个收件人");

  const subject = (draft.subject || "").trim() || "(无主题)";
  const text = typeof draft.bodyText === "string" ? draft.bodyText : "";
  const html = typeof draft.bodyHtml === "string" && draft.bodyHtml ? draft.bodyHtml : textToHtml(text);

  let messageId = "";
  try {
    const result = await env.SEND_EMAIL.send({
      from: { name: ident.name, email: ident.email },
      to: to.map((email) => ({ name: "", email })),
      cc: cc.length ? cc.map((email) => ({ name: "", email })) : undefined,
      bcc: bcc.length ? bcc.map((email) => ({ name: "", email })) : undefined,
      subject,
      text,
      html,
    });
    messageId = result.messageId;
  } catch (e) {
    const reason = e instanceof Error ? e.message : "邮件服务拒绝了请求";
    throw new HttpError(502, "发送失败：" + reason);
  }

  // Keep a copy in the "已发送" folder.
  const id = newId("m");
  const now = Date.now();
  await insertMessage(env, {
    id,
    folder: "sent",
    from_name: ident.name,
    from_email: ident.email,
    to_email: to[0] || cc[0] || bcc[0] || "",
    routed_from: ident.email,
    routed_via: "cloudflare",
    subject,
    preview: makePreview(text),
    body_html: html,
    body_text: text,
    date: now,
    is_read: 1,
    is_starred: 0,
    has_attachment: 0,
    attachment_count: 0,
    spf: null,
    dkim: null,
    dmarc: null,
    raw_key: null,
    created_at: now,
  });

  return { id: messageId || id };
}
