import { buildComparisonPayload } from "@/lib/store";
import {
  comparisonWorkbook, comparisonCsv, auditBundle, awardNote,
} from "@/lib/documents";

/**
 * Exports: what leaves the tool.
 *
 *   comparison   xlsx, with each cell's source and caveats as a cell comment
 *   award-note   printable award recommendation, written for internal audit
 *   audit        JSON: every cell, source, trace and assumption
 *
 * The award note matters most. Its reader never touches the tool and has to
 * reconstruct the decision eight months later from a document that stands
 * alone, so it leads with what the recommendation rests on rather than with the
 * recommendation.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  const { kind } = await ctx.params;
  const url = new URL(request.url);
  const qualifiedOnly = url.searchParams.get("all") !== "true";

  /**
   * Is this even an export we have? Checked BEFORE the empty-data check.
   *
   * The order was the other way round, so `/api/export/nonsense` with nothing
   * read reported "nothing has been read yet" and a caller went looking for
   * data rather than for their typo. Two true statements, and the less useful
   * one first.
   */
  const KINDS = ["comparison", "comparison-csv", "award-note", "audit"];
  if (!KINDS.includes(kind)) {
    return Response.json(
      { error: `Unknown export '${kind}'. Try ${KINDS.join(", ")}.` },
      { status: 404 },
    );
  }

  try {
    const payload = await buildComparisonPayload();

    /**
     * An export must not outlive the caveat on the screen it came from.
     *
     * When `degraded` is set the database could not be read, so the comparison
     * is showing the shipped example and its stored qualification verdicts and
     * the UI says "do not act on these numbers". Every export ignored that and
     * produced a clean 14 kB award note recommending Rs 4.06 crore, with
     * "Qualified: NOT ASSESSED" against both recommended suppliers and a line
     * asserting the mandatory questionnaire had been applied.
     *
     * An award note's stated job is to stand alone for whoever audits this in
     * a year. A document that outlives the warning attached to its own data is
     * the worst artefact this product could emit, so it is refused: an export
     * of numbers the app has disowned would look exactly like a finished
     * analysis, which is the same argument as refusing to export an empty one.
     */
    if (payload.degraded) {
      return Response.json({
        error:
          "This comparison could not be read from the database, so the screen is " +
          "showing the shipped example rather than anything derived from what was " +
          "read, and nothing will be exported from it. An award note that outlives " +
          "the warning attached to its own data is worse than no award note. " +
          "Reload once the database is reachable and export again.",
        degraded: payload.degraded,
      }, { status: 409 });
    }

    if (!payload.hasAnyExtraction) {
      return Response.json(
        {
          error:
            "Nothing has been read yet, so there is nothing to export. An export of an empty " +
            "comparison would look like a finished analysis of nothing.",
        },
        { status: 409 },
      );
    }

    const rfxId = (payload.rfx as { id: string }).id;

    if (kind === "comparison") {
      const buf = comparisonWorkbook(payload);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${rfxId}_comparison.xlsx"`,
        },
      });
    }

    if (kind === "comparison-csv") {
      return new Response(comparisonCsv(payload), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${rfxId}_comparison.csv"`,
        },
      });
    }

    if (kind === "award-note") {
      return new Response(awardNote(payload, { qualifiedOnly }), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (kind === "audit") {
      return new Response(JSON.stringify(auditBundle(payload), null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${rfxId}_audit_bundle.json"`,
        },
      });
    }

    return Response.json(
      { error: `Unknown export '${kind}'. Try comparison, comparison-csv, award-note or audit.` },
      { status: 404 },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
