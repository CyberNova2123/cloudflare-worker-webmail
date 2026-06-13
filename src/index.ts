// Worker entry. Two handlers:
//   fetch() — serves the SPA (web/) + the JSON API under /api, gated by Access.
//   email() — Cloudflare Email Routing inbound ingestion.
// See docs/architecture.md for the request lifecycle.
import type { Env } from "./types";
import { authenticate } from "./access";
import { Router } from "./router";
import { error, HttpError } from "./lib/http";
import { handleInboundEmail } from "./email/inbound";
import * as session from "./api/session";
import * as messages from "./api/messages";
import * as identities from "./api/identities";
import * as destinations from "./api/destinations";
import * as profile from "./api/profile";
import * as notifications from "./api/notifications";

// Register specific paths before catch-alls (…/:id) — see Router.handle.
const api = new Router();
api.get("/api/auth/session", session.getSession);
api.post("/api/auth/logout", session.logout);

api.get("/api/messages", messages.list);
api.get("/api/messages/counts", messages.counts);
api.post("/api/messages/send", messages.send);
api.get("/api/messages/:id", messages.get);
api.patch("/api/messages/:id/state", messages.patchState);
api.get("/api/messages/:id/attachments/:idx", messages.attachment);

api.get("/api/identities", identities.list);
api.post("/api/identities", identities.create);
api.patch("/api/identities/:id", identities.update);

api.get("/api/destinations", destinations.list);
api.post("/api/destinations", destinations.create);
api.post("/api/destinations/:id/resend", destinations.resend);
api.delete("/api/destinations/:id", destinations.remove);

api.get("/api/profile", profile.get);
api.patch("/api/profile", profile.patch);

api.get("/api/settings/notifications", notifications.get);
api.patch("/api/settings/notifications", notifications.patch);

// Tells web/api.jsx the real backend is present (flip it out of mock mode).
const LIVE_FLAG = "<script>window.__WEBMAIL_LIVE__=true;</script>";
function injectLive(html: string): string {
  return html.includes("</head>") ? html.replace("</head>", LIVE_FLAG + "</head>") : LIVE_FLAG + html;
}

async function serveAsset(request: Request, env: Env, url: URL): Promise<Response> {
  let res = await env.ASSETS.fetch(request);
  let html = url.pathname === "/" || url.pathname.endsWith(".html");
  if (res.status === 404) {
    // SPA fallback: unknown non-/api route -> index.html.
    res = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), { method: "GET" }));
    html = true;
  }
  if (html && res.ok) {
    const body = injectLive(await res.text());
    const headers = new Headers(res.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(body, { status: res.status, headers });
  }
  // Workers Assets doesn't know the .jsx extension; the prototype loads these as
  // scripts, so force a JS content-type. (Bundled builds emit .js and skip this.)
  if (url.pathname.endsWith(".jsx")) {
    const headers = new Headers(res.headers);
    headers.set("content-type", "application/javascript; charset=utf-8");
    return new Response(res.body, { status: res.status, headers });
  }
  return res;
}

async function handleFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    const user = await authenticate(request, env);
    if (!user) return error(401, "unauthenticated");
    try {
      const res = await api.handle(request, env, ctx, url, user);
      return res ?? error(404, "未找到该接口");
    } catch (e) {
      if (e instanceof HttpError) return error(e.status, e.message);
      console.error("api error:", e);
      return error(500, "服务器内部错误");
    }
  }
  return serveAsset(request, env, url);
}

export default {
  fetch: handleFetch,
  email: handleInboundEmail,
} satisfies ExportedHandler<Env>;
