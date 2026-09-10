/**
 * Database schema.
 *
 * The load-bearing decision is in `extractedCells`: `provenance` is NOT NULL.
 * An extracted value that cannot say where it came from fails to insert. That
 * is a guarantee the database enforces, not a rule the prompt asks for, and
 * prompt instructions are advisory while constraints are not.
 *
 * The second decision: `landedUnitInr` is nullable and `status` is not. A cell
 * always knows what it is; it does not always have a number. Modelling it the
 * other way round makes "we do not know" unrepresentable, which is precisely
 * how these systems end up inventing values.
 *
 * Runs on Postgres. Locally that is PGlite (embedded, no server); on Vercel it
 * is Neon. Same schema, same SQL, same constraints, one driver line different.
 */

import {
  pgTable, text, integer, numeric, jsonb, timestamp, boolean, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------

export const rfx = pgTable("rfx", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  buyer: jsonb("buyer").notNull(),
  terms: jsonb("terms").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** Set when the co-pilot drafted this rather than it being seeded. */
  draftedByCopilot: boolean("drafted_by_copilot").default(false).notNull(),
});

export const rfxLines = pgTable("rfx_lines", {
  id: text("id").primaryKey(),                       // `${rfxId}:${no}`
  rfxId: text("rfx_id").notNull().references(() => rfx.id, { onDelete: "cascade" }),
  no: integer("no").notNull(),
  sku: text("sku").notNull(),
  groupName: text("group_name").notNull(),
  description: text("description").notNull(),
  spec: jsonb("spec").notNull(),
  uom: text("uom").notNull(),
  /** How many billable units sit inside one `uom`. The whole per-box trap. */
  packSize: integer("pack_size").notNull().default(1),
  qty: integer("qty").notNull(),
  hsn: text("hsn"),
  baselineInr: numeric("baseline_inr"),
}, (t) => [
  uniqueIndex("rfx_lines_rfx_no_idx").on(t.rfxId, t.no),
]);

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),                       // V1..V5
  rfxId: text("rfx_id").notNull().references(() => rfx.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  legalName: text("legal_name").notNull(),
  city: text("city"),
  gstin: text("gstin"),
  contact: jsonb("contact"),
  /** Mandatory-question verdict. Price is irrelevant if this fails. */
  qualified: boolean("qualified"),
  failedMandatory: jsonb("failed_mandatory"),
  questionnaireAnswers: jsonb("questionnaire_answers"),
});

/**
 * One row per file a vendor sent. A vendor may send several, and may send a
 * revision that supersedes an earlier one, which is a decision the system has
 * to make rather than assume.
 */
