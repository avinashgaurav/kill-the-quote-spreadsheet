import { readFile } from "node:fs/promises";
import { getQuery } from "@/lib/db/client";

/**
 * Serve a document a supplier sent, or attached.
 *
 * Two callers, one job. The provenance panel shows the actual pixels a value
 * was read from, because a re-rendered crop is a second rendering of the
 * evidence and the original bytes are the evidence. And the supplier panel
 * links the certificate a qualification verdict turns on.
 *
 * That second caller is why the query is no longer `mime_type like 'image/%'`.
 * A buyer could read our finding that Vector's ISO 27001 certificate names the
 * withdrawn 2013 revision and expired in November, and could not open the
 * certificate: the one filter meant only the photograph was servable, and the
 * brief asks for "attached docs sitting alongside the numbers", not a summary
 * of them. A verdict about a document nobody can look at is precisely the sort
 * of assertion this product refuses to make everywhere else.
 *
 * Both the path and the filename are resolved from the database and never from
 * the URL, so a caller cannot ask for an arbitrary file on disk. `?file=` is
 * matched against stored rows rather than joined onto a path.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ vendor: string }> },
) {
  const { vendor } = await ctx.params;

  // Supplier codes are created from uploaded filenames, so they are not always
  // V-plus-digits. Still constrained, because this value reaches a query.
  if (!/^[A-Za-z0-9_.&-]{1,40}$/.test(vendor)) {
    return new Response("Bad supplier id", { status: 400 });
  }

  const wanted = new URL(request.url).searchParams.get("file");

  try {
    const query = await getQuery();

    // An attachment first when one is named, because a named request is
    // specific and the fallback below deliberately is not.
    if (wanted) {
      const a = await query(
        `select filename, mime_type, file_base64 from attachments
          where vendor_id = $1 and filename = $2 limit 1`,
        [vendor, wanted],
      );
      const att = a.rows?.[0];
      if (att?.file_base64) {
        const buf = Buffer.from(String(att.file_base64), "base64");
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": String(att.mime_type),
            // Inline so a certificate opens in the browser rather than
            // downloading, which is what "open the document" should mean.
            "Content-Disposition":
              `inline; filename="${String(att.filename).replace(/[^\w.\-]/g, "_")}"`,
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    }

    const r = await query(
      wanted
        ? `select storage_path, mime_type, file_base64 from responses
            where vendor_id = $1 and filename = $2
            order by created_at desc limit 1`
        // No filename given: the image, because the only caller that omits it
        // is the provenance panel asking for the photograph a value was read
        // from.
        : `select storage_path, mime_type, file_base64 from responses
            where vendor_id = $1 and mime_type like 'image/%'
            order by created_at desc limit 1`,
      wanted ? [vendor, wanted] : [vendor],
    );

    const row = r.rows?.[0];
    if (!row) {
      return new Response(
        wanted
          ? `We do not hold '${wanted}' for this supplier. They may have cited a ` +
            `document they never sent, which is a different thing from a document ` +
            `that fails: ask them for it.`
          : "No image on file for this supplier",
        { status: 404 },
      );
    }

    // The bytes live in the database. Older rows written before that change
    // carry a filesystem path, so those still resolve from disk.
    const buf = row.file_base64
      ? Buffer.from(String(row.file_base64), "base64")
      : await readFile(String(row.storage_path));
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
