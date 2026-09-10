/**
 * The accuracy harness.
 *
 * Everything else in scripts/ tests machinery: that readers surface text, that
 * the calculator agrees with the Python reference, that the walkthrough holds
 * together. None of them says whether the READING IS RIGHT, because that is the
 * one thing you cannot check without spending money on a real model call.
 *
 * This does. It runs the extractor against documents whose true contents are
 * known from `raw-quotes.json` (the answer key the generators wrote the
 * documents FROM, so it is not a second opinion, it is the source), and scores
 * four things separately, because they fail separately:
 *
 *   RECALL      of the lines the supplier actually priced, how many came back
 *               with a price at all
 *   PRICE       of those, how many match to the rupee
 *   UNIT        how many carry the unit the supplier actually wrote, which is
 *               the error that survives review because the number looks fine
 *   INVENTION   prices returned for lines the supplier never priced. This is
 *               the only metric where the target is zero and the only one that
 *               can hurt a buyer directly
 *
 * And then the one that matters most on bad inputs:
 *
 *   CALIBRATION does confidence fall when accuracy falls? A run where accuracy
 *               drops and confidence holds is a FAILING run even if headline
 *               accuracy looks fine, because the screen would be lying with a
 *               straight face. The photo mode measures exactly this across five
 *               photographs of the same rate card, easy to very hard.
 *
 * Usage:
 *   npx tsx scripts/accuracy.ts            the five vendor documents
 *   npx tsx scripts/accuracy.ts --photos   the five-photograph degradation set
 *   npx tsx scripts/accuracy.ts --all
 *
 * Costs real API calls. Cached by (model, prompt hash, file hash), so a second
 * run of the same files is free and the numbers do not move.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// `next dev` loads .env.local for us; a bare tsx run does not, and the failure
// mode is a whole harness reporting "no API key" five times. Loaded before the
// llm module is imported, because that reads the key at module load.
for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}

import { extractDocument } from "../lib/extract/run";
import { activeModel, activeProvider } from "../lib/llm";
import type { ExtractedRow } from "../lib/extract/contract";
import rawQuotes from "../lib/data/raw-quotes.json";

const OUT = resolve(process.cwd(), "../dataset/out");

type Truth = {
  status: string; price?: number; uom?: string; ccy?: string;
  qty_override?: number; printed_price?: number; handwritten?: boolean;
};
const QUOTES = rawQuotes.quotes as unknown as Record<string, Record<string, Truth>>;

/**
 * Statuses in the answer key that mean "there is a number on the page".
 *
 * Derived from the key rather than listed by hand. The hand-written version
 * omitted `bundled`, so a line the supplier genuinely priced at Rs 13,400 with
 * twelve free against a hundred and twenty laptops counted as a line nobody
 * priced, and the reader reporting that exact figure was scored as having
 * invented it. The reader was right and the metric was wrong, which is the
 * more embarrassing way round.
 *
 * A status carries a price if any entry with that status has one. Statuses that
 * never do (omitted, not_quoted, illegible, relative, match_rival) stay out,
 * which is what makes the invention count mean anything.
 */
