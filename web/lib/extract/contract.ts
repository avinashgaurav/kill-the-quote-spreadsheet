/**
 * The extraction contract.
 *
 * This is the only shape an extractor may return, and it is enforced two ways:
 * the model is given it as a `strict: true` tool schema so its arguments
 * validate exactly, and the result is parsed with Zod before anything touches
 * the database.
 *
 * Three rules are built into the shape rather than asked for in prose:
 *
 * 1. CLOSED WORLD. `rfxLineNo` may only be a line number that exists in the
 *    RFx, or null. A vendor item that matches nothing goes to the unmapped
 *    tray. There is no way to express "I forced this onto line 30".
 *
 * 2. NO VALUE WITHOUT A SOURCE. `provenance` is required on every row, and the
 *    database column is NOT NULL as well. A price with no locator cannot be
 *    represented and cannot be stored.
 *
 * 3. ABSENCE IS TYPED. `omitted`, `not_quoted` and `illegible` are three
 *    different statuses because they mean three different things to a buyer:
 *    chase the vendor, accept the answer, open the original. A single "missing"
 *    would collapse the distinction, and that collapse is how a comparison
 *    sheet lies.
 */

import { z } from "zod";

/**
 * A field that may be absent OR explicitly null, normalised to null.
 *
 * This matters more than it looks. A reader that omits `supersedesRef` means
 * exactly what a reader that sends `null` means: there is no supersession. But
 * a plain `.nullable()` accepts the second and rejects the first, so an
 * otherwise perfect read of thirty lines fails wholesale because one optional
 * key was left out. Anthropic's `strict: true` fills every key; other providers
 * routinely omit nulls, and being intolerant of that is our bug, not theirs.
 *
 * Found by running the pipeline against a second provider, which is the value
 * of having a second provider at all.
 */
const maybe = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v) => (v === undefined ? null : v));

// ---------------------------------------------------------------------------
// Statuses the extractor may report. Deliberately about what the DOCUMENT
// says, never about what the number means once normalised.
// ---------------------------------------------------------------------------

export const RAW_STATUSES = [
  "quoted",        // a plain explicit price
  "substituted",   // priced, but against a different make or model
  "downgraded",    // priced, but against a lower spec than asked
  "uom_mismatch",  // priced in a different unit than asked
  "bundled",       // priced, but qty differs due to free goods
  "moq_adjusted",  // priced, but qty raised to the vendor's minimum
  "relative",      // no absolute price: refers to a prior PO or an uplift
  "match_rival",   // no price: offers to match another bidder
  "illegible",     // a price is present on the source and cannot be read
  "not_quoted",    // the vendor explicitly declined
  "omitted",       // silently absent, no mention anywhere
] as const;

export type RawStatus = (typeof RAW_STATUSES)[number];

// ---------------------------------------------------------------------------

export const provenanceSchema = z.object({
  /**
   * Where this came from, in whatever form the format allows:
   *   xlsx   "Quotation!G14"
   *   pdf    "p1, table row 12"  (plus citations from the API)
   *   docx   "para 7"
   *   email  "body line 4"
   *   photo  "bbox 0.62,0.31,0.78,0.34"  (normalised x0,y0,x1,y1)
   */
  locator: z.string().min(1),
  /** The vendor's own words, verbatim. Never a paraphrase. */
  citedText: z.string().min(1),
  method: z.string().transform((m) =>
    ["xlsx_cell", "pdf_text", "docx_prose", "email_text", "vision_bbox", "test_fixture"]
      .includes(m) ? m : "other"),
  /** 1-indexed, PDFs only. */
  page: maybe(z.number().int().positive()),
});

export type Provenance = z.infer<typeof provenanceSchema>;

