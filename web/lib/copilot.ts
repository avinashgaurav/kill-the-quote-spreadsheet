/**
 * The RFx co-pilot: a buyer talks an enquiry into existence.
 *
 * This is the first of the three real AI loops. It is also the one most likely
 * to be built as a form with a chat box bolted on, so it is worth saying what
 * this one actually does differently.
 *
 * The co-pilot's job is not to transcribe. It is to make the enquiry
 * UNAMBIGUOUS before it goes out, because almost every mess the reader has to
 * untangle later was created here. A line that says "32GB DDR5 RDIMM" without
 * saying "as a matched kit of 2x16GB" will come back three different ways from
 * three suppliers, forever, no matter how good the extraction is. A line that
 * says "3 year onsite" without "inclusive in the unit price, do not quote an
 * uplift separately" invites exactly the split that makes two bids
 * incomparable.
 *
 * So the co-pilot is scored on specification quality, not fluency:
 *
 *   - every line carries a unit AND, where the unit is a container, how many
 *     billable pieces are inside it
 *   - warranty scope is stated as inclusive or excluded, never left implied
 *   - substitution is either permitted with a stated disclosure rule, or barred
 *   - the questionnaire separates mandatory from desirable and says which need
 *     evidence, because "do you have X" without "attach it" produces a Yes and
 *     an expired certificate
 *   - conditional discounts are pre-empted in the terms, so a footnote discount
 *     arrives labelled instead of hidden
 *
 * It refuses to finalise an enquiry whose lines are under-specified, and says
 * which ones and why. That refusal is the product.
 */

import type { ToolSpec } from "./llm";

export const COPILOT_SYSTEM = `You are the drafting co-pilot inside a procurement tool. A category buyer describes what they need to buy, in their own words, and you turn it into an enquiry that can go out to suppliers without creating work for everyone later.

WHAT YOU ARE ACTUALLY FOR

Most of the pain in comparing quotations is created at this stage, not at comparison time. When five suppliers answer the same line five different ways, it is usually because the line permitted five readings. Your job is to close those readings before the enquiry leaves the building.

The specific ambiguities that cause the most damage, in order:

1. UNIT OF MEASURE. If a thing is sold in a container, say the container AND what is inside it. "Memory, 32GB DDR5 RDIMM" is ambiguous; "32GB total as a matched kit of 2 x 16GB DDR5-4800 RDIMM, quoted per kit, one kit contains 2 billable units" is not. Transceivers come in boxes of ten. Patch cords in boxes of fifty. Tape media in packs of five. A supplier quoting per piece against a line that meant per box is not being difficult; the line was unclear, and their price will look ninety per cent cheaper than it is.

2. WARRANTY SCOPE. Say whether the warranty term is included in the unit price or quoted separately, and never leave it implied. A supplier who quotes one year standard and offers the other two as a separate line is not comparable to one who includes three, and the difference will not be obvious.

3. SUBSTITUTION. Either permit equivalents and require the offered make and model to be stated, or bar them. An unstated substitution discovered at evaluation is a wasted round.

4. SPEC FLOOR. State the minimum on every axis that matters. A line asking for 16GB will otherwise attract an 8GB offer at a lower price, described as upgradeable.

5. EVIDENCE. A questionnaire question that asks "are you certified to X" gets a Yes. One that asks "are you certified to X, attach the certificate showing validity" gets a certificate, and sometimes an expired one, which is a finding rather than a surprise.

HOW TO WORK

Ask about what you cannot infer, and infer what you can. Do not interrogate the buyer about things a competent category manager would take as read: standard tax basis, ordinary payment terms, obvious delivery arrangements. Propose sensible defaults for those and say you have.

Do ask about: quantities you cannot guess, delivery locations, the split across sites, whether they have a spec they must match, the term of warranty and support they actually need, and any budget or timeline that constrains the shape of the enquiry.

Keep it to a few exchanges. A buyer who wanted a form would have used a form. When you have enough to draft, draft.

WHEN YOU DRAFT

Call draft_rfx with the whole enquiry: scope, line items, questionnaire and terms. Every line must carry a unit, a quantity, and unitsPerUom (1 unless the unit is a container). Write descriptions a supplier could quote against without asking a question.

Set clarityIssues honestly. If any line is still under-specified, or a quantity is a guess, or the buyer never answered something material, list it. An enquiry that goes out with a known hole in it is worse than one that waits an hour.

WHEN THE BUYER ASKS FOR A CHANGE

Call amend_rfx rather than redrafting from scratch. Adding a line to an enquiry that has already gone out is legitimate and common, and the tool will show that line as one nobody has quoted, which is the correct thing for a buyer to see.

WHAT YOU DO NOT DO

You do not price anything. You have no view on what things cost, and inventing an estimate would put a number in front of a buyer that looks like intelligence and is not. If asked, say the enquiry establishes what to buy and the market establishes the price.

You do not evaluate suppliers, and you do not draft anything you were not asked for.`;

