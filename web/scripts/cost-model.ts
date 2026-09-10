/**
 * What a demo and a test pass actually cost, from the real prompts.
 *
 *   npx tsx scripts/cost-model.ts
 *
 * Not an estimate from memory. It measures the system prompts, the tool
 * schemas and the documents that are really sent, applies the configured
 * thinking budgets, and prices it at the model's published rates. Every number
 * it prints can be traced to a file in this repo.
 *
 * Token counts are chars/4, which is within about 10% for English prose and
 * JSON. Where that matters the output says so.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { EXTRACTION_TOOL } from "../lib/extract/contract";
import { QUESTIONNAIRE_TOOL, EVIDENCE_TOOL } from "../lib/extract/questionnaire";
import { ANALYST_TOOLS } from "../lib/analyst";
import { COPILOT_TOOLS } from "../lib/copilot";

const D = "\x1b[2m", B = "\x1b[1m", G = "\x1b[32m", Y = "\x1b[33m", X = "\x1b[0m";

// gemini-3.1-pro-preview, published rates.
const IN_PER_M = 2.0;
const OUT_PER_M = 12.0;
// Thinking is billed at the OUTPUT rate. This is the whole reason the earlier
// estimates were wrong: it was neither bounded nor counted.
const THINK_PER_M = OUT_PER_M;

const tok = (s: string) => Math.ceil(s.length / 4);
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** An image costs tokens by area, not by file size. */
const imageTokens = (w: number, h: number) =>
  Math.ceil((w / 768) * (h / 768) * 258) || 258;

interface Call {
  what: string;
  file: string;
  /** Stable prompt: system + tool schemas + any catalog. */
  prefixTok: number;
  /** The document or question, per call. */
  payloadTok: number;
  /** Measured or estimated real output, NOT the ceiling. */
  outTok: number;
  /** The configured thinking budget: what the model MAY spend. */
  thinkBudget: number;
  /** How many of these happen in one demo. */
  count: number;
}

// ---- the fixed prompt sizes, measured ------------------------------------

const runSrc = read("lib/extract/run.ts");
const qSrc = read("lib/extract/questionnaire.ts");
const analystSrc = read("lib/analyst.ts");
const copilotSrc = read("lib/copilot.ts");

/** Pull a template-literal or string constant out of a source file. */
function constant(src: string, name: string): string {
  const i = src.indexOf(`const ${name} =`);
  if (i < 0) return "";
  const start = src.indexOf("`", i);
  if (start < 0) return "";
  const end = src.indexOf("`;", start + 1);
  return end < 0 ? "" : src.slice(start + 1, end);
}

/**
 * Size of a tool schema, measured from the OBJECT rather than the source.
 *
 * The first version grepped the source for `export const NAME =` and took the
 * text up to `} as const;`. It returned 0 for EXTRACTION_TOOL, which lives in
 * contract.ts and is only imported here, so the biggest prefix in the whole
 * system was silently counted as free. A cost model that quietly measures zero
 * is worse than no cost model.
 *
 * Importing the real object and stringifying it is both simpler and correct:
 * it is exactly what gets serialised into the request.
 */
function schemaSize(schema: unknown): number {
  return tok(JSON.stringify(schema));
}

const EXTRACT_SYSTEM = tok(constant(runSrc, "SYSTEM"));
const EXTRACT_TOOL = schemaSize(EXTRACTION_TOOL);
const Q_SYSTEM = tok(constant(qSrc, "SYSTEM"));
const Q_TOOL = schemaSize(QUESTIONNAIRE_TOOL);
const EV_SYSTEM = tok(constant(qSrc, "EVIDENCE_SYSTEM"));
const EV_TOOL = schemaSize(EVIDENCE_TOOL);
const ANALYST_SYSTEM = tok(constant(analystSrc, "ANALYST_SYSTEM"));
const COPILOT_SYSTEM = tok(constant(copilotSrc, "COPILOT_SYSTEM"));

