/**
 * File -> content blocks the model can read.
 *
 * One reader per format. Each does the minimum mechanical work needed to put
 * the document in front of the model WITHOUT interpreting it, and each carries
 * enough structure that the model can cite a real locator afterwards.
 *
 * The division of labour matters:
 *
 *   readers  do the mechanical part (unzip, decode, lay out a grid, base64)
 *   model    does the judgement (which number is a price, what unit, what it
 *            refers to, whether it can be read at all)
 *   code     does the arithmetic, later, in normalise.ts
 *
 * A reader must never decide that a number is a price. That is judgement, and
 * a regex that guesses at it is exactly the brittle template-matching this
 * product exists to replace.
 */

import type { Part } from "../llm";

export type Format = "xlsx" | "pdf" | "docx" | "odt" | "eml" | "text" | "image";

/**
 * What a supplier will actually send you.
 *
 * The five obvious formats are not the whole set. A rate sheet arrives as a CSV
 * more often than as anything else, plenty of firms run LibreOffice and send
 * .ods and .odt, and a small supplier will paste a quote into a .txt. Rejecting
 * those means telling a buyer the file is unsupported when the prices are
 * sitting right there in it.
 *
 * `.msg` is deliberately NOT claimed. It is Outlook's binary compound-file
 * format, not RFC822, and mailparser cannot read it. Claiming support and then
 * failing on the parse is worse than declining clearly, because the failure
 * looks like the file being broken rather than us not supporting it.
 */
/**
 * What the first few bytes actually say the file is.
 *
 * The extension is a claim, not a fact. Suppliers rename things, mail clients
 * rewrite them, and a PDF saved as .xlsx will parse as a garbage spreadsheet
 * rather than fail, which is the worst outcome: confident nonsense instead of a
 * clear refusal. So the bytes get a vote.
 */
function sniff(buf: Buffer): "zip" | "pdf" | "ole" | "image" | "text" | "unknown" {
  if (buf.length < 4) return "unknown";
  const b = buf;
  if (b[0] === 0x50 && b[1] === 0x4b) return "zip";            // PK: xlsx/docx/odt/ods
  if (b.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  // D0 CF 11 E0: legacy Office compound file (.xls, .doc, .msg)
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "ole";
  if (b[0] === 0xff && b[1] === 0xd8) return "image";           // JPEG
  if (b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG") return "image";
  if (b.subarray(0, 4).toString("latin1") === "RIFF") return "image";  // WebP
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image";  // GIF
  if (b[0] === 0x49 && b[1] === 0x49) return "image";           // TIFF LE
  if (b[0] === 0x4d && b[1] === 0x4d) return "image";           // TIFF BE
  // Printable-ish start with no NULs: treat as text.
  const head = b.subarray(0, Math.min(512, b.length));
  if (!head.includes(0)) return "text";
  return "unknown";
}

/**
 * Refuse when the extension and the bytes disagree in a way that would produce
 * nonsense rather than an error.
 */
export function assertContentMatchesExtension(buf: Buffer, filename: string): void {
  const kind = sniff(buf);
  const n = filename.toLowerCase();

  const expectsZip = /\.(xlsx|xlsm|docx|odt|ods)$/.test(n);
  const expectsPdf = n.endsWith(".pdf");
  const expectsImage = /\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp)$/.test(n);

  const say = (was: string) =>
    `'${filename}' is named as one kind of file and its contents are ${was}. Reading it ` +
    `anyway would produce plausible-looking nonsense rather than an error, so it has been ` +
    `refused. Rename it correctly, or export it properly from whatever produced it.`;

  if (expectsZip && kind !== "zip") {
    // A CSV or TSV genuinely is text, so it is exempt.
    if (!/\.(csv|tsv)$/.test(n)) throw new Error(say(kind === "pdf" ? "a PDF" : `${kind}`));
  }
  if (expectsPdf && kind !== "pdf") throw new Error(say(`${kind}`));
  if (expectsImage && kind !== "image") throw new Error(say(`${kind}`));
}

export function detectFormat(filename: string, mimeType?: string): Format {
  const n = filename.toLowerCase();

  if (/\.(xlsx|xlsm|xls|ods|csv|tsv)$/.test(n)) return "xlsx";
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(docx|doc)$/.test(n)) return "docx";
  if (n.endsWith(".odt")) return "odt";
  if (n.endsWith(".eml")) return "eml";
  if (/\.(txt|md|rtf)$/.test(n)) return "text";
  if (/\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp)$/.test(n)) return "image";

  if (n.endsWith(".msg")) {
    throw new Error(
      `'${filename}' is an Outlook .msg file. That is a binary compound-file format, not a ` +
      `standard email, and reading it would need a different parser. In Outlook, open the ` +
      `message and use File > Save As > .eml, or forward it to yourself and save that. ` +
      `Guessing at the bytes would risk misreading prices.`,
    );
  }
  if (/\.(numbers|pages|key)$/.test(n)) {
    throw new Error(
      `'${filename}' is an Apple iWork file, which has no open format we can read. Export ` +
      `it to Excel, Word or PDF and upload that.`,
    );
  }

  const m = (mimeType ?? "").toLowerCase();
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("csv")) return "xlsx";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("opendocument.text")) return "odt";
  if (m.includes("wordprocessing") || m.includes("msword")) return "docx";
  if (m.startsWith("message/") || m.includes("rfc822")) return "eml";
  if (m.startsWith("text/")) return "text";
  if (m.startsWith("image/")) return "image";

  throw new Error(
    `Cannot tell what kind of file '${filename}' is. We read spreadsheets (xlsx, xls, ods, ` +
    `csv, tsv), documents (pdf, docx, odt, txt, rtf), email (.eml) and images (jpg, png, ` +
    `webp, tiff).`,
  );
}

