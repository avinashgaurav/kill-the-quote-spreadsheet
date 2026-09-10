/**
 * The "your data, not my data" test.
 *
 * The one failure that would ruin a live demo is not a wrong number. It is an
 * interviewer saying "here is my own enquiry and my own supplier" and the screen
 * coming back empty, because the whole comparison was quietly computed against
 * the thirty IT-hardware lines that happen to ship with the build.
 *
 * That was true until now. The calculator closed over the seeded catalog, the
 * extractor matched every supplier item against those thirty lines, and a
 * supplier who was not one of the five named ones was refused outright.
 *
 * So this drives the real code path on an enquiry that has NOTHING to do with
 * IT hardware: corrugated packaging, different units, different suppliers,
 * different quantities, one of them created on the fly at upload time. No API
 * calls; the reading step is not what is under test here, the wiring is.
 *
 * It asserts:
 *   1. The comparison is computed over the DRAFTED lines, not the seeded ones.
 *   2. A supplier nobody has ever heard of gets a column.
 *   3. A supplier nobody has assessed shows as unassessed, not as qualified.
 *   4. Units the seeded catalog has never seen still convert, or refuse to.
 *   5. The seeded example still works, unchanged, afterwards.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), "gentest-"));
delete process.env.DATABASE_URL;

import { getQuery } from "../lib/db/client";
import {
  seedRfx, activeRfx, ensureVendor, storeExtraction, buildComparisonPayload, RFX_ID,
} from "../lib/store";
import { extractionSchema, validateExtraction } from "../lib/extract/contract";
import type { ExtractionMeta } from "../lib/extract/run";

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? `${G}pass${X}` : `${R}FAIL${X}`}  ${label}\n        ${D}${detail}${X}`);
  if (!ok) failures += 1;
};

/** A packaging enquiry. Nothing here exists in the shipped catalog. */
const RFX = "RFX-PACK-2026-0001";
const LINES = [
  { no: 1, sku: "MLR-250", group: "Mailer boxes", desc: "3-ply mailer 250x200x75, 120 GSM kraft",
    uom: "per 1000 pcs", pack: 1000, qty: 240, baseline: 8600 },
  { no: 2, sku: "RSC-450", group: "Shipping cartons", desc: "5-ply RSC 450x350x300, 180 GSM",
    uom: "per 1000 pcs", pack: 1000, qty: 180, baseline: 21400 },
  { no: 3, sku: "TAPE-48", group: "Tape", desc: "BOPP tape 48mm x 65m, clear",
    uom: "carton of 72", pack: 72, qty: 90, baseline: 2880 },
];

const prov = (locator: string, cited: string) => ({
  locator, citedText: cited, method: "generality_test", page: null,
});
const meta = (): ExtractionMeta => ({
  model: "NONE - constructed by generality-test", promptHash: "gen", fileHash: "gen",
  format: "xlsx", cached: false, ms: 0, readerMeta: {}, validationIssues: [],
});

