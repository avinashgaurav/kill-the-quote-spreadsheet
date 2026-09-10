/**
 * "Go back and ask them for the rest."
 *
 * A supplier sends a spreadsheet and nothing else. No questionnaire, no terms,
 * six of thirty lines priced. That is not an unusual reply, it is the commonest
 * one, and the buyer's next move is obvious: ask them for the missing pieces.
 *
 * Three decisions shape this file, and they are all about what NOT to do.
 *
 * ONLY WHAT IS OUTSTANDING. The request lists the gaps and nothing else. Asking
 * a supplier to "please complete the questionnaire" when they answered eight of
 * ten questions is how a chase gets ignored, and it wastes the goodwill you
 * need for the two that matter. So the message is built from the actual state
 * of the comparison, item by item, and it is IMPOSSIBLE to send an empty one.
 *
 * A DEADLINE, ALWAYS. "No reply" means nothing without a date it was due. The
 * point of this whole record is that at award time the buyer can say "asked on
 * the 18th, due the 22nd, nothing came back", which is a defensible position,
 * rather than "their questionnaire is missing", which is not.
 *
 * ASKED-AND-IGNORED IS NOT THE SAME AS NEVER-ASKED. The system already
 * distinguishes five kinds of nothing in a cell. This adds the same distinction
 * one level up, at the supplier: a gap nobody chased and a gap the supplier
 * declined to close are different facts, and the second one is the one that
 * justifies awarding around them.
 */

import type { Matrix, RfxLine } from "./normalise";

/**
 * Two families, and the distinction is the whole point of splitting them.
 *
 * A GAP is something they never sent. The ask is "please send it".
 *
 * A DISPUTE is something they DID send that we cannot use as it stands: a
 * figure under glare we will not guess at, a pointer at another price we
 * resolved ourselves, a line their own revision skipped. The ask is "please
 * confirm this figure", which is a different sentence and gets a different
 * answer.
 *
 * Rolling them together produces the message every buyer has received and
 * ignored: "please provide your pricing", sent to a supplier who provided their
 * pricing. It reads as though nobody opened the file, and it invites an
 * argument about whether the tool misread them rather than an answer.
 */
export type ChaseFamily = "gap" | "dispute";

export type ChaseKind =
  | "price_missing"
  | "price_unreadable"
  | "price_not_a_price"
  | "price_derived_unconfirmed"
  | "price_carried_forward"
  | "questionnaire_unanswered"
  | "questionnaire_no_document"
  | "term_not_stated";

export const FAMILY: Record<ChaseKind, ChaseFamily> = {
  price_missing: "gap",
  questionnaire_unanswered: "gap",
  questionnaire_no_document: "gap",
  term_not_stated: "gap",
  // They answered. We cannot use the answer as it stands.
  price_unreadable: "dispute",
  price_not_a_price: "dispute",
  price_derived_unconfirmed: "dispute",
  price_carried_forward: "dispute",
};

export interface ChaseItem {
  kind: ChaseKind;
  family: ChaseFamily;
  /** What to say to the supplier. Their language, not ours. */
  ask: string;
  /** Why the buyer cares. Never sent; shown on the buyer's screen. */
  why: string;
  /** Rupees that hang on this item, where that is knowable. */
  atRiskInr: number;
  lineNos?: number[];
  questionNo?: string;
  termKey?: string;
}

export interface SupplierGaps {
  vendorId: string;
  vendorName: string;
  items: ChaseItem[];
  gapCount: number;
  disputeCount: number;
  totalAtRiskInr: number;
  /**
   * What the system settled itself instead of asking about.
   *
   * A supplier who quotes per piece against a line asked per box of ten has not
   * done anything wrong and does not need an email. The pack size is in our own
   * enquiry, so the conversion is ours to do. Same for a price in dollars, and
   * for a synonym like "nos" against "each".
   *
   * Shown next to what IS being asked, for two reasons. It stops the buyer
   * wondering why an obvious mismatch is not in the list, and it is the
   * clearest evidence on the screen that the tool does the work rather than
   * pushing it back to the supplier. An email for something we could have
   * worked out ourselves is how a buyer loses a supplier's attention.
   */
  resolvedWithoutAsking: Array<{ what: string; lineNos: number[] }>;
  /** Present when this supplier has already been asked. */
  lastChase?: {
    sentAt: string;
    dueAt: string | null;
    itemCount: number;
    answeredAt: string | null;
    overdue: boolean;
  };
}

