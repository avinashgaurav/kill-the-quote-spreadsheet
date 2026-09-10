/**
 * The revised-quote test.
 *
 * "The vendor who sent a revised quote two days later" is one of the named ugly
 * edges, and it is the one that is dangerous precisely because nothing looks
 * wrong: two documents load, both write cells for the same supplier, and
 * whichever row the database hands back last silently wins. The buyer sees a
 * complete, confident column built out of two different quotations.
 *
 * So this drives the REAL code path (storeExtraction into loadComparison, on a
 * throwaway database) and asserts four things:
 *
 *   1. The later revision's price is what the grid shows.
 *   2. A line the revision does not mention is carried forward from the earlier
 *      quote and MARKED, not silently blanked and not silently shown as current.
 *   3. The supersession is reported: which lines moved, by how much, and which
 *      are unconfirmed.
 *   4. Two documents at the SAME revision (an email and its attachment) merge
 *      instead of superseding, because that is a different thing entirely.
 *
 * No API calls. Every input here is constructed, and the provenance says so.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), "revtest-"));
delete process.env.DATABASE_URL;

import { seedRfx, storeExtraction, loadComparison } from "../lib/store";
import { extractionSchema, validateExtraction } from "../lib/extract/contract";
import type { ExtractionMeta } from "../lib/extract/run";
import { LINES } from "../lib/normalise";

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`  ${condition ? `${G}pass${X}` : `${R}FAIL${X}`}  ${label}\n        ${D}${detail}${X}`);
  if (!condition) failures += 1;
}

const prov = (locator: string, cited: string) => ({
  locator, citedText: cited, method: "revision_test", page: null,
});

/** One row of a constructed quotation. */
const row = (no: number, price: number, cited: string) => ({
  rfxLineNo: no,
  vendorDescription: LINES.find((l) => l.no === no)?.desc ?? `line ${no}`,
  status: "quoted",
  price,
  uom: "nos",
  currency: "INR",
  confidence: 0.95,
  provenance: prov(`Quotation!G${no + 10}`, cited),
});

const meta = (): ExtractionMeta => ({
  model: "NONE - constructed by revision-test",
  promptHash: "revision-test",
  fileHash: "revision-test",
  format: "xlsx",
  cached: false,
  ms: 0,
  readerMeta: {},
  validationIssues: [],
});

async function store(opts: {
  vendorId: string; filename: string; hash: string;
  vendorRef: string; supersedesRef?: string;
  rows: ReturnType<typeof row>[];
}) {
  const extraction = extractionSchema.parse({
    vendorRef: opts.vendorRef,
    supersedesRef: opts.supersedesRef ?? null,
    rows: opts.rows,
  });
  const { rows } = validateExtraction(extraction, new Set(LINES.map((l) => l.no)));
  return storeExtraction({
    vendorId: opts.vendorId,
    filename: opts.filename,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    byteSize: 1,
    fileHash: opts.hash,
    storagePath: "(constructed)",
    extraction, rows, meta: meta(),
  });
}

