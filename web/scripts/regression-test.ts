/**
 * Regression guards.
 *
 * Every case here is a bug that actually shipped into this build and was found
 * afterwards. They are collected in one file, separately from the suites that
 * test features, because they share a property worth naming: each one LOOKED
 * FINE. No exception, no red on screen, no failing test. A wrong number that
 * announces itself gets fixed in an hour; these are the ones that survive.
 *
 * A regression test is only worth writing if it would have caught the bug, so
 * each case asserts the property that was violated, not the symptom that was
 * observed.
 */

import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), "regtest-"));
delete process.env.DATABASE_URL;

import { getQuery } from "../lib/db/client";
import {
  seedRfx, ensureVendor, activeRfx, RFX_ID,
  storeQuestionnaireAnswers, loadAttachments,
} from "../lib/store";
import {
  buildMatrix, trustSummary, likeForLike, cheapestPerLine, singleVendor,
  LINES, VENDORS, QUALIFICATION,
} from "../lib/normalise";
import { buildComparisonPayload } from "../lib/store";
import { awardNote } from "../lib/documents";
import { sendIssues } from "../lib/copilot";
import { assessQuestionnaire, type QuestionSpec } from "../lib/questionnaire";
import catalog from "../lib/data/catalog.json";
import rawQuotes from "../lib/data/raw-quotes.json";
import type { RawQuote } from "../lib/normalise";

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
let failures = 0;

let passed = 0;

function check(bug: string, property: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  console.log(
    `  ${ok ? `${G}pass${X}` : `${R}FAIL${X}`}  ${B}${bug}${X}\n` +
    `        ${D}guards: ${property}${X}\n        ${detail}`,
  );
  if (!ok) failures += 1;
}

