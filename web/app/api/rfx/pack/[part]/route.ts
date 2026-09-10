import {
  scopeDocument, termsDocument, lineItemsWorkbook, questionnaireWorkbook,
} from "@/lib/documents";
import type { DraftedRfx } from "@/lib/copilot";

/**
 * Download one document from a drafted enquiry pack.
 *
 * POST rather than GET because the draft lives in the buyer's browser until it
 * is sent: a drafted-but-unsent enquiry is not yet a record, and inventing an
 * id for it just to make the URL prettier would put an unapproved enquiry into
 * the database.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ part: string }> },
) {
  const { part } = await ctx.params;
  try {
    // A malformed or absent body is a 400 with a sentence. It used to be a
    // 500 carrying a raw SyntaxError, which tells a caller nothing and
    // looks like the route is broken rather than the request.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json(
        { ok: false, error: "The request body was not readable JSON." },
        { status: 400 },
      );
    }
    const draft = body.draft as DraftedRfx | undefined;
    const rfxId = String(body.rfxId ?? "RFX-DRAFT");

    if (!draft?.lines?.length) {
      return Response.json({ error: "No drafted enquiry." }, { status: 400 });
    }

    const xlsx = (buf: Buffer, name: string) =>
      new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${name}"`,
        },
      });
    const html = (s: string) =>
      new Response(s, { headers: { "Content-Type": "text/html; charset=utf-8" } });

    switch (part) {
      case "scope":
        return html(scopeDocument(draft, rfxId));
      case "terms":
        return html(termsDocument(draft, rfxId));
      case "lines":
        return xlsx(lineItemsWorkbook(draft, rfxId), `${rfxId}_02_Line_Items.xlsx`);
      case "questionnaire":
        return xlsx(
          questionnaireWorkbook(draft, rfxId),
          `${rfxId}_03_Vendor_Questionnaire.xlsx`,
        );
      default:
        return Response.json(
          { error: `Unknown part '${part}'. Try scope, lines, questionnaire or terms.` },
          { status: 404 },
        );
    }
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