async function quote(vendorId: string, hash: string,
                     rows: Array<{ no: number; price: number; uom: string; ccy?: string }>) {
  const extraction = extractionSchema.parse({
    vendorRef: `${vendorId}/2026/01`,
    rows: rows.map((r) => ({
      rfxLineNo: r.no,
      vendorDescription: LINES.find((l) => l.no === r.no)!.desc,
      status: "quoted", price: r.price, uom: r.uom, currency: r.ccy ?? "INR",
      confidence: 0.9, provenance: prov(`Sheet1!D${r.no + 4}`, String(r.price)),
    })),
  });
  const { rows: validated } = validateExtraction(
    extraction, new Set(LINES.map((l) => l.no)),
  );
  return storeExtraction({
    rfxId: RFX, vendorId, filename: `${vendorId}_quote.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    byteSize: 1, fileHash: hash, storagePath: "(constructed)",
    extraction, rows: validated, meta: meta(),
  });
}

async function main() {
  console.log("\nAn enquiry that is not the one that ships with the build\n");
  await seedRfx();
  const run = await getQuery();

  // Draft a packaging enquiry, exactly as the co-pilot's send route would.
  await run(
    `insert into rfx (id, title, buyer, terms, drafted_by_copilot)
     values ($1,$2,'{}'::jsonb,'{}'::jsonb,true) on conflict (id) do nothing`,
    [RFX, "Annual rate contract, corrugated packaging"],
  );
  for (const l of LINES) {
    await run(
      `insert into rfx_lines
         (id, rfx_id, no, sku, group_name, description, spec, uom, pack_size, qty,
          hsn, baseline_inr)
       values ($1,$2,$3,$4,$5,$6,'{}'::jsonb,$7,$8,$9,null,$10)
       on conflict (id) do nothing`,
      [`${RFX}:${l.no}`, RFX, l.no, l.sku, l.group, l.desc, l.uom, l.pack, l.qty,
       String(l.baseline)],
    );
  }
  // One supplier known up front, with a real questionnaire verdict.
  await run(
    `insert into vendors
       (id, rfx_id, code, legal_name, city, gstin, contact, qualified,
        failed_mandatory, questionnaire_answers)
     values ($1,$2,'PACKWELL','Packwell Industries Pvt Ltd','Vapi','','{}'::jsonb,
             true,'[]'::jsonb,'{}'::jsonb) on conflict (id) do nothing`,
    ["PACKWELL", RFX],
  );

  const active = await activeRfx();
  check(
    "the active enquiry is the drafted one, not the shipped example",
    active.rfxId === RFX && !active.isSeededExample && active.ctx.lines.length === 3,
    `active ${active.rfxId} with ${active.ctx.lines.length} lines ` +
    `(the shipped example has 30)`,
  );

  // A supplier nobody has heard of, created at upload time.
  const created = await ensureVendor(RFX, "GUJCORR", "GUJCORR_rates.xlsx");
  check(
    "a supplier who is not on the list gets a column instead of a refusal",
    created.created && created.code === "GUJCORR",
    `created "${created.name}" on upload. Refusing would make the product work ` +
    `only on its own demo data.`,
  );

  await quote("PACKWELL", "packwellhash", [
    { no: 1, price: 8400, uom: "per 1000 pcs" },
    { no: 2, price: 21900, uom: "per 1000 pcs" },
    { no: 3, price: 2810, uom: "carton of 72" },
  ]);
  // The newcomer quotes line 3 per piece against a line asked per carton of 72,
  // which is the unit trap in a category the build has never seen.
  await quote("GUJCORR", "gujcorrhash", [
    { no: 1, price: 8250, uom: "per 1000 pcs" },
    { no: 2, price: 22400, uom: "per 1000 pcs" },
    { no: 3, price: 44, uom: "per pc" },
  ]);

  const payload = await buildComparisonPayload();
  const v = (c: string) => payload.vendors.find((x) => x.code === c);

  check(
    "the comparison is computed over the drafted lines",
    payload.lines.length === 3 && payload.lines[0].sku === "MLR-250",
    `${payload.lines.length} lines, first is ${payload.lines[0].sku} ` +
    `"${payload.lines[0].desc}"`,
  );

  check(
    "both suppliers have a column, including the one created on upload",
    !!v("PACKWELL") && !!v("GUJCORR"),
    `columns: ${payload.vendors.map((x) => x.code).join(", ")}`,
  );

  check(
    "an unassessed supplier reads as unassessed, not as qualified",
    v("GUJCORR")?.assessed === false && v("PACKWELL")?.assessed === true,
    `GUJCORR assessed=${v("GUJCORR")?.assessed} (nobody has checked their ` +
    `questionnaire), PACKWELL assessed=${v("PACKWELL")?.assessed}. Showing an ` +
    `unassessed supplier as "eligible" is the failure worth avoiding here.`,
  );

  const cell = payload.matrix.GUJCORR?.[3];
  check(
    "a unit trap in a category the build has never seen is still caught",
    !!cell && cell.status !== "comparable",
    `line 3 asked per "carton of 72", they quoted Rs 44 "per pc". ` +
    `Status: ${cell?.status}. ` +
    (cell?.unitInr !== null && cell?.unitInr !== undefined
      ? `Landed Rs ${cell.unitInr} against Packwell's Rs 2,810.`
      : "No comparable number produced, which is the honest answer when the " +
        "conversion is not stated."),
  );

  check(
    "the headline is computed from the drafted enquiry's own budget",
    payload.baselineTotalInr ===
      LINES.reduce((a, l) => a + l.baseline * l.qty, 0),
    `baseline Rs ${payload.baselineTotalInr.toLocaleString("en-IN")}, ` +
    `computed from the drafted lines rather than the shipped constant`,
  );

  // And the shipped example must still be intact underneath.
  const seeded = (await run(
    `select count(*)::text as n from rfx_lines where rfx_id = $1`, [RFX_ID],
  )).rows[0];
  check(
    "the shipped example is untouched",
    Number(seeded.n) === 30,
    `${seeded.n} lines still seeded under ${RFX_ID}`,
  );

  console.log(
    failures
      ? `\n${R}${failures} failure(s)${X}\n`
      : `\n${G}8/8 pass${X}  the product runs on an enquiry it has never seen.\n`,
  );
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(1);
});
