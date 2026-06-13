/// <reference types="@cloudflare/workers-types" />

// Bindings declared in wrangler.toml. Keep this in sync with that file and with
// docs/deployment.md whenever a binding/var is added.
export interface Env {
  // Static assets (the web/ SPA), served via run_worker_first.
  ASSETS: Fetcher;
  // D1: message metadata, identities, profiles, notifications.
  DB: D1Database;
  // R2: raw .eml + attachment blobs.
  MAIL_BUCKET: R2Bucket;
  // Email Sending (outbound) binding.
  SEND_EMAIL: SendEmail;

  // --- vars ---
  ACCESS_TEAM_DOMAIN: string; // e.g. "team.cloudflareaccess.com"
  ACCESS_AUD: string;         // Access application Audience tag
  CF_ACCOUNT_ID: string;      // for the destinations REST proxy
  PRIMARY_DOMAIN: string;     // the routed/sending domain
  DEV_BYPASS_ACCESS?: string; // "1" => skip Access verification (local dev only)

  // --- secrets ---
  CF_API_TOKEN: string;       // token with Email Routing Addresses: Edit
}

// The authenticated principal, derived from the Cloudflare Access JWT.
export interface AccessUser {
  email: string;
  name: string;
  sub?: string;
}

// Per-request context handed to every API handler.
export interface ReqCtx {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  params: Record<string, string>;
  user: AccessUser;
}
