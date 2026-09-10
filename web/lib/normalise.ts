/**
 * THE CALCULATOR.
 *
 * Every number a buyer sees is produced here, in plain TypeScript, with no
 * model in the loop. The AI reads documents and decides which questions to ask
 * of this file. It never performs the arithmetic, because a buyer signing off
 * Rs 4 crore has no way to verify addition done inside a token stream.
 *
 * This is a port of dataset/generators/normalise.py, which was verified against
 * the dataset first. That Python file is the reference implementation; where the
 * two disagree, this file is wrong. `npm run conformance` proves they agree on
 * all 150 cells.
 *
 * Normalisation order is fixed and must not be reordered:
 *
 *   raw price
 *     -> UoM alias      (a different word for the same unit; never changes the number)
 *     -> UoM conversion (a genuinely different unit; always changes the number)
 *     -> currency       (at a named, dated rate)
 *     -> scope          (bring warranty onto a common basis)
 *     -> extension      (x the ASKED quantity, never the vendor's own)
 *     -> discount       (line-level, then conditional, then total-level)
 */

import catalog from "./data/catalog.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CellStatus =
  | "comparable"              // a number you can rank
  | "comparable_with_caveat"  // a number, but the offer deviates from spec
  | "resolved_from_reference" // derived from a prior PO, needs vendor confirmation
  | "needs_review"            // we have raw input we cannot safely normalise
  | "unreadable"              // a price exists on the source and cannot be read
  | "declined"                // vendor explicitly said no
  | "omitted"                 // silently absent, vendor may not have noticed
  | "non_comparable"          // an "offer" that is not a price
  | "unresolvable"            // priced by reference to data we do not hold
  | "unmapped"                // vendor invented a line with no RFx equivalent
  | "not_read";               // WE have not read their response. Not their fault.

/**
 * Statuses that may enter award arithmetic.
 *
 * `resolved_from_reference` is deliberately NOT here. Those cells carry a real,
 * citable number derived from a prior PO ("same as our March rates"), but the
 * vendor never actually quoted it. Letting a derived price win a line would
 * mean awarding against an offer nobody made. It is shown to the buyer and
 * flagged; it becomes awardable only once the vendor confirms, which the buyer
 * opts into explicitly.
 */
const AWARDABLE: ReadonlySet<CellStatus> = new Set<CellStatus>([
  "comparable",
  "comparable_with_caveat",
]);

/** True if this cell may be used in a total. */
export const isAwardable = (s: CellStatus, includeUnconfirmed = false) =>
  AWARDABLE.has(s) || (includeUnconfirmed && s === "resolved_from_reference");

/** True if this cell carries a number at all, awardable or not. */
export const hasNumber = (c: Cell) => c.unitInr !== null;

/** One step of the audit trail, shown to the buyer verbatim. */
export interface NormStep {
  rule: string;   // what was applied
  basis: string;  // WHY it was applied, and from what source
  result: string; // where the number stood after it
}

/** What an extractor produces. Deliberately dumb: the vendor's own words. */
export interface RawQuote {
  status: string;
  price?: number;
  uom?: string;
  ccy?: string;
  qty_override?: number;
  printed_price?: number;
  handwritten?: boolean;
  offered?: string;
  note?: string;
  basis?: string;
  ref_sku?: string;
  uplift_pct?: number;
  rival?: string;
  desc?: string;
  qty?: number;
  /**
   * This price excludes something the enquiry asked for, and the supplier
   * quoted that something separately under THIS label in their own response.
   *
   * The commonest case is warranty: a supplier prices one year of cover in the
   * unit price and puts years two and three on a line of their own. Comparing
   * that against a bid with three years included understates it, so the two are
   * added together before ranking.
   *
   * The label is the supplier's own, read off their document. It used to be a
   * branch in the calculator on one vendor code and three line numbers, which
   * worked perfectly for the corpus that ships here and did nothing at all for
   * anybody else's data.
   */
  scope_uplift_ref?: string;
  /** What the uplift covers, in the supplier's words. Used in the audit trail. */
  scope_uplift_note?: string;
}