// ---------------------------------------------------------------------------
// Spreadsheets
// ---------------------------------------------------------------------------

/**
 * Lay the workbook out as text, one line per non-empty cell, tagged with its
 * real address.
 *
 * Why per-cell and not a rendered table: the model must be able to cite
 * "Quotation!G14", and a rendered table loses addresses. Merged headers,
 * section banner rows and notes below the table all survive this, which
 * matters because Zenith's quote has all three.
 *
 * Both the formatted text (`w`) and the underlying value (`v`) are shown,
 * because Zenith types prices as text with a rupee glyph. The model needs to
 * see that the cell is a string, not silently receive a coerced number.
 */
export async function readXlsx(buf: Buffer): Promise<{ parts: Part[]; meta: object }> {
  if (buf.length === 0) {
    throw new Error("The file is empty (0 bytes). Nothing to read.");
  }
  const XLSX = await import("xlsx");
  // cellFormula off: we want values as presented, and a formula string would
  // invite the model to try to evaluate it.
  //
  // SheetJS reads xlsx, xls, ods, csv and tsv through the same entry point, so
  // a LibreOffice sheet or a plain CSV rate list gets the same cell-address
  // provenance as an Excel file.
  let wb: import("xlsx").WorkBook;
  try {
    wb = XLSX.read(buf, { cellDates: true, cellNF: true, cellText: true, cellFormula: false });
  } catch (e) {
    throw new Error(
      `This does not open as a spreadsheet: ${String(e).slice(0, 140)}. If it is ` +
      `password-protected, save an unprotected copy. Nothing has been read, so no ` +
      `partial prices have been stored.`,
    );
  }
  if (!wb.SheetNames.length) {
    throw new Error("The spreadsheet has no sheets in it.");
  }

  const parts: string[] = [];
  let cellCount = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    parts.push(`\n### SHEET: ${sheetName}   (rows ${range.s.r + 1}-${range.e.r + 1})`);

    const merges = (ws["!merges"] ?? []).map((m) => XLSX.utils.encode_range(m));
    if (merges.length) parts.push(`merged ranges: ${merges.join(", ")}`);

    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr] as { v?: unknown; w?: string; t?: string } | undefined;
        if (!cell || cell.v === undefined || cell.v === null || cell.v === "") continue;
        cellCount += 1;
        const shown = cell.w ?? String(cell.v);
        // t: 's' string, 'n' number, 'd' date, 'b' bool. Surfaced so the model
        // can see a numeric-looking price that is actually stored as text.
        const typed = cell.t === "n" ? "num" : cell.t === "s" ? "str" : cell.t ?? "?";
        row.push(`${addr}[${typed}]=${JSON.stringify(shown)}`);
      }
      if (row.length) parts.push(row.join("  "));
    }
  }

  return {
    parts: [{
      kind: "text",
      text:
        `SPREADSHEET, laid out one line per row, each cell as ADDRESS[type]=value.\n` +
        `Types: num = stored as a number, str = stored as text.\n` +
        `Use the address as your provenance locator, e.g. "${wb.SheetNames[0]}!G14".\n` +
        parts.join("\n"),
    }],
    meta: { sheets: wb.SheetNames, cellCount },
  };
}

