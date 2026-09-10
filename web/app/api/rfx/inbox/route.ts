/**
 * Replies arriving from suppliers.
 *
 * The buyer picks who to invite, presses send, and their responses turn up.
 * Which is what a buyer does, and it is a much better demonstration than
 * telling them to go and find nine files on disk and drag them in.
 *
 * SO BE PRECISE ABOUT WHAT IS FAKED HERE, BECAUSE IT IS EXACTLY ONE THING.
 *
 *   FAKED     the transport. Nothing was emailed and no mailbox was polled.
 *             A supplier "replies" because their document is on file and you
 *             invited them. This is the SMTP server the brief says to stub.
 *
 *   NOT FAKED the reading. Every arriving document goes through the same
 *             extraction path as a drag-and-drop upload: a real model call, a
 *             real schema, real provenance, and the same loud failure when a
 *             read comes back empty. No answer is pre-written and none is
 *             stored alongside the file.
 *
 * The distinction matters because the two are easy to confuse and only one of
 * them is permitted. A demo where pressing a button makes prepared answers
 * appear is a scripted demo. A demo where pressing a button makes real
 * documents arrive, which are then genuinely read, is a stubbed transport.
 *
 * A supplier with no document on file does not reply at all. That is not a
 * gap in the dataset, it is the commonest thing in procurement: you invite ten
 * and five answer. It is also the state the chase loop exists for.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

import { extractDocument, fileHash } from "@/lib/extract/run";
import { dbCache } from "@/lib/extract/cache";
import { extractQuestionnaire, looksLikeQuestionnaire } from "@/lib/extract/questionnaire";
import {
  activeRfx, storeExtraction, storeQuestionnaireAnswers,
} from "@/lib/store";
import catalog from "@/lib/data/catalog.json";
import type { QuestionSpec } from "@/lib/questionnaire";

export const maxDuration = 300;

/**
 * What each supplier sends back, and in what order.
 *
 * Ordered as it would actually arrive: the quotation first, because that is
 * what a salesperson sends, and the questionnaire afterwards from somebody in
 * compliance, on a different day, in a different format. That gap is the whole
 * reason a supplier can look priced and unassessed at the same time.
 *
 * Paths only. Nothing here says what the documents contain.
 */
interface Arriving {
  /** The document itself. */
  path: string;
  /**
   * Files that came with it, which its own contents refer to.
   *
   * A questionnaire response is a form. Against "are you ISO 27001:2022
   * certified?" a supplier writes "Yes" and puts a FILENAME in the document
   * column, because that is what a form has room for. The revision year and
   * the expiry date live inside the attached certificate, and reading only the
   * form gets you "answered yes, attached something, nothing contradicts it".
   *
   * So an attachment is delivered with its parent and read as its own
   * document. This is the mechanism the whole expired-certificate finding
   * depends on, and until it existed the finding only survived because the
   * fixture had the standard and the date typed into a string.
   */
  attachments?: string[];
}

const MAILBOX: Record<string, Arriving[]> = {
  V1: [
    { path: "01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184.xlsx" },
    { path: "01-vendor-zenith/Zenith_Questionnaire_Response.xlsx" },
  ],
  V2: [{ path: "02-vendor-cygnus/Cygnus_Quotation_CTI-Q-2026-0918.pdf" }],
  V3: [
    { path: "03-vendor-orbit/Orbit_Offer_OSS-QT-2026-27-0442.docx" },
    { path: "03-vendor-orbit/Orbit_Questionnaire_Response.docx" },
  ],
  V4: [
    { path: "04-vendor-vector/IMG_20260917_1142_vector_rate_card.jpg" },
    {
      path: "04-vendor-vector/Vector_Questionnaire_Response.pdf",
      // The certificate they answered Q2 with. It names the 2013 revision and
      // expired on 2025-11-30, and neither fact is anywhere on the form.
      attachments: ["04-vendor-vector/VDS_ISO27001.pdf"],
    },
  ],
  V5: [{ path: "05-vendor-helios/helios_reply_2026-09-17.eml" }],
};

/** A later revision, delivered only when the buyer asks for it. */
const LATE_REVISIONS: Record<string, string> = {
  V1: "01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184-R2_REVISED.xlsx",
};

