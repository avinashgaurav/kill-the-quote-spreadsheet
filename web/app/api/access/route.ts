import {
  ACCESS_COOKIE, ACCESS_TTL_SECONDS, codeMatches, issueAccessToken, misconfiguration,
  rateLimit,
} from "@/lib/demo-guard";

/**
 * Unlock the model routes with the demo access code.
 *
 * Swaps the code for a signed, httpOnly cookie that lasts seven days, so the
 * code itself is typed once and never stored in the browser. Attempts are
 * rate-limited per IP like the model routes, so the code cannot be guessed by
 * brute force at the speed of a script.
 */

const UNLOCK_ATTEMPTS_PER_WINDOW = 10;

export async function POST(request: Request) {
  if (!process.env.DEMO_ACCESS_CODE?.trim()) {
    return Response.json({ ok: true, required: false });
  }

  // A production code with no real signing secret: refuse to issue a cookie
  // rather than sign one with a key derived from the code itself.
  const broken = misconfiguration();
  if (broken) {
    return Response.json({ ok: false, code: "misconfigured", error: broken }, { status: 503 });
  }

  try {
    const limited = await rateLimit(request, "unlock", UNLOCK_ATTEMPTS_PER_WINDOW);
    if (limited) return limited;
  } catch {
    return Response.json(
      { ok: false, error: "Could not check the code right now. Try again." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const attempt = typeof body?.code === "string" ? body.code : "";
  if (!attempt || !codeMatches(attempt)) {
    return Response.json(
      { ok: false, error: "That access code is not right." },
      { status: 401 },
    );
  }

  const { value } = issueAccessToken();
  const secure = new URL(request.url).protocol === "https:" ||
    process.env.NODE_ENV === "production";
  const cookie = [
    `${ACCESS_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${ACCESS_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");

  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