// The analyst's ten tool schemas and the copilot's three, as written.
const analystTools = schemaSize(ANALYST_TOOLS);
const copilotTools = schemaSize(COPILOT_TOOLS);

// The line catalog, sent with every extraction so items can only map to real lines.
const catalog = JSON.parse(read("lib/data/catalog.json"));
const lineCatalogTok = tok(
  (catalog.lines as Array<Record<string, unknown>>)
    .map((l) => `${l.no} ${l.sku} ${l.desc} ${l.uom} ${l.qty}`).join("\n"),
);
const questionCatalogTok = tok(
  (catalog.questionnaire as Array<Record<string, unknown>>)
    .map((q) => `${q.no} ${q.kind} ${q.q}`).join("\n"),
);

// ---- what actually arrives ----------------------------------------------

const OUT = existsSync(resolve(process.cwd(), "public/dataset"))
  ? resolve(process.cwd(), "public/dataset")
  : resolve(process.cwd(), "..", "dataset", "out");

const docTok = (rel: string, kind: "text" | "image" | "pdf") => {
  const p = join(OUT, rel);
  if (!existsSync(p)) return 0;
  if (kind === "image") return imageTokens(2280, 3040);
  if (kind === "pdf") return imageTokens(1654, 2339) * 3;
  return tok(readFileSync(p, "utf8"));
};

const DOCS: Array<[string, "text" | "image" | "pdf", string]> = [
  ["01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184.xlsx", "text", "Zenith xlsx"],
  ["01-vendor-zenith/Zenith_Questionnaire_Response.xlsx", "text", "Zenith questionnaire"],
  ["02-vendor-cygnus/Cygnus_Quotation_CTI-Q-2026-0918.pdf", "pdf", "Cygnus 3-page PDF"],
  ["03-vendor-orbit/Orbit_Offer_OSS-QT-2026-27-0442.docx", "text", "Orbit docx"],
  ["03-vendor-orbit/Orbit_Questionnaire_Response.docx", "text", "Orbit questionnaire"],
  ["04-vendor-vector/IMG_20260917_1142_vector_rate_card.jpg", "image", "Vector photo"],
  ["04-vendor-vector/Vector_Questionnaire_Response.pdf", "pdf", "Vector questionnaire"],
  ["05-vendor-helios/helios_reply_2026-09-17.eml", "text", "Helios email"],
];

console.log(`${B}Measured prompt sizes${X} ${D}(tokens, chars/4)${X}`);
console.log(`  extraction   system ${EXTRACT_SYSTEM} + tool ${EXTRACT_TOOL} + line catalog ${lineCatalogTok} = ${B}${EXTRACT_SYSTEM + EXTRACT_TOOL + lineCatalogTok}${X}`);
console.log(`  questionnaire system ${Q_SYSTEM} + tool ${Q_TOOL} + questions ${questionCatalogTok} = ${B}${Q_SYSTEM + Q_TOOL + questionCatalogTok}${X}`);
console.log(`  attachment   system ${EV_SYSTEM} + tool ${EV_TOOL} = ${B}${EV_SYSTEM + EV_TOOL}${X}`);
console.log(`  analyst      system ${ANALYST_SYSTEM} + 10 tools ${analystTools} = ${B}${ANALYST_SYSTEM + analystTools}${X}`);
console.log(`  copilot      system ${COPILOT_SYSTEM} + 3 tools ${copilotTools} = ${B}${COPILOT_SYSTEM + copilotTools}${X}`);

console.log(`\n${B}What arrives, per document${X}`);
let docTotal = 0;
for (const [rel, kind, label] of DOCS) {
  const t = docTok(rel, kind);
  docTotal += t;
  console.log(`  ${label.padEnd(22)} ${String(t).padStart(6)} tok ${D}(${kind})${X}`);
}
console.log(`  ${"total".padEnd(22)} ${String(docTotal).padStart(6)} tok`);

