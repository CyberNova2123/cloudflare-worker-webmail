// GET/PATCH /api/profile — per-user display + locale prefs (keyed by Access id).
import type { ReqCtx } from "../types";
import { json, readJson } from "../lib/http";
import { getOrCreateProfile, saveProfile } from "../store/db";
import { profileShape } from "./shapes";

export async function get(c: ReqCtx): Promise<Response> {
  return json(profileShape(await getOrCreateProfile(c.env, c.user)));
}

export async function patch(c: ReqCtx): Promise<Response> {
  const body = await readJson<{ name?: string; timezone?: string; locale?: string; avatarColor?: string }>(c.request);
  await getOrCreateProfile(c.env, c.user); // ensure the row exists
  await saveProfile(c.env, c.user.email, {
    name: body.name,
    timezone: body.timezone,
    locale: body.locale,
    avatar_color: body.avatarColor,
  });
  return json(profileShape(await getOrCreateProfile(c.env, c.user)));
}
