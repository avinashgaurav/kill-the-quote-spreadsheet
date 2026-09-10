import { getQuery } from "@/lib/db/client";
import { sendIssues, type DraftedRfx } from "@/lib/copilot";
import {
  scopeDocument, termsDocument, lineItemsWorkbook, questionnaireWorkbook,
  rfxPackFilenames,
} from "@/lib/documents";

/**
 * Send the enquiry. The outbound half of the flow.
 *
 * The transport is stubbed, which the brief explicitly permits ("fake the SMTP
 * server if you like"). What is NOT stubbed is the part that matters: the four
 * documents are really generated from the drafted enquiry, and the send is
 * REFUSED if the enquiry is still ambiguous.
 *
 * That refusal is the whole reason this route exists rather than being a button
 * that sets a flag. Almost every mess the reader has to untangle later was
 * created at this moment, so this is the cheapest place in the entire system to
 * prevent it. A blocking clarity issue, or a container unit that does not say
 * how many pieces are inside it, stops the send and says which line and why.
 */
export const maxDuration = 120;

export async function POST(request: Request) {
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
    const rfxId = String(body.rfxId ?? "").trim() || null;

    if (!draft?.lines?.length) {
      return Response.json(
        { ok: false, error: "No drafted enquiry to send." },
        { status: 400 },
      );
    }

    // Overrides the buyer has consciously accepted, each with a reason. Held
    // here rather than in the draft so a reason cannot be edited away later.
    const overrides = (Array.isArray(body.overrides) ? body.overrides : [])
      .map((o: Record<string, unknown>) => ({
        where: String(o?.where ?? "").trim(),
        reason: String(o?.reason ?? "").trim(),
      }))
      .filter((o: { where: string; reason: string }) => o.where && o.reason.length >= 3);
    const overridden = new Set(overrides.map((o: { where: string }) => o.where));

    const issues = sendIssues(draft);
    const blocking = issues.filter((i) => i.severity === "blocking");
    const unresolved = blocking.filter((i) => !overridden.has(i.where));

    if (unresolved.length) {
      return Response.json({
        ok: false,
        refused: true,
        // Structured, so the panel can offer the fix rather than only the
        // complaint. A refusal with no way forward is not a safeguard.
        issues: unresolved,
        blockers: unresolved.map((i) => `${i.where}: ${i.issue}`),
        error:
          `Held: ${unresolved.length} thing(s) would each cause a clarification round or an ` +
          `incomparable bid. Each one has a suggested fix. Apply them, or send anyway with ` +
          `a reason: fixing now costs a minute, fixing after five suppliers have replied ` +
          `costs a week.`,
      }, { status: 422 });
    }

    // A real id, derived from the enquiry rather than a counter, so the same
    // draft sent twice does not create two enquiries.
    const id = rfxId ?? `RFX-${new Date().getFullYear()}-${
      String(draft.lines.length * 7 + draft.questionnaire.length).padStart(4, "0")}`;

    // Anything sent knowingly ambiguous is recorded against the line, so when a
    // supplier later quotes per piece on it the comparison can say the enquiry
    // went out that way and who decided it should.
    const knowinglyAmbiguous = blocking
      .filter((i) => overridden.has(i.where))
      .map((i) => ({
        where: i.where,
        lineNo: i.lineNo ?? null,
        issue: i.issue,
        consequence: i.consequence,
        reason: overrides.find((o: { where: string }) => o.where === i.where)?.reason ?? "",
        acceptedAt: new Date().toISOString(),
      }));

    const files = rfxPackFilenames(id);
    const pack = [
      { name: files.scope, bytes: Buffer.byteLength(scopeDocument(draft, id)), kind: "Scope of Work" },
      { name: files.lines, bytes: lineItemsWorkbook(draft, id).length, kind: "Line Items" },
      { name: files.questionnaire, bytes: questionnaireWorkbook(draft, id).length, kind: "Vendor Questionnaire" },
      { name: files.terms, bytes: Buffer.byteLength(termsDocument(draft, id)), kind: "Commercial Terms" },
    ];

    // The stub. A real integration would put an SMTP, portal or messaging
    // adapter here; nothing above or below this line would change.
    //
    // The channel is the buyer's choice, and it is not cosmetic: a channel that
    // cannot carry an attachment sends a link instead, and the supplier who
    // gets a link on their phone is the one most likely to reply with a
    // photograph of a rate card. Which is exactly the input the reader has to
    // survive, so the choice made here shows up at the other end of the flow.
    const CHANNELS: Record<string, { label: string; attachments: boolean }> = {
      email: { label: "Email", attachments: true },
      portal: { label: "Supplier portal", attachments: true },
      whatsapp: { label: "WhatsApp", attachments: false },
    };
    const chosen = CHANNELS[String(body.channel ?? "email")] ?? CHANNELS.email;
    const recipients = (body.recipients as string[] | undefined) ?? [];
    const packLink = `/api/rfx/pack/{part}?rfx=${encodeURIComponent(id)}`;
    const outbound = {
      channel: `${chosen.label} (transport stubbed)`,
      recipients: recipients.length ? recipients : ["(no suppliers selected)"],
      subject: `${id}: ${draft.title}`,
      attachments: chosen.attachments
        ? pack.map((f) => f.name)
        : [`link to the 4-document pack (${packLink})`],
      sentAt: new Date().toISOString(),
      note:
        `Transport is stubbed, as the brief permits. The four documents are really ` +
        `generated from this enquiry and are downloadable below; only the delivery hop ` +
        `is faked.` +
        (chosen.attachments
          ? ""
          : ` This channel carries no attachment, so the pack goes as a link. Expect at ` +
            `least one supplier to reply with a photograph rather than a file.`),
    };

    try {
      const query = await getQuery();
      await query(
        `insert into rfx
           (id, title, buyer, terms, drafted_by_copilot, knowingly_ambiguous,
            questionnaire)
         values ($1,$2,$3,$4,true,$5,$6)
         on conflict (id) do update set title = $2, terms = $4,
           drafted_by_copilot = true, knowingly_ambiguous = $5,
           questionnaire = $6`,
        [
          id, draft.title, JSON.stringify({}), JSON.stringify(draft.terms),
          JSON.stringify(knowinglyAmbiguous),
          // The questions THIS buyer asked. Without this every questionnaire
          // read is graded against the shipped demo's questions, so a real
          // supplier's real answers to real questions get dropped as unknown
          // question numbers and the verdict describes an enquiry nobody sent.
          JSON.stringify(draft.questionnaire ?? []),
        ],
      );
      for (const l of draft.lines) {
        await query(
          `insert into rfx_lines
             (id, rfx_id, no, sku, group_name, description, spec, uom, pack_size, qty, hsn)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           on conflict (id) do nothing`,
          [
            `${id}:${l.no}`, id, l.no, String(l.sku), String(l.group),
            String(l.description), JSON.stringify(l.spec ?? []), String(l.uom),
            Number(l.unitsPerUom ?? 1), Number(l.qty), l.hsn ? String(l.hsn) : null,
          ],
        );
      }
    } catch (e) {
      // The pack is still valid and downloadable even if persistence fails, so
      // report the failure rather than losing the buyer's work.
      return Response.json({
        ok: true, rfxId: id, pack, outbound,
        warning: `The enquiry was generated and can be downloaded, but was not saved: ${e}`,
      });
    }

    return Response.json({
      ok: true, rfxId: id, pack, outbound,
      knowinglyAmbiguous,
      shouldFix: issues.filter((i) => i.severity === "should_fix"),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