async function main() {
  console.log("\nRevised quotes and same-revision complements\n");
  await seedRfx();

  // ---- The named edge: a supplier re-quotes two days later -----------------
  //
  // Rev 1 prices lines 1, 5, 7 and 9. Rev 2 says it replaces Rev 1, moves 1 and
  // 5, restates 7 unchanged, and never mentions 9.
  await store({
    vendorId: "V1", filename: "Quote_R1.xlsx", hash: "rev1hash",
    vendorRef: "ZIS/NBR/2026/1184",
    rows: [
      row(1, 62800, "62,800"), row(5, 9600, "9,600"),
      row(7, 12900, "12,900"), row(9, 3100, "3,100"),
    ],
  });
  await store({
    vendorId: "V1", filename: "Quote_R2_REVISED.xlsx", hash: "rev2hash",
    vendorRef: "ZIS/NBR/2026/1184-R2",
    supersedesRef: "ZIS/NBR/2026/1184",
    rows: [row(1, 60900, "60,900"), row(5, 9180, "9,180"), row(7, 12900, "12,900")],
  });

  // ---- Not a revision: an email and the spreadsheet attached to it ---------
  await store({
    vendorId: "V5", filename: "reply.eml", hash: "emlhash",
    vendorRef: "HES/2026/0417",
    rows: [row(2, 101000, "1,01,000 as per mail")],
  });
  await store({
    vendorId: "V5", filename: "rates.xlsx", hash: "attachhash",
    vendorRef: "HES/2026/0417",
    rows: [row(3, 88000, "88,000")],
  });

  const loaded = await loadComparison();
  const m = loaded.matrix;
  const s = loaded.supersessions.find((x) => x.vendorId === "V1");

  check(
    "the later revision wins",
    m.V1?.[1]?.raw?.price === 60900 && m.V1?.[5]?.raw?.price === 9180,
    `line 1 shows ${m.V1?.[1]?.raw?.price} (Rev 2: 60,900, Rev 1: 62,800); ` +
    `line 5 shows ${m.V1?.[5]?.raw?.price} (Rev 2: 9,180)`,
  );

  check(
    "a line the revision does not mention is carried forward, not lost",
    m.V1?.[9]?.raw?.price === 3100 && loaded.carriedForward.includes("V1:9"),
    `line 9 shows ${m.V1?.[9]?.raw?.price} from Rev 1 and is flagged carried-forward. ` +
    `Blanking it would read as "did not quote"; showing it unmarked would read as current.`,
  );

  check(
    "the revision is reported, not just applied",
    !!s && s.revision === 2 && s.supersedesRef === "ZIS/NBR/2026/1184",
    s ? `revision ${s.revision}, claims to replace ${s.supersedesRef}` : "no supersession recorded",
  );

  const moved = s?.changedLines ?? [];
  check(
    "only the lines whose price actually moved are reported as moved",
    moved.length === 2 &&
      moved.some((c) => c.lineNo === 1 && c.from === 62800 && c.to === 60900) &&
      moved.some((c) => c.lineNo === 5 && c.from === 9600 && c.to === 9180) &&
      !moved.some((c) => c.lineNo === 7),
    `moved: ${moved.map((c) => `L${c.lineNo} ${c.from}->${c.to}`).join(", ") || "none"}. ` +
    `Line 7 was restated at the same price and is correctly not listed.`,
  );

  check(
    "the unconfirmed line is named",
    (s?.carriedForwardLines ?? []).join(",") === "9",
    `carried forward: ${(s?.carriedForwardLines ?? []).join(", ") || "none"}`,
  );

  check(
    "same-revision documents merge instead of superseding",
    m.V5?.[2]?.raw?.price === 101000 && m.V5?.[3]?.raw?.price === 88000 &&
      !loaded.supersessions.some((x) => x.vendorId === "V5"),
    `the email's line 2 (${m.V5?.[2]?.raw?.price}) and the attachment's line 3 ` +
    `(${m.V5?.[3]?.raw?.price}) both survive, and nothing is reported as replaced`,
  );

  // ---- Re-reading the same revised file must not move it up a revision ----
  //
  // The revision number is derived from what the document claims, not from a
  // counter, precisely so this holds. If it drifted, a re-upload would flip
  // which quotation the buyer is looking at.
  await store({
    vendorId: "V1", filename: "Quote_R2_REVISED.xlsx", hash: "rev2hash",
    vendorRef: "ZIS/NBR/2026/1184-R2",
    supersedesRef: "ZIS/NBR/2026/1184",
    rows: [row(1, 60900, "60,900"), row(5, 9180, "9,180"), row(7, 12900, "12,900")],
  });
  const again = await loadComparison();
  const s2 = again.supersessions.find((x) => x.vendorId === "V1");
  check(
    "re-reading the same file is idempotent",
    s2?.revision === 2 && again.matrix.V1?.[1]?.raw?.price === 60900 &&
      again.carriedForward.includes("V1:9"),
    `still revision ${s2?.revision} with the same winner after a second read`,
  );

  console.log(
    failures
      ? `\n${R}${failures} failure(s)${X}\n`
      : `\n${G}7/7 pass${X}  a replaced quote is resolved, reported, and re-readable.\n`,
  );
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(1);
});