const TERM_LABELS: Record<string, { label: string; why: string }> = {
  gst: {
    label: "the tax basis, and the GST rate you have assumed",
    why: "without a rate we have assumed one, so their price may not be comparable to the others",
  },
  freight: {
    label: "whether freight and insurance to our warehouse are inside the price",
    why: "an ex-works price and a delivered price are not the same number and the difference is not visible",
  },
  payment: {
    label: "your payment terms",
    why: "payment terms are worth real money over an order this size",
  },
  validity: {
    label: "how long this price stands",
    why: "a price that expires before approval closes cannot be awarded",
  },
  delivery: {
    label: "your delivery lead time from receipt of order",
    why: "lead time is part of the offer, and a cheap price on a 14-week lead time may be unusable",
  },
};

const VAGUE = /^\s*$|not stated|tbd|to be (advised|confirmed)|as applicable|at actuals|n\/?a$/i;

/**
 * Work out what one supplier still owes us.
 *
 * Deliberately computed from the SAME matrix the grid renders, so the chase can
 * never disagree with what the buyer is looking at.
 */
export function gapsForSupplier(opts: {
  vendorId: string;
  vendorName: string;
  matrix: Matrix;
  lines: RfxLine[];
  questionnaire: Array<{ no: string; kind: string; q: string; doc_required: boolean }>;
  answers: Record<string, { answer: string | null; doc: string | null; ok: boolean }>;
  terms: Record<string, unknown>;
  carriedForwardLines?: number[];
  lastChase?: SupplierGaps["lastChase"];
}): SupplierGaps {
  const { vendorId, vendorName, matrix, lines, questionnaire, answers, terms } = opts;
  const rows = matrix[vendorId] ?? {};
  const items: ChaseItem[] = [];

  const lineByNo = new Map(lines.map((l) => [l.no, l]));
  // What a line is worth, so the buyer can see which gaps are expensive. Uses
  // the best price anyone else quoted, because this supplier by definition has
  // not given us one.
  const worth = (no: number) => {
    const l = lineByNo.get(no);
    if (!l) return 0;
    const others = Object.entries(matrix)
      .filter(([v]) => v !== vendorId)
      .map(([, r]) => r[no]?.unitInr)
      .filter((n): n is number => typeof n === "number");
    const unit = others.length ? Math.min(...others) : Number(l.baseline_inr ?? 0);
    return Math.round(unit * Number(l.qty ?? 0));
  };

  const group = (
    kind: ChaseKind,
    match: (status: string) => boolean,
    ask: (nos: number[]) => string,
    why: string,
  ) => {
    const nos = Object.entries(rows)
      .filter(([, c]) => match(c.status))
      .map(([n]) => Number(n))
      .sort((a, b) => a - b);
    if (!nos.length) return;
    items.push({
      kind, family: FAMILY[kind], lineNos: nos, ask: ask(nos), why,
      atRiskInr: nos.reduce((a, n) => a + worth(n), 0),
    });
  };

  group(
    "price_missing",
    (s) => s === "omitted",
    (nos) =>
      `A price for line${nos.length === 1 ? "" : "s"} ${fmt(nos)}, which your ` +
      `quotation does not mention. If you do not intend to quote them, please say so ` +
      `explicitly so we can record it.`,
    "A line nobody priced cannot be awarded to them, and silence is not the same as a decline.",
  );

  group(
    "price_unreadable",
    (s) => s === "unreadable",
    (nos) =>
      `Confirmation of the price on line${nos.length === 1 ? "" : "s"} ${fmt(nos)}. ` +
      `The figure is present on the document you sent but we cannot read it with ` +
      `confidence. Please confirm it in writing, or send a clearer copy.`,
    "We can see a number is there and we will not guess at it. Only they can confirm it.",
  );

  group(
    "price_not_a_price",
    (s) => s === "non_comparable" || s === "unresolvable",
    (nos) =>
      `An actual figure for line${nos.length === 1 ? "" : "s"} ${fmt(nos)}. What you ` +
      `sent refers to another price rather than quoting one, so there is nothing we ` +
      `can put in a comparison.`,
    "A pointer at someone else's price, or a promise to match one, is not a number that can be ranked.",
  );

  group(
    "price_derived_unconfirmed",
    (s) => s === "resolved_from_reference",
    (nos) =>
      `Written confirmation of the rates for line${nos.length === 1 ? "" : "s"} ` +
      `${fmt(nos)}. You referred us to a previous order. We have taken those rates ` +
      `from it, but we will not award on a figure you have not restated.`,
    "We derived this from a prior order. It is an inference until they confirm it.",
  );

  if (opts.carriedForwardLines?.length) {
    const nos = [...opts.carriedForwardLines].sort((a, b) => a - b);
    items.push({
      kind: "price_carried_forward", family: "dispute", lineNos: nos,
      ask:
        `Confirmation that your rates for line${nos.length === 1 ? "" : "s"} ${fmt(nos)} ` +
        `still stand. Your revised quotation does not mention them, so we have carried ` +
        `forward the figures from your earlier one.`,
      why: "Their revision skipped these lines. We kept the old price and it is unconfirmed.",
      atRiskInr: nos.reduce((a, n) => a + worth(n), 0),
    });
  }

  for (const q of questionnaire) {
    const a = answers[q.no];
    const mandatory = q.kind === "M" || q.kind === "mandatory";
    if (!a || a.answer === null || String(a.answer).trim() === "") {
      items.push({
        kind: "questionnaire_unanswered", family: "gap", questionNo: q.no,
        ask: `${q.no}. ${q.q}`,
        why: mandatory
          ? "Mandatory. Unanswered, they cannot be awarded at all."
          : "Unanswered. Not disqualifying, but it is part of the offer.",
        atRiskInr: 0,
      });
    } else if (q.doc_required && !a.doc) {
      items.push({
        kind: "questionnaire_no_document", family: "gap", questionNo: q.no,
        ask:
          `The supporting document for ${q.no}. You answered "${String(a.answer).slice(0, 60)}" ` +
          `but did not attach the evidence the question asks for.`,
        // Written to fit ANY document-backed question. The first version always
        // talked about certificates, which read as boilerplate the moment it
        // appeared under a question about turnover, and boilerplate is how a
        // buyer learns to stop reading the reasons.
        why: mandatory
          ? "Mandatory, and answered without the evidence it asks for. The answer alone " +
            "cannot be checked, so this is not yet a pass."
          : "Answered, but the supporting document is missing, so nothing here has been " +
            "verified against anything.",
        atRiskInr: 0,
      });
    }
  }

  for (const [key, meta] of Object.entries(TERM_LABELS)) {
    const v = terms[key];
    if (v !== undefined && v !== null && !VAGUE.test(String(v))) continue;
    items.push({
      kind: "term_not_stated", family: "gap", termKey: key,
      ask: `Please state ${meta.label}.`,
      why: meta.why,
      atRiskInr: 0,
    });
  }

  // Expensive first. The buyer's attention is the scarce resource, and a chase
  // read top-down should start with the line that decides the award.
  items.sort((a, b) => b.atRiskInr - a.atRiskInr);

  // Group the traced rules that actually moved a number. Read from the same
  // trace the provenance panel shows, so this cannot claim a conversion the
  // cell does not record.
  const resolved = new Map<string, number[]>();
  for (const [no, cell] of Object.entries(rows)) {
    if (cell.unitInr === null) continue;
    for (const step of cell.trace ?? []) {
      const r = step.rule;
      const label =
        r.startsWith("unit conversion") ? "unit mismatches converted using the pack size in our own enquiry"
        : r.startsWith("FX ") ? "prices in another currency converted at the rate in the assumption ledger"
        : r === "unit synonym" ? "different words for the same unit matched up"
        : r.startsWith("scope adjustment") ? "a separately-quoted item folded in so the line is comparable"
        : r === "pen override" ? "a handwritten correction read in place of the printed price"
        : r.startsWith("uplift") || r === "prior-PO lookup" ? "a rate taken from the prior order they pointed at"
        : null;
      if (!label) continue;
      const list = resolved.get(label) ?? [];
      if (!list.includes(Number(no))) list.push(Number(no));
      resolved.set(label, list);
    }
  }

  return {
    vendorId, vendorName, items,
    resolvedWithoutAsking: [...resolved]
      .map(([what, lineNos]) => ({ what, lineNos: lineNos.sort((a, b) => a - b) }))
      .sort((a, b) => b.lineNos.length - a.lineNos.length),
    gapCount: items.filter((i) => i.family === "gap").length,
    disputeCount: items.filter((i) => i.family === "dispute").length,
    totalAtRiskInr: items.reduce((a, i) => a + i.atRiskInr, 0),
    lastChase: opts.lastChase,
  };
}