/** What the buyer sees. `unitInr` is null unless genuinely comparable. */
export interface Cell {
  vendor: string;
  lineNo: number;
  status: CellStatus;
  unitInr: number | null;
  extendedInr: number | null;
  flags: string[];
  trace: NormStep[];
  needsConfirmation?: boolean;
  raw?: { price?: number; uom?: string; ccy?: string };
}

export interface RfxLine {
  no: number;
  sku: string;
  group: string;
  desc: string;
  spec: Record<string, unknown>;
  uom: string;
  pack_size: number;
  qty: number;
  hsn: string;
  baseline_inr: number;
  trap: string | null;
}

// ---------------------------------------------------------------------------
// Catalog access
// ---------------------------------------------------------------------------

export const LINES = catalog.lines as unknown as RfxLine[];
export const VENDORS = catalog.vendors as Array<{
  code: string; slug: string; name: string; city: string; reply_format: string;
}>;
export const TERMS = catalog.terms as Record<string, Record<string, unknown>>;
export const PRIOR_PO = catalog.prior_po as {
  po_number: string; po_date: string; vendor: string; rates: Record<string, number>;
};
export const QUALIFICATION = catalog.qualification as Record<
  string, { qualified: boolean; failed_mandatory: string[] }
>;
export const ASSUMPTIONS = catalog.assumptions as Record<string, {
  value: unknown; source: string; alternative?: string; note: string;
  confidence?: string;
}>;
export const BASELINE_TOTAL_INR = catalog.baseline_total_inr as number;

const UOM_ALIASES = catalog.uom_aliases as Record<string, string[]>;
const UOM_CONVERSIONS = catalog.uom_conversions as Array<{
  from_uom: string; to_uom: string; factor: number; basis: string;
}>;

export const lineByNo = (no: number, lines: RfxLine[] = LINES): RfxLine => {
  const l = lines.find((x) => x.no === no);
  if (!l) throw new Error(`No RFx line ${no}. Extraction may only map to the catalog.`);
  return l;
};

/** The FX rate lives in the assumption ledger, never as a constant in code. */
const fxRate = (): number => Number(ASSUMPTIONS.fx_usd_inr.value);

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Resolve a synonym to the asked unit. An alias NEVER changes the number.
 *
 * Kept strictly separate from conversion below. Conflating the two tables is
 * precisely how a system silently multiplies a price by 5: "pack" and
 * "pack of 5" mean the same thing, while "per pc" and "pack of 5" do not.
 */
export function canonicalUom(quoted: string, asked: string): string {
  if (quoted === asked) return asked;
  if ((UOM_ALIASES[asked] ?? []).includes(quoted)) return asked;
  return quoted;
}

const conversionFor = (from: string, to: string) =>
  UOM_CONVERSIONS.find((c) => c.from_uom === from && c.to_uom === to);

// ---------------------------------------------------------------------------
// The core: normalise one vendor x line cell
// ---------------------------------------------------------------------------

