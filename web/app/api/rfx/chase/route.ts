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
    const kinds = Array.isArray(body.kinds) ? (body.kinds as ChaseKind[]) : undefined;

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

    const dueAt = body.dueAt ? new Date(String(body.dueAt)).toISOString() : defaultDue();

    const msg = chaseMessage({ gaps: g, rfxId, rfxTitle, buyerName, dueAt, selected: kinds });
    if (!msg.items.length) {
      return Response.json({
        ok: false,
        refused: true,
        error: "Nothing selected to ask for.",
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