export const extractedRowSchema = z.object({
  /**
   * The RFx line this belongs to, or null if it matches nothing. Validated
   * against the real catalog after parsing: a hallucinated line number is
   * rejected, not trusted.
   */
  rfxLineNo: z.number().int().positive().nullable(),
  /** What the vendor called it. Kept so a human can check the match. */
  vendorDescription: z.string(),
  status: z.enum(RAW_STATUSES),

  price: maybe(z.number()),
  uom: maybe(z.string()),
  currency: maybe(z.string()),
  qty: maybe(z.number().int()),

  /** A printed value that a pen annotation struck through. */
  printedPrice: maybe(z.number()),
  handwritten: z.boolean().nullish().transform((v) => Boolean(v)),

  offeredMakeModel: maybe(z.string()),
  /** Anything the vendor said about this line that a buyer would want. */
  note: maybe(z.string()),

  /**
   * This price leaves something out that the enquiry asked for, and the
   * supplier quoted that something separately under this label.
   *
   * "Price includes 1-year warranty. 3-year onsite uplift at our line 30A"
   *   -> scopeUpliftRef: "30A", scopeUpliftNote: "years 1-3 onsite cover"
   *
   * The calculator adds the two together before ranking, so a partial offer is
   * not compared against a complete one. Reported, never resolved here: the
   * reader says what the document says and the arithmetic happens in code.
   */
  scopeUpliftRef: maybe(z.string()),
  scopeUpliftNote: maybe(z.string()),

  /**
   * For a price expressed as a pointer rather than a number.
   * "Same as our March PO" -> { basis: "prior_po", refSku: "MON-24" }
   * "6% over last year"    -> { basis: "prior_po_uplift", refSku: "SW-48P", upliftPct: 6 }
   * "we'll match Zenith"   -> { basis: "match_rival", rival: "Zenith" }
   */
  reference: maybe(z.object({
    basis: z.enum(["prior_po", "prior_po_uplift", "match_rival", "other"]),
    refSku: maybe(z.string()),
    upliftPct: maybe(z.number()),
    rival: maybe(z.string()),
  })),

  /**
   * The model's OWN confidence that it read this correctly, 0 to 1.
   * Not a proxy computed from anything else. Used to gate cells into review,
   * so an inflated value here is a real failure and is checked against the
   * ground-truth answer key in the accuracy harness.
   */
  confidence: z.number().min(0).max(1).nullish().transform((v) => v ?? 0.5),

  provenance: provenanceSchema,
});

export type ExtractedRow = z.infer<typeof extractedRowSchema>;

export const conditionalDiscountSchema = z.object({
  percent: maybe(z.number()),
  amountInr: maybe(z.number()),
  scope: z.string(),
  /** What it depends on. This is why it never enters a ranked comparison. */
  condition: z.string(),
  provenance: provenanceSchema,
});

export const extractionSchema = z.object({
  /** The vendor's own quotation number, if the document carries one. */
  vendorRef: maybe(z.string()),
  /** Set when the document says it supersedes an earlier quotation. */
  supersedesRef: maybe(z.string()),
  revisionNote: maybe(z.string()),

  rows: z.array(extractedRowSchema).nullish().transform((v) => v ?? []),

  /**
   * A statement covering every line the vendor did not price individually.
   * Belongs to the response, not to a line, and without it those lines read as
   * silently omitted when the vendor in fact addressed them.
   */
  blanketFallback: maybe(z.object({
    status: z.enum(RAW_STATUSES),
    note: z.string(),
    rival: maybe(z.string()),
    provenance: provenanceSchema,
  })),

  terms: z.object({
    gst: maybe(z.string()),
    freight: maybe(z.string()),
    payment: maybe(z.string()),
    validity: maybe(z.string()),
    delivery: maybe(z.string()),
    /** A rate the vendor stated for its own currency conversion. */
    fxReference: maybe(z.number()),
    fxNote: maybe(z.string()),
    /** A discount applied only to the grand total, not to any line. */
    totalLevelDiscountPercent: maybe(z.number()),
    notes: maybe(z.string()),
  }).nullish().transform((v) => v ?? {
    gst: null, freight: null, payment: null, validity: null, delivery: null,
    fxReference: null, fxNote: null, totalLevelDiscountPercent: null, notes: null,
  }),

  conditionalDiscounts: z.array(conditionalDiscountSchema).nullish()
    .transform((v) => v ?? []),

  /**
   * The vendor's own stated grand total, if present. Never used as a source of
   * truth: it is compared against the sum of the lines, and a disagreement is
   * surfaced rather than reconciled silently.
   */
  statedTotal: z.object({
    amount: maybe(z.number()),
    currency: maybe(z.string()),
    basis: maybe(z.string()),
  }).nullish().transform((v) => v ?? { amount: null, currency: null, basis: null }),

  /** Anything the reader could not read at all, in its own words. */
  unreadableRegions: z.array(z.string()).nullish().transform((v) => v ?? []),
});

export type Extraction = z.infer<typeof extractionSchema>;

// ---------------------------------------------------------------------------
// The tool the model calls.
//
// Written as explicit JSON Schema rather than generated from Zod, because
// `strict: true` requires `additionalProperties: false` and every key listed
// in `required`, and hand-writing it makes that visible instead of hoping a
// converter got it right.
// ---------------------------------------------------------------------------

