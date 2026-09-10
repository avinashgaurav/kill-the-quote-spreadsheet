/**
 * Conformance test: does the TypeScript calculator agree with the Python one?
 *
 *   npm run conformance
 *
 * The Python implementation (dataset/generators/normalise.py) was written and
 * verified against the dataset first, so it is the reference. If the two
 * disagree, this file's job is to say exactly where, and the TypeScript is
 * wrong until proven otherwise.
 *
 * This tests the calculator in ISOLATION from the extractor: both sides are fed
 * identical raw quotes from the fixture, so any difference is an arithmetic or
 * rule bug, never a misread document. That separation is the point. Without it,
 * a wrong total could be either component and you would not know which.
 *
 * Checked, per cell: status, landed unit price, extended total.
 * Then: every award scenario, and the like-for-like guard.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMatrix, cellStatusCounts, trustSummary, singleVendor, cheapestPerLine,
  likeForLike, costOfCompliance, LINES, VENDORS, QUALIFICATION,
  BASELINE_TOTAL_INR, inr, inrShort, type RawQuote, type Matrix,
} from "../lib/normalise";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORACLE = join(HERE, "..", "..", "dataset", "out", "99-internal", "ground-truth.json");
const FIXTURE = join(HERE, "..", "lib", "data", "raw-quotes.json");

interface OracleCell {
  status: string;
  unit_inr: number | null;
  extended_inr?: number | null;
  flags: string[];
}
interface Oracle {
  baseline_total_inr: number;
  cells: Record<string, Record<string, OracleCell>>;
  cell_status_counts: Record<string, number>;
  scenarios: {
    single_vendor: Record<string, { total_inr: number; lines_priced: number;
      total_after_stated_discount_inr: number }>;
    split_all_vendors: { total_inr: number; lines_awarded: number };
    split_qualified_only: { total_inr: number; lines_awarded: number };
    split_qualified_no_caveats: { total_inr: number; lines_awarded: number };
    cost_of_compliance_inr: number;
  };
}

const oracle: Oracle = JSON.parse(readFileSync(ORACLE, "utf8"));
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
  quotes: Record<string, Record<string, RawQuote>>;
};

let checks = 0;
const failures: string[] = [];

function eq(label: string, got: unknown, want: unknown) {
  checks += 1;
  if (got !== want) failures.push(`${label}\n      got  ${got}\n      want ${want}`);
}

// ---------------------------------------------------------------------------

const matrix: Matrix = buildMatrix(fixture.quotes);

console.log("=".repeat(78));
console.log("CONFORMANCE: TypeScript calculator vs Python reference");
console.log("=".repeat(78));

// --- 1. baseline -----------------------------------------------------------
eq("baseline total", BASELINE_TOTAL_INR, oracle.baseline_total_inr);

// --- 2. every cell ---------------------------------------------------------
const statusMismatch: string[] = [];
const valueMismatch: string[] = [];

for (const v of VENDORS) {
  for (const line of LINES) {
    const mine = matrix[v.code][line.no];
    const theirs = oracle.cells[v.code]?.[String(line.no)];
    if (!theirs) {
      failures.push(`oracle has no cell ${v.code} L${line.no}`);
      continue;
    }
    checks += 2;
    if (mine.status !== theirs.status) {
      statusMismatch.push(`${v.code} L${line.no}: got '${mine.status}', want '${theirs.status}'`);
    }
    const wantUnit = theirs.unit_inr;
    if (mine.unitInr !== wantUnit) {
      valueMismatch.push(
        `${v.code} L${line.no}: got ${mine.unitInr}, want ${wantUnit}`,
      );
    }
    // Extension must use the ASKED quantity.
    if (mine.unitInr !== null) {
      checks += 1;
      const wantExt = (wantUnit as number) * line.qty;
      if (mine.extendedInr !== wantExt) {
        valueMismatch.push(
          `${v.code} L${line.no} extended: got ${mine.extendedInr}, want ${wantExt}`,
        );
      }
    }
  }
}

const cellsTotal = VENDORS.length * LINES.length;
console.log(`\nCELLS  ${cellsTotal} checked`);
console.log(`  status matches   ${cellsTotal - statusMismatch.length}/${cellsTotal}`);
console.log(`  value  matches   ${cellsTotal - valueMismatch.length}/${cellsTotal}`);
if (statusMismatch.length) {
  console.log("\n  STATUS MISMATCHES");
  statusMismatch.forEach((m) => console.log(`    ${m}`));
  failures.push(`${statusMismatch.length} cell status mismatches`);
}
if (valueMismatch.length) {
  console.log("\n  VALUE MISMATCHES");
  valueMismatch.forEach((m) => console.log(`    ${m}`));
  failures.push(`${valueMismatch.length} cell value mismatches`);
}

// --- 3. status census ------------------------------------------------------
const counts = cellStatusCounts(matrix);
console.log("\nCENSUS");
for (const k of Object.keys(oracle.cell_status_counts).sort()) {
  const got = counts[k] ?? 0;
  const want = oracle.cell_status_counts[k];
  console.log(`  ${k.padEnd(26)} ${String(got).padStart(3)}  ${got === want ? "ok" : `WANT ${want}`}`);
  eq(`census ${k}`, got, want);
}
const trust = trustSummary(matrix);
console.log(`  ${"-> usable".padEnd(26)} ${String(trust.usable).padStart(3)} of ${trust.total}`);
console.log(`  ${"-> needs a human".padEnd(26)} ${String(trust.needsHuman).padStart(3)}`);

// --- 4. single-vendor awards ----------------------------------------------
console.log("\nSINGLE-VENDOR AWARD");
for (const v of VENDORS) {
  const mine = singleVendor(matrix, v.code);
  const theirs = oracle.scenarios.single_vendor[v.code];
  const tag = QUALIFICATION[v.code].qualified ? "QUALIFIED   " : "DISQUALIFIED";
  const ok = mine.totalInr === theirs.total_inr && mine.linesPriced === theirs.lines_priced;
  console.log(
    `  ${v.code} ${tag} ${inr(mine.totalInr).padStart(16)}  ` +
    `(${String(mine.linesPriced).padStart(2)}/30)  ${ok ? "ok" : "MISMATCH"}`,
  );
  eq(`${v.code} total`, mine.totalInr, theirs.total_inr);
  eq(`${v.code} lines priced`, mine.linesPriced, theirs.lines_priced);
  eq(
    `${v.code} total after stated discount`,
    mine.totalAfterStatedDiscountInr,
    theirs.total_after_stated_discount_inr,
  );
}

// --- 5. split awards -------------------------------------------------------
const all = VENDORS.map((v) => v.code);
const qualified = all.filter((c) => QUALIFICATION[c].qualified);

const naive = cheapestPerLine(matrix, all, { key: "a", label: "all vendors" });
const compliant = cheapestPerLine(matrix, qualified, { key: "b", label: "qualified only" });
const strict = cheapestPerLine(matrix, qualified, {
  key: "c", label: "qualified, no caveats", excludeCaveats: true,
});

console.log("\nSPLIT AWARD, CHEAPEST PER LINE");
for (const [name, mine, theirs] of [
  ["a) all vendors            ", naive, oracle.scenarios.split_all_vendors],
  ["b) qualified only         ", compliant, oracle.scenarios.split_qualified_only],
  ["c) qualified, no caveats  ", strict, oracle.scenarios.split_qualified_no_caveats],
] as const) {
  const ok = mine.totalInr === theirs.total_inr && mine.linesAwarded === theirs.lines_awarded;
  console.log(
    `  ${name} ${inr(mine.totalInr).padStart(16)}  ` +
    `(${mine.linesAwarded}/30 lines)  ${ok ? "ok" : "MISMATCH"}`,
  );
  eq(`${name.trim()} total`, mine.totalInr, theirs.total_inr);
  eq(`${name.trim()} lines`, mine.linesAwarded, theirs.lines_awarded);
}

// --- 6. cost of compliance -------------------------------------------------
const coc = costOfCompliance(matrix);
console.log(
  `\nCOST OF COMPLIANCE  ${inr(coc.deltaInr)} (${coc.deltaPct.toFixed(1)}%)  ` +
  `= ${inrShort(coc.deltaInr)}`,
);
eq("cost of compliance", coc.deltaInr, oracle.scenarios.cost_of_compliance_inr);

// --- 7. the like-for-like guard -------------------------------------------
const lfl = likeForLike([naive, compliant, strict]);
console.log(`\nLIKE-FOR-LIKE GUARD  common basis = ${lfl.linesInCommonBasis} lines`);
for (const s of lfl.scenarios) {
  console.log(
    `  ${s.key})  headline ${inr(s.headlineTotalInr).padStart(16)} over ` +
    `${String(s.linesAwarded).padStart(2)} lines   |  like-for-like ` +
    `${inr(s.likeForLikeTotalInr).padStart(16)}`,
  );
}
checks += 1;
if (!lfl.coverageDiffers) {
  failures.push(
    "like-for-like guard did not fire: scenario (c) awards 29 lines against 30, " +
    "so coverageDiffers must be true or the guard is not protecting anything",
  );
} else {
  console.log("  guard fired: coverage differs, headline totals declared incomparable");
}

// The guard must also get the DIRECTION right: on a common basis, strict
// compliance has to be dearer than plain compliance, even though its headline
// total is lower. This is the trap the dataset exposed.
const b = lfl.scenarios.find((s) => s.key === "b")!;
const c = lfl.scenarios.find((s) => s.key === "c")!;
checks += 1;
if (!(c.headlineTotalInr < b.headlineTotalInr && c.likeForLikeTotalInr > b.likeForLikeTotalInr)) {
  failures.push(
    "the headline-vs-like-for-like inversion is not reproduced. Expected (c) " +
    "cheaper on headline but dearer on a common basis.",
  );
} else {
  console.log(
    `  inversion reproduced: (c) is ${inrShort(b.headlineTotalInr - c.headlineTotalInr)} ` +
    `cheaper on headline, ${inrShort(c.likeForLikeTotalInr - b.likeForLikeTotalInr)} ` +
    `dearer like-for-like`,
  );
}

// ---------------------------------------------------------------------------

console.log("\n" + "=".repeat(78));
if (failures.length === 0) {
  console.log(`PASS  ${checks} assertions, zero disagreements with the Python reference.`);
  console.log("The TypeScript calculator is a faithful port.");
  console.log("=".repeat(78));
} else {
  console.log(`FAIL  ${failures.length} problem(s) across ${checks} assertions:\n`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log("\nThe Python is the reference. Fix the TypeScript.");
  console.log("=".repeat(78));
  process.exit(1);
}
