/**
 * Every number the documents claim, computed from the calculator.
 *
 *   npx tsx scripts/doc-numbers.ts
 *
 * BUILD-PLAN.md opens by asserting that every figure in it is reproducible
 * from a runnable script. An audit found eleven that were not: a cell census
 * of 99/8 where the calculator says 89/17, a like-for-like story of
 * "Rs 30 lakh cheaper, Rs 1 lakh dearer" where the live figures are Rs 77.5
 * lakh and Rs 4.14 lakh, Helios described as pricing 6 of 30 lines when they
 * priced 2, and test counts that had drifted in both directions.
 *
 * None of them changed a conclusion. All of them are the kind of thing a
 * reviewer finds in one command, in a submission whose entire argument is that
 * its numbers can be trusted. So the numbers now come from here, and this file
 * is the thing to re-run before touching a document.
 */

import raw from "../lib/data/raw-quotes.json";
import {
  buildMatrix, cheapestPerLine, singleVendor, likeForLike, trustSummary,
  cellStatusCounts, costOfCompliance, LINES, VENDORS, QUALIFICATION,
  inr, inrShort,
} from "../lib/normalise";

const m = buildMatrix((raw as unknown as { quotes: Parameters<typeof buildMatrix>[0] }).quotes);
const all = VENDORS.map((v) => v.code);
const qualified = all.filter((c) => QUALIFICATION[c].qualified);

const line = (k: string, v: string) => console.log(`  ${k.padEnd(46)} ${v}`);

console.log("\n=== CELL CENSUS (150 cells) ===");
const counts = cellStatusCounts(m);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  if (v) line(k, String(v));
}
const t = trustSummary(m);
console.log("\n=== TRUST BAR ===");
line("total", String(t.total));
line("in the award (usable)", String(t.usable));
line("  of which off-spec but counted", String(t.awardableWithCaveat));
line("excluded", String(t.excluded));
line("needs a human", String(t.needsHuman));
line("derived, awaiting supplier", String(t.derivedAwaitingVendor));
line("no price", String(t.noPrice));
line("not read", String(t.notRead));
line(
  "the five parts sum to the total",
  String(t.usable + t.needsHuman + t.derivedAwaitingVendor + t.noPrice + t.notRead
    === t.total),
);

console.log("\n=== HEADLINE ===");
const cheapAll = cheapestPerLine(m, all, { key: "a", label: "all" });
const cheapQual = cheapestPerLine(m, qualified, { key: "q", label: "qualified" });
line("cheapest ignoring the questionnaire", `${inrShort(cheapAll.totalInr)} over ${cheapAll.linesAwarded} lines`);
line("cheapest among qualified", `${inrShort(cheapQual.totalInr)} over ${cheapQual.linesAwarded} lines`);
const coc = costOfCompliance(m);
line("cost of compliance", `${inrShort(coc.deltaInr)} (${coc.deltaPct.toFixed(1)}%)`);

console.log("\n=== STRICT COMPLIANCE, the like-for-like guard ===");
const strict = cheapestPerLine(m, qualified, {
  key: "s", label: "strict", excludeCaveats: true,
});
line("strict total", `${inr(strict.totalInr)} over ${strict.linesAwarded} lines`);
const lfl = likeForLike([cheapQual, strict]);
line("headline difference", inrShort(Math.abs(cheapQual.totalInr - strict.totalInr)));
line("coverage differs?", String(lfl.coverageDiffers));
line("lines in the common basis", String(lfl.linesInCommonBasis));
line("common basis share", `${(lfl.commonBasisShare * 100).toFixed(0)}%`);
line("common basis too thin to use?", String(lfl.commonBasisTooThin));
for (const r of lfl.scenarios) {
  line(`  ${r.key} headline`, `${inr(r.headlineTotalInr)} over ${r.linesAwarded} lines`);
  line(`  ${r.key} restated like-for-like`, inr(r.likeForLikeTotalInr));
}
const [a, b] = lfl.scenarios;
line(
  "LIKE-FOR-LIKE DIFFERENCE",
  `${inrShort(Math.abs(a.likeForLikeTotalInr - b.likeForLikeTotalInr))} ` +
  `(${a.likeForLikeTotalInr < b.likeForLikeTotalInr ? a.key : b.key} is cheaper)`,
);

console.log("\n=== PER SUPPLIER ===");
for (const v of VENDORS) {
  const s = singleVendor(m, v.code);
  const cells = Object.values(m[v.code] ?? {});
  const priced = cells.filter((c) => c.unitInr !== null).length;
  line(
    `${v.code} ${v.name.split(" ")[0]}`,
    `${s.linesPriced} awardable, ${priced} with a number, ` +
    `${LINES.length - priced} without · ${inrShort(s.totalInr)}` +
    (s.totalLevelDiscountPct ? ` · states ${s.totalLevelDiscountPct}%` : ""),
  );
}
console.log("");