// ---------------------------------------------------------------------------

const lineSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "no", "sku", "group", "description", "spec", "uom", "unitsPerUom", "qty",
    "hsn", "warrantyBasis", "substitutionAllowed",
  ],
  properties: {
    no: { type: "integer", description: "Line number, starting at 1, contiguous." },
    sku: {
      type: "string",
      description: "A short internal code, e.g. LT-BUS-14. The buyer's own reference, not a supplier part number.",
    },
    group: {
      type: "string",
      description: "A grouping the buyer would recognise, e.g. 'Enduser Compute', 'Datacentre'.",
    },
    description: {
      type: "string",
      description:
        "What is being bought, specific enough that a supplier can quote it without asking a " +
        "question. State every axis that matters: capacity, generation, interface, rating, and " +
        "the warranty term.",
    },
    spec: {
      type: "array",
      description: "The spec as key/value pairs, so a deviation can be detected mechanically.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value"],
        properties: { key: { type: "string" }, value: { type: "string" } },
      },
    },
    uom: {
      type: "string",
      description:
        "The unit the supplier must price per: 'nos', 'kit', 'box of 10', 'pack of 5'. If the " +
        "unit is a container, name the container AND its count here.",
    },
    unitsPerUom: {
      type: "integer",
      description:
        "How many billable pieces sit inside one uom. 1 for a plain unit, 2 for a kit of two, " +
        "10 for a box of ten. This single field prevents the most expensive misreading in the " +
        "whole process, so get it right.",
    },
    qty: { type: "integer" },
    hsn: { type: ["string", "null"], description: "HSN code if known, else null." },
    warrantyBasis: {
      type: "string",
      enum: ["included_in_unit_price", "quoted_separately", "not_applicable"],
      description:
        "Whether the warranty term stated in the description must be inside the unit price. " +
        "Leaving this to the supplier is how two bids become incomparable.",
    },
    substitutionAllowed: {
      type: "boolean",
      description:
        "If true, equivalents are permitted provided the offered make and model is stated.",
    },
  },
} as const;