// ---------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------

/**
 * Hand the PDF to the model natively, with citations on.
 *
 * No PDF text-extraction library is involved. The API reads the document and
 * returns `cited_text` plus a page location for anything it cites, which is
 * real provenance from the source rather than a span I matched by hand and
 * hoped was right.
 *
 * This is also what makes Cygnus's footnote-3 discount findable: it sits three
 * pages away from the numbers it modifies, and a page-at-a-time text pipeline
 * tends to lose exactly that relationship.
 */
export function readPdf(buf: Buffer, filename: string): { parts: Part[]; meta: object } {
  return {
    parts: [{
      kind: "pdf",
      mediaType: "application/pdf",
      base64: buf.toString("base64"),
      title: filename,
      citations: true,
    }],
    meta: { bytes: buf.length, citations: true },
  };
}

// ---------------------------------------------------------------------------
// Word documents
// ---------------------------------------------------------------------------

/**
 * Convert to text, numbering paragraphs so the model can cite "para 7".
 *
 * Orbit writes its prices inside sentences ("our best price for this model is
 * Rs. 58,200/- per unit with 8GB DDR5 memory as standard"), so paragraph
 * numbering is the finest locator this format honestly supports.
 */
export async function readDocx(buf: Buffer): Promise<{ parts: Part[]; meta: object }> {
  const mammoth = await import("mammoth");
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ buffer: buf }));
  } catch (e) {
    throw new Error(
      `This does not open as a Word document: ${String(e).slice(0, 140)}. If it is a ` +
      `legacy .doc, save it as .docx. Nothing has been read.`,
    );
  }
  const paras = value.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  return {
    parts: [{
      kind: "text",
      text:
        `WORD DOCUMENT, paragraphs numbered. Cite as "para N".\n` +
        `Commercial terms in this format are often written as prose inside sentences ` +
        `rather than set out in a table. Read every paragraph.\n\n` +
        paras.map((p, i) => `[para ${i + 1}] ${p}`).join("\n\n"),
    }],
    meta: { paragraphs: paras.length, chars: value.length },
  };
}

// ---------------------------------------------------------------------------
// OpenDocument text
// ---------------------------------------------------------------------------

/**
 * LibreOffice / OpenOffice documents.
 *
 * An .odt is a zip containing content.xml. Plenty of suppliers, especially
 * smaller firms and anyone on Linux, write their quotation in LibreOffice, and
 * "we cannot read your file" is not an acceptable answer when the prices are
 * sitting in plain XML inside it.
 *
 * Paragraph and table structure is preserved so a prose price can still cite a
 * location, the same as a .docx.
 */