const PRICED: Set<string> = (() => {
  const out = new Set<string>();
  for (const rows of Object.values(QUOTES)) {
    for (const r of Object.values(rows)) {
      if (r && r.price !== undefined && r.price !== null) out.add(r.status);
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Comparing a reported unit to the written one
// ---------------------------------------------------------------------------

/**
 * Units are prose, so an exact string match would score a correct read as
 * wrong. "per box of 10", "box of ten", "per box (10 pcs)" are the same answer.
 * Reduced to letters and digits, with the number words that appear in pack
 * sizes spelled out, then compared on containment.
 *
 * Deliberately generous on FORM and strict on CONTENT: a reply of "box" against
 * a truth of "box of 10" still fails, because losing the pack size is the exact
 * error this metric exists to catch.
 */
const NUMWORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  twenty: "20", fifty: "50", hundred: "100",
};

function unitKey(u: string | null | undefined): string {
  if (!u) return "";
  let s = u.toLowerCase();
  for (const [w, d] of Object.entries(NUMWORDS)) s = s.replace(new RegExp(`\\b${w}\\b`, "g"), d);
  return s.replace(/\bper\b|\bof\b|\bpcs?\b|\bpieces?\b|\bnos?\b|\beach\b/g, "")
          .replace(/[^a-z0-9]/g, "");
}

function unitMatches(got: string | null | undefined, want: string | undefined): boolean {
  const a = unitKey(got), b = unitKey(want);
  if (!b) return true;                       // truth records no unit: nothing to get wrong
  if (!a) return false;
  const packA = a.match(/\d+/)?.[0], packB = b.match(/\d+/)?.[0];
  if (packB && packA !== packB) return false;   // pack size is never a formatting detail
  if (!packB && packA) return false;            // invented a pack size
  return a.includes(b) || b.includes(a) || (!packA && !packB);
}

// ---------------------------------------------------------------------------
// Scoring one document
// ---------------------------------------------------------------------------

interface Score {
  label: string;
  file: string;
  ok: boolean;
  error?: string;
  model: string;
  cached: boolean;
  ms: number;
  /** Lines the answer key says carry a price. */
  expectedPriced: number;
  found: number;
  priceExact: number;
  unitRight: number;
  currencyRight: number;
  invented: number;
  /** The key said this value is unreadable. Did the reader say so too? */
  illegibleExpected: number;
  illegibleAdmitted: number;
  meanConfidence: number;
  meanConfidenceOnWrong: number;
  meanConfidenceOnRight: number;
  misses: string[];
}

function score(label: string, file: string, vendor: string, rows: ExtractedRow[],
               meta: { model: string; cached: boolean; ms: number },
               onlyLines?: Set<number>): Score {
  const truth = QUOTES[vendor] ?? {};
  const byLine = new Map<number, ExtractedRow>();
  for (const r of rows) if (r.rfxLineNo !== null) byLine.set(r.rfxLineNo, r);

  const inScope = (n: number) => !onlyLines || onlyLines.has(n);

  const expected = Object.entries(truth)
    .filter(([k, t]) => /^\d+$/.test(k) && PRICED.has(t.status) && inScope(Number(k)));

  let found = 0, priceExact = 0, unitRight = 0, ccyRight = 0;
  const misses: string[] = [];
  const confRight: number[] = [], confWrong: number[] = [];

  for (const [k, t] of expected) {
    const got = byLine.get(Number(k));
    if (!got || got.price === null) {
      misses.push(`L${k}: not returned (truth ${t.price} ${t.uom ?? ""})`);
      continue;
    }
    found += 1;
    // The handwritten override: the answer key's `price` is the value that
    // governs, and a reader that reports the struck-through printed number is
    // wrong even though that number is genuinely on the page.
    const want = t.price!;
    const exact = Math.abs(got.price - want) < 0.5;
    if (exact) { priceExact += 1; confRight.push(got.confidence); }
    else {
      confWrong.push(got.confidence);
      const printed = t.printed_price && Math.abs(got.price - t.printed_price) < 0.5;
      misses.push(
        `L${k}: read ${got.price}, truth ${want}` +
        (printed ? " (reported the struck-through printed price)" : "") +
        ` [confidence ${got.confidence.toFixed(2)}]`,
      );
    }
    if (unitMatches(got.uom, t.uom)) unitRight += 1;
    else misses.push(`L${k}: unit "${got.uom}" against "${t.uom}"`);
    if ((got.currency ?? "INR") === (t.ccy ?? "INR")) ccyRight += 1;
    else misses.push(`L${k}: currency ${got.currency} against ${t.ccy}`);
  }

  // A price returned for a line the supplier never priced. Counted separately
  // because it is the only failure that puts a made-up number in front of a
  // buyer, and it is invisible in a recall figure.
  let invented = 0;
  for (const [no, r] of byLine) {
    if (!inScope(no) || r.price === null) continue;
    const t = truth[String(no)];
    if (!t || !PRICED.has(t.status)) {
      invented += 1;
      misses.push(`L${no}: returned ${r.price} where the answer key has ` +
                  `${t ? t.status : "no entry at all"}`);
    }
  }

  const illegible = Object.entries(truth)
    .filter(([k, t]) => t.status === "illegible" && inScope(Number(k)));
  const admitted = illegible.filter(([k]) => {
    const g = byLine.get(Number(k));
    return !g || g.price === null;
  }).length;
  for (const [k] of illegible) {
    const g = byLine.get(Number(k));
    if (g && g.price !== null) {
      misses.push(`L${k}: guessed ${g.price} at a value the key marks unreadable`);
    }
  }

  const all = [...confRight, ...confWrong];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    label, file, ok: true, model: meta.model, cached: meta.cached, ms: meta.ms,
    expectedPriced: expected.length, found, priceExact, unitRight, currencyRight: ccyRight,
    invented,
    illegibleExpected: illegible.length, illegibleAdmitted: admitted,
    meanConfidence: mean(all),
    meanConfidenceOnRight: mean(confRight),
    meanConfidenceOnWrong: mean(confWrong),
    misses,
  };
}

// ---------------------------------------------------------------------------

async function run(label: string, file: string, vendor: string,
                   onlyLines?: Set<number>): Promise<Score> {
  const path = resolve(OUT, file);
  const empty: Score = {
    label, file, ok: false, model: "", cached: false, ms: 0,
    expectedPriced: 0, found: 0, priceExact: 0, unitRight: 0, currencyRight: 0,
    invented: 0, illegibleExpected: 0, illegibleAdmitted: 0,
    meanConfidence: 0, meanConfidenceOnRight: 0, meanConfidenceOnWrong: 0, misses: [],
  };
  if (!existsSync(path)) return { ...empty, error: `missing: ${path}` };

  const buf = readFileSync(path);
  const name = file.split("/").pop()!;
  const ext = name.split(".").pop()!.toLowerCase();
  const mime = ({
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    eml: "message/rfc822",
  } as Record<string, string>)[ext] ?? "application/octet-stream";

  try {
    const { rows, meta } = await extractDocument({
      buf, filename: name, mimeType: mime,
      // The crop re-read is a separate mechanism with its own evidence value.
      // Leaving it on here would score the pair, not the reader.
      verifyPhotos: false,
    });
    return score(label, file, vendor, rows,
                 { model: meta.model, cached: meta.cached, ms: meta.ms }, onlyLines);
  } catch (e) {
    return { ...empty, error: String(e).slice(0, 300) };
  }
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : "n/a");
const pad = (s: string, n: number) => s.padEnd(n);

function table(rows: Score[]) {
  console.log(
    "\n" + pad("input", 26) + pad("priced", 8) + pad("found", 8) + pad("price", 8) +
    pad("unit", 8) + pad("made up", 9) + pad("conf", 7) + "conf|wrong",
  );
  console.log("-".repeat(90));
  for (const r of rows) {
    if (!r.ok) { console.log(pad(r.label, 26) + "FAILED  " + (r.error ?? "")); continue; }
    console.log(
      pad(r.label, 26) +
      pad(String(r.expectedPriced), 8) +
      pad(pct(r.found, r.expectedPriced), 8) +
      pad(pct(r.priceExact, r.found), 8) +
      pad(pct(r.unitRight, r.found), 8) +
      pad(String(r.invented), 9) +
      pad(r.meanConfidence.toFixed(2), 7) +
      (r.meanConfidenceOnWrong ? r.meanConfidenceOnWrong.toFixed(2) : "-"),
    );
  }
}

function detail(rows: Score[]) {
  for (const r of rows) {
    if (!r.ok || !r.misses.length) continue;
    console.log(`\n  ${r.label}: ${r.misses.length} discrepanc${r.misses.length === 1 ? "y" : "ies"}`);
    for (const m of r.misses.slice(0, 14)) console.log(`    ${m}`);
    if (r.misses.length > 14) console.log(`    ... ${r.misses.length - 14} more`);
  }
}

// ---------------------------------------------------------------------------

const DOCS: Array<[string, string, string]> = [
  ["Zenith  xlsx (Rev 1)", "01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184.xlsx", "V1"],
  ["Cygnus  pdf", "02-vendor-cygnus/Cygnus_Quotation_CTI-Q-2026-0918.pdf", "V2"],
  ["Orbit   docx", "03-vendor-orbit/Orbit_Offer_OSS-QT-2026-27-0442.docx", "V3"],
  ["Vector  photo", "04-vendor-vector/IMG_20260917_1142_vector_rate_card.jpg", "V4"],
  ["Helios  eml", "05-vendor-helios/helios_reply_2026-09-17.eml", "V5"],
];

const PHOTOS: Array<[string, string]> = [
  ["v1 easy      flat/bright", "04-vendor-vector/variants/v1_flat_bright.jpg"],
  ["v2 moderate  handheld", "04-vendor-vector/variants/v2_moderate.jpg"],
  ["v3 hard      curl+thumb", "04-vendor-vector/variants/v3_curled_thumb.jpg"],
  ["v4 v.hard    lowlight", "04-vendor-vector/variants/v4_lowlight_motion.jpg"],
  ["v5 v.hard    steep angle", "04-vendor-vector/variants/v5_steep_angle.jpg"],
];

async function main() {
  const args = process.argv.slice(2);
  const wantPhotos = args.includes("--photos") || args.includes("--all");
  const wantDocs = args.includes("--all") || !args.includes("--photos");

  console.log(`Accuracy harness. provider=${activeProvider()} model=${activeModel("main")}`);
  console.log(
    "Answer key: dataset/out/99-internal via lib/data/raw-quotes.json, which is what the\n" +
    "generators wrote the documents from. Scoring the READ, not the calculator.",
  );

  let failed = 0;

  if (wantDocs) {
    console.log("\n=== The five replies, one per format ===");
    const rows: Score[] = [];
    for (const [label, file, vendor] of DOCS) {
      process.stdout.write(`  reading ${label} ... `);
      const r = await run(label, file, vendor);
      console.log(r.ok ? `${r.cached ? "cached" : `${(r.ms / 1000).toFixed(1)}s`}` : "FAILED");
      rows.push(r);
    }
    table(rows);
    detail(rows);

    const tot = (f: (r: Score) => number) => rows.filter((r) => r.ok).reduce((a, r) => a + f(r), 0);
    const expected = tot((r) => r.expectedPriced);
    const found = tot((r) => r.found);
    const exact = tot((r) => r.priceExact);
    const units = tot((r) => r.unitRight);
    const invented = tot((r) => r.invented);
    console.log(
      `\n  overall: ${found}/${expected} priced lines returned (${pct(found, expected)}), ` +
      `${pct(exact, found)} exact on price, ${pct(units, found)} on unit, ` +
      `${invented} invented.`,
    );

    // What actually fails a run. A missed line is a gap on the screen and the
    // buyer can see it. An invented price is not visible as an error at all.
    if (invented > 0) {
      console.log(`  FAIL: ${invented} price(s) returned for lines nobody priced.`);
      failed += 1;
    }
    if (expected && found / expected < 0.85) {
      console.log(`  FAIL: recall below 85%.`);
      failed += 1;
    }
    if (found && exact / found < 0.9) {
      console.log(`  FAIL: fewer than 90% of returned prices match the key.`);
      failed += 1;
    }
    for (const r of rows) {
      if (!r.ok) { console.log(`  FAIL: ${r.label} did not read.`); failed += 1; }
      if (r.ok && r.illegibleExpected > r.illegibleAdmitted) {
        console.log(
          `  FAIL: ${r.label} produced a number for a value the key marks unreadable. ` +
          `A guess that cannot be told from a reading is the worst output there is.`,
        );
        failed += 1;
      }
    }
  }

  if (wantPhotos) {
    console.log("\n=== The same rate card, five photographs, easy to very hard ===");
    console.log(
      "  The test is NOT that accuracy stays high. It is that confidence falls with it,\n" +
      "  and that unreadable values come back unreadable instead of guessed.",
    );
    // The variants photograph a 22-line card, not all 30.
    const inCard = new Set(
      Object.entries(QUOTES.V4)
        .filter(([k, t]) => /^\d+$/.test(k) && t.status !== "omitted")
        .map(([k]) => Number(k)),
    );
    const rows: Score[] = [];
    for (const [label, file] of PHOTOS) {
      process.stdout.write(`  reading ${label} ... `);
      const r = await run(label, file, "V4", inCard);
      console.log(r.ok ? `${r.cached ? "cached" : `${(r.ms / 1000).toFixed(1)}s`}` : "FAILED");
      rows.push(r);
    }
    table(rows);
    detail(rows);

    // Calibration: pair up accuracy and confidence across the five conditions
    // and check they move together. Spearman would be overkill on five points;
    // the question is only whether the easy end beats the hard end on both.
    const ok = rows.filter((r) => r.ok && r.expectedPriced > 0);
    if (ok.length >= 2) {
      const acc = (r: Score) => (r.expectedPriced ? r.priceExact / r.expectedPriced : 0);
      const easy = ok[0], hard = ok[ok.length - 1];
      console.log(
        `\n  calibration: easiest ${pct(easy.priceExact, easy.expectedPriced)} accurate at ` +
        `confidence ${easy.meanConfidence.toFixed(2)}; hardest ` +
        `${pct(hard.priceExact, hard.expectedPriced)} at ${hard.meanConfidence.toFixed(2)}.`,
      );
      const accDrop = acc(easy) - acc(hard);
      const confDrop = easy.meanConfidence - hard.meanConfidence;
      if (accDrop > 0.1 && confDrop <= 0.02) {
        console.log(
          `  FAIL: accuracy fell ${(accDrop * 100).toFixed(0)} points and confidence did not ` +
          `follow. The screen would be equally sure of a worse answer, which is the one ` +
          `failure mode a buyer cannot see.`,
        );
        failed += 1;
      } else if (accDrop > 0.1) {
        console.log(
          `  confidence fell ${(confDrop * 100).toFixed(0)} points as accuracy fell ` +
          `${(accDrop * 100).toFixed(0)}. That is the behaviour we want.`,
        );
      }
      const guessers = ok.filter((r) => r.illegibleExpected > r.illegibleAdmitted);
      if (guessers.length) {
        console.log(
          `  FAIL: ${guessers.map((r) => r.label.trim()).join(", ")} guessed at a value the ` +
          `key marks unreadable.`,
        );
        failed += 1;
      }
    }
  }

  console.log(failed ? `\nACCURACY: ${failed} failure(s)` : "\nACCURACY: pass");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
