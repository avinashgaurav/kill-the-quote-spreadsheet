/**
 * Who may spend the owner's model budget, and how much of it.
 *
 * The comparison grid, provenance and exports are free to serve, so they stay
 * open: a reviewer should be able to browse the whole thing without asking
 * anyone. Every route that calls a model costs real money per request, and on
 * a public URL with no gate one script could empty the account overnight.
 *
 * Three checks, in one place, in two calls every model-calling route makes:
 *
 *   checkAccess(), first, before the body is read:
 *   1. ACCESS CODE   DEMO_ACCESS_CODE set -> the request must carry a signed
 *                    cookie from POST /api/access. Unset -> no gate, which is
 *                    local development. In production the code also needs a
 *                    DEMO_COOKIE_SECRET of 32+ characters, or every model
 *                    route answers 503 rather than sign with a weak key.
 *
 *   consumeQuota(weight), after the route's own cheap validation, so a request
 *   that would be refused anyway (too large, too long a history) does not
 *   spend anybody's allowance:
 *   2. PER-IP RATE   DEMO_RATE_LIMIT model calls per IP per 10 minutes
 *                    (default 60). 429 with Retry-After.
 *   3. DAILY CAP     DEMO_DAILY_CALL_CAP model calls per UTC day across
 *                    everyone (default 300). 429 with Retry-After.
 *
 * Limits are counted in MODEL CALLS, not in dollars and not in requests. One
 * analyst question can loop through up to ANALYST_MAX_TURNS calls and one
 * upload reads every file in it, so each route passes the most calls the
 * request can make as its weight. That is a ceiling rather than a measurement
 * (a cached read costs nothing), which errs on the side of the bill. The repo's
 * cost model (`npm run cost-model`) is an offline estimate from prompt sizes,
 * and nothing at runtime prices a call, so a USD cap would be a guess dressed
 * as a number.
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
/** A cookie signing key shorter than this is refused in production. */
const MIN_SECRET_LENGTH = 32;

/**
 * The most model calls one request to each route can make. The loops read
 * these, so the weight charged and the bound enforced cannot drift apart.
 */
export const ANALYST_MAX_TURNS = 12;
export const COPILOT_MAX_TURNS = 8;

/** Bounds on a conversation sent back by the client, checked before any quota. */
export const MAX_HISTORY_MESSAGES = 40;
export const MAX_HISTORY_CHARS = 60_000;
export const MAX_MESSAGE_CHARS = 8_000;

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
    ratePerWindow: int(process.env.DEMO_RATE_LIMIT, 60),
    dailyCap: int(process.env.DEMO_DAILY_CALL_CAP, 300),
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/**
 * Why this deployment cannot safely sign cookies, or null if it can.
 *
 * A key derived from the access code is fine on a laptop, but in production it
 * means anyone who learns the code can mint cookies forever, and a short
 * explicit secret is guessable. So a production build with a code and no real
 * secret fails closed: no unlock, no model call.
 */
export function misconfiguration(): string | null {
  const { code } = config();
  if (!code || process.env.NODE_ENV !== "production") return null;
  const explicit = process.env.DEMO_COOKIE_SECRET?.trim() ?? "";
  return explicit.length >= MIN_SECRET_LENGTH
    ? null
    : "server misconfigured: DEMO_COOKIE_SECRET required";
}

/**
 * The signing key. An explicit secret if one is set, otherwise derived from the
 * code, so local development with only DEMO_ACCESS_CODE still signs its
 * cookies. Production refuses the derived key: see misconfiguration().
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
  // Nothing this server issues expires later than now + TTL, so a cookie that
  // claims to is not one of ours, whatever its signature.
  if (expires * 1000 > now + ACCESS_TTL_SECONDS * 1000) return false;
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
 * The caller's IP: x-vercel-forwarded-for, then the first hop of
 * x-forwarded-for, then x-real-ip. On Vercel the first two are set by the
 * platform, not passed through from the client.
 *
 * Off Vercel, behind a proxy that forwards these headers untouched, every one
 * of them is spoofable, so a script can rotate its apparent address and dodge
 * the per-IP limit. The global daily cap is the backstop for that: it does not
 * care who is asking. A request with none of the headers lands in one shared
 * "unknown" bucket rather than getting a bucket of its own.
 */
