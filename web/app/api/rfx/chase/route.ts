/**
 * Ask a supplier for what they did not send.
 *
 * GET   what is outstanding, per supplier, computed from the live comparison
 * POST  send the request, and record what was asked and by when
 *
 * The transport is stubbed, exactly as the outbound enquiry is and for the same
 * reason the brief allows. What is not stubbed is the part that carries the
 * judgement: which items are outstanding, that the message contains only those,
 * that it carries a deadline, and that the asking is recorded so a buyer can
 * later say "asked, and they did not answer" rather than "missing".
 */

import { randomUUID } from "node:crypto";

import { getQuery } from "@/lib/db/client";
import { activeRfx, buildComparisonPayload } from "@/lib/store";
import { gapsForSupplier, chaseMessage, type SupplierGaps, type ChaseKind } from "@/lib/chase";

export const maxDuration = 60;

/**
 * Six days.
 *
 * Short enough that "no reply" means something inside a live evaluation, long
 * enough that a supplier who has to fetch a certificate from their OEM can
 * actually do it. Anything under about five days produces a non-response that
 * says more about the deadline than about the supplier, and a non-response you
 * cannot rely on is worse than no deadline at all. The buyer can change it.
 */
const CHASE_DAYS = 6;
const defaultDue = () =>
  new Date(Date.now() + CHASE_DAYS * 24 * 3600 * 1000).toISOString();

type Q = { no: string; kind: string; q: string; doc_required: boolean };
type A = { answer: string | null; doc: string | null; ok: boolean };

async function collectGaps(): Promise<{
  gaps: SupplierGaps[];
  rfxId: string;
  rfxTitle: string;
  buyerName: string;
}> {
  const rfx = await activeRfx();
  const payload = await buildComparisonPayload();
  const run = await getQuery();

  const chaseRows = (await run(
    `select vendor_id, sent_at, due_at, items, answered_at
       from chases where rfx_id = $1 order by sent_at desc`,
    [rfx.rfxId],
  )).rows ?? [];
  const latest = new Map<string, Record<string, unknown>>();
  for (const c of chaseRows) {
    if (!latest.has(String(c.vendor_id))) latest.set(String(c.vendor_id), c);
  }

  const now = Date.now();
  const gaps = payload.vendors.map((v) => {
    const c = latest.get(v.code);
    const supersession = payload.supersessions.find((s) => s.vendorId === v.code);
    return gapsForSupplier({
      vendorId: v.code,
      vendorName: v.name,
      matrix: payload.matrix,
      lines: payload.lines,
      questionnaire: payload.questionnaire as unknown as Q[],
      answers: (payload.questionnaireAnswers as Record<string, Record<string, A>>)[v.code] ?? {},
      terms: (v.meta?.terms ?? {}) as Record<string, unknown>,
      carriedForwardLines: supersession?.carriedForwardLines,
      lastChase: c
        ? {
            sentAt: String(c.sent_at),
            dueAt: c.due_at ? String(c.due_at) : null,
            itemCount: Array.isArray(c.items) ? c.items.length : 0,
            answeredAt: c.answered_at ? String(c.answered_at) : null,
            overdue: Boolean(
              c.due_at && !c.answered_at && new Date(String(c.due_at)).getTime() < now,
            ),
          }
        : undefined,
    });
  });

  return {
    gaps,
    rfxId: (payload.rfx as { id: string }).id,
    rfxTitle: (payload.rfx as { title?: string }).title ?? "the enquiry",
    buyerName: (payload.buyer as { short_name?: string }).short_name ?? "Procurement",
  };
}

