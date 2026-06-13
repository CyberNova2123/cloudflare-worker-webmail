// /api/destinations — thin proxy over the Cloudflare Email Routing
// "destination addresses" REST API. Requires CF_ACCOUNT_ID + CF_API_TOKEN
// (token scope: Account » Email Routing Addresses » Edit). See docs/api.md.
import type { Env, ReqCtx } from "../types";
import { HttpError, json, noContent, readJson } from "../lib/http";

interface CfAddress {
  id: string;
  tag: string;
  email: string;
  verified: string | null; // ISO timestamp once verified, else null
  created: string;
  modified: string;
}
interface CfResult<T> {
  success: boolean;
  result: T;
  errors?: { message: string }[];
}

function base(env: Env): string {
  if (!env.CF_ACCOUNT_ID) throw new HttpError(500, "未配置 CF_ACCOUNT_ID");
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`;
}
function headers(env: Env): HeadersInit {
  if (!env.CF_API_TOKEN) throw new HttpError(500, "未配置 CF_API_TOKEN");
  return { Authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" };
}
// `tag` is the per-address identifier used in the address-specific routes.
function shape(a: CfAddress) {
  return { id: a.tag, email: a.email, verified: !!a.verified, created: a.created };
}

async function cf<T>(url: string, init: RequestInit, env: Env, fail: string): Promise<CfResult<T>> {
  const res = await fetch(url, { ...init, headers: headers(env) });
  const data = (await res.json().catch(() => null)) as CfResult<T> | null;
  if (!res.ok || !data || !data.success) {
    throw new HttpError(502, data?.errors?.[0]?.message || fail);
  }
  return data;
}

// GET /api/destinations
export async function list(c: ReqCtx): Promise<Response> {
  const data = await cf<CfAddress[]>(base(c.env) + "?per_page=100&direction=desc", {}, c.env, "无法获取目标地址");
  return json(data.result.map(shape));
}

// POST /api/destinations { email } -> triggers a verification email
export async function create(c: ReqCtx): Promise<Response> {
  const body = await readJson<{ email?: string }>(c.request);
  const email = (body.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "请输入有效的邮箱地址");
  const data = await cf<CfAddress>(
    base(c.env),
    { method: "POST", body: JSON.stringify({ email }) },
    c.env,
    "添加目标地址失败",
  );
  return json(shape(data.result), { status: 201 });
}

// DELETE /api/destinations/:id
export async function remove(c: ReqCtx): Promise<Response> {
  await cf<CfAddress>(
    `${base(c.env)}/${encodeURIComponent(c.params.id)}`,
    { method: "DELETE" },
    c.env,
    "删除目标地址失败",
  );
  return noContent();
}

// POST /api/destinations/:id/resend
// Cloudflare exposes no dedicated "resend verification" endpoint; re-creating an
// unverified address re-sends the email. We look it up, delete, and re-add (it
// was unverified anyway). The returned id changes — the client refetches.
export async function resend(c: ReqCtx): Promise<Response> {
  const tag = encodeURIComponent(c.params.id);
  const existing = await cf<CfAddress>(`${base(c.env)}/${tag}`, {}, c.env, "目标地址不存在");
  const email = existing.result.email;
  await fetch(`${base(c.env)}/${tag}`, { method: "DELETE", headers: headers(c.env) });
  const added = await cf<CfAddress>(
    base(c.env),
    { method: "POST", body: JSON.stringify({ email }) },
    c.env,
    "重发验证失败",
  );
  return json(shape(added.result));
}