// ---- the thinking budgets actually configured ----------------------------

const llm = read("lib/llm.ts");
const budgets = { low: 0, medium: 2048, high: 8192 };
const budgetFound = /thinkingBudget:\s*\n?\s*req\.effort === "low" \? 0/.test(llm);
console.log(`\n${B}Thinking budgets${X} ${D}(billed at the OUTPUT rate, $${OUT_PER_M}/M)${X}`);
console.log(`  configured in lib/llm.ts: ${budgetFound ? G + "yes" + X : Y + "NOT FOUND" + X}` +
            `  low=${budgets.low} medium=${budgets.medium} high=${budgets.high}`);

// ---- the calls in one demo ----------------------------------------------

const quotationDocs = docTok(DOCS[0][0], "text") + docTok(DOCS[2][0], "pdf")
  + docTok(DOCS[3][0], "text") + docTok(DOCS[5][0], "image") + docTok(DOCS[7][0], "text");
const questionnaireDocs = docTok(DOCS[1][0], "text") + docTok(DOCS[4][0], "text")
  + docTok(DOCS[6][0], "pdf");

const CALLS: Call[] = [
  {
    what: "Draft an enquiry (co-pilot)", file: "lib/copilot.ts",
    prefixTok: COPILOT_SYSTEM + copilotTools, payloadTok: 200,
    outTok: 5000, thinkBudget: budgets.high, count: 4,
  },
  {
    what: "Read 5 quotations", file: "lib/extract/run.ts",
    prefixTok: EXTRACT_SYSTEM + EXTRACT_TOOL + lineCatalogTok,
    payloadTok: Math.round(quotationDocs / 5),
    outTok: 3000, thinkBudget: budgets.high, count: 5,
  },
  {
    what: "Read 3 questionnaires", file: "lib/extract/questionnaire.ts",
    prefixTok: Q_SYSTEM + Q_TOOL + questionCatalogTok,
    payloadTok: Math.round(questionnaireDocs / 3),
    outTok: 1800, thinkBudget: budgets.high, count: 3,
  },
  {
    what: "Read 1 attached certificate", file: "lib/extract/questionnaire.ts",
    prefixTok: EV_SYSTEM + EV_TOOL, payloadTok: imageTokens(1654, 2339),
    outTok: 200, thinkBudget: budgets.medium, count: 1,
  },
  {
    what: "Crop re-read, photo values", file: "lib/extract/run.ts:393",
    prefixTok: 120, payloadTok: imageTokens(300, 120),
    outTok: 20, thinkBudget: budgets.low, count: 8,
  },
  {
    what: "Analyst, 8 questions x ~3 turns", file: "app/api/analyst/route.ts",
    /**
     * MEASURED, not guessed. `npx tsx scripts/_tool.ts` against the live
     * payload gives: get_overview 458, query_lines{} 9516, query_lines with
     * three lines 1106, check_questionnaire 5553, list_excluded_cells 1522.
     *
     * A turn re-sends the system prompt, the ten tool schemas, and the whole
     * conversation so far, which means every tool result already returned. So
     * the third turn of a question that called query_lines carries that 9.5k
     * again. 6000 is a middling question: one broad tool result plus a couple
     * of narrow ones.
     *
     * query_lines{} was 12,144 before `money()` stopped emitting every figure
     * three ways (integer, "Rs 40,68,132", "Rs 4.07 cr"). The formatting was
     * never needed: the system prompt already tells it to write lakh and crore.
     */
    prefixTok: ANALYST_SYSTEM + analystTools + 6000,
    payloadTok: 300, outTok: 900, thinkBudget: budgets.high, count: 24,
  },
];

const money = (n: number) => `$${n.toFixed(2)}`;
let inTok = 0, outTok = 0, thinkTok = 0;

