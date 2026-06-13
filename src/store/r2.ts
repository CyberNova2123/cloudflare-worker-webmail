// R2 blob storage. Key layout (see docs/storage.md):
//   raw/<messageId>.eml      the full raw MIME of an inbound message
//   att/<messageId>/<idx>    one attachment payload
import type { Env } from "../types";

export async function putRaw(env: Env, key: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  await env.MAIL_BUCKET.put(key, data, { httpMetadata: { contentType: "message/rfc822" } });
}

export async function putAttachment(
  env: Env,
  key: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await env.MAIL_BUCKET.put(key, data, { httpMetadata: { contentType } });
}

export async function getObject(env: Env, key: string): Promise<R2ObjectBody | null> {
  return env.MAIL_BUCKET.get(key);
}
