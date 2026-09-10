/**
 * Does the extraction parser survive realistic provider output?
 *
 *   npm run parse-check
 *
 * Anthropic's strict tool schemas fill every key. Other providers omit nulls,
 * truncate, and occasionally invent a field. This exercises the parser against
 * those shapes WITHOUT spending a model call, so the failure modes are known
 * before a demo rather than during one.
 */

import { extractionSchema, validateExtraction } from "../lib/extract/contract";
import { LINES } from "../lib/normalise";

const validLineNos = new Set(LINES.map((l) => l.no));
let pass = 0;
const fails: string[] = [];

function check(name: string, input: unknown, expect: (r: unknown) => string | null) {
  const parsed = extractionSchema.safeParse(input);
  if (!parsed.success) {
    fails.push(`${name}: parse failed -> ${parsed.error.issues[0]?.message}`);
    return;
  }
  const problem = expect(parsed.data);
  if (problem) fails.push(`${name}: ${problem}`);
  else pass++;
}

const goodProv = { locator: "Quotation!G14", citedText: "₹ 62,800", method: "xlsx_cell" };

// 1. A provider that omits every null, which is the common case.
check("omits all nulls", {
  rows: [{
    rfxLineNo: 1, vendorDescription: "Laptop 14in", status: "quoted",
    price: 62800, uom: "nos", currency: "INR", confidence: 0.95,
    provenance: goodProv,
  }],
  terms: {},
}, (r) => {
  const d = r as { rows: Array<Record<string, unknown>>; vendorRef: unknown;
                   statedTotal: unknown; unreadableRegions: unknown[] };
  if (d.vendorRef !== null) return "vendorRef should default to null";
  if (d.rows[0].qty !== null) return "qty should default to null";
  if (d.rows[0].handwritten !== false) return "handwritten should default to false";
  if (!Array.isArray(d.unreadableRegions)) return "unreadableRegions should default to []";
  if (!d.statedTotal) return "statedTotal should default";
  return null;
});

// 2. Only the bare minimum. Should still parse to something usable.
check("bare minimum", { rows: [], terms: {} }, (r) => {
  const d = r as { rows: unknown[]; conditionalDiscounts: unknown[] };
  if (d.rows.length !== 0) return "rows should be empty";
  if (!Array.isArray(d.conditionalDiscounts)) return "conditionalDiscounts should be []";
  return null;
});

// 3. Nothing at all, not even rows.
check("empty object", {}, (r) => {
  const d = r as { rows: unknown[] };
  return Array.isArray(d.rows) ? null : "rows should default to []";
});

// 4. An unknown provenance method must not reject a real locator.
check("unknown provenance method", {
  rows: [{
    rfxLineNo: 5, vendorDescription: "Monitor", status: "quoted",
    price: 9450, uom: "nos", currency: "INR", confidence: 0.9,
    provenance: { locator: "row 12", citedText: "9,450", method: "some_new_method" },
  }],
  terms: {},
}, (r) => {
  const d = r as { rows: Array<{ provenance: { method: string } }> };
  return d.rows[0].provenance.method === "other"
    ? null
    : `method should normalise to 'other', got ${d.rows[0].provenance.method}`;
});

// 5. Missing confidence must not be read as zero confidence, nor as certainty.
check("missing confidence", {
  rows: [{
    rfxLineNo: 7, vendorDescription: "Dock", status: "quoted",
    price: 13100, uom: "nos", currency: "INR", provenance: goodProv,
  }],
  terms: {},
}, (r) => {
  const d = r as { rows: Array<{ confidence: number }> };
  return d.rows[0].confidence === 0.5
    ? null
    : `confidence should default to 0.5, got ${d.rows[0].confidence}`;
});

// --- semantic validation, which a schema cannot do -------------------------

function semantic(name: string, rows: unknown[], expect: (issues: string[], out: unknown[]) => string | null) {
  const parsed = extractionSchema.parse({ rows, terms: {} });
  const { issues, rows: out } = validateExtraction(parsed, validLineNos);
  const problem = expect(issues.map((i) => i.reason), out);
  if (problem) fails.push(`${name}: ${problem}`);
  else pass++;
}

// 6. A hallucinated line number must be pushed to the unmapped tray.
semantic("hallucinated line 99", [{
  rfxLineNo: 99, vendorDescription: "Mystery item", status: "quoted",
  price: 1000, uom: "nos", currency: "INR", confidence: 0.9, provenance: goodProv,
}], (issues, out) => {
  if (!issues.some((i) => i.includes("does not exist"))) return "should flag a non-existent line";
  if ((out[0] as { rfxLineNo: number | null }).rfxLineNo !== null) return "should be unmapped";
  return null;
});

// 7. A status claiming a price, with no price, must become illegible.
semantic("quoted with no price", [{
  rfxLineNo: 3, vendorDescription: "Ultraportable", status: "quoted",
  uom: "nos", currency: "INR", confidence: 0.9, provenance: goodProv,
}], (issues, out) => {
  if ((out[0] as { status: string }).status !== "illegible") return "should become illegible";
  if (!issues.some((i) => i.includes("implies a price"))) return "should say why";
  return null;
});

// 8. A price with no unit is not comparable: confidence must be pulled down.
semantic("price with no unit", [{
  rfxLineNo: 4, vendorDescription: "Desktop", status: "quoted",
  price: 39800, currency: "INR", confidence: 0.98, provenance: goodProv,
}], (issues, out) => {
  const c = (out[0] as { confidence: number }).confidence;
  if (c > 0.4) return `confidence should be capped low, got ${c}`;
  if (!issues.some((i) => i.includes("no unit"))) return "should say why";
  return null;
});

// 9. A no-price status must not smuggle a price through.
semantic("illegible with a price", [{
  rfxLineNo: 6, vendorDescription: "Monitor 27", status: "illegible",
  price: 19800, uom: "nos", currency: "INR", confidence: 0.4, provenance: goodProv,
}], (issues, out) => {
  if ((out[0] as { price: number | null }).price !== null) return "price should be discarded";
  if (!issues.some((i) => i.includes("no usable price"))) return "should say why";
  return null;
});

// 10. A negative price is rejected outright, not stored.
semantic("negative price", [{
  rfxLineNo: 8, vendorDescription: "Bag", status: "quoted",
  price: -1390, uom: "nos", currency: "INR", confidence: 0.9, provenance: goodProv,
}], (issues, out) => {
  if (out.length !== 0) return "row should be dropped";
  if (!issues.some((i) => i.includes("negative"))) return "should say why";
  return null;
});

console.log("=".repeat(70));
console.log("EXTRACTION PARSER: robustness against realistic provider output");
console.log("=".repeat(70));
if (fails.length === 0) {
  console.log(`PASS  ${pass}/${pass} cases.`);
  console.log("\nThe parser survives omitted nulls, missing fields and unknown enum");
  console.log("values, and the semantic checks catch what a schema cannot: invented");
  console.log("line numbers, prices without units, and statuses that contradict");
  console.log("their own payload.");
} else {
  console.log(`FAIL  ${fails.length} of ${pass + fails.length} cases:\n`);
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
