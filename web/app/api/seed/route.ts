import { seedRfx } from "@/lib/store";

/**
 * Load the buyer's own enquiry: 30 lines, 5 vendor columns, every cell empty.
 *
 * No vendor price is seeded. The comparison starts genuinely blank and is
 * filled only by reading real documents, so there is nothing to mistake for a
 * pre-baked result.
 */
export async function POST() {
  try {
    const r = await seedRfx();
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