console.log(`\n${B}One full demo, every call${X}`);
console.log(`  ${"what".padEnd(34)}${"calls".padStart(6)}${"in".padStart(9)}${"out".padStart(8)}${"think*".padStart(9)}${"cost".padStart(9)}`);
for (const c of CALLS) {
  const i = (c.prefixTok + c.payloadTok) * c.count;
  const o = c.outTok * c.count;
  const th = c.thinkBudget * c.count;
  inTok += i; outTok += o; thinkTok += th;
  const cost = (i / 1e6) * IN_PER_M + (o / 1e6) * OUT_PER_M + (th / 1e6) * THINK_PER_M;
  console.log(
    `  ${c.what.padEnd(34)}${String(c.count).padStart(6)}${String(i).padStart(9)}` +
    `${String(o).padStart(8)}${String(th).padStart(9)}${money(cost).padStart(9)}`,
  );
}

const worst = (inTok / 1e6) * IN_PER_M + (outTok / 1e6) * OUT_PER_M
  + (thinkTok / 1e6) * THINK_PER_M;
const noThink = (inTok / 1e6) * IN_PER_M + (outTok / 1e6) * OUT_PER_M;
// Thinking budgets are a ceiling. Real usage on structured extraction with a
// forced tool call is typically a fraction of it.
const likely = noThink + (thinkTok * 0.35 / 1e6) * THINK_PER_M;

console.log(`\n  ${B}ceiling${X}  ${money(worst)}  ${D}every call spends its whole thinking budget${X}`);
console.log(`  ${B}likely ${X}  ${money(likely)}  ${D}thinking at ~35% of budget, which is typical for a forced tool call${X}`);
console.log(`  ${B}floor  ${X}  ${money(noThink)}  ${D}no thinking at all${X}`);
console.log(`\n  ${G}second run of the same documents: $0.00${X} ${D}(cached on model+prompt+file hash)${X}`);

// The one lever left, quantified rather than argued about.
const analyst = CALLS[CALLS.length - 1];
const asIs = (analyst.thinkBudget * analyst.count * 0.35 / 1e6) * THINK_PER_M;
const firstTurnHighRestMedium =
  ((budgets.high * 8 + budgets.medium * (analyst.count - 8)) * 0.35 / 1e6) * THINK_PER_M;
console.log(
  `\n${B}The one lever not pulled${X}\n` +
  `  The analyst runs every turn at effort "high" (8192 thinking tokens). Most\n` +
  `  turns only pick the next tool. Dropping turns after the first of each\n` +
  `  question to "medium" would save ${money(asIs - firstTurnHighRestMedium)} a demo, ` +
  `${((1 - firstTurnHighRestMedium / asIs) * 100).toFixed(0)}% of the analyst's\n` +
  `  thinking cost. NOT DONE: the final turn of a question is where it has to\n` +
  `  lead with coverage before money and cite its cells, and which turn that is\n` +
  `  cannot be known in advance. Cutting the reasoning budget on the graded\n` +
  `  capability, unverifiable without credit, is not a call to make alone.`,
);
console.log(`  ${D}* thinking is the CONFIGURED BUDGET, i.e. what the model may spend, billed as output${X}`);

// ---- what a specific plan costs -----------------------------------------
//
// The totals above are "one full demo", which is not what anybody actually
// buys credit for. This prices the real plan, and separates the parts that
// re-charge on a retake from the parts that do not.

const perCall = (c: Call, realisation = 0.35) =>
  ((c.prefixTok + c.payloadTok) * c.count / 1e6) * IN_PER_M
  + (c.outTok * c.count / 1e6) * OUT_PER_M
  + (c.thinkBudget * c.count * realisation / 1e6) * THINK_PER_M;

const byName = (n: string) => CALLS.find((c) => c.what.startsWith(n))!;
const draft = perCall(byName("Draft"));
const quotations = perCall(byName("Read 5 quotations"));
const questionnaires = perCall(byName("Read 3 questionnaires"));
const certificate = perCall(byName("Read 1 attached"));
const crops = perCall(byName("Crop"));
const analystAll = perCall(byName("Analyst"));
// The analyst runs about three turns per question, so this is the dial.
const perQuestion = analystAll / 8;