export async function GET() {
  try {
    const { gaps, rfxId, rfxTitle, buyerName } = await collectGaps();
    // The draft message travels with the gaps so the buyer can read exactly
    // what would go out before deciding to send it. A chase you cannot preview
    // is a chase you send by accident.
    const dueAt = defaultDue();
    return Response.json({
      ok: true,
      rfxId,
      defaultDueAt: dueAt,
      suppliers: gaps.map((g) => ({
        ...g,
        preview: g.items.length
          ? chaseMessage({ gaps: g, rfxId, rfxTitle, buyerName, dueAt })
          : null,
      })),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const vendorId = String(body.vendorId ?? "").trim();
    const channel = String(body.channel ?? "email");
    /**
     * A SCOPE THAT IS PRESENT BUT MALFORMED MUST REFUSE, NOT WIDEN.
     *
     * `Array.isArray(body.lineNos) ? ... : undefined` reads as careful input
     * handling and is the opposite. Send `lineNos: "15"` instead of `[15]`,
     * which is exactly what a hand-rolled client does, and the check fails,
     * the scope becomes `undefined`, and the guard downstream sees an
     * UNSCOPED ask. So a buyer who queried one line sent that supplier a list
     * of sixteen items, and the chase record then says they asked for all of
     * it.
     *
     * The route's own comment two functions down says "a scoped ask that
     * matches nothing must refuse, never widen". Silently discarding a
     * malformed scope broke that in the one way the guard could not see.
     *
     * So: absent means unscoped, present-and-valid means scoped, and
     * present-and-malformed means refuse. Three states, not two.
     */
    const scopeOf = (v: unknown, name: string):
      { ok: true; value: string[] | undefined } | { ok: false; error: string } => {
      if (v === undefined || v === null) return { ok: true, value: undefined };
      if (!Array.isArray(v)) {
        return {
          ok: false,
          error:
            `'${name}' must be an array, and it was ${typeof v}. Nothing has ` +
            `been sent. A malformed scope is refused rather than ignored, ` +
            `because ignoring it would turn a question about one item into a ` +
            `request for everything this supplier owes.`,
        };
      }
      return { ok: true, value: (v as unknown[]).map(String) };
    };

    const kindsScope = scopeOf(body.kinds, "kinds");
    const linesScope = scopeOf(body.lineNos, "lineNos");
    const questionsScope = scopeOf(body.questionNos, "questionNos");
    for (const r of [kindsScope, linesScope, questionsScope]) {
      if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 400 });
    }

    const kinds = kindsScope.ok && kindsScope.value
      ? (kindsScope.value as ChaseKind[])
      : undefined;
    const onlyLines = linesScope.ok && linesScope.value
      ? linesScope.value.map(Number).filter(Number.isFinite)
      : undefined;
    const onlyQuestions = questionsScope.ok ? questionsScope.value : undefined;

    if (!vendorId) {
      return Response.json(
        { ok: false, error: "No supplier named. A chase goes to one supplier at a time." },
        { status: 400 },
      );
    }

    const { gaps, rfxId, rfxTitle, buyerName } = await collectGaps();
    const g = gaps.find((x) => x.vendorId === vendorId);
    if (!g) {
      return Response.json(
        { ok: false, error: `No supplier '${vendorId}' on this enquiry.` },
        { status: 404 },
      );
    }

    // The refusal that matters. Re-asking a supplier for something they already
    // sent is how a chase gets ignored, and it costs the goodwill needed for
    // the items that do matter.
    if (!g.items.length) {
      return Response.json({
        ok: false,
        refused: true,
        error:
          `${g.vendorName} has nothing outstanding. Everything the enquiry asked for ` +
          `has been received, so there is nothing to ask them for.`,
      }, { status: 422 });
    }

    // An unparseable date threw RangeError: Invalid time value, straight out
    // as a 500. A deadline is the buyer's input, so a bad one is a 400.
    let dueAt: string;
    if (body.dueAt) {
      const d = new Date(String(body.dueAt));
      if (Number.isNaN(d.getTime())) {
        return Response.json({
          ok: false,
          error:
            `'${String(body.dueAt)}' is not a date we can read. Nothing has been ` +
            `sent. Use YYYY-MM-DD.`,
        }, { status: 400 });
      }
      /**
       * A deadline in the past is almost certainly a typo, and it is not
       * harmless: the chase comes back `overdue: true` immediately and the
       * award note prints "Due 1 Jan 1990, no response, deadline passed",
       * which is a fact about the supplier that the buyer manufactured by
       * accident. Allowed with `?force=true` for the rare deliberate case.
       */
      const past = d.getTime() < Date.now() - 60_000;
      const force = new URL(request.url).searchParams.get("force") === "true";
      if (past && !force) {
        return Response.json({
          ok: false,
          error:
            `That deadline (${d.toISOString().slice(0, 10)}) is in the past, so ` +
            `this request would be overdue the moment it was sent and the award ` +
            `note would report a missed deadline the supplier never had. ` +
            `Nothing has been sent. Add ?force=true if you meant it.`,
        }, { status: 400 });
      }
      dueAt = d.toISOString();
    } else {
      dueAt = defaultDue();
    }

    const msg = chaseMessage({
      gaps: g, rfxId, rfxTitle, buyerName, dueAt, selected: kinds,
      onlyLines, onlyQuestions,
    });
    if (!msg.items.length) {
      // A scoped ask that matches nothing must refuse, never widen. The buyer
      // asked about one cell; sending them a list of everything outstanding
      // instead would be a different message to a different conversation.
      const scoped = Boolean(onlyLines?.length || onlyQuestions?.length);
      return Response.json({
        ok: false,
        refused: true,
        error: scoped
          ? "There is nothing outstanding on that item. Either they already sent " +
            "it, or it is settled on our side and does not need them."
          : "Nothing selected to ask for.",
      }, { status: 422 });
    }

    const run = await getQuery();
    const id = `chase_${randomUUID().slice(0, 12)}`;
    await run(
      `insert into chases (id, rfx_id, vendor_id, channel, due_at, items, message)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, rfxId, vendorId, channel, dueAt, JSON.stringify(msg.items), msg.body],
    );

    return Response.json({
      ok: true,
      chaseId: id,
      outbound: {
        channel: `${channel} (transport stubbed)`,
        to: vendorId,
        subject: msg.subject,
        dueAt,
        itemCount: msg.items.length,
        body: msg.body,
        note:
          "Transport is stubbed, as the brief permits. What is real is the record: " +
          "this enquiry now holds what was asked of them and when it was due, so the " +
          "award can say 'asked and not answered' rather than 'missing'.",
      },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

/**
 * Close a chase without an answer.
 *
 * The VP's other instruction: "if they don't send now either, we decide then."
 * That decision has to be recordable, because proceeding on an unanswered chase
 * is a judgement someone made on a date, not an oversight.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const chaseId = String(body.chaseId ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    if (!chaseId || !reason) {
      return Response.json({
        ok: false,
        error:
          "Closing a chase needs the chase and a reason. Proceeding without an " +
          "answer is a decision, and an undated, unexplained decision is the thing " +
          "that cannot be defended later.",
      }, { status: 400 });
    }
    const run = await getQuery();
    const r = await run(
      `update chases set closed_reason = $2 where id = $1 returning id, vendor_id`,
      [chaseId, reason],
    );
    if (!r.rows?.length) {
      return Response.json({ ok: false, error: `No chase '${chaseId}'.` }, { status: 404 });
    }
    return Response.json({ ok: true, chaseId, reason });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
