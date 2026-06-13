// GET /api/auth/session, POST /api/auth/logout
import type { ReqCtx } from "../types";
import { json, noContent } from "../lib/http";
import { getOrCreateProfile } from "../store/db";
import { hueFor, shortHash } from "../lib/util";

export async function getSession(c: ReqCtx): Promise<Response> {
  const profile = await getOrCreateProfile(c.env, c.user);
  return json({
    id: "usr_" + (await shortHash(c.user.email)),
    name: profile.name || c.user.name,
    email: c.user.email,
    avatarColor: profile.avatar_color || hueFor(c.user.email),
    primaryDomain: c.env.PRIMARY_DOMAIN,
  });
}

// Session lives entirely in the Access cookie, so there is nothing server-side
// to clear; the browser then navigates to CONFIG.auth.logoutUrl (Access logout).
export function logout(_c: ReqCtx): Response {
  return noContent();
}