const provenanceJson = {
  type: "object",
  additionalProperties: false,
  required: ["locator", "citedText", "method"],
  properties: {
    locator: {
      type: "string",
      description:
        "Exactly where this came from. Excel: 'SheetName!G14'. PDF: 'p2, line item row 12'. " +
        "Word: 'para 7'. Email: 'body line 4'. Photo: 'bbox x0,y0,x1,y1' as four " +
        "numbers between 0 and 1 giving the fraction across and down the image.",
    },
    citedText: {
      type: "string",
      description:
        "The vendor's own words for this value, verbatim and unedited. Never a paraphrase. " +
        "For a spreadsheet cell, the cell's literal contents.",
    },
    method: {
      type: "string",
      enum: ["xlsx_cell", "pdf_text", "docx_prose", "email_text", "vision_bbox"],
    },
    page: { type: ["integer", "null"], description: "1-indexed page, PDFs only." },
  },
} as const;

export const EXTRACTION_TOOL = {
  name: "report_extraction",
  description:
    "Report every commercial fact found in this vendor response. Call this exactly once, " +
    "after reading the whole document.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "vendorRef", "supersedesRef", "revisionNote", "rows", "blanketFallback",
      "terms", "conditionalDiscounts", "statedTotal", "unreadableRegions",
    ],
    properties: {
      vendorRef: { type: ["string", "null"], description: "The vendor's own quotation number." },
      supersedesRef: {
        type: ["string", "null"],
        description: "If this document says it replaces an earlier quotation, that quotation's number.",
      },
      revisionNote: { type: ["string", "null"] },

      rows: {
        type: "array",
        description:
          "One entry per item the vendor addressed. Include an entry for items the vendor " +
          "explicitly declined (status not_quoted). Do NOT invent entries for items the " +
          "document does not mention at all: silence is handled elsewhere.",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "rfxLineNo", "vendorDescription", "status", "price", "uom", "currency",
            "qty", "printedPrice", "handwritten", "offeredMakeModel", "note",
            "scopeUpliftRef", "scopeUpliftNote",
            "confidence", "provenance", "reference",
          ],
          properties: {
            rfxLineNo: {
              type: ["integer", "null"],
              description:
                "The RFx line number this matches. Use null if it matches no RFx line, " +
                "including when the vendor invented an extra line. NEVER force a vendor " +
                "item onto the nearest line: a null here is correct and useful, a wrong " +
                "line number corrupts the comparison.",
            },
            scopeUpliftRef: {
              type: ["string", "null"],
              description:
                "Set ONLY when this line's price leaves out something the enquiry asked " +
                "for AND the vendor quoted that something separately somewhere else in " +
                "this same document. Put the vendor's own label for that other line here, " +
                "e.g. \"30A\". Example: \"price includes 1 year warranty, 3-year onsite " +
                "uplift quoted at line 30A\". Do NOT add the two numbers together; report " +
                "the pointer and the arithmetic is done afterwards in code.",
            },
            scopeUpliftNote: {
              type: ["string", "null"],
              description:
                "What that separately-quoted item covers, in the vendor's words, e.g. " +
                "\"years 2 and 3 onsite cover\". Null when scopeUpliftRef is null.",
            },
            vendorDescription: {
              type: "string",
              description: "How the vendor described the item, in their words.",
            },
            status: {
              type: "string",
              enum: RAW_STATUSES as unknown as string[],
              description:
                "quoted: a plain price. substituted: priced against a different make/model. " +
                "downgraded: priced against a lower spec than asked. uom_mismatch: priced " +
                "in a different unit than asked (per piece against a per-box line). " +
                "bundled: qty differs because of free goods. moq_adjusted: qty raised to " +
                "the vendor's minimum. relative: no absolute price, refers to a prior order " +
                "or a percentage uplift. match_rival: no price, offers to match a competitor. " +
                "illegible: a price is clearly present and you cannot read it. not_quoted: " +
                "the vendor explicitly declined. Choose illegible over guessing.",
            },
            price: {
              type: ["number", "null"],
              description:
                "The number as the vendor wrote it, in THEIR unit and THEIR currency. Do not " +
                "convert, do not multiply by pack size, do not apply any discount. " +
                "Normalisation happens in code afterwards. If a handwritten value overrides " +
                "a printed one, this is the handwritten value.",
            },
            uom: {
              type: ["string", "null"],
              description:
                "The unit the vendor priced in, in their words: 'nos', 'per pc', 'per DIMM', " +
                "'box of 10', 'kit'. This is one of the most important fields in the whole " +
                "extraction: a correct price against a wrong unit is worse than no price.",
            },
            currency: { type: ["string", "null"], description: "ISO code, e.g. INR or USD." },
            qty: {
              type: ["integer", "null"],
              description: "The quantity the VENDOR quoted, if they changed it from the asked quantity.",
            },
            printedPrice: {
              type: ["number", "null"],
              description: "If a printed price was struck through and replaced by hand, the printed one.",
            },
            handwritten: {
              type: "boolean",
              description: "True if the governing value was written or altered by hand.",
            },
            offeredMakeModel: {
              type: ["string", "null"],
              description: "The make and model actually offered, when it differs from what was asked.",
            },
            note: {
              type: ["string", "null"],
              description:
                "Anything the vendor said about this line that a buyer needs: minimum order " +
                "quantities, free goods, warranty scope, lead times, conditions.",
            },
            confidence: {
              type: "number",
              description:
                "Your own confidence you read this correctly, 0 to 1. Be honest and be " +
                "willing to be low. A confidently wrong number is the single most damaging " +
                "output this system can produce, because the buyer has no way to catch it. " +
                "Below roughly 0.8 the value is routed to a human, which is a good outcome, " +
                "not a failure.",
            },
            provenance: provenanceJson,
            reference: {
              type: ["object", "null"],
              additionalProperties: false,
              required: ["basis", "refSku", "upliftPct", "rival"],
              description:
                "Fill this in ONLY when the price is a pointer rather than a number. " +
                "'Same as our March PO' -> basis prior_po with the refSku it points at. " +
                "'6% over last year' -> basis prior_po_uplift with refSku and upliftPct. " +
                "'we will match <competitor>' -> basis match_rival with rival named. " +
                "Without this the pointer cannot be resolved and the line is lost.",
              properties: {
                basis: {
                  type: "string",
                  enum: ["prior_po", "prior_po_uplift", "match_rival", "other"],
                },
                refSku: {
                  type: ["string", "null"],
                  description: "The RFx SKU code the reference points at, e.g. 'MON-24'.",
                },
                upliftPct: { type: ["number", "null"] },
                rival: { type: ["string", "null"] },
              },
            },
          },
        },
      },

      blanketFallback: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["status", "note", "rival", "provenance"],
        description:
          "A single statement the vendor made covering every line they did not price " +
          "individually, e.g. 'rest we will match Zenith' or 'all other items as per " +
          "our standard rate card'. Report it here rather than repeating it on 25 rows. " +
          "Leave null if the vendor made no such statement. This matters: without it " +
          "those lines look silently omitted, when the vendor did address them.",
        properties: {
          status: { type: "string", enum: RAW_STATUSES as unknown as string[] },
          note: { type: "string" },
          rival: { type: ["string", "null"] },
          provenance: provenanceJson,
        },
      },

      terms: {
        type: "object",
        additionalProperties: false,
        required: [
          "gst", "freight", "payment", "validity", "delivery", "fxReference",
          "fxNote", "totalLevelDiscountPercent", "notes",
        ],
        properties: {
          gst: { type: ["string", "null"], description: "Tax treatment in the vendor's words." },
          freight: { type: ["string", "null"], description: "Delivery basis, e.g. ex-works or FOR destination." },
          payment: { type: ["string", "null"] },
          validity: { type: ["string", "null"] },
          delivery: { type: ["string", "null"] },
          fxReference: {
            type: ["number", "null"],
            description: "Any exchange rate the vendor stated for their own conversion.",
          },
          fxNote: {
            type: ["string", "null"],
            description: "What the vendor said about when and how conversion happens.",
          },
          totalLevelDiscountPercent: {
            type: ["number", "null"],
            description:
              "A discount applied ONLY to the grand total and not attributable to any line. " +
              "Report it here, not on the rows.",
          },
          notes: { type: ["string", "null"] },
        },
      },

      conditionalDiscounts: {
        type: "array",
        description:
          "Every discount that depends on something: an approval the vendor does not yet hold, " +
          "an order date, a competitor's price, or an all-or-nothing award. Check footnotes " +
          "and handwritten margin notes carefully, which is usually where these live.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["percent", "amountInr", "scope", "condition", "provenance"],
          properties: {
            percent: { type: ["number", "null"] },
            amountInr: { type: ["number", "null"] },
            scope: { type: "string", description: "Which lines or items it applies to." },
            condition: { type: "string", description: "Exactly what it depends on." },
            provenance: provenanceJson,
          },
        },
      },

      statedTotal: {
        type: "object",
        additionalProperties: false,
        required: ["amount", "currency", "basis"],
        properties: {
          amount: {
            type: ["number", "null"],
            description:
              "The grand total the vendor themselves stated. Report it even if it does not " +
              "match the sum of their own lines: that disagreement is a finding.",
          },
          currency: { type: ["string", "null"] },
          basis: { type: ["string", "null"], description: "e.g. 'ex-GST' or 'inclusive of GST'." },
        },
      },

      unreadableRegions: {
        type: "array",
        description:
          "Plain descriptions of anything on the document you could not read, and why: glare, " +
          "blur, a cut-off edge, an obscured corner. Say so here rather than guessing.",
        items: { type: "string" },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Post-parse validation. The tool schema constrains shape; this constrains
// meaning, which a schema cannot.
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  severity: "reject" | "downgrade";
  rowIndex: number;
  reason: string;
}

