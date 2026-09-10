import { buildComparisonPayload, seedRfx } from "@/lib/store";

/**
 * The whole comparison, recomputed on every request.
 *
 * Landed values are never read from the table; they are derived from the raw
 * extracted values by the same `buildMatrix` the conformance test proves
 * correct. That is what makes the assumption ledger live rather than
 * decorative: change an assumption and the next read reflects it.
 */
export async function GET() {
  try {
    await seedRfx();
    return Response.json(await buildComparisonPayload());
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
