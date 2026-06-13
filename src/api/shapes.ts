// Row -> wire-shape converters. These define the JSON the frontend consumes;
// keep them aligned with web/api.jsx response-shape comments + docs/api.md.
import type { AttachmentRow, IdentityRow, MessageRow, NotifRow, ProfileRow } from "../store/db";

export function listMessageShape(r: MessageRow) {
  return {
    id: r.id,
    folder: r.folder,
    from: { name: r.from_name || "", email: r.from_email || "" },
    to: r.to_email || "",
    subject: r.subject || "",
    preview: r.preview || "",
    date: new Date(r.date).toISOString(),
    read: !!r.is_read,
    starred: !!r.is_starred,
    hasAttachment: !!r.has_attachment,
    attachmentCount: r.attachment_count || 0,
    routedFrom: r.routed_from || "",
    routedVia: r.routed_via || "cloudflare",
    labels: [] as string[],
  };
}

export function fullMessageShape(r: MessageRow, atts: AttachmentRow[]) {
  return {
    ...listMessageShape(r),
    bodyHtml: r.body_html || "",
    bodyText: r.body_text || "",
    routing: {
      to: r.routed_from || r.to_email || "",
      spf: r.spf || "—",
      dkim: r.dkim || "—",
      dmarc: r.dmarc || "—",
    },
    attachments: atts.map((a) => ({
      idx: a.idx,
      filename: a.filename || `attachment-${a.idx + 1}`,
      mimeType: a.mime_type || "application/octet-stream",
      size: a.size || 0,
      url: `/api/messages/${r.id}/attachments/${a.idx}`,
    })),
    headers: {
      subject: r.subject || "",
      from: r.from_email || "",
      to: r.to_email || "",
      date: new Date(r.date).toISOString(),
    },
  };
}

export function identityShape(r: IdentityRow) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    isDefault: !!r.is_default,
    verified: !!r.verified,
    signature: r.signature || "",
  };
}

export function profileShape(r: ProfileRow) {
  return {
    name: r.name || "",
    email: r.user_email,
    timezone: r.timezone,
    locale: r.locale,
    avatarColor: r.avatar_color || "",
  };
}

export function notifShape(r: NotifRow) {
  return {
    desktop: !!r.desktop,
    sound: !!r.sound,
    newMail: !!r.new_mail,
    mentions: !!r.mentions,
    digestDaily: !!r.digest_daily,
    routingAlerts: !!r.routing_alerts,
    marketing: !!r.marketing,
  };
}
