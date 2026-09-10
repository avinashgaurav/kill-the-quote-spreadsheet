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

  try {
    const payload = await buildComparisonPayload();

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
