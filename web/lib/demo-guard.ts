/**
 * Who may spend the owner's model budget, and how much of it.
 *
 * The comparison grid, provenance and exports are free to serve, so they stay
 * open: a reviewer should be able to browse the whole thing without asking
 * anyone. Every route that calls a model costs real money per request, and on
 * a public URL with no gate one script could empty the account overnight.
 *
 * Three checks, in one place, called first by every model-calling route:
 *
 *   1. ACCESS CODE   DEMO_ACCESS_CODE set -> the request must carry a signed
 *                    cookie from POST /api/access. Unset -> no gate, which is
 *                    local development.
 *   2. PER-IP RATE   DEMO_RATE_LIMIT model requests per IP per 10 minutes
 *                    (default 20). 429 with Retry-After.
 *   3. DAILY CAP     DEMO_DAILY_CALL_CAP model requests per UTC day across
 *                    everyone (default 300). 429 with Retry-After.
 *
 * Limits are counted in REQUESTS to a model route, not in dollars. The repo's
 * cost model (`npm run cost-model`) is an offline estimate from prompt sizes,
 * and nothing at runtime prices a call, so a USD cap would be a guess dressed
 * as a number. A request count is exact.
 *
 * Counters live in Postgres rather than in memory because a serverless
 * function has no memory worth the name: each cold start would reset them.
 * IPs are stored only as an HMAC, never in the clear.
 *
 * The limits run whenever the access code is set OR the app is a production
 * build, so forgetting the code on a deployment still leaves a ceiling on the
 * bill. `npm run dev` with no code is ungated, which is what the HTTP test
 * suites expect.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getQuery } from "./db/client";

export const ACCESS_COOKIE = "demo_access";
export const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;
const RATE_WINDOW_SECONDS = 10 * 60;

/** Read at call time, not module load, so a test can change them between cases. */
function config() {
  const int = (v: string | undefined, d: number) => {
    const n = Number.parseInt(v ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const code = process.env.DEMO_ACCESS_CODE?.trim() || null;
  return {
    code,
    limitsOn: Boolean(code) || process.env.NODE_ENV === "production",
    ratePerWindow: int(process.env.DEMO_RATE_LIMIT, 20),
    dailyCap: int(process.env.DEMO_DAILY_CALL_CAP, 300),
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/**
 * The signing key. An explicit secret if one is set, otherwise derived from the
 * code, so a deployment with only DEMO_ACCESS_CODE still signs its cookies.
 */
function secret(): string {
  return process.env.DEMO_COOKIE_SECRET?.trim()
    || `derived:${sha256(`demo-cookie:${config().code ?? ""}`).toString("hex")}`;
}

/**
 * The code's fingerprint is part of what is signed, so changing the code
 * revokes every cookie issued under the old one, even with a fixed secret.
 */
function sign(expires: number): string {
  const codeTag = sha256(config().code ?? "").toString("hex").slice(0, 16);
  return createHmac("sha256", secret()).update(`v1:${expires}:${codeTag}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so the lengths match: timingSafeEqual throws on a mismatch, and
  // a length check before it would leak the length.
  return timingSafeEqual(sha256(a), sha256(b));
}

/** Is this the access code? Constant time. False when no code is configured. */
export function codeMatches(attempt: string): boolean {
  const { code } = config();
  return Boolean(code) && safeEqual(attempt.trim(), code!);
}

/** A cookie value: `<expiry epoch seconds>.<hmac>`. */
export function issueAccessToken(now = Date.now()): { value: string; expires: number } {
  const expires = Math.floor(now / 1000) + ACCESS_TTL_SECONDS;
  return { value: `${expires}.${sign(expires)}`, expires };
}

export function tokenValid(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, mac] = value.split(".");
  const expires = Number(exp);
  if (!Number.isInteger(expires) || !mac) return false;
  if (expires * 1000 <= now) return false;
  return safeEqual(mac, sign(expires));
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/**
 * The caller's IP, first hop of x-forwarded-for. On Vercel that header is set
 * by the platform rather than passed through from the client, so it cannot be
 * spoofed to dodge the limit.
 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function ipKey(request: Request): string {
  return createHmac("sha256", secret()).update(`ip:${clientIp(request)}`).digest("hex").slice(0, 32);
}

/**
 * Add one to a counter and return the new total. One statement, so two
 * concurrent requests cannot both read 19 and both be let through as the 20th.
 */
async function bump(bucket: string, windowStart: Date): Promise<number> {
  const query = await getQuery();
  const { rows } = await query<{ calls: number }>(
    `INSERT INTO demo_usage (bucket, window_start, calls) VALUES ($1, $2, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET calls = demo_usage.calls + 1
     RETURNING calls`,
    [bucket, windowStart.toISOString()],
  );
  const calls = Number(rows[0]?.calls ?? 0);
  // A fresh window is a cheap moment to drop counters nobody will read again.
  if (calls === 1) {
    await query(`DELETE FROM demo_usage WHERE window_start < $1`, [
      new Date(windowStart.getTime() - 2 * 86_400_000).toISOString(),
    ]);
  }
  return calls;
}

function json(status: number, body: Record<string, unknown>, retryAfter?: number): Response {
  return Response.json(
    { ok: false, ...body },
    {
      status,
      headers: retryAfter ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfter))) } : undefined,
    },
  );
}

/**
 * Per-IP fixed window. Shared by the model routes (bucket "model") and the
 * unlock route (bucket "unlock"), so guessing the code is throttled too.
 */
export async function rateLimit(
  request: Request, kind: string, limit: number, now = Date.now(),
): Promise<Response | null> {
  const windowMs = RATE_WINDOW_SECONDS * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  const calls = await bump(`${kind}:${ipKey(request)}`, new Date(start));
  if (calls <= limit) return null;
  return json(429, {
    code: "rate_limited",
    error:
      `Too many requests from your address: the demo allows ${limit} every ` +
      `${RATE_WINDOW_SECONDS / 60} minutes. Try again shortly.`,
  }, (start + windowMs - now) / 1000);
}

/**
 * Call first in every route that calls a model. Returns the response to send
 * if the request is refused, or null to carry on.
 *
 * Fails closed: if the counters cannot be read, the model is not called.
 */
export async function guardModelRoute(request: Request, now = Date.now()): Promise<Response | null> {
  const cfg = config();

  if (cfg.code && !tokenValid(readCookie(request, ACCESS_COOKIE), now)) {
    return json(401, {
      code: "access_required",
      error:
        "This demo needs an access code before it calls the model. Browsing the " +
        "comparison is open; reading, drafting and asking are not, because each " +
        "one is paid for.",
    });
  }

  if (!cfg.limitsOn) return null;

  try {
    const limited = await rateLimit(request, "model", cfg.ratePerWindow, now);
    if (limited) return limited;

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const today = await bump("day", dayStart);
    if (today > cfg.dailyCap) {
      return json(429, {
        code: "daily_cap",
        error:
          `Demo daily limit reached: ${cfg.dailyCap} model requests a day across ` +
          `everyone. It resets at midnight UTC. The grid and exports still work.`,
      }, (dayStart.getTime() + 86_400_000 - now) / 1000);
    }
  } catch {
    return json(503, {
      code: "limits_unavailable",
      error: "Usage limits could not be checked, so the model was not called. Try again.",
    });
  }

  return null;
}