const CORPUS = join(process.cwd(), "public", "dataset");
/** Where the generators write. Present in the repo, absent in a deployment. */
const FALLBACK = join(process.cwd(), "..", "dataset", "out");

/**
 * Find one supplier's document on disk.
 *
 * The `turbopackIgnore` comments are load-bearing rather than cosmetic. The
 * bundler sees a `join` with a runtime string, concludes it cannot know which
 * files are needed, and traces THE WHOLE PROJECT into the function bundle:
 * every source file and the entire public folder, which here includes the
 * eleven photographs of a rate card. That is how a 200 kB route becomes a
 * deployment that is slow to build and eventually too big to build at all.
 *
 * The paths are safe to exempt because both roots are fixed at module load
 * and `rel` only ever comes from MAILBOX or LATE_REVISIONS above, never from
 * the request body. The public/dataset files are already deployed as static
 * assets, which is how the route finds them at runtime.
 */
function resolve(rel: string): string | null {
  for (const base of [CORPUS, FALLBACK]) {
    const p = join(/* turbopackIgnore: true */ base, rel);
    if (existsSync(/* turbopackIgnore: true */ p)) return p;
  }
  return null;
}

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  eml: "message/rfc822",
  txt: "text/plain",
};

/** Who is on the roster, and who would answer. Read-only, no auth needed. */
export async function GET() {
  const roster = (catalog.roster ?? []) as Array<{
    code: string; name: string; city: string; email: string;
    reply_on_file: boolean; blurb: string;
  }>;
  return Response.json({
    ok: true,
    suppliers: roster.map((r) => ({ ...r, documents: MAILBOX[r.code]?.length ?? 0 })),
    note:
      "Five of the ten have a response on file. The other five never reply, which " +
      "is the ordinary case: you invite ten and five answer. Nothing about a " +
      "supplier's prices or answers is stored here, only which files would arrive.",
  });
}