export function normaliseCell(
  vendor: string,
  lineNo: number,
  raw: RawQuote | undefined,
  /**
   * The vendor's other extracted rows. Needed because some adjustments depend
   * on a different line of the same response: V2's warranty uplift is a price
   * V2 itself quoted on its invented line 30A, so it is read from the
   * extraction, never hardcoded here and never invented as an assumption.
   */
  vendorRaw?: Record<string, RawQuote>,
  /** The enquiry this cell belongs to. Defaults to the seeded catalog. */
  lines: RfxLine[] = LINES,
): Cell {
  const line = lineByNo(lineNo, lines);
  const flags: string[] = [];
  const trace: NormStep[] = [];

  const out = (status: CellStatus, unitInr: number | null = null, extra: Partial<Cell> = {}): Cell => ({
    vendor,
    lineNo,
    status,
    unitInr,
    extendedInr: unitInr === null ? null : unitInr * line.qty,
    flags,
    trace,
    raw: raw ? { price: raw.price, uom: raw.uom, ccy: raw.ccy } : undefined,
    ...extra,
  });

  if (!raw) {
    flags.push("silently missing: no price, no decline, no mention");
    trace.push({
      rule: "absence",
      basis: "the line is not in the response anywhere",
      result: "absence reported as absence, never as zero",
    });
    return out("omitted");
  }

  // --- paths that yield no comparable number, resolved first ---------------

  if (raw.status === "omitted") {
    flags.push("silently missing: no price, no decline, no mention");
    trace.push({
      rule: "absence",
      basis: "the line is not in the response anywhere",
      result: "absence reported as absence, never as zero",
    });
    return out("omitted");
  }

  if (raw.status === "not_quoted") {
    flags.push("vendor explicitly declined this line");
    trace.push({
      rule: "explicit decline",
      basis: raw.note ?? "marked NQ by the vendor",
      result: "this is an answer, not a gap. No chase needed",
    });
    return out("declined");
  }

  if (raw.status === "illegible") {
    flags.push("a price is present on the source and cannot be read");
    flags.push("buyer action required: open the original");
    trace.push({
      rule: "unreadable",
      basis: raw.note ?? "the value is destroyed on the source document",
      result: "not guessed, not interpolated, not averaged",
    });
    return out("unreadable");
  }

  if (raw.status === "match_rival") {
    flags.push("offer is conditional on another bidder's price");
    flags.push("cannot be ranked, cannot be awarded");
    trace.push({
      rule: "not a price",
      basis: raw.note ?? `vendor offered to match ${raw.rival ?? "a competitor"}`,
      result: "excluded from every scenario",
    });
    return out("non_comparable");
  }

  if (raw.status === "unmapped") {
    flags.push("vendor-created line with no RFx equivalent");
    trace.push({
      rule: "closed-world mapping",
      basis: raw.note ?? "no RFx line matches this item",
      result: "held in the unmapped tray rather than force-fitted onto a line",
    });
    return out("unmapped");
  }

  if (raw.status === "relative") {
    const ref = raw.ref_sku ? PRIOR_PO.rates[raw.ref_sku] : undefined;
    if (ref === undefined) {
      flags.push("priced by reference to data we do not hold");
      trace.push({
        rule: "unresolvable reference",
        basis: raw.note ?? "vendor referred to a prior order",
        result: `no prior-PO rate on file for ${raw.ref_sku ?? "this item"}`,
      });
      return out("unresolvable");
    }
    let value = ref;
    trace.push({
      rule: "prior-PO lookup",
      basis: `${raw.note ?? "vendor referred to a prior order"} | ${PRIOR_PO.po_number} dated ${PRIOR_PO.po_date}`,
      result: `Rs ${ref.toLocaleString("en-IN")} per ${line.uom}`,
    });
    if (raw.basis === "prior_po_uplift") {
      const pct = raw.uplift_pct ?? 0;
      value = Math.round(ref * (1 + pct / 100));
      trace.push({
        rule: `uplift +${pct}%`,
        basis: "vendor's own stated uplift over last year",
        result: `Rs ${value.toLocaleString("en-IN")} per ${line.uom}`,
      });
    }
    flags.push("price derived from a prior PO, not quoted directly");
    flags.push("vendor must confirm before award");
    return out("resolved_from_reference", value, { needsConfirmation: true });
  }

  // --- priced paths --------------------------------------------------------

  // A priced status with no usable number. Either the reader could not produce
  // one, or it produced a zero, which is a scope statement ("included in our
  // laptop prices") rather than a rate. Ranking a zero would make it the
  // cheapest bid on the line automatically, so it needs a person instead.
  if (raw.price === undefined || raw.price === null || raw.price === 0) {
    flags.push(
      `the supplier addressed this line but gave no usable rate. If they meant ` +
      `it is included in another line, that needs confirming before it can be ` +
      `compared; a zero would otherwise win this line automatically.`,
    );
    trace.push({
      rule: "no usable rate",
      basis: `reported as '${raw.status}' with no comparable number`,
      result: "excluded from every total pending a decision",
    });
    return out("needs_review");
  }

  let price = raw.price;
  let unit = raw.uom ?? line.uom;
  const ccy = raw.ccy ?? "INR";

  trace.push({
    rule: "raw value",
    basis: "exactly as the vendor wrote it, kept unchanged forever",
    // Suppliers write units both ways ("nos" but also "per pc"), so the
    // preposition is only added when it is not already there.
    result: `${ccy} ${price.toLocaleString("en-IN")} ${
      /^per\b/i.test(unit) ? unit : `per ${unit}`}`,
  });

  if (raw.handwritten && raw.printed_price !== undefined) {
    flags.push("handwritten override beats the printed price");
    trace.push({
      rule: "pen override",
      basis: `printed Rs ${raw.printed_price.toLocaleString("en-IN")} struck through`,
      result: `Rs ${price.toLocaleString("en-IN")} written in pen governs`,
    });
  }

  // 1. UoM alias (free), then 2. UoM conversion (costs a factor)
  const resolved = canonicalUom(unit, line.uom);
  if (resolved !== unit) {
    trace.push({
      rule: "unit synonym",
      basis: `'${unit}' is a different word for '${line.uom}', from the alias table`,
      result: "no factor applied, number unchanged",
    });
    unit = resolved;
  }
  if (unit !== line.uom) {
    const conv = conversionFor(unit, line.uom);
    if (!conv) {
      flags.push(`quoted per '${unit}', RFx asked per '${line.uom}', no conversion rule`);
      trace.push({
        rule: "no conversion rule",
        basis: `nothing in the rule table maps '${unit}' to '${line.uom}'`,
        result: "refused rather than guessed at a factor",
      });
      return out("needs_review");
    }
    price = price * conv.factor;
    flags.push(
      `unit mismatch: quoted per '${unit}', normalised to '${line.uom}' (x${conv.factor})`,
    );
    trace.push({
      rule: `unit conversion x${conv.factor}`,
      basis: conv.basis,
      result: `${ccy} ${price.toLocaleString("en-IN")} per ${line.uom}`,
    });
  }

  /**
   * An ex-works price is a real number and NOT a landed cost.
   *
   * Customs duty and inbound freight fall on the buyer, and this system
   * deliberately does not estimate them. Ranking such a price against a
   * delivered one understates it by an amount nobody has quantified, so it
   * stays awardable, because it is a genuine offer, but it carries the caveat
   * visibly instead of sitting in the grid looking like a like-for-like number.
   *
   * Checked BEFORE and INDEPENDENTLY of currency. It used to live inside the
   * USD branch, which worked perfectly for the one supplier in this corpus who
   * quotes ex-works in dollars, and silently passed an ex-works price quoted in
   * rupees straight through as a delivered cost. A domestic ex-works quote is
   * ordinary in Indian procurement, so that is not a corner case.
   */
  let exWorks = false;
  if ((raw.note ?? "").toLowerCase().includes("ex-works")) {
    exWorks = true;
    flags.push(
      "ex-works: customs duty and inbound freight are excluded and fall on you, so " +
      "this is NOT a delivered cost and is not directly comparable with a " +
      "FOR-destination price",
    );
  }

  // 3. Currency
  if (ccy === "USD") {
    const fx = fxRate();
    price = Math.round(price * fx);
    flags.push(`converted from USD at ${fx} (vendor's own stated reference rate)`);
    trace.push({
      rule: `FX x${fx}`,
      basis: String(ASSUMPTIONS.fx_usd_inr.source),
      result: `INR ${price.toLocaleString("en-IN")}`,
    });

  }

  // 4. Scope: put a partial offer onto the same footing as a complete one.
  //
  //    Driven entirely by the response: the supplier's own row says its price
  //    excludes something and names the label under which they quoted it. No
  //    vendor code, no line numbers, no knowledge of this particular corpus.
  if (raw.scope_uplift_ref) {
    const ref = String(raw.scope_uplift_ref);
    const upliftRow = vendorRaw?.[ref];
    const what = raw.scope_uplift_note ?? "scope the enquiry asked for";
    if (upliftRow?.price === undefined || upliftRow.price === null) {
      // Without the supplier's own figure we cannot put this line on the same
      // footing as the other bids, and we will not guess at it.
      flags.push(
        `this price excludes ${what}, which the supplier quoted separately at ` +
        `their line ${ref}. That line was not found in the response, so this ` +
        `cannot be compared with bids that include it.`,
      );
      trace.push({
        rule: "scope adjustment unavailable",
        basis: `supplier's line ${ref} carries the uplift and was not extracted`,
        result: "refused rather than compared on an unequal basis",
      });
      return out("needs_review");
    }
    // The uplift is a price the supplier quoted, so it carries its own currency.
    // Adding a USD figure to an INR one without converting would understate the
    // adjustment by a factor of about eighty-eight.
    let uplift = upliftRow.price;
    if (upliftRow.ccy === "USD") {
      const fx = fxRate();
      uplift = Math.round(uplift * fx);
      flags.push(`the uplift at line ${ref} was quoted in USD, converted at ${fx}`);
    }
    price += uplift;
    flags.push(
      `scope: +Rs ${uplift.toLocaleString("en-IN")} for ${what} (supplier's own ` +
      `line ${ref}), added so this is comparable with bids that include it`,
    );
    trace.push({
      rule: `scope adjustment +Rs ${uplift.toLocaleString("en-IN")}`,
      basis: `supplier priced ${what} separately at their line ${ref}`,
      result: `Rs ${price.toLocaleString("en-IN")} per ${line.uom}`,
    });
  }

  // 5. Quantity. The rate always applies to the ASKED quantity; a vendor's own
  //    quantity is carried as a flag, never silently absorbed into a total.
  if (raw.qty_override !== undefined) {
    flags.push(
      `vendor quoted ${raw.qty_override} ${line.uom} against ${line.qty} asked; ` +
      `rate applied to asked quantity`,
    );
  }

  if (raw.status === "substituted" && raw.offered) {
    flags.push(`substitution, supplier offered: ${raw.offered}`);
  }
  if (raw.status === "downgraded" && raw.offered) {
    flags.push(`below spec, supplier offered: ${raw.offered}`);
  }
  if (raw.note && ["downgraded", "bundled", "moq_adjusted", "quoted"].includes(raw.status)) {
    /**
     * Attribute it. The note is the SUPPLIER's words, and the rest of this
     * array is the system's own findings. Mixing them unlabelled means a
     * supplier can write a sentence that reaches the analyst looking like a
     * conclusion the tool reached, which is a free channel into the reasoning
     * for anyone with four crore riding on the outcome.
     */
    flags.push(`Supplier's note: ${raw.note}`);
  }

  trace.push({
    rule: "landed",
    basis: "comparable against every other bid on this line",
    result: `Rs ${price.toLocaleString("en-IN")} per ${line.uom}, ex-GST`,
  });

  // A number we had to ADJUST is not a like-for-like number, whatever the
  // supplier's own status said. Found by pointing the scope rule at a supplier
  // outside this corpus: the arithmetic was right and the cell came back with a
  // clean tick, because the caveat had been riding on the raw status rather
  // than on the fact that an adjustment happened.
  const status: CellStatus =
    raw.status === "substituted" || raw.status === "downgraded" || exWorks ||
    Boolean(raw.scope_uplift_ref)
      ? "comparable_with_caveat"
      : "comparable";

  return out(status, price);
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

export type Matrix = Record<string, Record<number, Cell>>;

/**
 * WHICH enquiry are we computing over.
 *
 * The calculator used to close over the seeded catalog, which meant the whole
 * comparison silently assumed 30 IT-hardware lines and five named suppliers.
 * That is fine for the built-in demo and wrong the moment anyone drafts their
 * own enquiry or sends a sixth supplier's quote: their rows would be read
 * against the wrong line list and their column would never render.
 *
 * So the line list, the supplier list and the qualification verdicts are now an
 * ARGUMENT, defaulting to the seeded catalog. Every caller that passes nothing
 * behaves exactly as before, which is what keeps the conformance suite honest:
 * it still calls these with no context and still compares against the Python
 * reference, so the default path is proven unchanged.
 */
export interface RfxContext {
  lines: RfxLine[];
  vendors: Array<{ code: string }>;
  qualification: Record<string, { qualified: boolean }>;
}

export const defaultContext = (): RfxContext => ({
  lines: LINES,
  vendors: VENDORS,
  qualification: QUALIFICATION as unknown as RfxContext["qualification"],
});

export function buildMatrix(
  rawByVendor: Record<string, Record<string, RawQuote>>,
  ctx: RfxContext = defaultContext(),
): Matrix {
  const m: Matrix = {};
  for (const v of ctx.vendors) {
    const rows: Record<number, Cell> = {};
    const vq = rawByVendor[v.code] ?? {};

    /**
     * Nothing at all from this supplier: WE have not read them.
     *
     * Distinct from `omitted`, which means we read their document and this line
     * was not in it. The grid used to render both identically, so a supplier
     * whose file nobody had opened showed thirty cells saying "they never
     * mentioned it. Worth chasing" — blaming them for our own inaction, and
     * inviting a buyer to chase somebody who has done nothing wrong.
     *
     * The same distinction the questionnaire makes between "failed" and "not
     * read", which I built there and did not build here.
     */
    const unread = Object.keys(vq).length === 0;

    for (const line of ctx.lines) {
      if (unread) {
        rows[line.no] = {
          vendor: v.code, lineNo: line.no, status: "not_read",
          unitInr: null, extendedInr: null,
          flags: ["nothing has been read from this supplier yet"],
          trace: [{
            rule: "not read",
            basis: "no response from this supplier has been extracted",
            result: "no cell, and no claim about what they did or did not quote",
          }],
        };
        continue;
      }
      // A vendor may state a blanket fallback ("rest we'll match Zenith").
      const raw = vq[String(line.no)] ?? vq["_default"];
      rows[line.no] = normaliseCell(v.code, line.no, raw, vq, ctx.lines);
    }
    m[v.code] = rows;
  }
  return m;
}

export function cellStatusCounts(
  m: Matrix, ctx: RfxContext = defaultContext(),
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of Object.keys(m)) {
    for (const line of ctx.lines) {
      const s = m[v][line.no].status;
      counts[s] = (counts[s] ?? 0) + 1;
    }
  }
  return counts;
}

