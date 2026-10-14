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
    guardModelRoute, issueAccessToken, codeMatches, ACCESS_COOKIE,
  } = await import("../lib/demo-guard");

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

  console.log(`\n${pass} passed, ${fail} failed`);
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(1);
});