/**
 * Check an extraction against the real world.
 *
 * `strict: true` guarantees the arguments match the schema. It does not
 * guarantee the line number exists, or that a price came with a unit, or that
 * a status claiming a price actually carries one. Those are semantic and get
 * checked here, in code, before anything is stored.
 */
export function validateExtraction(
  extraction: Extraction,
  validLineNos: ReadonlySet<number>,
): { issues: ValidationIssue[]; rows: ExtractedRow[] } {
  const issues: ValidationIssue[] = [];
  const rows: ExtractedRow[] = [];

  const PRICED: RawStatus[] = [
    "quoted", "substituted", "downgraded", "uom_mismatch", "bundled", "moq_adjusted",
  ];

  extraction.rows.forEach((row, i) => {
    // A line number that is not in the RFx is a hallucination. Send it to the
    // unmapped tray rather than trusting it.
    if (row.rfxLineNo !== null && !validLineNos.has(row.rfxLineNo)) {
      issues.push({
        severity: "downgrade",
        rowIndex: i,
        reason:
          `reported RFx line ${row.rfxLineNo}, which does not exist in this RFx. ` +
          `Moved to the unmapped tray.`,
      });
      rows.push({ ...row, rfxLineNo: null });
      return;
    }

    // A status that claims a price must carry one, with a unit.
    if (PRICED.includes(row.status)) {
      if (row.price === null) {
        issues.push({
          severity: "downgrade",
          rowIndex: i,
          reason: `status '${row.status}' implies a price but none was returned. Treated as illegible.`,
        });
        rows.push({ ...row, status: "illegible" });
        return;
      }
      if (row.uom === null) {
        issues.push({
          severity: "downgrade",
          rowIndex: i,
          reason:
            `a price of ${row.price} was returned with no unit. A price without a unit ` +
            `cannot be compared, so this is routed to review rather than assumed.`,
        });
        rows.push({ ...row, confidence: Math.min(row.confidence, 0.4) });
        return;
      }
      if (row.price < 0) {
        issues.push({ severity: "reject", rowIndex: i, reason: `negative price ${row.price}` });
        return;
      }
      if (row.price === 0) {
        // A zero is almost never a rate. It is usually a scope statement
        // ("included in our laptop prices", "no charge", "free of cost"), and
        // ranking it as a price makes it the cheapest bid on that line every
        // single time, which hands a supplier a line they never quoted.
        issues.push({
          severity: "downgrade",
          rowIndex: i,
          reason:
            `a price of zero was reported. Zero is almost always a scope ` +
            `statement ("included", "no charge") rather than a rate, and ranking ` +
            `it would make it the cheapest bid on this line automatically. ` +
            `Routed for review instead.`,
        });
        // The raw status is left alone: the reader read the document correctly,
        // and it is the calculator's job to decide a zero is not comparable.
        rows.push({ ...row, price: null, confidence: 0.2 });
        return;
      }
    }

    // A status that claims NO price must not smuggle one in.
    if (
      (row.status === "illegible" || row.status === "omitted" ||
        row.status === "not_quoted" || row.status === "match_rival") &&
      row.price !== null
    ) {
      issues.push({
        severity: "downgrade",
        rowIndex: i,
        reason:
          `status '${row.status}' means there is no usable price, but ${row.price} was ` +
          `returned. The price is discarded and the status kept.`,
      });
      rows.push({ ...row, price: null });
      return;
    }

    rows.push(row);
  });

  return { issues, rows };
}