export function trustSummary(m: Matrix, ctx: RfxContext = defaultContext()) {
  const counts = cellStatusCounts(m, ctx);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const n = (k: string) => counts[k] ?? 0;

  /**
   * Three groups that do not overlap.
   *
   * The earlier version counted `comparable_with_caveat` in BOTH "awardable"
   * and "needs a human", so the trust bar said "107 awardable" beside "12 need
   * you" while 8 of those 12 were inside the 107. A buyer reading it would
   * conclude 12 cells were excluded when most were counted. Overlapping counts
   * on a trust bar are precisely the kind of quietly wrong number this product
   * exists to catch, so the groups are now disjoint and each is named for what
   * it means to the buyer.
   */
  const clean = n("comparable");
  const withCaveat = n("comparable_with_caveat");
  const awardable = clean + withCaveat;

  // Blocked, and blocked on DIFFERENT people. A cell derived from a prior
  // order is waiting on the supplier to confirm it; a cell that needs review or
  // could not be read is waiting on the buyer. Rolling them together produced a
  // trust bar that said "5 blocked on you" beside "3 awaiting supplier
  // confirmation", where 3 of the 5 WERE the 3. Found by the end-to-end suite
  // summing the parts and getting 154 out of 150.
  const awaitingSupplier = n("resolved_from_reference");
  const awaitingBuyer = n("needs_review");
  // A price exists on the source and could not be read.
  const unreadable = n("unreadable");
  // No number exists at all: declined, silently missing, or not a price.
  const noPrice = n("declined") + n("omitted") + n("non_comparable")
    + n("unresolvable") + n("unmapped");
  // Its own bucket, deliberately. Folding it into "no price" would put our own
  // inaction in the same column as a supplier's decline.
  const notRead = n("not_read");

  return {
    total,
    /** In every total. */
    usable: awardable,
    /** Counted, but the offer deviates from spec, so worth your eye. */
    awardableWithCaveat: withCaveat,
    /** Not in any total. */
    excluded: total - awardable,
    /** Derived from a prior order, waiting on the SUPPLIER to confirm. */
    derivedAwaitingVendor: awaitingSupplier,
    unreadable,
    noPrice,
    /** Cells where nothing has been read yet. Ours to fix, not theirs. */
    notRead,
    /**
     * Cells the BUYER must act on before they can be used.
     *
     * Disjoint from `derivedAwaitingVendor`, and from `usable`: the caveat
     * cells are already inside the total and are surfaced separately as
     * `awardableWithCaveat`. So usable + needsHuman + derivedAwaitingVendor +
     * noPrice === total, which the end-to-end suite asserts on every run.
     */
    needsHuman: awaitingBuyer + unreadable,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Award scenarios
// ---------------------------------------------------------------------------

export interface Scenario {
  key: string;
  label: string;
  picks: Record<number, { vendor: string; unitInr: number; extendedInr: number }>;
  totalInr: number;
  linesAwarded: number;
  unfilledLines: number[];
}

export function cheapestPerLine(
  m: Matrix,
  vendorCodes: string[],
  opts: {
    excludeCaveats?: boolean;
    /** Opt in to prices derived from a prior PO that the vendor has not confirmed. */
    includeUnconfirmed?: boolean;
    key?: string;
    label?: string;
    ctx?: RfxContext;
  } = {},
): Scenario {
  const picks: Scenario["picks"] = {};
  const unfilled: number[] = [];
  const ctx = opts.ctx ?? defaultContext();

  for (const line of ctx.lines) {
    let best: number | null = null;
    let bestVendor: string | null = null;
    for (const vc of vendorCodes) {
      const cell = m[vc]?.[line.no];
      if (!cell || cell.unitInr === null) continue;
      if (!isAwardable(cell.status, opts.includeUnconfirmed)) continue;
      if (opts.excludeCaveats && cell.status === "comparable_with_caveat") continue;
      if (best === null || cell.unitInr < best) {
        best = cell.unitInr;
        bestVendor = vc;
      }
    }
    if (best === null || bestVendor === null) unfilled.push(line.no);
    else picks[line.no] = { vendor: bestVendor, unitInr: best, extendedInr: best * line.qty };
  }

  const totalInr = Object.values(picks).reduce((a, p) => a + p.extendedInr, 0);
  return {
    key: opts.key ?? "cheapest",
    label: opts.label ?? "Cheapest per line",
    picks,
    totalInr,
    linesAwarded: Object.keys(picks).length,
    unfilledLines: unfilled,
  };
}

export function singleVendor(
  m: Matrix, vc: string, includeUnconfirmed = false,
  ctx: RfxContext = defaultContext(),
) {
  let total = 0;
  const missing: number[] = [];
  let priced = 0;
  for (const line of ctx.lines) {
    const cell = m[vc]?.[line.no];
    if (!cell || cell.unitInr === null || !isAwardable(cell.status, includeUnconfirmed)) {
      missing.push(line.no);
      continue;
    }
    total += cell.extendedInr as number;
    priced += 1;
  }
  const discPct = TERMS[vc]?.total_level_discount_pct as number | undefined;

  /**
   * A total-level discount conditional on the COMPLETE scope must not be
   * applied to a partial award.
   *
   * Zenith states its 2.5% is "available only if the complete scope is awarded
   * to us". Applying it to a 27-line award would quote the buyer a discount the
   * supplier has not offered, which is the same class of error as inventing a
   * price.
   */
  const discountApplies = Boolean(discPct) && missing.length === 0;

  return {
    vendor: vc,
    totalInr: total,
    totalAfterStatedDiscountInr: discountApplies
      ? Math.round(total * (1 - (discPct as number) / 100))
      : total,
    totalLevelDiscountPct: discPct ?? null,
    totalLevelDiscountApplied: discountApplies,
    totalLevelDiscountWithheldReason: discPct && missing.length
      ? `the stated ${discPct}% discount requires the complete scope, and ` +
        `${missing.length} line(s) are unpriced, so it has not been applied`
      : null,
    linesPriced: priced,
    missingLines: missing,
    complete: missing.length === 0,
    /**
     * Whole-bid totals are only comparable between suppliers who priced the
     * same lines. Cygnus priced 27 of 30, so their total is smaller partly
     * because it buys less.
     */
    comparableToOtherVendors: missing.length === 0,
  };
}

/**
 * The guard the dataset taught us.
 *
 * Two scenario totals are only comparable over the lines BOTH could fill.
 * Strict compliance appears to SAVE Rs 30 lakh against plain compliance, purely
 * because it awards 29 lines instead of 30. Both totals are individually
 * correct, which is exactly why a careful human reviewer misses it.
 *
 * So the engine refuses to rank scenarios without restating them on their
 * common line set, and callers must surface the coverage difference BEFORE the
 * money difference.
 */
export function likeForLike(scenarios: Scenario[]) {
  const sets = scenarios.map((s) => new Set(Object.keys(s.picks).map(Number)));
  const common = sets.length
    ? [...sets[0]].filter((n) => sets.every((set) => set.has(n))).sort((a, b) => a - b)
    : [];
  const union = new Set(sets.flatMap((set) => [...set]));

  const restated = scenarios.map((s) => ({
    key: s.key,
    label: s.label,
    headlineTotalInr: s.totalInr,
    linesAwarded: s.linesAwarded,
    likeForLikeTotalInr: common.reduce((a, n) => a + s.picks[n].extendedInr, 0),
    couldNotFill: s.unfilledLines,
    /** Lines this scenario covers that at least one other does not. */
    coversUniquely: [...sets[scenarios.indexOf(s)]]
      .filter((n) => !common.includes(n)).sort((a, b) => a - b),
  }));

  /**
   * Coverage differs if the line SETS differ, not if the counts differ.
   *
   * Counting was the original test and it defeated the whole guard: two
   * scenarios that each award 25 lines, but 25 DIFFERENT lines, have identical
   * counts and nothing in common, and a count-based check would have declared
   * their totals directly comparable. Refusing exactly that comparison is the
   * only reason this function exists.
   */
  const coverageDiffers = sets.length > 1
    && sets.some((set) => set.size !== sets[0].size || [...set].some((n) => !sets[0].has(n)));

  const commonShare = union.size ? common.length / union.size : 0;

  return {
    commonLines: common,
    linesInCommonBasis: common.length,
    linesInAnyScenario: union.size,
    /** How much of the enquiry the common basis represents. */
    commonBasisShare: commonShare,
    scenarios: restated,
    coverageDiffers,
    /**
     * A like-for-like total over a small shared basis is arithmetically valid
     * and practically useless. Say so rather than presenting it as an answer.
     */
    commonBasisTooThin: coverageDiffers && commonShare < 0.5,
    warning: !coverageDiffers
      ? null
      : commonShare < 0.5
        ? `These scenarios cover different lines and share only ${common.length} of ` +
          `${union.size}. Neither the headline totals nor the like-for-like totals ` +
          `answer which is better value: they are not measuring the same purchase.`
        : `These scenarios cover different lines. Their headline totals are not ` +
          `comparable. Compare the like-for-like column, restated on the ` +
          `${common.length} lines they all fill, and read the coverage difference first.`,
  };
}

/** The demo's money moment, computed rather than asserted. */
export function costOfCompliance(m: Matrix, ctx: RfxContext = defaultContext()) {
  const all = ctx.vendors.map((v) => v.code);
  const qualified = all.filter((c) => ctx.qualification[c]?.qualified);

  const naive = cheapestPerLine(m, all, {
    key: "all_vendors",
    label: "Cheapest per line, all vendors",
    ctx,
  });
  const compliant = cheapestPerLine(m, qualified, {
    key: "qualified_only",
    label: "Cheapest per line, qualified vendors only",
    ctx,
  });

  const deltaInr = compliant.totalInr - naive.totalInr;
  return {
    naive,
    compliant,
    qualifiedVendors: qualified,
    disqualifiedVendors: all.filter((c) => !ctx.qualification[c]?.qualified),
    deltaInr,
    deltaPct: naive.totalInr ? (deltaInr / naive.totalInr) * 100 : 0,
    likeForLike: likeForLike([naive, compliant]),
  };
}

// ---------------------------------------------------------------------------
// Formatting. Indian digit grouping, because the audience reads lakh and crore.
// ---------------------------------------------------------------------------

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
}