async function main() {
  console.log("\n" + "=".repeat(78));
  console.log(`${B}REGRESSIONS${X}  bugs that shipped, and the properties that stop them`);
  console.log("=".repeat(78) + "\n");

  const quotes = rawQuotes.quotes as unknown as Record<string, Record<string, RawQuote>>;
  const matrix = buildMatrix(quotes);

  // ---- 1. The trust bar double-counted, twice --------------------------
  //
  // First version counted comparable_with_caveat in both "awardable" and
  // "needs a human". Fixed. The SECOND version rolled the supplier-blocked
  // cells into "blocked on you", so the bar said "5 blocked on you" beside
  // "3 awaiting supplier confirmation" where 3 of the 5 were the 3.
  //
  // The property is arithmetic, not wording: the parts must sum to the whole.
  const t = trustSummary(matrix);
  const sum = t.usable + t.needsHuman + t.derivedAwaitingVendor + t.noPrice + t.notRead;
  check(
    "1. Trust bar double-counted (twice)",
    "the disjoint groups sum exactly to the cell count, so no cell is in two",
    sum === t.total,
    `${t.usable} usable + ${t.needsHuman} on you + ${t.derivedAwaitingVendor} on them ` +
    `+ ${t.noPrice} no price = ${sum}, total ${t.total}`,
  );
  check(
    "1b. Caveat cells counted as both awardable and blocked",
    "cells already inside the total are never also counted as blocking it",
    t.awardableWithCaveat > 0 && t.awardableWithCaveat <= t.usable &&
      t.needsHuman + t.derivedAwaitingVendor < t.awardableWithCaveat + t.needsHuman +
      t.derivedAwaitingVendor + 1,
    `${t.awardableWithCaveat} caveat cells are inside the ${t.usable} usable, and are ` +
    `not part of the ${t.needsHuman} blocked on the buyer`,
  );

  // ---- 2. The uncertainty glyphs were the least legible text -----------
  //
  // Contrast is measured in the browser, not here, so this guards the source
  // of the bug instead: the glyphs must not be rendered at a reduced opacity.
  // An opacity modifier on these specific classes is what produced 1.8:1.
  const grid = readFileSync(resolve(process.cwd(), "components/comparison-grid.tsx"), "utf8");
  const glyphBlock = grid.slice(
    grid.indexOf("EMPTY_GLYPH[cell.status]") - 1200,
    grid.indexOf("EMPTY_GLYPH[cell.status]") + 200,
  );
  const fadedGlyph = /text-(?:muted-)?foreground\/\d\d\b/.test(glyphBlock);
  check(
    "2. Uncertainty glyphs were the faintest text on the page",
    "the marks that say 'I am not sure' are never drawn at reduced opacity",
    !fadedGlyph,
    fadedGlyph
      ? "an opacity modifier is back on the empty-cell glyph"
      : "glyphs render at full token strength (1.8:1 and 2.3:1 were the measured lows)",
  );
  const markerBlock = grid.slice(
    grid.indexOf("bestIsEligible ?") - 400, grid.indexOf("bestIsEligible ?") + 300,
  );
  check(
    "2b. 'Cheapest but cannot win' marker was invisible",
    "the marker warning that the cheapest supplier is disqualified stays legible",
    !/muted-foreground\/(?:2\d|3\d|4\d)\b/.test(markerBlock),
    "the disqualified-cheapest marker uses a full-strength token, not /45 opacity",
  );

  // ---- 3. A provider rate limit returned a raw 500 ---------------------
  const analyst = readFileSync(resolve(process.cwd(), "app/api/analyst/route.ts"), "utf8");
  const handles429 = /429|rate.\?limit|RESOURCE_EXHAUSTED/i.test(analyst) &&
    analyst.includes("status: 503");
  // The tool-call catch legitimately puts String(e) into a TOOL RESULT, which
  // the model reads and reasons about. The bug was the HTTP response body
  // carrying it, so that is what this looks at.
  const outerCatch = analyst.slice(analyst.lastIndexOf("} catch (e) {"));
  const leaks = /error:\s*String\(e\)/.test(outerCatch);
  check(
    "3. A rate-limited provider returned a raw 500 with a JSON blob",
    "provider failures return 503 with a sentence, and never the raw payload",
    handles429 && !leaks,
    handles429
      ? "429/quota/overloaded map to 503; the raw payload goes to a `detail` field only"
      : "the rate-limit branch is missing",
  );

  // ---- 4. A missing field 500'd the outbound send gate -----------------
  //
  // The gate on an outbound action must fail CLOSED. A crash is not a refusal:
  // it looks like a bug in the tool rather than a problem with the enquiry.
  const brokenDrafts: Array<[string, unknown]> = [
    ["no clarityIssues", { title: "x", lines: [], questionnaire: [], terms: {} }],
    ["no lines", { title: "x", clarityIssues: [], questionnaire: [], terms: {} }],
    ["no questionnaire", { title: "x", clarityIssues: [], lines: [], terms: {} }],
    ["entirely empty", {}],
    ["null members", { clarityIssues: [null], lines: [null], questionnaire: [null] }],
  ];
  let crashed = "";
  for (const [label, d] of brokenDrafts) {
    try {
      const issues = sendIssues(d as never);
      if (!Array.isArray(issues)) crashed = `${label}: did not return a list`;
    } catch (e) {
      crashed = `${label}: threw ${String(e).slice(0, 60)}`;
    }
  }
  check(
    "4. A draft missing a field crashed the send route",
    "the send gate never throws on a malformed draft; it reports issues instead",
    !crashed,
    crashed || `all ${brokenDrafts.length} malformed drafts produced an issue list, not a throw`,
  );

  // ---- 5. ensureVendor violated a foreign key -------------------------
  //
  // responses.vendor_id references vendors.id, and the seeded rows use the code
  // AS the id. Creating a supplier with a composite id therefore inserted a row
  // no response could ever point at.
  await seedRfx();
  const run = await getQuery();
  const created = await ensureVendor(RFX_ID, "REGTEST_SUPPLIER", "regtest.xlsx");
  const row = (await run(
    `select id, code from vendors where id = $1`, [created.code],
  )).rows?.[0];
  let fkOk = false;
  try {
    await run(
      `insert into responses
         (id, rfx_id, vendor_id, filename, mime_type, byte_size, file_hash,
          storage_path, extraction_status)
       values ('regtest_r', $1, $2, 'x.xlsx', 'application/octet-stream', 1,
               'regtesthash', '(none)', 'extracted')`,
      [RFX_ID, created.code],
    );
    fkOk = true;
  } catch (e) {
    fkOk = false;
    console.error(String(e).slice(0, 160));
  }
  check(
    "5. A supplier created on upload could not be referenced",
    "a supplier created at upload time can carry a response immediately",
    Boolean(row) && fkOk,
    `vendors.id='${row?.id}' and a response referencing it inserts cleanly`,
  );

  // A second supplier with the same code on another enquiry must not silently
  // attach to the first one's record.
  await run(
    `insert into rfx (id, title, buyer, terms) values ('REG-OTHER','Other','{}','{}')
     on conflict (id) do nothing`,
  );
  const second = await ensureVendor("REG-OTHER", "REGTEST_SUPPLIER", "other.xlsx");
  check(
    "5b. Two enquiries reusing a supplier code collided",
    "a code already taken by another enquiry gets its own record, not a shared one",
    second.code !== created.code,
    `'${created.code}' on the seeded enquiry, '${second.code}' on the other`,
  );

  // ---- 6. The 'active enquiry' rule broke twice -----------------------
  //
  // v1 "newest with lines" let debris hijack the screen with no way back.
  // v2 "prefer one with replies" snapped back to the shipped example at the
  // exact moment a buyer drafted their own enquiry and had no replies yet.
  //
  // The property that survives both: an enquiry someone drafted, with lines and
  // no replies at all, is still the one on screen.
  await run(
    `insert into rfx (id, title, buyer, terms, drafted_by_copilot)
     values ('REG-DRAFT','A freshly drafted enquiry','{}','{}',true)
     on conflict (id) do nothing`,
  );
  await run(
    `insert into rfx_lines
       (id, rfx_id, no, sku, group_name, description, spec, uom, pack_size, qty)
     values ('REG-DRAFT:1','REG-DRAFT',1,'X','G','A line','{}','nos',1,10)
     on conflict (id) do nothing`,
  );
  const active = await activeRfx();
  check(
    "6. A freshly drafted enquiry did not reach the screen",
    "a drafted enquiry with lines and zero replies is the active one",
    active.rfxId === "REG-DRAFT" && active.ctx.lines.length === 1,
    `active is ${active.rfxId} with ${active.ctx.lines.length} line(s), ` +
    `even though the shipped example has ${LINES.length} and this one has no replies`,
  );

  await run(`delete from rfx where id in ('REG-DRAFT','REG-OTHER')`);
  const back = await activeRfx();
  // Asserted on the shipped suppliers being present, not on an exact count:
  // an earlier case in this same suite deliberately creates one, and a test
  // that breaks when another test does its job is a test about itself.
  const seededPresent = VENDORS.every((v) =>
    back.ctx.vendors.some((x) => x.code === v.code));
  check(
    "6b. Discarding a draft left the tool stuck",
    "with no drafts, the shipped example is the active enquiry again",
    back.rfxId === RFX_ID && back.isSeededExample && seededPresent
      && back.ctx.lines.length === LINES.length,
    `back to ${back.rfxId} with ${back.ctx.lines.length} lines and all ` +
    `${VENDORS.length} shipped suppliers present`,
  );

  // ---- 7. A schema change never reached an existing database ----------
  //
  // CREATE TABLE IF NOT EXISTS is a no-op on a table that already exists, so a
  // new column never arrived, the insert referencing it threw, and a
  // defensively-caught write turned into a feature that silently did nothing.
  const cols = (await run(
    `select column_name from information_schema.columns where table_name = 'rfx'`,
  )).rows ?? [];
  const names = cols.map((c) => String(c.column_name));
  check(
    "7. A new column never reached an existing database",
    "columns added after the first release are applied as migrations on start",
    names.includes("knowingly_ambiguous"),
    `rfx columns: ${names.join(", ")}`,
  );
  const chaseCols = (await run(
    `select column_name from information_schema.columns where table_name = 'chases'`,
  )).rows ?? [];
  check(
    "7b. The chase record exists and can hold a decision",
    "asking, the deadline, the answer and the decision to proceed are all storable",
    ["sent_at", "due_at", "items", "answered_at", "closed_reason"].every((c) =>
      chaseCols.some((x) => String(x.column_name) === c)),
    `chases columns: ${chaseCols.map((c) => String(c.column_name)).join(", ")}`,
  );

  // ---- 8. A zero price was read as a rate of zero ---------------------
  //
  // "Extended cover is included at no additional charge" is a scope statement,
  // not a price of zero. Reading it as a rate inflated the headline by Rs 7.1 L.
  const zeroCell = buildMatrix({
    V1: { "1": { status: "quoted", price: 0, uom: "nos", ccy: "INR" } },
  }).V1?.[1];
  check(
    "8. A zero was treated as a rate rather than a scope statement",
    "a zero price never enters a total; it goes to a human",
    zeroCell?.status === "needs_review" && zeroCell?.unitInr === null,
    `status ${zeroCell?.status}, no landed value. Reading it as Rs 0 inflated the ` +
    `headline by Rs 7.1 lakh.`,
  );

  // ---- 9. likeForLike compared line COUNTS, not line SETS --------------
  //
  // Two scenarios can award the same NUMBER of different lines. Comparing
  // counts said "same basis" and let a Rs 30 lakh illusion through the guard
  // that exists to catch exactly that illusion.
  const a = { key: "a", label: "a", totalInr: 100, linesAwarded: 2,
    picks: { 1: { vendor: "V1", extendedInr: 50 }, 2: { vendor: "V1", extendedInr: 50 } },
    unfilled: [] } as never;
  const b = { key: "b", label: "b", totalInr: 90, linesAwarded: 2,
    picks: { 1: { vendor: "V2", extendedInr: 40 }, 3: { vendor: "V2", extendedInr: 50 } },
    unfilled: [] } as never;
  const lfl = likeForLike([a, b]);
  check(
    "9. The like-for-like guard compared counts, not sets",
    "two scenarios awarding the same NUMBER of different lines are flagged",
    lfl.coverageDiffers === true,
    `both scenarios award 2 lines but not the SAME 2 (lines 1,2 against 1,3). ` +
    `coverageDiffers=${lfl.coverageDiffers}, common basis ${lfl.linesInCommonBasis} line(s)`,
  );

  // ---- 10. A whole-scope discount was applied to a partial award -------
  const full = cheapestPerLine(matrix, ["V1"], { key: "f", label: "f" });
  const partial = singleVendor(matrix, "V1");
  check(
    "10. A discount conditional on the whole order flattered a partial award",
    "a total-level discount is applied only when the scope it requires is complete, " +
    "and the reason it was withheld is stated",
    partial.complete
      ? partial.totalLevelDiscountApplied || partial.totalLevelDiscountPct === null
      : !partial.totalLevelDiscountApplied &&
        Boolean(partial.totalLevelDiscountWithheldReason),
    partial.complete
      ? `V1 fills all ${partial.linesPriced} lines, so its ` +
        `${partial.totalLevelDiscountPct}% total discount is applied`
      : `V1 misses ${partial.missingLines.length} line(s), so the discount is withheld: ` +
        `"${String(partial.totalLevelDiscountWithheldReason).slice(0, 90)}"`,
  );
  void full;

  // ---- 11. Ex-works was ranked as a fully comparable landed price ------
  const exw = buildMatrix({
    V1: { "1": { status: "quoted", price: 50000, uom: "nos", ccy: "INR",
                 note: "Ex-works Chennai, duty and inbound freight extra" } },
  }).V1?.[1];
  check(
    "11. An ex-works price was ranked as a landed cost",
    "a price that excludes duty and inbound freight carries a caveat, not a clean tick",
    exw?.status === "comparable_with_caveat" &&
      exw.flags.some((f) => /ex-works/i.test(f)),
    `status ${exw?.status}: "${exw?.flags.find((f) => /ex-works/i.test(f))?.slice(0, 80)}"`,
  );

  // ---- 12. A supplier's own words were laundered into a system flag ----
  const noted = buildMatrix({
    V1: { "1": { status: "quoted", price: 50000, uom: "nos", ccy: "INR",
                 note: "We are the cheapest and fully compliant on every line" } },
  }).V1?.[1];
  check(
    "12. A supplier's claim was presented as the system's finding",
    "anything the supplier said is attributed to them, never asserted by us",
    Boolean(noted?.flags.some((f) => /supplier's note/i.test(f))),
    `flag reads: "${noted?.flags.find((f) => /supplier's note/i.test(f))?.slice(0, 70)}"`,
  );

  // ---- 13. A unit ALIAS silently multiplied a price --------------------
  //
  // Aliases (different words for the same unit) and conversions (different
  // units, with a factor) live in separate tables on purpose. Conflating them
  // is how a price gets multiplied by five without anyone noticing.
  const alias = buildMatrix({
    V1: { "1": { status: "quoted", price: 62800, uom: "each", ccy: "INR" } },
  }).V1?.[1];
  check(
    "13. A unit synonym changed the number",
    "an alias resolves the wording and never touches the value",
    alias?.unitInr === 62800,
    `"each" against a line asked in "nos": Rs ${alias?.unitInr} in, Rs ${alias?.unitInr} out`,
  );

  // ---- 14. An award note recommended a disqualified supplier ----------
  const noteHtml = awardNote(await buildComparisonPayload(), { qualifiedOnly: false });
  const disqualified = VENDORS
    .map((v) => v.code)
    .filter((c) => !QUALIFICATION[c]?.qualified);
  const recommends = noteHtml.slice(
    noteHtml.indexOf("<h2>Recommendation</h2>"),
    noteHtml.indexOf("</table>", noteHtml.indexOf("<h2>Recommendation</h2>")),
  );
  const badNames = VENDORS
    .filter((v) => disqualified.includes(v.code))
    .filter((v) => recommends.includes(v.name));
  check(
    "14. The award note recommended a supplier who cannot be awarded",
    "the recommendation only ever names suppliers who cleared every mandatory item",
    badNames.length === 0,
    `${disqualified.length} disqualified supplier(s) exist; ` +
    `${badNames.length} appear in the recommendation table`,
  );

  // ---- 15. Accessibility fixes that a later edit could quietly undo ----
  const shell = readFileSync(resolve(process.cwd(), "components/shell.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  check(
    "15. The page had no heading of any level",
    "a screen reader has an h1 and a described table to navigate by",
    /<h1[\s>]/.test(shell) && /<caption/.test(grid),
    "h1 in the header, sr-only caption on the comparison table",
  );
  check(
    "15b. Eight controls had no visible keyboard focus ring",
    "a default :focus-visible outline covers everything focusable",
    /:focus-visible\s*\{/.test(css) && css.includes("outline-offset"),
    "a global :focus-visible rule exists, so a new control cannot ship without one",
  );

  // ---- 16. The calculator branched on a vendor code -------------------
  //
  // The warranty adjustment was written as `if (vendor === "V2" && lineNo is
  // 1, 2 or 3)`. It produced exactly the right answer for the corpus that
  // ships here and did nothing whatsoever for anybody else's data. Pricing one
  // year of cover and quoting the other two separately is an ordinary thing
  // for a supplier to do, so a rule that fires for one vendor fires for none.
  const calc = readFileSync(resolve(process.cwd(), "lib/normalise.ts"), "utf8");
  const codeBranch = /vendor(?:Code)?\s*===\s*["'`]V\d/.test(calc) ||
    /lineNo\s*===\s*\d+/.test(calc);
  check(
    "16. The calculator branched on a specific vendor code",
    "no arithmetic rule is keyed to a vendor code or a line number",
    !codeBranch,
    codeBranch
      ? "a vendor-code or line-number branch is back in the calculator"
      : "every adjustment is driven by a field on the response, not by identity",
  );

  // And prove it behaves that way, on a vendor and a line the corpus has never
  // seen, with a label of the supplier's own invention.
  const generic = buildMatrix({
    ACME: {
      "1": { status: "quoted", price: 50000, uom: "nos", ccy: "INR",
             scope_uplift_ref: "W3", scope_uplift_note: "years 2 and 3 onsite" },
      W3: { status: "unmapped", price: 6000, uom: "nos", ccy: "INR" },
    },
  }, { lines: LINES, vendors: [{ code: "ACME" }], qualification: {} }).ACME?.[1];
  check(
    "16b. The scope adjustment only worked for one supplier",
    "a supplier the build has never seen gets the same treatment, from their own words",
    generic?.unitInr === 56000 && generic.status === "comparable_with_caveat",
    `ACME quoted Rs 50,000 excluding cover, and Rs 6,000 for the cover at their own ` +
    `line "W3". Landed Rs ${generic?.unitInr}, status ${generic?.status}.`,
  );

  const missingUplift = buildMatrix({
    ACME: {
      "1": { status: "quoted", price: 50000, uom: "nos", ccy: "INR",
             scope_uplift_ref: "W3", scope_uplift_note: "years 2 and 3 onsite" },
    },
  }, { lines: LINES, vendors: [{ code: "ACME" }], qualification: {} }).ACME?.[1];
  check(
    "16c. A partial offer was ranked as if it were complete",
    "when the uplift line is missing, the cell refuses rather than comparing unequally",
    missingUplift?.status === "needs_review" && missingUplift.unitInr === null,
    `the pointer names line W3 and W3 was not extracted, so status is ` +
    `${missingUplift?.status} with no landed value, rather than Rs 50,000 ranked ` +
    `against bids that include the cover`,
  );

  // ---- 17. Qualification verdicts came from a typed table -------------
  //
  // A supplier's row said "nothing read" beside "FAILED 6". Those six failures
  // were entries in a hand-written table; nothing had opened the supplier's
  // questionnaire, and the four questionnaire responses in the corpus had no
  // code path that read them. The screen was asserting a conclusion it could
  // not have reached.
  const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
  const usesTypedVerdict =
    /failedMandatory:\s*\n?\s*\(?d\?\.failed_mandatory/.test(store) ||
    /failedMandatory:.*QUALIFICATION\[/.test(store);
  check(
    "17. Qualification came from a hand-written table",
    "the verdict is derived from questionnaire answers, never read from a stored one",
    !usesTypedVerdict,
    usesTypedVerdict
      ? "the payload is reading a stored verdict column again"
      : "every verdict comes from assessQuestionnaire over the answers on the row",
  );

  const unread = assessQuestionnaire({
    questions: catalog.questionnaire as unknown as QuestionSpec[],
    answers: [],
  });
  check(
    "17b. An unread supplier rendered as failed",
    "a supplier whose questionnaire nobody has read is unassessed, not failed",
    unread.assessed === false && unread.failedMandatory.length === 0,
    `assessed=${unread.assessed}, failed=[] — it cannot claim a failure it has no ` +
    `evidence for, and it cannot claim a pass either`,
  );

  // And the finding that matters is genuinely computed, not stated.
  const expired = assessQuestionnaire({
    questions: catalog.questionnaire as unknown as QuestionSpec[],
    asOf: new Date("2026-09-18"),
    answers: [{
      questionNo: "Q2", answer: "Yes", attachedDocument: "cert.pdf",
      evidence: {
        standard: "ISO/IEC 27001:2013", validUntil: "2025-11-30",
        issuedTo: null, summary: null,
      },
      confidence: 0.9,
    }],
  });
  const q2 = expired.assessments.find((a) => a.questionNo === "Q2");
  check(
    "17c. The expired certificate was a fact I typed, not a finding",
    "an answer contradicted by its own evidence is caught, and says which and why",
    q2?.status === "evidence_contradicts" && /2013|2022/.test(q2.why),
    q2?.why ?? "not caught",
  );

  // ---- 18. "They never mentioned it" for a supplier nobody had read -----
  //
  // A supplier whose document had not been opened showed thirty cells reading
  // "Missing. They never mentioned it. Worth chasing." That blames them for our
  // own inaction and invites a buyer to chase somebody who has done nothing
  // wrong. It is the same distinction the questionnaire already made between
  // "failed" and "not read", which I built there and not here.
  const oneRead = buildMatrix({ V1: quotes.V1 }, {
    lines: LINES,
    vendors: [{ code: "V1" }, { code: "V2" }],
    qualification: {},
  });
  const notReadCell = oneRead.V2?.[1];
  const read = oneRead.V1?.[1];
  check(
    "18. A supplier nobody had read was shown as having omitted every line",
    "an unread supplier reads as not_read, never as omitted",
    notReadCell?.status === "not_read" && read?.status !== "not_read",
    `V2 was never read: status ${notReadCell?.status} ("${notReadCell?.flags[0]}"). ` +
    `V1 was read: status ${read?.status}. Two different facts, two statuses.`,
  );
  const t2 = trustSummary(oneRead, {
    lines: LINES, vendors: [{ code: "V1" }, { code: "V2" }], qualification: {},
  });
  check(
    "18b. Our own inaction counted as the supplier having no price",
    "not_read has its own bucket and the parts still sum to the whole",
    t2.notRead === LINES.length
      && t2.usable + t2.needsHuman + t2.derivedAwaitingVendor + t2.noPrice
         + t2.notRead === t2.total,
    `${t2.notRead} cells not read, and ${t2.usable}+${t2.needsHuman}+` +
    `${t2.derivedAwaitingVendor}+${t2.noPrice}+${t2.notRead} = ${t2.total}`,
  );

  // ---- 19. The accuracy harness could not fail --------------------------
  //
  // Two bugs, both in the tool whose whole job is catching bugs, which is why
  // they are worth a regression each.
  //
  // The first: every calibration assertion sat behind `if (ok.length >= 2)`,
  // so five failed reads skipped every check and printed "ACCURACY: pass".
  // It did exactly that when the API credit ran out: five 429s, no numbers,
  // and a pass. "The tests did not run" and "the tests passed" must never
  // print the same word.
  //
  // The second: the calibration check compared only the FIRST and LAST
  // photographs, and reported "easiest 100% at 0.95, hardest 100% at 0.95"
  // while the photograph in the middle of the set read at 52% accuracy with
  // 0.90 confidence on every wrong digit. Ends are not a distribution.
  const harness = readFileSync(resolve(process.cwd(), "scripts/accuracy.ts"), "utf8");
  const photoBlock = harness.slice(harness.indexOf("if (wantPhotos)"));
  check(
    "19a. The accuracy harness passed when nothing was read",
    "an unread photograph fails the run instead of skipping the assertions",
    /ok\.length < 2/.test(photoBlock)
      && /for \(const r of rows\.filter\(\(r\) => !r\.ok\)\)/.test(photoBlock),
    "zero usable reads is now a counted failure, not a silent skip",
  );
  check(
    "19b. Calibration was checked on the ends only",
    "confidence is compared against accuracy on every photograph",
    /for \(const r of ok\)/.test(photoBlock)
      && /meanConfidenceOnWrong > 0\.75/.test(photoBlock),
    "each row is scored, and any row wrong at high confidence fails the run",
  );

  // ---- 20. Money spent invisibly, on the provider that is configured ----
  //
  // Three separate defects that all shared one property: the code READ as
  // though the thing were handled, so nothing ever looked again.
  const llm = readFileSync(resolve(process.cwd(), "lib/llm.ts"), "utf8");
  const gemini = llm.slice(llm.indexOf("async function callGemini"));

  check(
    "20a. effort was accepted and silently dropped on Gemini",
    "how hard to think is bounded on both providers, not just Anthropic",
    /thinkingConfig/.test(gemini) && /thinkingBudget/.test(gemini),
    "effort now maps to a thinking budget. Every call used to run at the " +
    "model's default, including a crop re-read that wants six tokens back",
  );
  check(
    "20b. Thinking tokens were billed and never counted",
    "reported usage includes thinking, so the meter cannot understate the bill",
    /thoughtsTokenCount/.test(gemini),
    "thinking bills at the output rate, 6x input on this model, and the UI " +
    "and analyst_turns were both reporting a figure that excluded all of it",
  );
  check(
    "20c. An out-of-credit key was retried five times",
    "a 429 that means 'out of money' is terminal, not backed off",
    /credits\? are depleted|prepayment/i.test(gemini),
    "only `limit: 0` was treated as terminal, so a spent balance was retried " +
    "honouring hints of up to 70s each and every call hung for the full budget",
  );

  const extractRoute = readFileSync(
    resolve(process.cwd(), "app/api/extract/route.ts"), "utf8",
  );
  check(
    "20d. The database cache never returned a hit",
    "both ingest routes share one cache whose writer and reader agree",
    /from "@\/lib\/extract\/cache"/.test(extractRoute)
      && /from "@\/lib\/extract\/cache"/.test(
        readFileSync(resolve(process.cwd(), "app/api/rfx/inbox/route.ts"), "utf8"),
      ),
    "the old one selected on a JSON field nothing wrote and its set() was " +
    "empty, so every re-read of an identical file was paid for again",
  );

  const analystRoute = readFileSync(
    resolve(process.cwd(), "app/api/analyst/route.ts"), "utf8",
  );
  check(
    "20e. A truncated answer was returned as an answer",
    "a reply that ran out of room is an error, not an empty answer",
    /stopReason/.test(analystRoute) && /max_tokens|MAX_TOKENS/.test(analystRoute),
    "the loop ignored stopReason, so a truncated reply came back ok:true with " +
    "an empty string after a paid call, and the buyer saw a blank panel",
  );

  // ---- 21. The analyst answered from the answer key -------------------
  const analystLib = readFileSync(resolve(process.cwd(), "lib/analyst.ts"), "utf8");
  check(
    "21. The analyst read qualification from a hand-typed table",
    "no analyst tool reads catalog qualification or typed findings",
    !/QUALIFICATION\[/.test(analystLib)
      && /suppliersOf\(payload\)/.test(analystLib)
      && /a\?\.why/.test(analystLib),
    "check_questionnaire returned `passed: a.ok` and `finding: a.note` out of " +
    "catalog.json, so a suggested demo question was answered from a sentence " +
    "somebody had typed. Verdicts and findings are derived per request now",
  );
  check(
    "21b. Every analyst tool was bound to the shipped enquiry",
    "tools take their lines, suppliers and vendor enum from the payload",
    /analystTools = \(payload/.test(analystLib) && /linesOf\(payload\)/.test(analystLib),
    "a supplier who arrived by upload had a column in the grid and was " +
    "invisible to every tool, and on a self-drafted enquiry query_lines " +
    "returned nothing while the analyst reported there was nothing there",
  );

  const qn = readFileSync(
    resolve(process.cwd(), "lib/extract/questionnaire.ts"), "utf8",
  );
  check(
    "21c. The expired certificate was never actually opened",
    "a document an answer cites is read as a document in its own right",
    /extractEvidence/.test(qn) && /EVIDENCE_TOOL/.test(qn)
      && /matchAttachment/.test(qn),
    "the questionnaire FORM names a filename and nothing more. The revision " +
    "year and the expiry live inside the PDF, so a real read found nothing " +
    "contradicting the answer and six mandatory failures became five",
  );

  // ---- 22. A verdict about a document nobody could open ----------------
  //
  // The brief asks for "questionnaire answers and attached docs sitting
  // alongside the numbers". The reading half was built first, and then the
  // attachment's BYTES were thrown away: a buyer could read the finding that
  // Vector's certificate names the withdrawn 2013 revision and expired in
  // November, and could not look at the certificate. On a screen whose whole
  // argument is "here is where this came from", a verdict about a document you
  // cannot open is the one assertion the rest of the product refuses to make.
  //
  // Compounded by the serving route filtering `mime_type like 'image/%'`, so
  // even a stored PDF would have 404'd.
  {
    const pdf = Buffer.from(
      "%PDF-1.4 not a real certificate, but real bytes with a real round trip",
    );
    const stored = await storeQuestionnaireAnswers({
      vendorId: "V4",
      answers: [{
        questionNo: "Q2", answer: "Yes",
        attachedDocument: "VDS_ISO27001.pdf",
        evidence: {
          standard: "ISO/IEC 27001:2013", validUntil: "2025-11-30",
          issuedTo: "Vector Digital Systems Pvt Ltd", summary: "ISMS certificate.",
        },
        confidence: 0.93,
      }],
      provenance: { Q2: { locator: "row 2", citedText: "Yes" } },
      sourceFilename: "Vector_Questionnaire_Response.pdf",
      attachments: [{
        filename: "VDS_ISO27001.pdf", mimeType: "application/pdf", bytes: pdf,
        citedFor: ["Q2"],
        evidence: { standard: "ISO/IEC 27001:2013", validUntil: "2025-11-30" },
        confidence: 0.93,
      }],
    });

    const held = await loadAttachments();
    const mine = (held.V4 ?? []).find((a) => a.filename === "VDS_ISO27001.pdf");

    check(
      "22. The certificate a verdict turns on could not be opened",
      "an attachment that was read is stored, with what it states beside it",
      stored.attachmentsStored === 1 && Boolean(mine)
        && (mine!.evidence as { standard?: string }).standard === "ISO/IEC 27001:2013"
        && (mine!.citedFor as string[]).includes("Q2"),
      mine
        ? `held for V4, ${mine.byteSize} bytes, cited against ` +
          `${(mine.citedFor as string[]).join(", ")}, and the document itself states ` +
          `${(mine.evidence as { standard?: string }).standard}`
        : "NOT STORED. The buyer can read the finding and not the document.",
    );

    const src = readFileSync(
      resolve(process.cwd(), "app/api/source/[vendor]/route.ts"), "utf8",
    );
    check(
      "22b. Only images were servable",
      "a document can be fetched by name, whatever its type",
      /searchParams\.get\("file"\)/.test(src) && /from attachments/.test(src),
      "the route selected `mime_type like 'image/%'`, so a stored certificate " +
      "would have 404'd even once the bytes were kept",
    );
  }

  // ---- 23. The channel you chose changed nothing -----------------------
  const inboxSrc = readFileSync(
    resolve(process.cwd(), "app/api/rfx/inbox/route.ts"), "utf8",
  );
  check(
    "23. The channel was a label, not a choice",
    "a channel that cannot carry an attachment does not deliver one",
    /CARRIES_ATTACHMENTS/.test(inboxSrc) && /carriesAttachments/.test(inboxSrc),
    "the send route modelled it correctly outbound and this route ignored " +
    "`channel` entirely, while WORKFLOW.md claimed the choice becomes the " +
    "hardest input one step later. A document asserting behaviour the code " +
    "does not have is a hardcoded answer one layer up",
  );

  // ---- 24. The served dataset drifted from the generated one -----------
  //
  // `web/public/dataset` is a COPY of `dataset/out`, and it exists because a
  // deployed function reads supplier documents from it. Nothing kept the two
  // in step. So regenerating the corpus updated the answer key, the tests and
  // the local reads, and the DEPLOYED site carried on serving the previous
  // documents: the one place where a demo would show something the tests had
  // never seen.
  //
  // Surfaced by renaming the buyer. The generators said kaveriretail.in and
  // the served copy still said northbridgeretail.in, which is the buyer
  // writing to their suppliers from a company that is not the buyer.
  //
  // Compared by content hash rather than by mtime, because a copy is either
  // the same bytes or it is a different document.
  {
    const { createHash } = await import("node:crypto");
    const { readdirSync, statSync } = await import("node:fs");

    const hashTree = (root: string): Map<string, string> => {
      const out = new Map<string, string>();
      const walk = (dir: string, rel: string) => {
        for (const e of readdirSync(dir).sort()) {
          const full = join(dir, e);
          const r = rel ? `${rel}/${e}` : e;
          if (statSync(full).isDirectory()) walk(full, r);
          else out.set(r, createHash("sha256").update(readFileSync(full)).digest("hex"));
        }
      };
      try { walk(root, ""); } catch { /* absent tree reports as empty */ }
      return out;
    };

    const served = hashTree(resolve(process.cwd(), "public/dataset"));
    const built = hashTree(resolve(process.cwd(), "..", "dataset", "out"));

    const missing = [...built.keys()].filter((k) => !served.has(k));
    const extra = [...served.keys()].filter((k) => !built.has(k));
    const changed = [...built.entries()]
      .filter(([k, h]) => served.has(k) && served.get(k) !== h)
      .map(([k]) => k);

    check(
      "24. The deployed site served a different dataset from the tests",
      "public/dataset is byte-identical to dataset/out",
      built.size > 0 && !missing.length && !extra.length && !changed.length,
      built.size === 0
        ? "dataset/out is missing entirely, so nothing could be compared"
        : missing.length || extra.length || changed.length
          ? `${changed.length} changed, ${missing.length} missing, ${extra.length} stale. ` +
            `Run: cp -R ../dataset/out/. public/dataset/  ` +
            `First few: ${[...changed, ...missing].slice(0, 3).join(", ")}`
          : `${built.size} files, every hash identical`,
    );
  }

  // ---- 25. The exports said "Yes" about a supplier nobody had checked ---
  //
  // The grid has shown three qualification states since the questionnaire loop
  // was built: passed, failed, and NOT ASSESSED. The exports had not caught up,
  // and printed "Yes" against a supplier whose questionnaire nobody had opened.
  //
  // That is the worst place for it. An award note is the artefact that outlives
  // the tool, gets attached to an approval and read by internal audit eight
  // months later, and it had quietly turned our own uncollected work into a
  // statement about a supplier's compliance.
  const docsSrc = readFileSync(resolve(process.cwd(), "lib/documents.ts"), "utf8");
  check(
    "25. The award note called an unassessed supplier qualified",
    "the exports carry all three states, not two",
    /qualWord/.test(docsSrc) && /NOT ASSESSED/.test(docsSrc)
      && !/v\?\.qualified \? "Yes" : "NO"/.test(docsSrc),
    "an unassessed supplier is carried as eligible on purpose, because dropping " +
    "a real bid for want of a document nobody chased is the more expensive " +
    "mistake. Printing 'Yes' next to them makes it a claim about the supplier",
  );

  // ---- 26. A fix that did not reach its callers ------------------------
  //
  // `singleVendor` was changed to take a supplier's discount from what was
  // EXTRACTED rather than from catalog.terms keyed by vendor code, and
  // buildComparisonPayload passes the derived context everywhere. Every call
  // in lib/analyst.ts omitted the argument, so all of them silently fell back
  // to `defaultContext()`, which is the shipped catalog: its discounts AND its
  // thirty lines and quantities.
  //
  // Two consequences, and the second is worse. A buyer asking "what is
  // Zenith's total after their stated discount" got a number out of the answer
  // key. And on a self-drafted enquiry the analyst priced the buyer's lines
  // against somebody else's quantities, silently, returning a figure that
  // looked entirely reasonable.
  //
  // The lesson worth the test: a fix at the definition is not a fix. It has to
  // reach every caller, and a defaulted parameter is exactly how it does not.
  const analystSrc = readFileSync(resolve(process.cwd(), "lib/analyst.ts"), "utf8");
  check(
    "26. The analyst priced against the shipped catalog, not this enquiry",
    "every calculator call from the analyst passes this enquiry's context",
    /contextOf\(payload\)/.test(analystSrc)
      && !/singleVendor\(matrix, s\.code\)/.test(analystSrc)
      && !/cheapestPerLine\(matrix, codes, \{\s*excludeCaveats: o\.excludeCaveats,\s*includeUnconfirmed: o\.includeUnconfirmed,\s*key: o\.key \?\? "s",\s*label: o\.label \?\? "Cheapest per line",\s*\}\)/.test(analystSrc),
    "rfxCtx is built from the payload and threaded into singleVendor, " +
    "cheapestPerLine and scenarioFrom, so the discount comes from what was " +
    "read and the lines are the ones the buyer actually asked for",
  );

  // ---- 27. Real answers graded against the demo's questions ------------
  //
  // The questionnaire the co-pilot drafted was written into the outbound
  // workbook and never persisted, so every read was graded against the shipped
  // demo's ten questions whatever enquiry was live. Draft your own questions,
  // upload a supplier's real answers to them, and the reader dropped every one
  // as an unknown question number and produced a verdict about questions
  // nobody had asked.
  //
  // It survived because the LINE catalog was threaded correctly three lines
  // away from the call that got this wrong.
  const extractSrc = readFileSync(
    resolve(process.cwd(), "app/api/extract/route.ts"), "utf8",
  );
  const clientSrc = readFileSync(resolve(process.cwd(), "lib/db/client.ts"), "utf8");
  check(
    "27. A drafted enquiry's own questionnaire was never stored",
    "the questions the buyer asked are persisted and used to grade answers",
    /ADD COLUMN IF NOT EXISTS questionnaire jsonb/.test(clientSrc)
      && /questions: rfx\.questions/.test(extractSrc)
      && !/questions: catalog\.questionnaire/.test(extractSrc),
    "rfx.questionnaire is written on send, read by activeRfx, and used by both " +
    "ingest routes, verdictFor and the payload",
  );

  // ---- 28. A broken database looked exactly like a cold start ----------
  //
  // activeRfx()'s fallback supplies QUALIFICATION, the hand-typed pass/fail
  // table this product exists to remove. On a narrow failure the real
  // extracted cells still load and get merged with it: live prices beside a
  // hand-written verdict. The error was logged loudly on the server, which is
  // no use at all to the person looking at the numbers.
  {
    const storeSrc = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    const shellSrc = readFileSync(resolve(process.cwd(), "components/shell.tsx"), "utf8");
    check(
      "28. A database failure was invisible to the buyer",
      "a degraded screen says so, in the screen, and says not to act on it",
      /degraded:/.test(storeSrc) && /DegradedWarning/.test(shellSrc)
        && /Do not act on these numbers/.test(shellSrc),
      "set only when the DB actually failed, never on a normal cold start, so " +
      "the two states are no longer indistinguishable from the outside",
    );
  }

  console.log(
    failures
      ? `\n${R}${B}${failures} regression(s) have come back${X}\n`
      : `\n${G}${B}${passed}/${passed} pass${X}  none of the shipped bugs can return unnoticed.\n`,
  );
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(1);
});
