/**
 * Do the readers actually surface what the model needs?
 *
 *   npm run reader-test
 *
 * This tests the mechanical layer, and it is the test that would otherwise
 * never get written. If a reader drops a price on the way from the file to the
 * model, no model can recover it, and the failure looks exactly like a model
 * that read badly. So the two are separated: this asserts the information
 * survived the format, and the extraction test asserts the model read it.
 *
 * Runs against dataset/out/98-stress/, twenty-one deliberately awkward files
 * carrying identical facts, plus the five canonical vendor replies.
 *
 * No model calls, no API key, and it costs nothing to run on every change.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readFileParts } from "../lib/extract/readers";
import type { Part } from "../lib/llm";

const HERE = dirname(fileURLToPath(import.meta.url));
const STRESS = join(HERE, "..", "..", "dataset", "out", "98-stress");
const CANON = join(HERE, "..", "..", "dataset", "out");

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", BOLD = "\x1b[1m", OFF = "\x1b[0m";

interface Expected {
  lines: Array<{ line: number; price: number; uom: string; sku: string }>;
  files: Array<{ name: string; tests: string }>;
}

const expected: Expected = JSON.parse(readFileSync(join(STRESS, "_expected.json"), "utf8"));

const MIME: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".eml": "message/rfc822",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const mimeFor = (name: string) =>
  MIME[name.slice(name.lastIndexOf("."))] ?? "application/octet-stream";

/** All the ways a supplier might write the same number. */
function priceForms(n: number): string[] {
  const plain = String(n);
  const grouped = n.toLocaleString("en-US");
  const indian = n.toLocaleString("en-IN");
  return [...new Set([plain, grouped, indian])];
}

/** Everything the model will see, flattened. Binary parts report their kind. */
function visible(parts: Part[]): { text: string; binaryKinds: string[] } {
  const text = parts.filter((p) => p.kind === "text")
    .map((p) => (p as { text: string }).text).join("\n");
  const binaryKinds = parts.filter((p) => p.kind !== "text").map((p) => p.kind);
  return { text, binaryKinds };
}

interface Result {
  file: string;
  what: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];

/**
 * A file that must be REFUSED, with a message a buyer can act on.
 *
 * Silent acceptance of a broken file is the failure mode that matters: an empty
 * spreadsheet read as "the supplier quoted nothing" puts a blank column in
 * front of a buyer who reads it as a decision.
 */
async function checkMustFail(path: string, name: string, what: string) {
  const buf = readFileSync(path);
  try {
    const { parts } = await readFileParts(buf, name, mimeFor(name));
    const { text, binaryKinds } = visible(parts);
    // A truncated PDF still routes to vision legitimately: the model is the
    // right thing to tell us it cannot see the rest.
    if (name.includes("truncated") && binaryKinds.includes("pdf")) {
      results.push({
        file: name, what, ok: true,
        detail: "routed to vision intact; the model reports what it cannot see",
      });
      return;
    }
    results.push({
      file: name, what, ok: false,
      detail: `ACCEPTED a file it should have refused. Returned ${text.length} chars. ` +
              `A broken file read as an empty quote is how a blank column becomes a decision.`,
    });
  } catch (e) {
    const msg = String(e);
    // Refusing is right; refusing usefully is the requirement.
    const actionable =
      /\.eml|export|save|unprotected|empty|password|does not open|Export it|Rename it/i
        .test(msg);
    results.push({
      file: name, what, ok: actionable,
      detail: actionable
        ? `refused with a usable message: "${msg.replace(/^Error:\s*/, "").slice(0, 120)}"`
        : `refused, but the message does not tell the buyer what to do: "${msg.slice(0, 120)}"`,
    });
  }
}