/** "1, 2, 3 and 7" reads better to a supplier than "[1,2,3,7]". */
function fmt(nos: number[]): string {
  if (nos.length <= 6) {
    return nos.length === 1
      ? String(nos[0])
      : `${nos.slice(0, -1).join(", ")} and ${nos[nos.length - 1]}`;
  }
  return `${nos.slice(0, 5).join(", ")} and ${nos.length - 5} others`;
}

/**
 * The message itself.
 *
 * Written as a buyer would write it: short, specific, and with a date. No
 * mention of how the gaps were found, because a supplier does not care that a
 * model read their spreadsheet, and telling them invites an argument about
 * whether the tool misread them rather than an answer.
 */
export function chaseMessage(opts: {
  gaps: SupplierGaps;
  rfxId: string;
  rfxTitle: string;
  buyerName: string;
  dueAt: string;
  selected?: ChaseKind[];
  /**
   * Narrow the request to specific lines or specific questions.
   *
   * Because the buyer's question is usually not "what does this supplier owe
   * me across the board", it is "I am looking at THIS cell and I cannot read
   * it, ask them about THIS". The chase panel sends nothing here and gets
   * everything outstanding; the ask-again button on one cell sends one line
   * number and gets a message about one line.
   *
   * A scope that matches nothing produces no message rather than a broad one.
   * Silently widening the ask would be the worst outcome: the buyer thinks
   * they queried one figure and the supplier receives a list of nine.
   */
  onlyLines?: number[];
  onlyQuestions?: string[];
}): { subject: string; body: string; items: ChaseItem[] } {
  let items = opts.selected?.length
    ? opts.gaps.items.filter((i) => opts.selected!.includes(i.kind))
    : opts.gaps.items;

  if (opts.onlyLines?.length || opts.onlyQuestions?.length) {
    const lines = new Set(opts.onlyLines ?? []);
    const qs = new Set(opts.onlyQuestions ?? []);
    items = items.filter((i) =>
      (i.lineNos?.some((n) => lines.has(n)) ?? false) ||
      (i.questionNo ? qs.has(i.questionNo) : false),
    );
  }

  const dueText = new Date(opts.dueAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  const gaps = items.filter((i) => i.family === "gap");
  const disputes = items.filter((i) => i.family === "dispute");

  const gapPrices = gaps.filter((i) => i.kind === "price_missing");
  const gapQuest = gaps.filter((i) => i.kind.startsWith("questionnaire_"));
  const gapTerms = gaps.filter((i) => i.kind === "term_not_stated");

  const section = (title: string, list: ChaseItem[]) =>
    list.length ? `\n${title}\n${list.map((i) => `  - ${i.ask}`).join("\n")}\n` : "";

  // Two openings, because the two families deserve different tones. A supplier
  // who sent nothing is being chased. A supplier whose figures we cannot use is
  // being consulted, and telling them they "did not provide pricing" when they
  // did is how a chase gets ignored.
  const opening = gaps.length && disputes.length
    ? `Thank you for your response to ${opts.rfxId}, ${opts.rfxTitle}. We have recorded ` +
      `everything you sent. Two things are holding up our evaluation: some items the ` +
      `enquiry asked for have not reached us, and some of the figures you did send need ` +
      `your confirmation before we can rely on them.`
    : disputes.length
      ? `Thank you for your response to ${opts.rfxId}, ${opts.rfxTitle}. We have recorded ` +
        `your quotation. Before we can rely on it we need you to confirm the points ` +
        `below: these are figures you have already given us, not new requests.`
      : `Thank you for your response to ${opts.rfxId}, ${opts.rfxTitle}. We are missing ` +
        `some of what the enquiry asked for and cannot complete our evaluation without ` +
        `it. The items below are the only ones outstanding; everything else you sent ` +
        `has been received.`;

  const body =
    `${opening}\n` +
    section("STILL TO SEND", gapPrices) +
    section("QUESTIONNAIRE", gapQuest) +
    section("COMMERCIAL TERMS", gapTerms) +
    section("PLEASE CONFIRM (we hold a figure but cannot rely on it as it stands)", disputes) +
    `\nPlease send these by ${dueText}.\n\n` +
    `If we do not hear from you by then we will complete the evaluation on what we ` +
    `already hold from you, which may mean your bid cannot be considered for the ` +
    `lines above.\n\n` +
    `${opts.buyerName}`;

  const subject = disputes.length && !gaps.length
    ? `${opts.rfxId}: please confirm some figures in your quotation`
    : `${opts.rfxId}: outstanding items from your quotation`;

  return { subject, body, items };
}
