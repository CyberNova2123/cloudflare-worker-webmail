// /api/identities — verified send-from aliases (Email Sending senders).
import type { ReqCtx } from "../types";
import { HttpError, json, readJson } from "../lib/http";
import { createIdentity, listIdentities, updateIdentity } from "../store/db";
import { identityShape } from "./shapes";

export async function list(c: ReqCtx): Promise<Response> {
  const rows = await listIdentities(c.env);
  return json(rows.map(identityShape));
}

// POST /api/identities { name, email, signature? } — creates an UNVERIFIED
// alias. Verification (Email Sending DNS onboarding) happens in the Cloudflare
// dashboard; flip `verified` in D1 once the domain is onboarded.
export async function create(c: ReqCtx): Promise<Response> {
  const body = await readJson<{ name?: string; email?: string; signature?: string }>(c.request);
  if (!body.name || !body.email) throw new HttpError(400, "缺少 name 或 email");
  const row = await createIdentity(c.env, { name: body.name, email: body.email, signature: body.signature });
  return json(identityShape(row), { status: 201 });
}

// PATCH /api/identities/:id { name?, signature?, isDefault? }
export async function update(c: ReqCtx): Promise<Response> {
  const body = await readJson<{ name?: string; signature?: string; isDefault?: boolean }>(c.request);
  const row = await updateIdentity(c.env, c.params.id, body);
  if (!row) throw new HttpError(404, "发件身份不存在");
  return json(identityShape(row));
}
