/**
 * What to say when the model provider is the thing that failed.
 *
 * This existed once, inside `app/api/analyst/route.ts`, and it was good: a
 * 503, a sentence a buyer can act on, and the raw provider payload confined to
 * a `detail` field. The other three model-backed routes never got it, and a QA
 * pass found the consequence. Typing into the Draft box printed this, in red,
 * as the first thing anybody sees:
 *
 *   Error: Gemini 429 (OUT OF CREDIT...): { "error": { "code": 429,
 *   "message": "Your prepayment credits are depleted. Please go to AI Studio
 *   at https://ai.studio/projects to manage your project and billing..." } }
 *
 * Three things wrong with that. It is unreadable. It leaks a provider's
 * billing console into a buyer's screen. And it reads as the product being
 * broken when the truth is that somebody needs to top up an account.
 *
 * So it lives here, once, and every route that can hit a provider uses it.
 * Duplicated good behaviour is how three routes end up with one fix between
 * them.
 */

export type ProviderFailure = "rate_limit" | "unavailable" | "no_key" | "other";

export function classifyProviderError(e: unknown): ProviderFailure {
  const raw = String(e);
  if (/API key|GEMINI_API_KEY|ANTHROPIC_API_KEY is not set|\b401\b|\b403\b/i.test(raw)) {
    return "no_key";
  }
  // Out of credit arrives as a 429 and is terminal, but from the buyer's seat
  // it is the same sentence as a rate limit: the tool is fine, the account is
  // not, and there is nothing for them to fix in the app.
  if (/\b429\b|rate.?limit|quota|RESOURCE_EXHAUSTED|credits? are depleted|prepayment/i
      .test(raw)) {
    return "rate_limit";
  }
  if (/\b5\d\d\b|overloaded|unavailable|timeout|ETIMEDOUT|ECONNRESET/i.test(raw)) {
    return "unavailable";
  }
  return "other";
}

/**
 * One sentence, for a place that has room for one: a per-file result, a status
 * line, a toast. Says what happened, whether anything was stored, and whose
 * problem it is.
 *
 * @param what  The thing that did not happen, e.g. "This document was not read".
 */
export function providerSentence(e: unknown, what: string): string {
  switch (classifyProviderError(e)) {
    case "no_key":
      return `${what}: the model provider is not configured or the key was ` +
             `rejected. Nothing has been stored.`;
    case "rate_limit":
      return `${what}: the model provider is rate limiting or the account is out ` +
             `of credit. Nothing has been guessed and nothing has been stored. ` +
             `This is an account problem rather than a problem with the document.`;
    case "unavailable":
      return `${what}: the model provider did not respond. Nothing has been ` +
             `stored. Try again.`;
    default:
      return `${what}. Nothing has been stored.`;
  }
}

/**
 * A full JSON response for a route that could not do its job.
 *
 * `detail` carries the raw payload, truncated, because it is genuinely useful
 * to a developer and must never be the thing a buyer reads. The UI shows it
 * behind a collapsed "Technical detail".
 */
export function providerErrorResponse(e: unknown, opts: {
  /** What the route was trying to do, in the buyer's terms. */
  action: string;
  /** Extra fields to merge, e.g. `{ refused: true }`. */
  extra?: Record<string, unknown>;
}): Response {
  const kind = classifyProviderError(e);
  const raw = String(e);

  const status = kind === "no_key" ? 503
    : kind === "rate_limit" ? 503
    : kind === "unavailable" ? 503
    : 500;

  return Response.json({
    ok: false,
    refused: kind !== "other",
    refusalReason:
      kind === "no_key" ? "provider not configured"
      : kind === "rate_limit" ? "provider rate limit"
      : kind === "unavailable" ? "provider unavailable"
      : undefined,
    error: providerSentence(e, opts.action),
    detail: raw.replace(/\s+/g, " ").slice(0, 400),
    ...(opts.extra ?? {}),
  }, { status });
}