export function clientIp(request: Request): string {
  const firstHop = (name: string) => request.headers.get(name)?.split(",")[0]?.trim();
  return firstHop("x-vercel-forwarded-for")
    || firstHop("x-forwarded-for")
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function ipKey(request: Request): string {
  return createHmac("sha256", secret()).update(`ip:${clientIp(request)}`).digest("hex").slice(0, 32);
}

/**
 * Add `weight` to a counter and return the new total. One statement, so two
 * concurrent requests cannot both read 19 and both be let through as the 20th.
 */
async function bump(bucket: string, windowStart: Date, weight = 1): Promise<number> {
  const query = await getQuery();
  const { rows } = await query<{ calls: number }>(
    `INSERT INTO demo_usage (bucket, window_start, calls) VALUES ($1, $2, $3)
     ON CONFLICT (bucket, window_start) DO UPDATE SET calls = demo_usage.calls + $3
     RETURNING calls`,
    [bucket, windowStart.toISOString(), weight],
  );
  const calls = Number(rows[0]?.calls ?? 0);
  // A fresh day is a cheap moment to drop counters nobody will read again.
  // Only the daily bucket triggers it: a fresh per-IP window happens on most
  // requests from a new address, and a DELETE on each would be wasted work.
  if (bucket === "day" && calls === weight) {
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
  request: Request, kind: string, limit: number, now = Date.now(), weight = 1,
): Promise<Response | null> {
  const windowMs = RATE_WINDOW_SECONDS * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  const calls = await bump(`${kind}:${ipKey(request)}`, new Date(start), weight);
  if (calls <= limit) return null;
  return json(429, {
    code: "rate_limited",
    error:
      `Too many requests from your address: the demo allows ${limit} every ` +
      `${RATE_WINDOW_SECONDS / 60} minutes. Try again shortly.`,
  }, (start + windowMs - now) / 1000);
}

/**
 * Call first in every route that calls a model, before the body is read.
 * Returns the response to send if the request is refused, or null to carry on.
 * Spends nothing: the allowance is taken by consumeQuota().
 */
export function checkAccess(request: Request, now = Date.now()): Response | null {
  const broken = misconfiguration();
  if (broken) return json(503, { code: "misconfigured", error: broken });

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
  return null;
}

/**
 * Take `weight` model calls from the caller's per-IP allowance and from the
 * global daily cap. Call after checkAccess() and after the route's own cheap
 * validation, immediately before the first model call. Returns the response to
 * send if the request is refused, or null to carry on.
 *
 * Fails closed: if the counters cannot be read, the model is not called.
 */
export async function consumeQuota(
  request: Request, weight: number, now = Date.now(),
): Promise<Response | null> {
  const cfg = config();
  if (!cfg.limitsOn) return null;
  const calls = Math.max(1, Math.ceil(weight));

  try {
    const limited = await rateLimit(request, "model", cfg.ratePerWindow, now, calls);
    if (limited) return limited;

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const today = await bump("day", dayStart, calls);
    if (today > cfg.dailyCap) {
      return json(429, {
        code: "daily_cap",
        error:
          `Demo daily limit reached: ${cfg.dailyCap} model calls a day across ` +
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

/** Both checks at once, for a caller with nothing to validate in between. */
export async function guardModelRoute(
  request: Request, now = Date.now(), weight = 1,
): Promise<Response | null> {
  return checkAccess(request, now) ?? consumeQuota(request, weight, now);
}

/**
 * Bound a conversation the client sends back before anything is spent on it.
 *
 * The history is the server's own earlier reply, but it arrives from the
 * browser, and every turn of the loop resends all of it to the model. Left
 * unbounded, one request could carry megabytes of padding and be billed for it
 * up to a dozen times. Returns a 413 to send, or null.
 */
export function historyTooLarge(history: unknown, message: string): Response | null {
  const refuse = (error: string) =>
    Response.json({ ok: false, code: "too_large", error }, { status: 413 });
  if (!Array.isArray(history)) {
    return Response.json(
      { ok: false, error: "The conversation history was not a list." },
      { status: 400 },
    );
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return refuse(
      `That message is ${message.length} characters; the limit is ${MAX_MESSAGE_CHARS}. ` +
      `Shorten it and send again.`,
    );
  }
  if (history.length > MAX_HISTORY_MESSAGES) {
    return refuse(
      `This conversation is over ${MAX_HISTORY_MESSAGES} messages long. Reload the page ` +
      `to start a new one.`,
    );
  }
  const chars = JSON.stringify(history).length + message.length;
  if (chars > MAX_HISTORY_CHARS) {
    return refuse(
      `This conversation is over ${MAX_HISTORY_CHARS} characters long. Reload the page ` +
      `to start a new one.`,
    );
  }
  return null;
}
