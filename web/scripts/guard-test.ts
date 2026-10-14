/**
 * Does the demo guard actually stop anyone?
 *
 *   npm run guard-test
 *
 * The model routes are on a public URL and every call is paid for. The guard
 * in lib/demo-guard.ts is the only thing between that URL and the bill, and a
 * guard that silently lets everything through looks exactly like one that
 * works until the invoice arrives. So each property is exercised against a
 * real embedded database, offline, without a key.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PGLITE_DIR ??= mkdtempSync(join(tmpdir(), "guardtest-"));

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
let pass = 0, fail = 0;
function check(what: string, ok: boolean, detail: string) {
  if (ok) { pass += 1; console.log(`  ${G}pass${X}  ${B}${what}${X}`); }
  else { fail += 1; console.log(`  ${R}FAIL${X}  ${B}${what}${X}`); }
  console.log(`        ${D}${detail}${X}`);
}

const env = process.env as Record<string, string | undefined>;

function req(ip: string, cookie?: string): Request {
  const headers: Record<string, string> = { "x-forwarded-for": `${ip}, 10.0.0.1` };
  if (cookie) headers.cookie = cookie;
  return new Request("https://demo.test/api/analyst", { method: "POST", headers });
}

async function main() {
  const {
    guardModelRoute, issueAccessToken, codeMatches, ACCESS_COOKIE, checkAccess, consumeQuota,
    clientIp, tokenValid, ANALYST_MAX_TURNS, MAX_HISTORY_CHARS,
  } = await import("../lib/demo-guard");
  const { getQuery } = await import("../lib/db/client");
  const usageTotal = async () => {
    const query = await getQuery();
    const { rows } = await query<{ total: number | null }>(
      `SELECT COALESCE(SUM(calls), 0) AS total FROM demo_usage`,
    );
    return Number(rows[0]?.total ?? 0);
  };

  console.log("\n" + "=".repeat(78));
  console.log(`${B}DEMO GUARD${X}  access code, per-IP rate, daily cap`);
  console.log("=".repeat(78) + "\n");

  // Pinned clock, mid-window and mid-day, so a run near a boundary cannot flake.
  const now = Date.parse("2026-10-14T12:03:00Z");

  // ---- no code configured: local development ----
  delete env.DEMO_ACCESS_CODE;
  env.NODE_ENV = "development";
  let r = await guardModelRoute(req("203.0.113.1"), now);
  check(
    "no access code configured: the request passes",
    r === null,
    r ? `refused with ${r.status}` : "ungated, which is what npm run dev and the HTTP suites expect",
  );

  // ---- code configured, no cookie ----
  env.DEMO_ACCESS_CODE = "open-sesame";
  env.DEMO_COOKIE_SECRET = "test-secret";
  env.DEMO_RATE_LIMIT = "3";
  env.DEMO_DAILY_CALL_CAP = "1000";
  r = await guardModelRoute(req("203.0.113.2"), now);
  const body = r ? await r.json() : null;
  check(
    "code configured, no cookie: 401 with a reason the UI can recognise",
    r?.status === 401 && body?.code === "access_required" && typeof body?.error === "string",
    `status ${r?.status}, code ${body?.code}`,
  );

  // ---- the code itself ----
  check(
    "the right code matches and a wrong one does not",
    codeMatches("open-sesame") && codeMatches("  open-sesame ") && !codeMatches("open") &&
      !codeMatches(""),
    "compared in constant time on hashes of equal length",
  );

  // ---- valid cookie ----
  const { value } = issueAccessToken(now);
  const cookie = `other=1; ${ACCESS_COOKIE}=${encodeURIComponent(value)}`;
  r = await guardModelRoute(req("203.0.113.3", cookie), now);
  check(
    "a valid signed cookie passes",
    r === null,
    r ? `refused with ${r.status}` : "signed with DEMO_COOKIE_SECRET, seven-day expiry",
  );

  // ---- forged, expired, and old-code cookies ----
  const [exp] = value.split(".");
  const forged = await guardModelRoute(req("203.0.113.4", `${ACCESS_COOKIE}=${exp}.${"0".repeat(64)}`), now);
  const expired = await guardModelRoute(
    req("203.0.113.4", `${ACCESS_COOKIE}=${encodeURIComponent(issueAccessToken(now - 8 * 86_400_000).value)}`),
    now,
  );
  env.DEMO_ACCESS_CODE = "rotated";
  const stale = await guardModelRoute(req("203.0.113.4", cookie), now);
  env.DEMO_ACCESS_CODE = "open-sesame";
  check(
    "a forged, an expired, or a pre-rotation cookie is refused",
    forged?.status === 401 && expired?.status === 401 && stale?.status === 401,
    `forged ${forged?.status}, expired ${expired?.status}, after code change ${stale?.status}`,
  );

  // ---- per-IP rate limit ----
  const ip = "198.51.100.7";
  const statuses: number[] = [];
  let last: Response | null = null;
  for (let i = 0; i < 4; i++) {
    last = await guardModelRoute(req(ip, cookie), now);
    statuses.push(last?.status ?? 200);
  }
  const retry = Number(last?.headers.get("Retry-After"));
  check(
    "the per-IP limit returns 429 with Retry-After after N requests",
    statuses.join(",") === "200,200,200,429" && retry > 0 && retry <= 600,
    `limit 3: ${statuses.join(", ")}; Retry-After ${retry}s`,
  );

  const other = await guardModelRoute(req("198.51.100.8", cookie), now);
  const nextWindow = await guardModelRoute(req(ip, cookie), now + 10 * 60_000);
  check(
    "the limit is per address and per window",
    other === null && nextWindow === null,
    "a different IP, and the same IP ten minutes later, both pass",
  );

  // ---- daily cap ----
  // Counted so far today: 1 (valid cookie) + 3 (rate test) + 1 (other IP) +
  // 1 (next window). The rate-limited and 401 requests were refused before
  // reaching the daily counter, so they are not in it.
  env.DEMO_RATE_LIMIT = "1000";
  env.DEMO_DAILY_CALL_CAP = "8";
  const day: number[] = [];
  let capped: Response | null = null;
  for (let i = 0; i < 3; i++) {
    capped = await guardModelRoute(req(`192.0.2.${i}`, cookie), now);
    day.push(capped?.status ?? 200);
  }
  const capBody = capped ? await capped.json() : null;
  check(
    "the global daily cap returns 429 once reached, across every address",
    day.join(",") === "200,200,429" && capBody?.code === "daily_cap" &&
      /daily limit reached/i.test(String(capBody?.error)),
    `cap 8 with 6 already counted: ${day.join(", ")}; Retry-After ${capped?.headers.get("Retry-After")}s`,
  );

  const tomorrow = await guardModelRoute(req("192.0.2.9", cookie), now + 86_400_000);
  check(
    "the daily cap resets at midnight UTC",
    tomorrow === null,
    tomorrow ? `still refused with ${tomorrow.status}` : "the next UTC day starts from zero",
  );

  // ---- limits stay on in production even if the code was forgotten ----
  delete env.DEMO_ACCESS_CODE;
  env.NODE_ENV = "production";
  env.DEMO_DAILY_CALL_CAP = "1";
  const prodDay = now + 3 * 86_400_000;
  const a = await guardModelRoute(req("192.0.2.50"), prodDay);
  const b = await guardModelRoute(req("192.0.2.51"), prodDay);
  check(
    "a production build with no code still has a ceiling",
    a === null && b?.status === 429,
    `no cookie needed, but the second call of a cap-1 day is ${b?.status}`,
  );

  // ---- a production code without a real signing secret fails closed ----
  env.DEMO_ACCESS_CODE = "open-sesame";
  delete env.DEMO_COOKIE_SECRET;
  const { POST: unlock } = await import("../app/api/access/route");
  const unlockReq = () => new Request("https://demo.test/api/access", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.60" },
    body: JSON.stringify({ code: "open-sesame" }),
  });
  const noSecretUnlock = await unlock(unlockReq());
  const noSecretBody = await noSecretUnlock.json();
  const noSecretRoute = checkAccess(req("192.0.2.61", cookie), now);
  env.DEMO_COOKIE_SECRET = "too-short";
  const shortSecret = checkAccess(req("192.0.2.61", cookie), now);
  env.DEMO_COOKIE_SECRET = "x".repeat(32);
  const goodUnlock = await unlock(unlockReq());
  const goodCookie = `${ACCESS_COOKIE}=${encodeURIComponent(issueAccessToken(now).value)}`;
  const goodRoute = checkAccess(req("192.0.2.61", goodCookie), now);
  check(
    "production with a code but no 32-character secret: 503 on unlock and on model routes",
    noSecretUnlock.status === 503 &&
      /DEMO_COOKIE_SECRET required/.test(String(noSecretBody?.error)) &&
      noSecretRoute?.status === 503 && shortSecret?.status === 503 &&
      goodUnlock.status === 200 && goodRoute === null,
    `unset: unlock ${noSecretUnlock.status}, route ${noSecretRoute?.status}; short: ` +
      `${shortSecret?.status}; 32 chars: unlock ${goodUnlock.status}, route ${goodRoute?.status ?? 200}`,
  );

  // ---- a signed cookie claiming a longer life than the server grants ----
  const farFuture = issueAccessToken(now + 30 * 86_400_000).value;
  check(
    "a validly signed cookie whose expiry is beyond now + TTL is refused",
    !tokenValid(farFuture, now) && tokenValid(issueAccessToken(now).value, now),
    "the signature is ours, but nothing this server issues lives that long",
  );

  // ---- weights: a request is charged for the model calls it can make ----
  env.NODE_ENV = "development";
  env.DEMO_COOKIE_SECRET = "test-secret";
  env.DEMO_RATE_LIMIT = "10";
  env.DEMO_DAILY_CALL_CAP = "1000";
  const weightDay = now + 5 * 86_400_000;
  const w1 = await consumeQuota(req("192.0.2.70"), 6, weightDay);
  const w2 = await consumeQuota(req("192.0.2.70"), 5, weightDay);
  const w3 = await consumeQuota(req("192.0.2.71"), 4, weightDay);
  env.DEMO_RATE_LIMIT = "1000";
  env.DEMO_DAILY_CALL_CAP = String(ANALYST_MAX_TURNS + 1);
  const capDay = now + 6 * 86_400_000;
  const d1 = await consumeQuota(req("192.0.2.72"), ANALYST_MAX_TURNS, capDay);
  const d2 = await consumeQuota(req("192.0.2.73"), 2, capDay);
  check(
    "per-IP limit and daily cap count weighted model calls, not requests",
    w1 === null && w2?.status === 429 && w3 === null && d1 === null && d2?.status === 429,
    `limit 10: weight 6 ${w1?.status ?? 200}, then weight 5 ${w2?.status}, other IP ${w3?.status ?? 200}; ` +
      `cap ${ANALYST_MAX_TURNS + 1}: analyst weight ${ANALYST_MAX_TURNS} ${d1?.status ?? 200}, then weight 2 ${d2?.status}`,
  );

  // ---- client address ----
  const both = new Request("https://demo.test/api/analyst", {
    method: "POST",
    headers: {
      "x-vercel-forwarded-for": "203.0.113.90, 10.0.0.2",
      "x-forwarded-for": "198.51.100.99, 10.0.0.1",
      "x-real-ip": "198.51.100.98",
    },
  });
  const spoofA = new Request("https://demo.test/api/analyst", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": "203.0.113.91", "x-forwarded-for": "1.1.1.1" },
  });
  const spoofB = new Request("https://demo.test/api/analyst", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": "203.0.113.91", "x-forwarded-for": "2.2.2.2" },
  });
  env.DEMO_RATE_LIMIT = "1";
  const ipDay = now + 7 * 86_400_000;
  const s1 = await consumeQuota(spoofA, 1, ipDay);
  const s2 = await consumeQuota(spoofB, 1, ipDay);
  check(
    "x-vercel-forwarded-for wins over x-forwarded-for and x-real-ip",
    clientIp(both) === "203.0.113.90" && s1 === null && s2?.status === 429 &&
      clientIp(new Request("https://demo.test/")) === "unknown",
    `resolved ${clientIp(both)}; a changed x-forwarded-for under the same Vercel ` +
      `address shares its bucket (${s1?.status ?? 200}, ${s2?.status}); no headers is "unknown"`,
  );

  // ---- an oversized history is refused before it costs anything ----
  env.DEMO_RATE_LIMIT = "1000";
  env.DEMO_DAILY_CALL_CAP = "1000";
  const { POST: analyst } = await import("../app/api/analyst/route");
  const before = await usageTotal();
  const analystCookie = `${ACCESS_COOKIE}=${encodeURIComponent(issueAccessToken().value)}`;
  const askWith = (history: unknown[], question = "Who is cheapest?") => analyst(new Request(
    "https://demo.test/api/analyst", {
      method: "POST",
      headers: {
        "content-type": "application/json", cookie: analystCookie, "x-forwarded-for": "192.0.2.80",
      },
      body: JSON.stringify({ question, history }),
    },
  ));
  const tooLong = await askWith(
    [{ role: "user", parts: [{ kind: "text", text: "x".repeat(MAX_HISTORY_CHARS) }] }],
  );
  const tooMany = await askWith(
    Array.from({ length: 41 }, () => ({ role: "user", parts: [] })),
  );
  const tooBigQuestion = await askWith([], "y".repeat(9000));
  const tooLongBody = await tooLong.json();
  const after = await usageTotal();
  check(
    "an oversized history or message is a 413 and consumes no quota",
    tooLong.status === 413 && tooMany.status === 413 && tooBigQuestion.status === 413 &&
      /characters/.test(String(tooLongBody?.error)) && after === before,
    `chars ${tooLong.status}, messages ${tooMany.status}, question ${tooBigQuestion.status}; ` +
      `usage counters ${before} before, ${after} after`,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(1);
});