/**
 * Deliver one supplier's reply and read it.
 *
 * One supplier per call, so the UI can show them arriving one at a time and so
 * a single slow or failed read does not take the others with it.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.supplierCode ?? "").trim();
    const includeRevision = body.includeRevision === true;
    const channel = String(body.channel ?? "email").trim().toLowerCase();

    /**
     * The channel is not cosmetic, and this is where it stops being a label.
     *
     * The send route already models it correctly outbound: WhatsApp cannot
     * carry an attachment, so the four-document pack goes as a link. This
     * route ignored `channel` completely, so the choice changed nothing about
     * what came back, while WORKFLOW.md claimed "your choice at step 3 becomes
     * the hardest input at step 4". A document asserting behaviour the code
     * does not have is the same defect as a hardcoded answer, one layer up.
     *
     * A channel that cannot carry an attachment cannot carry one INBOUND
     * either. So on WhatsApp a supplier's questionnaire form arrives and the
     * certificate it cites does not, and the consequence lands exactly where
     * it should: their answer to "are you ISO 27001:2022 certified?" has
     * nothing behind it that we can check, and the reason is a choice the
     * buyer made two steps earlier. Not a fabricated behaviour: it is what the
     * medium does.
     */
    const CARRIES_ATTACHMENTS: Record<string, boolean> = {
      email: true, portal: true, whatsapp: false,
    };
    const carriesAttachments = CARRIES_ATTACHMENTS[channel] ?? true;

    if (!code) {
      return Response.json(
        { ok: false, error: "No supplier named." },
        { status: 400 },
      );
    }

    const files: Arriving[] = [
      ...(MAILBOX[code] ?? []),
      ...(includeRevision && LATE_REVISIONS[code]
        ? [{ path: LATE_REVISIONS[code] }]
        : []),
    ];

    if (!files.length) {
      // Not an error. They were invited and chose not to bid, which is a fact
      // the buyer needs rather than a failure to report.
      return Response.json({
        ok: true,
        supplierCode: code,
        replied: false,
        note:
          "No response. They were invited and have not sent anything, which is " +
          "different from a supplier whose reply nobody has read yet. Chase them, " +
          "or record the non-response and award around them.",
      });
    }

    const rfx = await activeRfx();
    // The SAME cache the upload route uses. These two routes read the same
    // corpus, and until now they did not even share a broken cache: this one
    // fell through to a module-level Map that is empty on every cold start, so
    // pressing Send and then dragging the same files in paid twice.
    const cache = await dbCache();
    const results: unknown[] = [];

    for (const arriving of files) {
      const rel = arriving.path;
      const path = resolve(rel);
      const name = rel.split("/").pop()!;
      if (!path) {
        results.push({ filename: name, ok: false, error: "not on file" });
        continue;
      }

      const buf = await readFile(/* turbopackIgnore: true */ path);
      const ext = name.split(".").pop()!.toLowerCase();
      const mimeType = MIME[ext] ?? "application/octet-stream";

      try {
        // A questionnaire response and a quotation are different documents and
        // get different readers. Same routing as a manual upload.
        if (looksLikeQuestionnaire(name)) {
          // Everything that came with it, so an answer that points at a
          // certificate can be checked against the certificate. Unless the
          // channel cannot carry one, in which case it genuinely did not
          // arrive and the answer stands alone.
          const attachments = [];
          for (const arel of carriesAttachments ? (arriving.attachments ?? []) : []) {
            const apath = resolve(arel);
            if (!apath) continue;
            const aname = arel.split("/").pop()!;
            attachments.push({
              filename: aname,
              mimeType: MIME[aname.split(".").pop()!.toLowerCase()] ?? "application/octet-stream",
              buf: await readFile(/* turbopackIgnore: true */ apath),
            });
          }

          const qr = await extractQuestionnaire({
            buf, filename: name, mimeType,
            questions: catalog.questionnaire as unknown as QuestionSpec[],
            attachments,
            cache,
          });
          await storeQuestionnaireAnswers({
            rfxId: rfx.rfxId, vendorId: code,
            answers: qr.answers, provenance: qr.provenance, sourceFilename: name,
            attachments: qr.openedAttachments,
          });
          results.push({
            filename: name, ok: true, kind: "questionnaire",
            answersRead: qr.answers.length, model: qr.model, ms: qr.ms,
            // Reported so the screen can say which certificates were actually
            // opened, rather than leaving "attached" to imply "checked".
            attachmentsRead: qr.evidenceRead.map((e) => ({
              file: e.filename, forQuestion: e.questionNo,
              states: e.standard, expires: e.validUntil,
            })),
            attachmentsNotHeld: qr.attachmentsNotHeld,
            // Named separately from "they never sent it", because the cause is
            // ours and it is reversible: ask them again over email.
            attachmentsBlockedByChannel: carriesAttachments
              ? []
              : (arriving.attachments ?? []).map((a) => a.split("/").pop()!),
          });
          continue;
        }

        const { extraction, rows, meta, nestedFiles } = await extractDocument({
          buf, filename: name, mimeType, lines: rfx.ctx.lines, cache,
        });

        const stored = await storeExtraction({
          rfxId: rfx.rfxId, vendorId: code, filename: name, mimeType,
          byteSize: buf.length, fileHash: fileHash(buf),
          storagePath: `db:${fileHash(buf)}`, fileBytes: buf,
          extraction, rows, meta,
        });

        results.push({
          filename: name, ok: true, kind: "quotation",
          format: meta.format, model: meta.model, cached: meta.cached, ms: meta.ms,
          rowsFound: rows.length,
          priced: rows.filter((r) => r.price !== null).length,
          cellsStored: stored.cellsStored,
          unmapped: stored.unmappedStored,
          attachments: nestedFiles?.length ?? 0,
        });
      } catch (e) {
        // A failed read stays a gap. Nothing partial is stored, because a
        // half-read document is worse than an unread one: it looks complete.
        results.push({ filename: name, ok: false, error: String(e) });
      }
    }

    return Response.json({
      ok: true,
      supplierCode: code,
      replied: true,
      results,
      channel,
      carriesAttachments,
      note:
        "Delivery is simulated: nothing was emailed and no mailbox was polled. " +
        "The reading is not simulated. Each document above went through the same " +
        "model call, schema and provenance checks as a file dragged in by hand." +
        (carriesAttachments
          ? ""
          : ` You chose ${channel}, which cannot carry an attachment, so any ` +
            `certificate a supplier cited did not arrive. Their answers stand ` +
            `alone and cannot be checked against their own documents. Ask them ` +
            `again over email or the portal to close that.`),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
