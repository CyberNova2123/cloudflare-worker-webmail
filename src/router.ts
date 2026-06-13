// Minimal dependency-free router. Matches METHOD + a /segment/:param pattern and
// hands matched routes a ReqCtx. Routes are tested in registration order, so
// register more specific paths (…/counts, …/send) before catch-alls (…/:id).
import type { AccessUser, Env, ReqCtx } from "./types";

type Handler = (c: ReqCtx) => Promise<Response> | Response;

interface Route {
  method: string;
  segs: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  private add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({ method, segs: pattern.split("/").filter(Boolean), handler });
  }
  get(p: string, h: Handler): void { this.add("GET", p, h); }
  post(p: string, h: Handler): void { this.add("POST", p, h); }
  patch(p: string, h: Handler): void { this.add("PATCH", p, h); }
  delete(p: string, h: Handler): void { this.add("DELETE", p, h); }

  // Returns null when nothing matched (caller renders 404).
  async handle(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    url: URL,
    user: AccessUser,
  ): Promise<Response | null> {
    const parts = url.pathname.split("/").filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== request.method) continue;
      if (r.segs.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < r.segs.length; i++) {
        const s = r.segs[i];
        if (s.startsWith(":")) params[s.slice(1)] = decodeURIComponent(parts[i]);
        else if (s !== parts[i]) { ok = false; break; }
      }
      if (!ok) continue;
      return r.handler({ request, env, ctx, url, params, user });
    }
    return null;
  }
}
