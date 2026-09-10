/**
 * Exactly what the model is given for a document, before it reads anything.
 *
 *   npx tsx scripts/what-the-model-sees.ts <file> [<file> ...]
 *   npm run sees -- ../dataset/out/01-vendor-zenith/*.xlsx
 *
 * Two reasons this exists.
 *
 * FIRST, it separates two failures that look identical. If a price never
 * reaches the model, no model can recover it, and the result looks exactly
 * like a model that read badly. Reading is measured separately by
 * `npm run accuracy`, which needs a key; this needs nothing and answers the
 * prior question: did the information survive the format at all?
 *
 * SECOND, and this is the one that matters live: an interviewer hands you a
 * spreadsheet with four sheets, or a fourteen-page PDF, and asks whether you
 * read the whole thing. This prints the answer for their file rather than
 * asserting it about mine. Every sheet name, every page, the count of numbers
 * that made it through, and whether the document went to vision instead.
 *
 * Costs nothing and touches no network.
 */

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { readFileParts } from "../lib/extract/readers";

const G = "\x1b[32m", Y = "\x1b[33m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

const MIME: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".heic": "image/heic",
  ".eml": "message/rfc822", ".txt": "text/plain", ".rtf": "application/rtf",
};

async function one(path: string) {
  const name = basename(path);
  console.log(`\n${B}${name}${X}`);

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch (e) {
    console.log(`  ${Y}cannot open:${X} ${String(e).slice(0, 120)}`);
    return;
  }

  const mime = MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
  console.log(`  ${D}${(buf.length / 1024).toFixed(0)} kB, treated as ${mime}${X}`);

  let parts;
  try {
    ({ parts } = await readFileParts(buf, name, mime));
  } catch (e) {
    // A refusal is a correct outcome, and the message is the product.
    console.log(`  ${Y}REFUSED${X}  ${String(e).replace(/^Error:\s*/, "").slice(0, 300)}`);
    console.log(`  ${D}A refusal with instructions is a better answer than a half-read ` +
                `document, which looks complete.${X}`);
    return;
  }

  const text = parts.filter((p) => p.kind === "text")
    .map((p) => (p as { text: string }).text).join("\n");
  const binary = parts.filter((p) => p.kind !== "text");

  if (binary.length) {
    console.log(
      `  ${G}${binary.length} page(s)/image(s) sent to vision${X} ` +
      `${D}(${binary.map((b) => b.kind).join(", ")})${X}`,
    );
    console.log(`  ${D}Nothing is extracted mechanically from these: the model looks at ` +
                `the pixels, which is the only honest way to read a photograph.${X}`);
  }

  if (!text.length && !binary.length) {
    console.log(`  ${Y}nothing at all reached the model.${X}`);
    return;
  }

  if (text.length) {
    const sheets = [...text.matchAll(/### SHEET: ([^\n(]+)/g)].map((m) => m[1].trim());
    const paras = (text.match(/\[para \d+\]/g) ?? []).length;
    const pages = (text.match(/### PAGE \d+|\bpage \d+ of \d+/gi) ?? []).length;
    // Anything that could be a price. Deliberately crude: the question is
    // whether numbers survived, not which ones are prices.
    const numbers = (text.match(/\b[\d][\d,]{3,}(\.\d+)?\b/g) ?? []).length;

    console.log(`  ${G}${text.length.toLocaleString()} characters of text${X}`);
    if (sheets.length) console.log(`  sheets read: ${G}${sheets.length}${X} ${D}(${sheets.join(", ")})${X}`);
    if (paras) console.log(`  paragraphs, each citable: ${G}${paras}${X}`);
    if (pages) console.log(`  page markers: ${G}${pages}${X}`);
    console.log(`  numbers of 4+ digits that survived: ${G}${numbers}${X}`);

    const guidance = text.match(/^[^\n]{20,140}/)?.[0] ?? "";
    if (guidance) console.log(`  ${D}opens with: ${guidance.slice(0, 110)}${X}`);
  }
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.log(
      "Usage: npx tsx scripts/what-the-model-sees.ts <file> [<file> ...]\n\n" +
      "Prints exactly what reaches the model for each document: every sheet,\n" +
      "every citable paragraph, how many numbers survived the format, and\n" +
      "whether it went to vision instead. No API key, no network.",
    );
    process.exit(1);
  }
  for (const f of files) await one(f);
  console.log(
    `\n${D}This says the information survived the format. Whether the model then ` +
    `reads it correctly is a different question, measured by npm run accuracy.${X}\n`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
