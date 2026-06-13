// GET/PATCH /api/settings/notifications — per-user notification prefs.
// The wire shape is camelCase (matches web/settings.jsx); D1 columns are
// snake_case, so we translate here.
import type { ReqCtx } from "../types";
import { json, readJson } from "../lib/http";
import { getOrCreateNotifications, saveNotifications } from "../store/db";
import { notifShape } from "./shapes";

const CAMEL_TO_SNAKE: Record<string, string> = {
  desktop: "desktop",
  sound: "sound",
  newMail: "new_mail",
  mentions: "mentions",
  digestDaily: "digest_daily",
  routingAlerts: "routing_alerts",
  marketing: "marketing",
};

export async function get(c: ReqCtx): Promise<Response> {
  return json(notifShape(await getOrCreateNotifications(c.env, c.user.email)));
}

export async function patch(c: ReqCtx): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(c.request);
  const snake: Record<string, unknown> = {};
  for (const [camel, col] of Object.entries(CAMEL_TO_SNAKE)) {
    if (camel in body) snake[col] = body[camel];
  }
  await getOrCreateNotifications(c.env, c.user.email); // ensure the row exists
  await saveNotifications(c.env, c.user.email, snake);
  return json(notifShape(await getOrCreateNotifications(c.env, c.user.email)));
}