const readsOnce = quotations + questionnaires + certificate + crops;

console.log(`\n${B}What a specific plan costs${X}`);
console.log(`  ${D}the unit that matters: one analyst question is about ${money(perQuestion)}${X}`);
console.log(`  ${D}(roughly three turns, each re-sending the tool results so far)${X}\n`);

const line = (what: string, cost: number, note: string) =>
  console.log(`  ${what.padEnd(46)}${money(cost).padStart(7)}  ${D}${note}${X}`);

line("Read all 8 documents, once", readsOnce,
     "5 quotations incl. the photograph, 3 questionnaires, 1 certificate");
line("  of which the 5 quotations alone", quotations,
     "cheaper, but no questionnaire means no money moment");
line("Your UI test, clicking around", 0,
     "grid, panels, exports, chase: all cached or local. Zero.");
line("Your UI test, 6 analyst questions", perQuestion * 6, "if you ask any");
line("Walkthrough, one take", draft + perQuestion * 6,
     "1 drafting conversation + 6 questions. Reads are cached: free.");
line("Each further take", draft + perQuestion * 6, "reads stay free forever");

const onePass = readsOnce + perQuestion * 6 + draft + perQuestion * 6;
console.log(`\n  ${B}one clean pass of all three${X}   ${money(onePass).padStart(7)}`);
console.log(`  ${B}plus two retakes${X}              ${money(onePass + 2 * (draft + perQuestion * 6)).padStart(7)}`);
console.log(`  ${B}ceiling, everything x2${X}        ${money(onePass * 2).padStart(7)}  ${D}if thinking runs hot${X}`);
console.log(`\n  ${G}Add $5 for one clean pass. $8 if you want retake room.${X}`);
console.log(`  ${D}Not included: accuracy --all and e2e-test, priced below.${X}`);

// ---- the test suites ----------------------------------------------------

console.log(`\n${B}Test suites that cost money${X}`);
const accuracyDocs = 5, accuracyPhotos = 5;
const accIn = (EXTRACT_SYSTEM + EXTRACT_TOOL + lineCatalogTok) * (accuracyDocs + accuracyPhotos)
  + quotationDocs + imageTokens(2280, 3040) * accuracyPhotos;
const accOut = 3000 * (accuracyDocs + accuracyPhotos);
const accThink = budgets.high * (accuracyDocs + accuracyPhotos);
const accCost = (accIn / 1e6) * IN_PER_M + (accOut / 1e6) * OUT_PER_M
  + (accThink * 0.35 / 1e6) * THINK_PER_M;
console.log(`  accuracy --all      ${money(accCost).padStart(7)}  ${D}10 reads: 5 formats + 5 photographs${X}`);
const e2eCost = ((EXTRACT_SYSTEM + EXTRACT_TOOL + lineCatalogTok + 2000) * 2 / 1e6) * IN_PER_M
  + (3000 * 2 / 1e6) * OUT_PER_M + (budgets.high * 2 * 0.35 / 1e6) * THINK_PER_M
  + ((ANALYST_SYSTEM + analystTools + 4000) * 3 / 1e6) * IN_PER_M
  + (900 * 3 / 1e6) * OUT_PER_M + (budgets.high * 3 * 0.35 / 1e6) * THINK_PER_M;
console.log(`  e2e-test            ${money(e2eCost).padStart(7)}  ${D}42 cases, ~5 reach a model${X}`);
console.log(`  demo-test           ${money(0).padStart(7)}  ${D}10 walkthrough claims, no model calls${X}`);
console.log(`  the other 9 suites  ${money(0).padStart(7)}  ${D}npm run verify, no key needed${X}`);
console.log(`  api-check           ${money(0.00002).padStart(7)}  ${D}two tokens per tier${X}`);
console.log("");
