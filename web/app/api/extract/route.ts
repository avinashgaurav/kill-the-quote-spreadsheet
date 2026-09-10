import { extractDocument, fileHash } from "@/lib/extract/run";
import {
  activeRfx, guessVendor, seedRfx, storeExtraction, ensureVendor,
  storeQuestionnaireAnswers,
} from "@/lib/store";
import {
  extractQuestionnaire, looksLikeQuestionnaire,
} from "@/lib/extract/questionnaire";
import catalog from "@/lib/data/catalog.json";
import type { QuestionSpec } from "@/lib/questionnaire";
import { dbCache } from "@/lib/extract/cache";

/**
 * Upload vendor documents and read them.
 *
 * This is the loop the brief requires to be real, so what happens here is
 * exactly what it looks like: the bytes go to the model, the model reports what
 * the document says, code validates it, and the rows are stored with their
 * provenance. There is no lookup table and no branch on filename that produces
 * a prepared answer.
 *
 * Results are cached on (model, prompt hash, file hash) so a second run of the
 * same file is instant. That makes a live demo fast without making it fake:
 * change one byte of the document, or one word of the prompt, and it genuinely
 * re-reads. The response says which files were cached and which were read now,
 * so the distinction is visible on screen rather than a claim.
 */

// Reading five documents with vision and adaptive thinking takes longer than a
// default serverless window allows.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await seedRfx();

    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const explicitVendor = form.get("vendor");
    const verifyPhotos = form.get("verifyPhotos") !== "false";

    if (!files.length) {
      return Response.json(
        { ok: false, error: "No files were uploaded." },
        { status: 400 },
      );
    }

    const cache = await dbCache();
    const results: unknown[] = [];

    // Read against the enquiry that is actually on screen, not the shipped
    // example. If someone drafted their own thirty lines through the co-pilot,
    // those are the only line numbers a supplier item may map to. Reading a
    // packaging quote against an IT-hardware catalog would return thirty
    // unmapped rows and look like a reader failure when it is a wiring failure.
    const rfx = await activeRfx();
    const knownVendors = new Set(rfx.ctx.vendors.map((v) => v.code));

    // A queue rather than a fixed list: reading an email can discover an
    // attachment that itself needs reading. Bounded so a pathological
    // attachment chain cannot loop.
    const queue = [...files];
    const MAX_DOCUMENTS = 40;

    /**
     * Everything in this upload, so a questionnaire can be checked against the
     * certificate that came with it.
     *
     * Safe to hand over wholesale. `matchAttachment` inside the questionnaire
     * reader only opens a file whose name an ANSWER actually cites, so a
     * sibling nobody referred to is never read and never charged for. The
     * supplier's own citation decides what counts as evidence, which is the
     * right rule: we are not entitled to treat a file as backing an answer
     * just because it arrived in the same email.
     */
    const uploaded = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        mimeType: f.type || "application/octet-stream",
        buf: Buffer.from(await f.arrayBuffer()),
      })),
    );

    for (let i = 0; i < queue.length && i < MAX_DOCUMENTS; i++) {
      const file = queue[i];
      const buf = Buffer.from(await file.arrayBuffer());
      const fh = fileHash(buf);

      // Which vendor sent this? A filename is a hint, not a fact, so an
      // unrecognised file is reported rather than guessed at.
      let vendorId = typeof explicitVendor === "string" && explicitVendor.trim()
        ? explicitVendor.trim()
        : guessVendor(file.name, rfx.ctx.vendors.map((v) => v.code));

      if (!vendorId) {
        results.push({
          filename: file.name,
          ok: false,
          error:
            `Could not tell which supplier sent this file. Rather than guess and put ` +
            `prices in the wrong column, it has been skipped. Name the supplier and ` +
            `upload again.`,
          needsVendor: true,
          knownVendors: [...knownVendors],
        });
        continue;
      }

      // A supplier we have never seen is a NEW supplier, not an error. Someone
      // forwards a sixth quotation, or the buyer drafted their own enquiry and
      // their suppliers are not the five in the example. Refusing that would
      // make the product work only on its own demo data.
      //
      // The supplier is created with NO qualification verdict, which resolves
      // to qualified, and the column carries an explicit "questionnaire not
      // assessed" marker rather than a silent pass. An unassessed supplier that
      // looks assessed is the failure worth avoiding here.
      if (!knownVendors.has(vendorId)) {
        const created = await ensureVendor(rfx.rfxId, vendorId, file.name);
        vendorId = created.code;
        knownVendors.add(vendorId);
        results.push({
          filename: file.name, ok: true, informational: true, vendorId,
          note:
            `${created.name} was not on the supplier list, so a column has been created ` +
            `for them. Their questionnaire has not been assessed, so they appear as ` +
            `unassessed rather than as qualified.`,
        });
      }

      // The bytes go into the database with the response, not onto disk. A
      // serverless filesystem is read-only, so writing here failed with EROFS
      // on the deployed site and took the whole upload path down with it.
      const storagePath = `db:${fh}`;

      // A questionnaire response and a quotation are different documents
      // answering different questions, so they get different readers. The
      // filename is a hint, not a fact: getting it wrong is recoverable,
      // because a quotation read as a questionnaire returns no answers and
      // throws loudly rather than silently producing nothing.
      if (looksLikeQuestionnaire(file.name)) {
        try {
          const qr = await extractQuestionnaire({
            buf,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            questions: catalog.questionnaire as unknown as QuestionSpec[],
            attachments: uploaded.filter((u) => u.filename !== file.name),
            cache,
          });
          await storeQuestionnaireAnswers({
            rfxId: rfx.rfxId,
            vendorId,
            answers: qr.answers,
            provenance: qr.provenance,
            sourceFilename: file.name,
          });
          results.push({
            filename: file.name, ok: true, vendorId, kind: "questionnaire",
            model: qr.model, ms: qr.ms,
            answersRead: qr.answers.length,
            withEvidence: qr.answers.filter((a) => a.attachedDocument).length,
            unreadableRegions: qr.unreadableRegions,
            // Which certificates were actually opened, and what they turned
            // out to say. "Attached" must never be allowed to imply "checked".
            attachmentsRead: qr.evidenceRead.map((e) => ({
              file: e.filename, forQuestion: e.questionNo,
              states: e.standard, expires: e.validUntil,
              contradictedTheForm: e.overrode,
            })),
            attachmentsNotHeld: qr.attachmentsNotHeld,
            note:
              `Read ${qr.answers.length} questionnaire answer(s)` +
              (qr.evidenceRead.length
                ? `, and opened ${qr.evidenceRead.length} attached document(s) to see ` +
                  `what they state rather than trusting that they support the answer`
                : "") +
              (qr.attachmentsNotHeld.length
                ? `. They cite ${qr.attachmentsNotHeld.length} document(s) we do not ` +
                  `hold (${qr.attachmentsNotHeld.join(", ")}), so those answers have ` +
                  `nothing behind them yet: ask for the file`
                : "") +
              `. The pass or fail verdict is not stored: it is computed from these ` +
              `answers against the questions every time the comparison is read, so a ` +
              `certificate that expires next week changes the verdict without anybody ` +
              `editing a row.`,
          });
        } catch (e) {
          results.push({
            filename: file.name, ok: false, vendorId, kind: "questionnaire",
            error: String(e),
          });
        }
        continue;
      }

      try {
        const { extraction, rows, meta, nestedFiles } = await extractDocument({
          buf,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          lines: rfx.ctx.lines,
          cache,
          verifyPhotos,
        });

        // "Rates attached" is the commonest reply shape there is. An attached
        // spreadsheet has to be read AS a spreadsheet, with cell addresses, so
        // each binary attachment is queued as its own document rather than
        // flattened into the covering email.
        for (const nested of nestedFiles ?? []) {
          queue.push(new File([new Uint8Array(nested.buf)], nested.filename, {
            type: nested.mimeType,
          }));
          results.push({
            filename: file.name, ok: true, informational: true, vendorId,
            note:
              `Contained an attachment (${nested.filename}) which is being read ` +
              `separately with its own reader, so it keeps its own provenance.`,
          });
        }

        const stored = await storeExtraction({
          rfxId: rfx.rfxId,
          vendorId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          byteSize: buf.length,
          fileHash: fh,
          storagePath,
          fileBytes: buf,
          extraction,
          rows,
          meta,
        });

        const priced = rows.filter((r) => r.price !== null).length;
        const lowConfidence = rows.filter((r) => r.confidence < 0.8).length;

        // A document-level confidence rating, reported for EVERY format rather
        // than only for photographs. A Word letter with prices buried in
        // sentences and a scanned PDF are both harder to read than a
        // spreadsheet, and a buyer deciding where to spend twenty minutes of
        // checking needs to know which document the reader found hardest.
        //
        // Reported as three numbers, not one, because one average hides the
        // case that matters: a document can average 0.93 and still contain the
        // single 0.30 cell that decides an award.
        const confidences = rows.map((r) => r.confidence);
        const mean = confidences.length
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : 0;
        const lowest = confidences.length ? Math.min(...confidences) : 0;
        const weakest = rows
          .filter((r) => r.confidence <= lowest + 1e-9)
          .map((r) => r.rfxLineNo)
          .filter((n): n is number => n !== null);
        const readConfidence = {
          mean: Number(mean.toFixed(2)),
          lowest: Number(lowest.toFixed(2)),
          lowestLines: weakest.slice(0, 5),
          belowFloor: lowConfidence,
          floor: 0.8,
        };

        results.push({
          filename: file.name,
          ok: true,
          vendorId,
          format: meta.format,
          cached: meta.cached,
          ms: meta.ms,
          model: meta.model,
          rowsFound: rows.length,
          priced,
          unmapped: stored.unmappedStored,
          cellsStored: stored.cellsStored,
          rejectedForNoProvenance: stored.rejectedForNoProvenance,
          lowConfidence,
          readConfidence,
          unreadableRegions: extraction.unreadableRegions,
          conditionalDiscounts: extraction.conditionalDiscounts.length,
          statedTotal: extraction.statedTotal,
          supersedesRef: extraction.supersedesRef,
          validationIssues: meta.validationIssues,
          verification: meta.verification ?? null,
          usage: meta.usage,
        });
      } catch (e) {
        // A failed read stays a gap. Nothing partial is stored, because a
        // half-read document is worse than an unread one: it looks complete.
        results.push({ filename: file.name, ok: false, vendorId, error: String(e) });
      }
    }

    const ok = results.filter((r) => (r as { ok: boolean }).ok);
    return Response.json({
      ok: true,
      read: ok.length,
      failed: results.length - ok.length,
      results,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