export const COPILOT_TOOLS: ToolSpec[] = [
  {
    name: "draft_rfx",
    description:
      "Produce the complete enquiry: scope, line items, questionnaire and terms. Call this once " +
      "you have enough from the buyer, not before. Every line must carry a unit and unitsPerUom.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "scope", "lines", "questionnaire", "terms", "clarityIssues"],
      properties: {
        title: { type: "string", description: "A short title for the enquiry." },

        scope: {
          type: "object",
          additionalProperties: false,
          required: [
            "background", "included", "excluded", "deliveryLocations", "timeline", "awardBasis",
          ],
          properties: {
            background: {
              type: "string",
              description: "Why this is being bought. Two or three sentences a supplier can read.",
            },
            included: {
              type: "array", items: { type: "string" },
              description: "What the supplier is responsible for beyond supplying the goods.",
            },
            excluded: {
              type: "array", items: { type: "string" },
              description: "What is explicitly NOT in scope. Absent exclusions become disputes.",
            },
            deliveryLocations: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["site", "share"],
                properties: {
                  site: { type: "string" },
                  share: { type: "string", description: "e.g. '60%' or 'all datacentre items'." },
                },
              },
            },
            timeline: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["milestone", "when"],
                properties: { milestone: { type: "string" }, when: { type: "string" } },
              },
            },
            awardBasis: {
              type: "string",
              description:
                "How the award will be decided, including whether it may be split by line or " +
                "group, and that price is not the sole criterion.",
            },
          },
        },

        lines: { type: "array", items: lineSchema },

        questionnaire: {
          type: "array",
          description:
            "Ten questions or fewer. Mark each mandatory or desirable, and say which need a " +
            "document. A mandatory question without an evidence requirement will be answered " +
            "Yes and evidenced with nothing.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["no", "kind", "question", "documentRequired", "whyItMatters"],
            properties: {
              no: { type: "string", description: "Q1, Q2, ..." },
              kind: { type: "string", enum: ["mandatory", "desirable"] },
              question: { type: "string" },
              documentRequired: { type: "boolean" },
              whyItMatters: {
                type: "string",
                description:
                  "One line for the buyer's own benefit: what a failure here would actually cost " +
                  "them. A mandatory question nobody can justify should not be mandatory.",
              },
            },
          },
        },

        terms: {
          type: "object",
          additionalProperties: false,
          required: [
            "currency", "taxBasis", "deliveryBasis", "payment", "validity", "priceFirmness",
            "supportSla", "acceptance", "partialAward", "conditionalDiscounts", "compliance",
            "governingLaw",
          ],
          properties: {
            currency: {
              type: "string",
              description:
                "State the currency AND what happens if a supplier quotes in another: they must " +
                "state the reference rate, its source and date, and whether it is committed.",
            },
            taxBasis: { type: "string" },
            deliveryBasis: { type: "string" },
            payment: { type: "string" },
            validity: { type: "string" },
            priceFirmness: {
              type: "string",
              description:
                "Whether prices must be firm, and how forex or availability caveats will be treated.",
            },
            supportSla: { type: "string" },
            acceptance: { type: "string" },
            partialAward: { type: "string" },
            conditionalDiscounts: {
              type: "string",
              description:
                "Require any discount conditional on an approval, a date, or a competitor's price " +
                "to be labelled as such. This is what turns a hidden footnote discount into a " +
                "declared one.",
            },
            compliance: { type: "string" },
            governingLaw: { type: "string" },
          },
        },

        clarityIssues: {
          type: "array",
          description:
            "Anything still ambiguous, guessed, or unanswered. Be honest. An empty array means " +
            "you are certifying that every line is unambiguous, every quantity is real, and " +
            "nothing material is outstanding.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "where", "issue", "suggestion"],
            properties: {
              severity: {
                type: "string",
                enum: ["blocking", "should_fix", "note"],
                description:
                  "blocking: do not send until resolved. should_fix: will probably cause a " +
                  "clarification round. note: worth the buyer knowing.",
              },
              where: { type: "string", description: "e.g. 'line 13' or 'terms.taxBasis'." },
              issue: { type: "string" },
              suggestion: { type: "string" },
            },
          },
        },
      },
    },
  },

  {
    name: "amend_rfx",
    description:
      "Change an enquiry that already exists: add, remove or revise lines, or change a term. Use " +
      "this instead of redrafting. A line added after the enquiry went out will correctly show as " +
      "one nobody has quoted yet.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "addLines", "removeLineNos", "reviseLines", "termChanges"],
      properties: {
        summary: { type: "string", description: "One line the buyer can read and approve." },
        addLines: { type: "array", items: lineSchema },
        removeLineNos: { type: "array", items: { type: "integer" } },
        reviseLines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["no", "field", "from", "to", "reason"],
            properties: {
              no: { type: "integer" },
              field: { type: "string" },
              from: { type: "string" },
              to: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
        termChanges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "to", "reason"],
            properties: {
              field: { type: "string" },
              to: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
      },
    },
  },

  {
    name: "flag_underspecified",
    description:
      "Refuse to draft, and say why. Use this when the buyer has not given enough to write an " +
      "enquiry that will not create a clarification round: no quantities, no spec at all, or a " +
      "request too vague to turn into line items. Asking is cheaper than sending something wrong.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["missing", "askInstead"],
      properties: {
        missing: {
          type: "array",
          items: { type: "string" },
          description: "What you still need, specifically.",
        },
        askInstead: {
          type: "string",
          description: "The one or two questions to put to the buyer now, in their language.",
        },
      },
    },
  },
];

// ---------------------------------------------------------------------------

/** Openers, shown before the buyer types anything. */
/**
 * Openers for the drafting conversation.
 *
 * Written the way a category buyer actually opens: a rough shape, a couple of
 * numbers, and every genuinely important detail missing. That is not laziness
 * on their part, it is what having the requirement in your head rather than on
 * paper sounds like.
 *
 * Each one also carries a latent trap the co-pilot has to close, because a
 * demo prompt that drafts cleanly first time shows nothing. In order:
 *
 *   memory and optics    a kit of two and a box of ten, the units that make a
 *                        bid look ninety per cent cheaper than it is
 *   packaging            priced per thousand, per kilo and per running metre,
 *                        sometimes in one quotation
 *   "onsite on
 *    everything"         warranty scope, which decides whether a supplier
 *                        quotes one year and puts the other two on their own line
 *   "the usual list"     nothing to draft from at all, so the right first move
 *                        is a question rather than a document
 */