export const responses = pgTable("responses", {
  id: text("id").primaryKey(),
  rfxId: text("rfx_id").notNull().references(() => rfx.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  /** sha256 of the bytes. Part of the extraction cache key. */
  fileHash: text("file_hash").notNull(),
  storagePath: text("storage_path").notNull(),
  channel: text("channel"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  revision: integer("revision").default(1).notNull(),
  supersedesId: text("supersedes_id"),
  /** pending | extracting | extracted | failed */
  extractionStatus: text("extraction_status").default("pending").notNull(),
  extractionError: text("extraction_error"),
  /** Model id + prompt hash, so a run is reproducible and re-runs are cheap. */
  extractionMeta: jsonb("extraction_meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("responses_vendor_idx").on(t.vendorId),
  index("responses_hash_idx").on(t.fileHash),
]);

/**
 * The heart of the system: one row per extracted fact, not per line.
 *
 * A vendor's price, unit, currency and quantity can each carry different
 * confidence. Line 13 of the photographed rate card has a high-confidence
 * price and a high-confidence unit that happens to be the wrong unit.
 * Collapsing those into one line-level score throws away the only information
 * that matters.
 */
export const extractedCells = pgTable("extracted_cells", {
  id: text("id").primaryKey(),                       // `${responseId}:${lineNo}`
  responseId: text("response_id").notNull()
    .references(() => responses.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),

  // --- exactly as the vendor wrote it. Never overwritten. ---
  rawStatus: text("raw_status").notNull(),
  rawPrice: numeric("raw_price"),
  rawUom: text("raw_uom"),
  rawCurrency: text("raw_currency"),
  rawQty: integer("raw_qty"),
  /** A printed value that a pen annotation struck through. */
  printedPrice: numeric("printed_price"),
  handwritten: boolean("handwritten").default(false).notNull(),
  offeredMakeModel: text("offered_make_model"),
  vendorNote: text("vendor_note"),
  /**
   * What a non-absolute price refers to.
   *
   * "Same as our March rates" and "6% over last year" are not prices; they are
   * pointers. Without persisting the pointer (which SKU, which basis, what
   * uplift) the calculator cannot resolve them on read, and a resolvable price
   * silently degrades to unresolvable. Found by testing, which is the only way
   * this kind of gap shows up.
   */
  rawReference: jsonb("raw_reference"),

  // --- derived by the calculator. Recomputable, never authoritative. ---
  status: text("status").notNull(),
  landedUnitInr: numeric("landed_unit_inr"),
  landedExtendedInr: numeric("landed_extended_inr"),
  flags: jsonb("flags").notNull().default([]),
  trace: jsonb("trace").notNull().default([]),

  // --- trust ---
  /** The model's own reported confidence, not a proxy computed from it. */
  confidence: numeric("confidence"),
  /**
   * REQUIRED. Where this came from: sheet!cell, page + char span, or a bbox on
   * the photograph, plus the vendor's own cited words and how it was read.
   * No provenance, no insert.
   */
  provenance: jsonb("provenance").notNull(),
  /** Second, independent read of the same region. Agreement is real evidence. */
  verification: jsonb("verification"),
  needsConfirmation: boolean("needs_confirmation").default(false).notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("cells_response_line_idx").on(t.responseId, t.lineNo),
  index("cells_vendor_idx").on(t.vendorId),
  index("cells_status_idx").on(t.status),
]);

/**
 * Lines a vendor invented that map to nothing in the RFx (Cygnus's line 30A).
 * They go here rather than being force-fitted onto a real line, because
 * force-fitting is how a warranty uplift silently becomes a warranty.
 */
export const unmappedItems = pgTable("unmapped_items", {
  id: text("id").primaryKey(),
  responseId: text("response_id").notNull()
    .references(() => responses.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull(),
  vendorRef: text("vendor_ref"),
  description: text("description").notNull(),
  price: numeric("price"),
  uom: text("uom"),
  currency: text("currency"),
  qty: integer("qty"),
  note: text("note"),
  provenance: jsonb("provenance").notNull(),
  /** Set once a human decides where, if anywhere, it belongs. */
  resolvedToLineNo: integer("resolved_to_line_no"),
});

/**
 * The assumption ledger. Every judgement the system made, with its source and
 * its alternative, editable by the buyer. Changing one recomputes the whole
 * comparison. Nothing here is baked into a prompt.
 */
export const assumptions = pgTable("assumptions", {
  id: text("id").primaryKey(),
  rfxId: text("rfx_id").notNull().references(() => rfx.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  source: text("source").notNull(),
  alternative: text("alternative"),
  note: text("note"),
  confidence: text("confidence"),
  setBy: text("set_by").default("system").notNull(),
  setAt: timestamp("set_at", { withTimezone: true }).defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
}, (t) => [
  uniqueIndex("assumptions_rfx_key_idx").on(t.rfxId, t.key),
]);

/**
 * Every analyst answer, with the tool calls, cell ids and assumption versions
 * it used. "Why did it say that in the demo" has to be answerable afterwards.
 */
export const analystTurns = pgTable("analyst_turns", {
  id: text("id").primaryKey(),
  rfxId: text("rfx_id").notNull().references(() => rfx.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer"),
  /** Refusals are first-class outcomes, not errors. */
  refused: boolean("refused").default(false).notNull(),
  refusalReason: text("refusal_reason"),
  toolCalls: jsonb("tool_calls").notNull().default([]),
  citedCellIds: jsonb("cited_cell_ids").notNull().default([]),
  assumptionVersions: jsonb("assumption_versions").notNull().default({}),
  modelId: text("model_id"),
  usage: jsonb("usage"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const schema = {
  rfx, rfxLines, vendors, responses, extractedCells, unmappedItems,
  assumptions, analystTurns,
};
