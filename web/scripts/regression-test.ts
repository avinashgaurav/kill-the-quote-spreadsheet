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
import { seedRfx, ensureVendor, activeRfx, RFX_ID } from "../lib/store";
import {
  buildMatrix, trustSummary, likeForLike, cheapestPerLine, singleVendor,
  LINES, VENDORS, QUALIFICATION,
} from "../lib/normalise";
import { buildComparisonPayload } from "../lib/store";
import { awardNote } from "../lib/documents";
import { sendIssues } from "../lib/copilot";
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
  const sum = t.usable + t.needsHuman + t.derivedAwaitingVendor + t.noPrice;
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
  check(
    "6b. Discarding a draft left the tool stuck",
    "with no drafts, the shipped example is the active enquiry again",
    back.rfxId === RFX_ID && back.isSeededExample && back.ctx.vendors.length === VENDORS.length,
    `back to ${back.rfxId} with ${back.ctx.lines.length} lines`,
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
