import { readFile } from "node:fs/promises";
import { getQuery } from "@/lib/db/client";

/**
 * Serve a supplier's original uploaded file.
 *
 * Needed so the provenance panel can show the actual pixels a value was read
 * from. Showing a re-rendered crop would be a second rendering of the evidence;
 * showing the original bytes is the evidence.
 *
 * The path is resolved from the database, never from the URL, so a caller
 * cannot ask for an arbitrary file on disk.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ vendor: string }> },
) {
  const { vendor } = await ctx.params;

  if (!/^V\d+$/.test(vendor)) {
    return new Response("Bad vendor id", { status: 400 });
  }

  try {
    const query = await getQuery();
    const r = await query(
      `select storage_path, mime_type from responses
        where vendor_id = $1 and mime_type like 'image/%'
        order by created_at desc limit 1`,
      [vendor],
    );

    const row = r.rows?.[0];
    if (!row) return new Response("No image on file for this supplier", { status: 404 });

    const buf = await readFile(String(row.storage_path));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": String(row.mime_type),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
}
