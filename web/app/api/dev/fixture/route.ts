import { seedFixture, wipeFixture, resetDrafts, clearAllResponses } from "@/lib/fixture";

/**
 * DEVELOPMENT ONLY. Load or clear test-harness data.
 *
 * This exists because the local database is embedded and single-process: a CLI
 * script writing to it is invisible to the running server, so the harness has
 * to go through the server itself.
 *
 * What keeps this honest is not the absence of a route, it is that every cell
 * it writes carries `provenance.method = "test_fixture"` and the UI shows an
 * undismissable banner naming the affected suppliers for as long as any such
 * cell exists. Reading a real document for a supplier replaces their fixture
 * rows, and the banner clears when the last one is gone.
 *
 * Refused outright in production.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      {
        ok: false,
        error:
          "The test harness is disabled in production. Comparison data can only " +
          "come from reading real documents here.",
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const wipe = url.searchParams.get("wipe") === "true";
  // Drops drafted enquiries and returns to the shipped example. Separate from
  // `wipe`, which only removes harness cells: they answer different questions.
  const reset = url.searchParams.get("reset") === "true";
  // Everything on the shipped enquiry, real reads included. `wipe` clears only
  // harness cells and cannot get a test back to blank once a model has run.
  const clear = url.searchParams.get("clear") === "all";

  try {
    if (clear) return Response.json({ ok: true, ...(await clearAllResponses()) });
    if (reset) return Response.json({ ok: true, ...(await resetDrafts()) });
    const r = wipe ? await wipeFixture() : await seedFixture();
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