export const COPILOT_PROMPTS = [
  "About 200 laptops and 30 monitors for three offices, plus 12 rack servers with memory and 10G optics for the Pune datacentre",
  "Corrugated boxes for four fulfilment centres, five sizes, plus tape and void fill",
  "Refresh the store network. Routers, switches, patch cords, and I want 3-year onsite on everything",
  "MRO spares for the plant, the usual consumables list",
];

/**
 * Turn a drafted enquiry into the four documents that actually go out.
 *
 * Deliberately four files, not one. A real pack is split because different
 * people inside the supplier answer different parts: pre-sales does the scope,
 * inside sales does the pricing, compliance does the questionnaire, legal does
 * the terms. Splitting it is also what produces the trap the reader has to
 * survive later, since the questionnaire comes back on a different day, in a
 * different format, from a different person than the prices, and nothing forces
 * the two to agree.
 */
export interface DraftedRfx {
  title: string;
  scope: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  questionnaire: Array<Record<string, unknown>>;
  terms: Record<string, unknown>;
  clarityIssues: Array<{ severity: string; where: string; issue: string; suggestion: string }>;
}

/** Blocking issues stop a send. This is the refusal, and it is the point. */
/**
 * A thing that would go out wrong, what to do about it, and what it costs.
 *
 * The first build returned an array of strings and simply refused the send.
 * That was half a product: it named the problem, offered no way forward, and
 * left the buyer to go back and re-argue with a chat window. A dead end is not
 * a safeguard, it is a bug with good intentions.
 *
 * So an issue now carries three things instead of one:
 *
 *   the PROBLEM, in the buyer's language, not the schema's
 *   the FIX, as an actual value that can be applied with one click
 *   the CONSEQUENCE of ignoring it, in money where money is knowable
 *
 * And the send can proceed over a blocker, with a recorded reason. That is a
 * deliberate loosening: an unclickable button gets worked around by editing the
 * draft until the check stops firing, which is worse than an override, because
 * an override leaves a record. When a supplier later quotes per piece against
 * that very line, the comparison can say the line went out ambiguous and who
 * decided to send it that way.
 */
export interface SendIssue {
  severity: "blocking" | "should_fix" | "note";
  /** Human location: "line 12", "Q4", "the enquiry". */
  where: string;
  lineNo?: number;
  issue: string;
  /** What happens if this ships as written. */
  consequence: string;
  /** A concrete change the buyer can accept, when one exists. */
  fix?: {
    label: string;
    /** Field/value pairs to apply to that line or question. */
    patch: Record<string, unknown>;
    target: "line" | "question" | "enquiry";
    targetId?: string | number;
  };
}

/** How many billable pieces a container word usually holds, when the buyer said. */
const PACK_HINT = /\b(?:of|x|×)\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:pcs?|pieces?|nos)\b/i;

/**
 * Everything wrong with this enquiry, ranked by what it would cost.
 *
 * The container-unit check is the one that earns its keep. A line whose unit is
 * "box" with one piece inside is the single most expensive ambiguity in the
 * whole process: one supplier prices the box, another prices a piece, and the
 * second bid looks five or ten times cheaper while being dearer. No amount of
 * good extraction fixes it afterwards, because both suppliers answered the
 * question that was actually asked.
 */