export async function readOdt(buf: Buffer): Promise<{ parts: Part[]; meta: object }> {
  const { unzipSync, strFromU8 } = await import("fflate");

  let xml = "";
  try {
    const files = unzipSync(new Uint8Array(buf));
    const content = files["content.xml"];
    if (!content) {
      throw new Error("no content.xml inside the document");
    }
    xml = strFromU8(content);
  } catch (e) {
    throw new Error(
      `This does not open as an OpenDocument file: ${String(e).slice(0, 140)}. ` +
      `Nothing has been read.`,
    );
  }

  // Turn the XML into text, keeping paragraph and table-row boundaries, since
  // a rate table's rows are the data.
  const text = xml
    .replace(/<text:tab\/?>/g, "\t")
    .replace(/<text:s\s*\/?>/g, " ")
    .replace(/<\/text:p>/g, "\n")
    .replace(/<\/table:table-cell>/g, "\t")
    .replace(/<\/table:table-row>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paras = text.split("\n").map((p) => p.trim()).filter(Boolean);

  return {
    parts: [{
      kind: "text",
      text:
        `OPENDOCUMENT TEXT (LibreOffice), paragraphs numbered. Cite as "para N".\n` +
        `Table cells within a paragraph are separated by tabs. Commercial terms in this ` +
        `format are often written as prose inside sentences rather than in a table, so ` +
        `read every paragraph.\n\n` +
        paras.map((p, i) => `[para ${i + 1}] ${p}`).join("\n\n"),
    }],
    meta: { paragraphs: paras.length, chars: text.length, source: "odt" },
  };
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

/**
 * A quote pasted into a text file, or an RTF from an older system.
 *
 * RTF is stripped of its control words rather than parsed properly. That is
 * enough to surface the numbers, which is what matters, and a full RTF parser
 * would be a large dependency on the untrusted-input path for a rare format.
 */
export function readText(buf: Buffer, filename: string): { parts: Part[]; meta: object } {
  let text = buf.toString("utf8");
  const isRtf = /\.rtf$/i.test(filename) || text.startsWith("{\\rtf");

  if (isRtf) {
    text = text
      .replace(/\{\\\*?[^{}]*\}/g, "")
      .replace(/\\'[0-9a-f]{2}/gi, "")
      .replace(/\\[a-z]+-?\d*\s?/gi, "")
      .replace(/[{}]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const lines = text.split("\n");
  return {
    parts: [{
      kind: "text",
      text:
        `PLAIN TEXT${isRtf ? " (converted from RTF)" : ""}, lines numbered. ` +
        `Cite as "line N".\n\n` +
        lines.map((l, i) => `[line ${i + 1}] ${l}`).join("\n"),
    }],
    meta: { lines: lines.length, chars: text.length, source: isRtf ? "rtf" : "txt" },
  };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Parse the message, number the body lines, and follow what is inside it.
 *
 * Three things here were bugs the stress corpus caught, and each one lost every
 * price in the message silently:
 *
 * 1. HTML-ONLY BODY. Plenty of suppliers send a rate table as an HTML email
 *    with no text/plain part at all. Reading only `mail.text` returns an empty
 *    string, the model sees nothing, and the read looks clean. So the HTML is
 *    converted to text with its table structure preserved, because the rows are
 *    the data.
 *
 * 2. RATES IN AN ATTACHMENT. "Rates attached" is the single most common reply
 *    shape in procurement. Listing the attachment and not reading it means the
 *    entire quotation is invisible. Text-ish attachments are inlined; binary
 *    ones (a spreadsheet, a PDF, a photograph) are handed back so the caller
 *    can read them with the right reader rather than as bytes in an email.
 *
 * 3. FORWARDED CHAINS. The quote is often three levels down behind "> > >".
 *    The quote markers are kept rather than stripped, because depth is
 *    information: a price quoted by a colleague and forwarded on is worth
 *    knowing about.
 */

/** Turn an HTML body into text that keeps its table rows intact. */
export function htmlToText(html: string): string {
  return html
    // Structure first, so a rate table survives as rows and columns.
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li)\s*>/gi, "\n")
    .replace(/<\s*\/\s*tr\s*>/gi, "\n")
    .replace(/<\s*\/\s*t[dh]\s*>/gi, "\t")
    .replace(/<\s*\/\s*table\s*>/gi, "\n")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "")
    // Entities a rate table actually contains.
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&rupee;|&#8377;/gi, "\u20b9")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const TEXTUAL_ATTACHMENT = /\.(csv|tsv|txt|md|json)$/i;

export interface EmlResult {
  parts: Part[];
  meta: object;
  /**
   * Attachments that need a reader of their own. Returned rather than parsed
   * here so a spreadsheet attached to an email is read as a spreadsheet, with
   * cell addresses, instead of being flattened into the email's text.
   */
  nestedFiles: Array<{ filename: string; mimeType: string; buf: Buffer }>;
}

export async function readEml(buf: Buffer): Promise<EmlResult> {
  const { simpleParser } = await import("mailparser");
  const mail = await simpleParser(buf);

  // Prefer the plain part; fall back to converting the HTML one.
  const plain = (mail.text ?? "").trim();
  const htmlSource = typeof mail.html === "string" ? mail.html : "";
  const fromHtml = htmlSource ? htmlToText(htmlSource) : "";

  // A "plain" part that is just a stub telling you to use an HTML reader is
  // worse than nothing, so the longer of the two wins.
  const usedHtml = fromHtml.length > plain.length;
  const bodyText = usedHtml ? fromHtml : plain;
  const body = bodyText.split("\n");

  const attachments = mail.attachments ?? [];
  const inlined: string[] = [];
  const nestedFiles: EmlResult["nestedFiles"] = [];

  for (const a of attachments) {
    const name = a.filename ?? "(unnamed)";
    const content = a.content as Buffer | undefined;
    if (!content) continue;

    if (TEXTUAL_ATTACHMENT.test(name) || (a.contentType ?? "").startsWith("text/")) {
      // Small and textual: put it in front of the model directly.
      const txt = content.toString("utf8").trim();
      inlined.push(
        `--- attachment: ${name} (${a.contentType ?? "text"}) ---\n` +
        txt.split("\n").map((l, i) => `[${name} line ${i + 1}] ${l}`).join("\n"),
      );
    } else {
      nestedFiles.push({
        filename: name,
        mimeType: a.contentType ?? "application/octet-stream",
        buf: content,
      });
    }
  }

  const header =
    `From: ${mail.from?.text ?? "?"}\n` +
    `To: ${mail.to && "text" in mail.to ? mail.to.text : "?"}\n` +
    `Date: ${mail.date?.toISOString() ?? "?"}\n` +
    `Subject: ${mail.subject ?? "?"}\n` +
    `Attachments: ${attachments.length
      ? attachments.map((a) => a.filename ?? "(unnamed)").join(", ")
      : "NONE"}` +
    (nestedFiles.length
      ? `\nNote: ${nestedFiles.length} attachment(s) are being read separately with their ` +
        `own reader and are not reproduced below.`
      : "");

  return {
    parts: [{
      kind: "text",
      text:
        `EMAIL. Cite the body as "body line N", and an inlined attachment as ` +
        `"<filename> line N".\n` +
        (usedHtml
          ? `This message had no usable plain-text part, so the HTML body was converted ` +
            `to text with its table rows preserved. Columns are separated by tabs.\n`
          : "") +
        `An email like this often prices by reference rather than absolutely: ` +
        `"same as our last order", "5% over last year", "we will match X". Those are ` +
        `NOT prices. Use status 'relative' when it points at a prior order or an ` +
        `uplift, and 'match_rival' when it depends on a competitor's bid. Do not ` +
        `compute a number for either.\n` +
        `Quote markers ("&gt;", "&gt; &gt;") are kept deliberately: a price forwarded from a ` +
        `colleague is still the supplier's price, and the depth tells you who said it.\n\n` +
        `--- headers ---\n${header}\n\n--- body ---\n` +
        body.map((l, i) => `[body line ${i + 1}] ${l}`).join("\n") +
        (inlined.length ? `\n\n${inlined.join("\n\n")}` : ""),
    }],
    meta: {
      from: mail.from?.text, subject: mail.subject,
      date: mail.date?.toISOString(),
      attachments: attachments.map((a) => a.filename ?? "(unnamed)"),
      bodyLines: body.length,
      bodySource: usedHtml ? "html-converted" : "text/plain",
      inlinedAttachments: inlined.length,
      nestedForSeparateReading: nestedFiles.map((f) => f.filename),
    },
    nestedFiles,
  };
}

// ---------------------------------------------------------------------------
// Photographs
// ---------------------------------------------------------------------------

/**
 * Hand the image to the model's vision.
 *
 * There is no text layer to fall back on, and no OCR pass in front: an OCR
 * pass on a page photographed at an angle produces confident garbage that then
 * looks like data. The model reads the pixels and reports a normalised bounding
 * box per value, which is then used to crop the region and re-read it
 * independently (see verifyByCrop in run.ts).
 */
export function readImage(
  buf: Buffer,
  mimeType: string,
): { parts: Part[]; meta: object } {
  const media = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
    ? mimeType
    : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  return {
    parts: [{ kind: "image", mediaType: media, base64: buf.toString("base64") }],
    meta: { bytes: buf.length, media },
  };
}

export const PHOTO_GUIDANCE =
  `This is a PHOTOGRAPH of a printed document, not a scan. Expect it to be taken ` +
  `at an angle, so a table's columns will not line up horizontally with their own ` +
  `rows: follow the ruled grid lines to associate a value with its row, never the ` +
  `pixel height alone. This is the most common way to misread this kind of image, ` +
  `and it produces a plausible number against the wrong item.\n\n` +
  `Specifically:\n` +
  `- If a printed value is struck through and another is written by hand, the ` +
  `HANDWRITTEN value governs. Report it as price, the printed one as printedPrice, ` +
  `and set handwritten true.\n` +
  `- If glare, blur or an obscured corner means you cannot read a value that is ` +
  `clearly there, use status 'illegible' and describe it in unreadableRegions. ` +
  `Do NOT infer it from neighbouring rows, from the quantity, or from what would ` +
  `be a plausible price. An honest 'illegible' is a correct answer here; a guess ` +
  `is the worst possible output because nobody can tell it was a guess.\n` +
  `- Read the unit column carefully. A rate card may quote per piece where the ` +
  `enquiry asked per box, and the unit is what tells us so.\n` +
  `- Check the margins and the foot of the page for handwritten notes, circled ` +
  `conditions and tax scrawls.\n` +
  `- Give provenance locators as "bbox x0,y0,x1,y1" with four numbers between 0 ` +
  `and 1, as fractions across and down the whole image.`;

// ---------------------------------------------------------------------------

export async function readFileParts(
  buf: Buffer,
  filename: string,
  mimeType: string,
): Promise<{
  format: Format;
  parts: Part[];
  meta: object;
  guidance?: string;
  /** Attachments the caller should read with their own reader. */
  nestedFiles?: Array<{ filename: string; mimeType: string; buf: Buffer }>;
}> {
  const format = detectFormat(filename, mimeType);
  if (buf.length === 0) {
    throw new Error(`'${filename}' is empty (0 bytes). Nothing to read.`);
  }
  assertContentMatchesExtension(buf, filename);
  switch (format) {
    case "xlsx":  return { format, ...(await readXlsx(buf)) };
    case "pdf":   return { format, ...readPdf(buf, filename) };
    case "docx":  return { format, ...(await readDocx(buf)) };
    case "odt":   return { format, ...(await readOdt(buf)) };
    case "eml":   return { format, ...(await readEml(buf)) };
    case "text":  return { format, ...readText(buf, filename) };
    case "image": return { format, ...readImage(buf, mimeType), guidance: PHOTO_GUIDANCE };
  }
}
