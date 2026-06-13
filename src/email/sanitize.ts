// Best-effort HTML sanitizer for inbound mail bodies, built on Workers'
// native streaming HTMLRewriter (no DOM, no deps).
//
// Strategy: drop active/structural elements entirely (script/style/iframe/…),
// strip event-handler attributes and dangerous URL schemes, and harden links.
// This neutralizes the common XSS vectors before the body is stored/rendered.
// It is NOT a formally verified sanitizer — for high-assurance deployments,
// pair it with a strict CSP and/or a vetted sanitizer. See docs/inbound.md.

const DROP = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet",
  "form", "input", "button", "select", "option", "textarea", "link", "meta",
  "base", "title", "head", "svg", "math", "noscript",
]);

const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "background", "poster"]);
const BAD_SCHEME = /^\s*(javascript|vbscript|data):/i;
const DATA_IMAGE = /^\s*data:image\//i;

class CleanHandler implements HTMLRewriterElementContentHandlers {
  element(el: Element): void {
    const tag = el.tagName.toLowerCase();
    if (DROP.has(tag)) {
      el.remove(); // removes the element AND its contents (good for script/style)
      return;
    }
    const remove: string[] = [];
    for (const [name, value] of el.attributes) {
      const n = name.toLowerCase();
      if (n.startsWith("on")) { remove.push(name); continue; }
      if (n === "srcset") { remove.push(name); continue; }
      if (URL_ATTRS.has(n) && BAD_SCHEME.test(value)) {
        // allow inline data: images on src, reject every other data:/js:/vbs:
        if (!(n === "src" && DATA_IMAGE.test(value))) remove.push(name);
      }
      if (n === "style" && /(expression\s*\(|javascript:|vbscript:)/i.test(value)) remove.push(name);
    }
    for (const n of remove) el.removeAttribute(n);
    if (tag === "a") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }
}

export async function sanitizeHtml(html: string): Promise<string> {
  if (!html) return "";
  const rewriter = new HTMLRewriter().on("*", new CleanHandler());
  const res = rewriter.transform(new Response(html));
  return res.text();
}