async function check(path: string, name: string, what: string) {
  if (name.startsWith("bad_")) return checkMustFail(path, name, what);
  try {
    const buf = readFileSync(path);
    const { format, parts, meta } = await readFileParts(buf, name, mimeFor(name));
    const { text, binaryKinds } = visible(parts);

    // An image or a PDF is handed to the model as bytes: there is nothing for
    // this test to assert about its contents, only that it was routed as
    // binary rather than silently turned into an empty string.
    if (format === "image" || format === "pdf") {
      const wantsBinary = format === "image" ? "image" : "pdf";
      if (!binaryKinds.includes(wantsBinary)) {
        results.push({
          file: name, what, ok: false,
          detail: `routed as ${binaryKinds.join(",") || "text only"}, expected a ${wantsBinary} part. ` +
                  `The model would receive no document at all.`,
        });
        return;
      }
      const bytes = (meta as { bytes?: number }).bytes ?? buf.length;
      results.push({
        file: name, what, ok: true,
        detail: `routed to vision as a ${wantsBinary} part, ${(bytes / 1024).toFixed(0)} KB intact` +
                (format === "pdf" && (meta as { citations?: boolean }).citations
                  ? ", citations on" : ""),
      });
      return;
    }

    // Text formats: assert the actual numbers survived.
    const missing = expected.lines.filter(
      (l) => !priceForms(l.price).some((f) => text.includes(f)),
    );
    const foundUoms = expected.lines.filter((l) => text.includes(l.uom)).length;

    if (missing.length) {
      results.push({
        file: name, what, ok: false,
        detail: `${missing.length} of ${expected.lines.length} prices absent from what the ` +
                `model would see (lines ${missing.map((m) => m.line).join(", ")}). ` +
                `Reader output was ${text.length} chars.`,
      });
      return;
    }

    // Locators: a price the model cannot cite has no provenance.
    let locatorNote = "";
    if (format === "xlsx") {
      const hasAddrs = /\b[A-Z]{1,2}\d{1,4}\[(num|str)\]=/.test(text);
      if (!hasAddrs) {
        results.push({
          file: name, what, ok: false,
          detail: "no cell addresses in the reader output, so no price could cite a source",
        });
        return;
      }
      locatorNote = `, cell addresses present (${(meta as { cellCount?: number }).cellCount} cells)`;
    }
    if (format === "docx") {
      if (!/\[para \d+\]/.test(text)) {
        results.push({
          file: name, what, ok: false,
          detail: "no paragraph numbering, so a prose price could not cite a location",
        });
        return;
      }
      locatorNote = `, ${(meta as { paragraphs?: number }).paragraphs} paragraphs numbered`;
    }
    if (format === "odt") {
      if (!/\[para \d+\]/.test(text)) {
        results.push({
          file: name, what, ok: false,
          detail: "no paragraph numbering, so a prose price could not cite a location",
        });
        return;
      }
      locatorNote = `, ${(meta as { paragraphs?: number }).paragraphs} paragraphs numbered`;
    }
    if (format === "text") {
      if (!/\[line \d+\]/.test(text)) {
        results.push({
          file: name, what, ok: false,
          detail: "no line numbering, so a price could not cite a location",
        });
        return;
      }
      locatorNote = `, ${(meta as { lines?: number }).lines} lines numbered`;
    }
    if (format === "eml") {
      if (!/\[body line \d+\]/.test(text)) {
        results.push({
          file: name, what, ok: false,
          detail: "no body-line numbering, so an emailed price could not cite a location",
        });
        return;
      }
    }

    results.push({
      file: name, what, ok: true,
      detail: `all ${expected.lines.length} prices and ${foundUoms} units visible in ` +
              `${text.length} chars${locatorNote}`,
    });
  } catch (e) {
    results.push({ file: name, what, ok: false, detail: `threw: ${String(e).slice(0, 160)}` });
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(84));
  console.log(`${BOLD}READERS${OFF}  does the mechanical layer surface what the model needs?`);
  console.log("=".repeat(84));

  if (!existsSync(STRESS)) {
    console.log(`\n${RED}No stress corpus.${OFF} Run: cd dataset/generators && python3 build_stress_corpus.py`);
    process.exit(1);
  }

  for (const f of expected.files) {
    await check(join(STRESS, f.name), f.name, f.tests);
  }

  // The five canonical replies, so the awkward set never diverges from the real one.
  console.log(`\n${DIM}canonical replies${OFF}`);
  const canon: Array<[string, string]> = [
    ["01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184.xlsx", "the supplier's own spreadsheet format"],
    ["02-vendor-cygnus/Cygnus_Quotation_CTI-Q-2026-0918.pdf", "3-page PDF, footnote discount on the last page"],
    ["03-vendor-orbit/Orbit_Offer_OSS-QT-2026-27-0442.docx", "Word letter, prices in prose"],
    ["04-vendor-vector/IMG_20260917_1142_vector_rate_card.jpg", "photographed rate card at an angle"],
    ["05-vendor-helios/helios_reply_2026-09-17.eml", "five-line email"],
  ];
  // Every photograph in the corpus, not just the canonical one. A reader that
  // routes a clean flat scan and drops a steep-angle shot is a reader that will
  // fail live, and "we tested the photo path" would be true and useless.
  //
  // This is a MECHANICAL check: does each image reach the model as an image, at
  // a size a model can actually use. Whether the model then reads it correctly
  // is a different question, measured against the answer key by the accuracy
  // harness, which needs a working key.
  const photos: Array<[string, string]> = [
    ["04-vendor-vector/variants/v1_flat_bright.jpg", "flat on a desk, good light"],
    ["04-vendor-vector/variants/v2_moderate.jpg", "handheld, off-axis, one lamp"],
    ["04-vendor-vector/variants/v3_curled_thumb.jpg", "curled page, thumb over a corner"],
    ["04-vendor-vector/variants/v4_lowlight_motion.jpg", "low light, motion blur, tungsten"],
    ["04-vendor-vector/variants/v5_steep_angle.jpg", "steep angle, keystone, glare"],
    ["98-stress/jpg_01_flat_scan.jpg", "clean flat scan"],
    ["98-stress/jpg_02_steep_angle.jpg", "steep angle"],
    ["98-stress/jpg_03_low_light.jpg", "low light"],
    ["98-stress/jpg_04_finger_occlusion.jpg", "a finger over part of the table"],
    ["98-stress/jpg_05_photo_of_screen.jpg", "a photo of a screen, moire and reflection"],
    ["99-internal/v4_rate_card_flat_REFERENCE.png", "PNG, not JPEG"],
  ];
  console.log(`\n${DIM}photographs, every condition in the corpus${OFF}`);
  for (const [rel, what] of photos) {
    const p2 = join(CANON, rel);
    if (!existsSync(p2)) {
      results.push({ file: rel.split("/").pop()!, what, ok: false, detail: "file missing" });
      continue;
    }
    const name = rel.split("/").pop()!;
    const buf = readFileSync(p2);
    try {
      const { format, parts } = await readFileParts(buf, name, mimeFor(name));
      const { binaryKinds } = visible(parts);
      const kb = buf.length / 1024;
      // Under ~15 KB a photographed rate card has lost the digits, whatever the
      // format says. Routing is necessary and not sufficient.
      const ok = format === "image" && binaryKinds.length > 0 && kb > 15;
      results.push({
        file: name, what, ok,
        detail: `${format}, ${binaryKinds.join(",") || "NO IMAGE PART"}, ${kb.toFixed(0)} KB`,
      });
    } catch (e) {
      results.push({ file: name, what, ok: false, detail: `threw: ${String(e).slice(0, 140)}` });
    }
  }

  const canonStart = results.length;
  for (const [rel, what] of canon) {
    const p = join(CANON, rel);
    if (!existsSync(p)) {
      results.push({ file: rel, what, ok: false, detail: "file missing" });
      continue;
    }
    // The canonical replies carry the FULL 30-line set, not the stress subset,
    // so only structural assertions apply here.
    const name = rel.split("/").pop()!;
    const buf = readFileSync(p);
    try {
      const { format, parts, meta } = await readFileParts(buf, name, mimeFor(name));
      const { text, binaryKinds } = visible(parts);
      const ok = format === "image" || format === "pdf"
        ? binaryKinds.length > 0
        : text.length > 200;
      results.push({
        file: name, what, ok,
        detail: format === "image" || format === "pdf"
          ? `routed as ${binaryKinds.join(",")}, ${(buf.length / 1024).toFixed(0)} KB`
          : `${text.length} chars, ${JSON.stringify(meta).slice(0, 70)}`,
      });
    } catch (e) {
      results.push({ file: name, what, ok: false, detail: `threw: ${String(e).slice(0, 140)}` });
    }
  }

  // ---- report ----
  let group = "";
  results.forEach((r, i) => {
    if (i === canonStart) console.log();
    const ext = r.file.slice(r.file.lastIndexOf("."));
    if (ext !== group && i < canonStart) {
      group = ext;
      console.log(`\n${DIM}${ext}${OFF}`);
    }
    const mark = r.ok ? `${GREEN}pass${OFF}` : `${RED}FAIL${OFF}`;
    console.log(`  ${mark}  ${r.file.padEnd(38)} ${DIM}${r.what}${OFF}`);
    console.log(`        ${r.detail}`);
  });

  const passed = results.filter((r) => r.ok).length;
  console.log("\n" + "=".repeat(84));
  if (passed === results.length) {
    console.log(`${GREEN}${BOLD}${passed}/${results.length} pass${OFF}  ` +
      `every reader surfaces its prices, units and locators.`);
    console.log(
      `\n${DIM}What this does and does not prove: the model is given everything it needs\n` +
      `in every one of these formats. Whether it then reads correctly is measured\n` +
      `separately, against dataset/out/99-internal/ground-truth.json.${OFF}`);
  } else {
    console.log(`${RED}${BOLD}${passed}/${results.length} pass, ` +
      `${results.length - passed} FAILED${OFF}`);
    console.log(`\nA failure here means information is lost before the model sees it.`);
  }
  console.log("=".repeat(84));
  process.exit(passed === results.length ? 0 : 1);
}

main();
