// Cloudflare Access (Zero Trust) JWT verification — pure Web Crypto, no deps.
//
// Access puts a signed JWT in the `CF_Authorization` cookie (and the
// `Cf-Access-Jwt-Assertion` header). We verify it against the team's public
// keys at https://<team>/cdn-cgi/access/certs (RS256), check aud/iss/exp, and
// pull the user's email out of the claims. The app shell may still be public;
// the JWT is what gates /api/*.
import type { AccessUser, Env } from "./types";

interface Jwk extends JsonWebKey {
  kid?: string;
}

// Module-scoped JWKS cache (per isolate). Access rotates keys infrequently.
let jwksCache: { map: Map<string, CryptoKey>; exp: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s: string): Uint8Array {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = t.length % 4;
  if (pad) t += "=".repeat(4 - pad);
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

async function loadKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && jwksCache.exp > now) return jwksCache.map;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("无法获取 Access 公钥（检查 ACCESS_TEAM_DOMAIN）");
  const data = (await res.json()) as { keys?: Jwk[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of data.keys ?? []) {
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (jwk.kid) map.set(jwk.kid, key);
    } catch {
      // skip unusable keys
    }
  }
  jwksCache = { map, exp: now + JWKS_TTL_MS };
  return map;
}

export async function verifyAccessJwt(token: string, env: Env): Promise<AccessUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string | string[];
    iss?: string;
    exp?: number;
    nbf?: number;
    email?: string;
    name?: string;
    sub?: string;
    identity_nonce?: string;
  };
  try {
    header = JSON.parse(b64urlToString(h));
    payload = JSON.parse(b64urlToString(p));
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;

  const map = await loadKeys(env.ACCESS_TEAM_DOMAIN);
  const keyed = header.kid ? map.get(header.kid) : undefined;
  const candidates = keyed ? [keyed] : [...map.values()];
  const data = new TextEncoder().encode(`${h}.${p}`);
  const sig = b64urlToBytes(s);
  let verified = false;
  for (const k of candidates) {
    if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", k, sig, data)) {
      verified = true;
      break;
    }
  }
  if (!verified) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  if (env.ACCESS_AUD) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
  }
  if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;

  const email = payload.email;
  if (!email) return null;
  return { email, name: payload.name || email.split("@")[0], sub: payload.sub };
}

function extractToken(request: Request): string | null {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (assertion) return assertion;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Returns the authenticated user, or null (=> 401). Honors DEV_BYPASS_ACCESS for
// local `wrangler dev` only.
export async function authenticate(request: Request, env: Env): Promise<AccessUser | null> {
  if (env.DEV_BYPASS_ACCESS === "1") {
    return { email: `dev@${env.PRIMARY_DOMAIN || "example.com"}`, name: "Dev User", sub: "dev" };
  }
  if (!env.ACCESS_TEAM_DOMAIN) return null;
  const token = extractToken(request);
  if (!token) return null;
  try {
    return await verifyAccessJwt(token, env);
  } catch {
    return null;
  }
}
