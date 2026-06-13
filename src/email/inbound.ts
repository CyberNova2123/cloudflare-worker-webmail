// Inbound mail — Cloudflare Email Routing invokes this for every message routed
// to the Worker. We parse the MIME (postal-mime), sanitize the HTML body, stash
// the raw .eml + attachments in R2, and write metadata to D1 so the /api can
// list and read it. See docs/inbound.md.
import PostalMime, { type Address, type Mailbox } from "postal-mime";
import type { Env } from "../types";
import { insertAttachment, insertMessage } from "../store/db";
import { putAttachment, putRaw } from "../store/r2";
import { sanitizeHtml } from "./sanitize";
import { makePreview, newId, stripTags, textToHtml, toBytes } from "../lib/util";

function isMailbox(a: Address | undefined): a is Mailbox {
  return !!a && "address" in a && typeof a.address === "string";
}

// Pull spf/dkim/dmarc verdicts out of the Authentication-Results header that
// Email Routing prepends.
function parseAuthResults(header: string): { spf: string | null; dkim: string | null; dmarc: string | null } {
  const verdict = (key: string): string | null => {
    const m = new RegExp(`\\b${key}=([a-zA-Z]+)`).exec(header);
    return m ? m[1].toLowerCase() : null;
  };
  return { spf: verdict("spf"), dkim: verdict("dkim"), dmarc: verdict("dmarc") };
}

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  try {
    const rawBuf = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(rawBuf, { attachmentEncoding: "arraybuffer" });

    const id = newId("m");
    const alias = message.to; // the alias the mail was addressed to (Email Routing)
    const fromAddr = isMailbox(parsed.from) ? parsed.from.address : message.from;
    const fromName = (isMailbox(parsed.from) && parsed.from.name) || fromAddr;
    const toMb = parsed.to?.find(isMailbox);
    const subject = (parsed.subject || "").trim() || "(无主题)";
    const text = parsed.text || "";
    const html = parsed.html ? await sanitizeHtml(parsed.html) : textToHtml(text);
    const preview = makePreview(text || stripTags(parsed.html || ""));
    const auth = parseAuthResults(message.headers.get("authentication-results") || "");

    // raw .eml
    const rawKey = `raw/${id}.eml`;
    await putRaw(env, rawKey, rawBuf);

    // attachments (skip inline/cid parts; those belong to the HTML body)
    const visible = (parsed.attachments || []).filter((a) => a.disposition !== "inline");
    for (let i = 0; i < visible.length; i++) {
      const a = visible[i];
      const bytes = toBytes(a.content, a.encoding);
      const key = `att/${id}/${i}`;
      await putAttachment(env, key, bytes, a.mimeType || "application/octet-stream");
      await insertAttachment(env, {
        message_id: id,
        idx: i,
        filename: a.filename || `attachment-${i + 1}`,
        mime_type: a.mimeType || "application/octet-stream",
        size: bytes.byteLength,
        r2_key: key,
      });
    }

    const date = parsed.date ? Date.parse(parsed.date) || Date.now() : Date.now();
    await insertMessage(env, {
      id,
      folder: "inbox",
      from_name: fromName,
      from_email: fromAddr,
      to_email: toMb?.address || alias,
      routed_from: alias,
      routed_via: "cloudflare",
      subject,
      preview,
      body_html: html,
      body_text: text,
      date,
      is_read: 0,
      is_starred: 0,
      has_attachment: visible.length ? 1 : 0,
      attachment_count: visible.length,
      spf: auth.spf,
      dkim: auth.dkim,
      dmarc: auth.dmarc,
      raw_key: rawKey,
      created_at: Date.now(),
    });

    // Optional: also forward to a real mailbox (must be a verified Email Routing
    // destination). Uncomment + set an address to keep a downstream copy.
    // await message.forward("you@personal.example");
  } catch (err) {
    // Never reject here — rejecting bounces the sender. Log and move on; the
    // raw message is already (or will be) retried by Email Routing if needed.
    console.error("inbound email persist failed:", err);
  }
}