export function sendIssues(draft: DraftedRfx): SendIssue[] {
  const out: SendIssue[] = [];

  // A gate on an outbound action must fail CLOSED, never throw. A crash here
  // reads to the buyer as a broken tool rather than as a problem with their
  // enquiry, and it stops them seeing the issues that WERE detected. So every
  // member of every list is treated as possibly absent, not just the lists.
  const d = (draft ?? {}) as Partial<DraftedRfx>;

  for (const i of d.clarityIssues ?? []) {
    if (!i || typeof i !== "object") continue;
    out.push({
      severity: i.severity === "blocking" ? "blocking"
        : i.severity === "should_fix" ? "should_fix" : "note",
      where: i.where,
      issue: i.issue,
      consequence: i.suggestion || "Stated by the drafting step.",
    });
  }

  // Independent checks, in code, so the model cannot certify its way past them.
  (d.lines ?? []).forEach((line, index) => {
    const l = (line ?? {}) as Record<string, unknown>;
    if (l.no === undefined || l.no === null) {
      out.push({
        severity: "blocking", where: `line ${index + 1}`,
        issue: "This line has no number.",
        consequence:
          "Supplier replies map to line numbers. A line without one cannot be " +
          "matched to anything that comes back.",
      });
      return;
    }
    const uom = String(l.uom ?? "").trim();
    const units = Number(l.unitsPerUom ?? 0);
    const no = Number(l.no);
    const where = `line ${no}`;

    if (!uom) {
      out.push({
        severity: "blocking", where, lineNo: no,
        issue: "No unit of measure.",
        consequence:
          "Suppliers will each choose their own unit and the prices will not be " +
          "comparable at all.",
        fix: {
          label: "Set the unit to 'nos' (one item at a time)",
          patch: { uom: "nos", unitsPerUom: 1 },
          target: "line", targetId: no,
        },
      });
    }

    const container = /\b(box|pack|kit|set|carton|case|bundle|reel|roll|pallet)\b/i.exec(uom);
    if (container && (!Number.isInteger(units) || units <= 1)) {
      const hinted = PACK_HINT.exec(uom);
      const guess = hinted ? Number(hinted[1] ?? hinted[2]) : null;
      out.push({
        severity: "blocking", where, lineNo: no,
        issue:
          `The unit is "${uom}" but the enquiry does not say how many billable pieces ` +
          `are inside one ${container[1].toLowerCase()}.`,
        consequence:
          `One supplier will price the ${container[1].toLowerCase()} and another will ` +
          `price a single piece. The second bid looks several times cheaper while being ` +
          `dearer, and both of them answered the question you actually asked. Nothing ` +
          `downstream can fix this.`,
        fix: guess
          ? {
              label: `One ${container[1].toLowerCase()} contains ${guess} pieces`,
              patch: { unitsPerUom: guess },
              target: "line", targetId: no,
            }
          : {
              label: "Ask per single item instead",
              patch: { uom: "nos", unitsPerUom: 1 },
              target: "line", targetId: no,
            },
      });
    } else if (!Number.isInteger(units) || units < 1) {
      out.push({
        severity: "blocking", where, lineNo: no,
        issue: "Pieces per unit is missing or not a whole number.",
        consequence: "Every landed price on this line would be computed from a guess.",
        fix: {
          label: "One piece per unit",
          patch: { unitsPerUom: 1 },
          target: "line", targetId: no,
        },
      });
    }

    if (!Number.isInteger(Number(l.qty)) || Number(l.qty) < 1) {
      out.push({
        severity: "blocking", where, lineNo: no,
        issue: "Quantity is missing or not a positive whole number.",
        consequence:
          "Suppliers price differently at different volumes, so a missing quantity " +
          "invites a quotation you cannot hold them to.",
      });
    }
  });

  const nos = (d.lines ?? []).map((l) => Number((l ?? {}).no)).filter(Number.isFinite);
  if (new Set(nos).size !== nos.length) {
    out.push({
      severity: "blocking", where: "the enquiry",
      issue: "Two lines share a number.",
      consequence:
        "Supplier replies map to line numbers. Duplicates put one supplier's price " +
        "on top of another's.",
    });
  }

  const mandatory = (d.questionnaire ?? [])
    .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === "object")
    .filter((q) => q.kind === "mandatory");
  if (!mandatory.length) {
    out.push({
      severity: "blocking", where: "the questionnaire",
      issue: "No mandatory questions.",
      consequence:
        "Price becomes the only criterion, and a supplier who cannot legally supply " +
        "you can win on it.",
    });
  }
  mandatory
    .filter((q) => !q.documentRequired)
    .forEach((q) => {
      out.push({
        severity: "blocking", where: String(q.no ?? "a question"),
        issue: "Mandatory, but asks for no document.",
        consequence:
          'A question that asks "are you certified" gets a Yes. Only the document ' +
          "tells you whether the certificate is current.",
        fix: {
          label: "Require the supporting document",
          patch: { documentRequired: true },
          target: "question", targetId: String(q.no ?? ""),
        },
      });
    });

  return out;
}

/**
 * The blocking subset, as sentences.
 *
 * Kept because the send route, the tests and the panel all had a use for a
 * plain list before issues gained structure, and because a one-line summary is
 * still the right thing to put in an error body.
 */
export function sendBlockers(draft: DraftedRfx): string[] {
  return [...new Set(
    sendIssues(draft)
      .filter((i) => i.severity === "blocking")
      .map((i) => `${i.where}: ${i.issue}`),
  )];
}
