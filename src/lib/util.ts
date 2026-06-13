// Small pure helpers: ids, hashing, text/HTML massaging, byte coercion.

const B32 = "0123456789abcdefghijklmnopqrstuvwxyz";

// Roughly time-sortable id: base36 timestamp + random suffix. Good enough to
// order rows by id and avoid collisions without pulling in a ULID dep.
export function newId(prefix = "m"): string {
  const t = Date.now().toString(36).padStart(9, "0");
  let r = "";
  for (let i = 0; i < 10; i++) r += B32[Math.floor(Math.random() * 36)];
  return `${prefix}_${t}${r}`;
}

// Stable short hex digest of a string (used for a deterministic user id).
export async function shortHash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  const b = new Uint8Array(buf).slice(0, 5);
  let out = "";
  for (const x of b) out += x.toString(16).padStart(2, "0");
  return out;
}

// Deterministic 0..359 hue for avatar gradients, keyed off email/name.
export function hueFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return String(h);
}

export function makePreview(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

// Render plaintext as safe HTML paragraphs (used for text-only mail + sent copies).
export function textToHtml(s: string): string {
  if (!s || !s.trim()) return "<p>(无正文)</p>";
  return s
    .split(/\n{2,}/)
    .map((p) => "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>")
    .join("");
}

export function stripTags(html: string): string {
  return (html || "").replace(/<[^>]*>/g, " ");
}

// Normalize postal-mime attachment content into raw bytes for R2.
export function toBytes(content: ArrayBuffer | Uint8Array | string, encoding?: string): Uint8Array {
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (content instanceof Uint8Array) return content;
  if (typeof content === "string") {
    if (encoding === "base64") {
      const bin = atob(content);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    return new TextEncoder().encode(content);
  }
  return new Uint8Array();
}

// De-dupe + trim a list of email strings.
export function uniqEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v === "string") {
      const e = v.trim();
      if (e) seen.add(e);
    }
  }
  return [...seen];
}
