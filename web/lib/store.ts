/**
 * Persistence: seed the RFx, store extractions, load the comparison.
 *
 * The important property is the direction data flows:
 *
 *   extraction -> extracted_cells (raw + provenance)  [stored]
 *   extracted_cells -> rawByVendor -> buildMatrix()   [derived, every read]
 *
 * Landed values are recomputed on every read rather than trusted from the
 * table. That is what makes the assumption ledger real: change the FX rate and
 * the next read of the comparison reflects it, with nothing to migrate and no
 * stale total surviving anywhere. The stored landed columns exist for export
 * and audit, never as the source the UI reads.
 */

import { randomUUID } from "node:crypto";
import catalog from "./data/catalog.json";
import { getQuery } from "./db/client";
import {
  buildMatrix, cheapestPerLine, singleVendor, costOfCompliance, trustSummary,
  likeForLike, LINES, VENDORS, QUALIFICATION, BASELINE_TOTAL_INR,
  type Matrix, type RawQuote, type RfxContext, type RfxLine,
} from "./normalise";
import type { Extraction, ExtractedRow } from "./extract/contract";
import {
  assessQuestionnaire, type QuestionSpec, type ReadAnswer, type Verdict,
} from "./questionnaire";
import type { ExtractionMeta } from "./extract/run";

export const RFX_ID = (catalog.rfx as { id: string }).id;

const q = getQuery;

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Put the buyer's own enquiry into the database.
 *
 * Note what is NOT seeded: any vendor price. The grid exists with 30 lines and
 * 5 vendor columns and every cell empty, so the demo can start from a genuinely
 * blank comparison and fill it by reading real documents. Seeding prices would
 * make the whole thing theatre.
 */
export async function seedRfx(): Promise<{ seeded: boolean; lines: number; vendors: number }> {
  const run = await q();
  const existing = await run(`select 1 from rfx where id = $1`, [RFX_ID]);
  if (existing.rows?.length) {
    return { seeded: false, lines: LINES.length, vendors: VENDORS.length };
  }

  const rfx = catalog.rfx as Record<string, unknown>;
  await run(
    `insert into rfx (id, title, buyer, terms, issued_at, due_at, drafted_by_copilot)
     values ($1, $2, $3, $4, $5, $6, false)`,
    [
      RFX_ID, String(rfx.title), JSON.stringify(catalog.buyer),
      JSON.stringify({
        incoterm: rfx.incoterm_asked, taxBasis: rfx.tax_basis_asked,
        payment: rfx.payment_asked, validity: rfx.validity_asked,
        currency: rfx.currency_asked,
      }),
      String(rfx.issued), String(rfx.due),
    ],
  );

  for (const l of LINES) {
    await run(
      `insert into rfx_lines
         (id, rfx_id, no, sku, group_name, description, spec, uom, pack_size, qty, hsn, baseline_inr)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        `${RFX_ID}:${l.no}`, RFX_ID, l.no, l.sku, l.group, l.desc,
        JSON.stringify(l.spec), l.uom, l.pack_size, l.qty, l.hsn, String(l.baseline_inr),
      ],
    );
  }

  const answers = catalog.questionnaire_answers as Record<string, unknown>;
  for (const v of VENDORS) {
    const qual = QUALIFICATION[v.code];
    const seeded = seedAnswersFor(v.code);
    const full = (catalog.vendors as Array<Record<string, unknown>>)
      .find((x) => x.code === v.code)!;
    await run(
      `insert into vendors
         (id, rfx_id, code, legal_name, city, gstin, contact, qualified,
          failed_mandatory, questionnaire_answers, read_answers,
          answers_provenance, answers_read_at, answers_source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               case when $11::jsonb is null then null else now() end,$13)`,
      [
        v.code, RFX_ID, v.code, v.name, v.city, String(full.gstin ?? ""),
        JSON.stringify({ name: full.contact, role: full.role, email: full.email }),
        // The `qualified` and `failed_mandatory` columns are LEGACY. They hold
        // the hand-written verdict that this whole path exists to remove, and
        // nothing reads them any more: the verdict is derived from the answers
        // on every read. Kept only so an older row still parses.
        qual.qualified, JSON.stringify(qual.failed_mandatory),
        JSON.stringify(answers[v.code] ?? {}),
        seeded.length ? JSON.stringify(seeded) : null,
        JSON.stringify({}),
        seeded.length
          ? "seeded from the fabricated dataset, NOT read from a document"
          : null,
      ],
    );
  }

  const assumptions = catalog.assumptions as Record<string, Record<string, unknown>>;
  for (const [key, a] of Object.entries(assumptions)) {
    await run(
      `insert into assumptions (id, rfx_id, key, value, source, alternative, note, confidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        `${RFX_ID}:${key}`, RFX_ID, key, JSON.stringify(a.value ?? null),
        String(a.source ?? ""), a.alternative ? String(a.alternative) : null,
        String(a.note ?? ""), a.confidence ? String(a.confidence) : null,
      ],
    );
  }

  return { seeded: true, lines: LINES.length, vendors: VENDORS.length };
}

/**
 * Turn the fabricated questionnaire answers into the shape a READER would have
 * produced, so the verdict can be derived from them rather than asserted.
 *
 * This is the fix for a contradiction that was visible on the screen: a
 * supplier's row said "nothing read" beside "FAILED 6", and those six failures
 * came from a table somebody had typed.
 *
 * The answers themselves are legitimately part of the dataset, exactly like the
 * quotation documents: a supplier said something, and we fabricated what.
 * What was NOT legitimate was also fabricating the verdict. So the answers are
 * seeded and stamped as seeded, and every verdict is computed from them by
 * `assessQuestionnaire`, which is the same code that runs on a real read.
 *
 * The expired-certificate finding is now genuinely found: the seed reports
 * "ISO/IEC 27001:2013, EXPIRED 2025-11-30", and code notices both that the
 * revision is not the one asked for and that the date has passed.
 */
/**
 * The verdict for one supplier row, computed from the answers on it.
 *
 * The single place a qualification decision is made, so the grid, the award
 * note, the chase and the analyst cannot disagree about who is eligible.
 */
export function verdictFor(
  row: Record<string, unknown>,
  /**
   * The questions the enquiry asked. Defaults to the shipped set only so that
   * older callers and the seeded example still work: passing the enquiry's own
   * questions is the correct thing to do, and `activeRfx` does.
   */
  questions: QuestionSpec[] = catalog.questionnaire as unknown as QuestionSpec[],
): Verdict {
  const read = (row.read_answers ?? null) as ReadAnswer[] | null;
  return assessQuestionnaire({
    questions,
    answers: Array.isArray(read) ? read : [],
    supplierName: row.legal_name ? String(row.legal_name) : undefined,
  });
}

export function seedAnswersFor(code: string): ReadAnswer[] {
  const all = catalog.questionnaire_answers as Record<
    string, Record<string, { answer: string | null; doc: string | null; note?: string }>
  >;
  const mine = all[code];
  if (!mine) return [];

  const out: ReadAnswer[] = [];
  for (const [no, a] of Object.entries(mine)) {
    // A blank entry is INCLUDED, with a null answer.
    //
    // This is the difference between "we hold their response and this question
    // is blank" and "nobody has looked at their questionnaire". One supplier in
    // this dataset replied to the enquiry and sent no questionnaire at all;
    // skipping their blanks made them come back UNASSESSED, and therefore
    // eligible, when in fact they were asked ten mandatory questions and
    // answered none. Being asked and not answering is a failure. Never being
    // asked is not, and that is what an absent read_answers column means.

    // The dataset writes a document as one string, e.g.
    //   "ISO/IEC 27001:2013, EXPIRED 2025-11-30"
    //   "OEM authorisation letters, Dell / HPE / Cisco, valid to 2027-03-31"
    // which is how a reader would see it printed. Split into the standard and
    // the date the way a reader would report them.
    let evidence: ReadAnswer["evidence"] = null;
    if (a.doc) {
      const std = /\b(ISO(?:\/IEC)?\s*\d{4,5}\s*:\s*\d{4})\b/i.exec(a.doc);
      const date = /(\d{4}-\d{2}-\d{2})/.exec(a.doc);
      evidence = {
        standard: std ? std[1] : null,
        validUntil: date ? date[1] : null,
        issuedTo: null,
        summary: a.doc,
      };
    }

    out.push({
      questionNo: no,
      answer: a.answer,
      attachedDocument: a.doc,
      evidence,
      confidence: 0.5,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Which enquiry are we looking at
// ---------------------------------------------------------------------------

/**
 * Load the ACTIVE enquiry from the database rather than from the shipped
 * catalog.
 *
 * This is the difference between a demo that only works on my data and a
 * product that works on yours. If a buyer drafts their own enquiry through the
 * co-pilot, its lines land in `rfx_lines` and its suppliers in `vendors`, and
 * everything downstream has to read THOSE, not the thirty IT-hardware lines
 * that happen to be seeded.
 *
 * "Active" means the most recently created enquiry that actually has lines.
 * A counter or a session flag would be more configurable and less honest: the
 * enquiry you just drafted is the one you mean, and if you have not drafted
 * one, the seeded example is the one you mean.
 *
 * Falls back to the catalog if the database is empty or unreachable, so a cold
 * start still renders something rather than an error page.
 */
/** One line sent past the ambiguity gate on purpose, with the buyer's reason. */
export interface KnowinglyAmbiguous {
  where: string;
  lineNo: number | null;
  issue: string;
  consequence: string;
  reason: string;
  acceptedAt: string;
}

export async function activeRfx(): Promise<{
  rfxId: string;
  ctx: RfxContext;
  /** True when this came from the shipped example rather than a drafted one. */
  isSeededExample: boolean;
  baselineTotalInr: number;
  questionnaireAnswers: Record<string, unknown>;
  /** The questions this enquiry asked, not the shipped set. */
  questions: QuestionSpec[];
  /** Non-null only when the database failed and this is not live data. */
  degraded: string | null;
  vendorRows: Array<Record<string, unknown>>;
  /**
   * Lines the buyer sent KNOWING they were ambiguous, and the reason they gave.
   *
   * Recorded at send time and carried all the way to the award note. It was
   * stored and then read by nothing for a while, which quietly made the
   * override pointless: the whole argument for letting a buyer past the gate
   * with a typed reason is that the reason turns up later, next to the money,
   * where a CFO asking "why is this line a mess" can find it. An override that
   * disappears is just a dismissable warning with extra steps.
   */
  knowinglyAmbiguous: KnowinglyAmbiguous[];
}> {
  const run = await q();
  const fallback = {
    rfxId: RFX_ID,
    ctx: { lines: LINES, vendors: VENDORS, qualification: QUALIFICATION } as RfxContext,
    isSeededExample: true,
    baselineTotalInr: BASELINE_TOTAL_INR,
    questionnaireAnswers: catalog.questionnaire_answers as Record<string, unknown>,
    questions: catalog.questionnaire as unknown as QuestionSpec[],
    // The shipped example was never sent past the gate by anybody.
    knowinglyAmbiguous: [] as KnowinglyAmbiguous[],
    /**
     * Set only when we got here because the DATABASE FAILED, never on a normal
     * cold start.
     *
     * The two states used to be indistinguishable from the outside, and that
     * mattered more than it sounds. On a database error this object supplies
     * `QUALIFICATION`, the hand-typed pass/fail table the whole product exists
     * to remove. If the failure is narrow, real extracted cells still load and
     * get merged with those catalog verdicts, so the screen shows live prices
     * beside a hand-written verdict with nothing saying so. The error was
     * logged loudly on the server, which is no use at all to the person
     * looking at the numbers.
     *
     * A fallback the buyer cannot see is worse than no fallback.
     */
    degraded: null as string | null,
    vendorRows: [],
  };

  try {
    // The newest enquiry somebody drafted wins, and the shipped example is the
    // floor. Two rules were tried and rejected before this one:
    //
    //   "newest with lines", plainly: correct, but debris from an abandoned
    //   draft hijacked the screen with no way back. Fixed by giving the flow a
    //   discard (resetDrafts) rather than by making the rule cleverer.
    //
    //   "prefer an enquiry that has replies": survived debris and broke the
    //   actual journey. A buyer who has just drafted and sent an enquiry has no
    //   replies yet, so the screen snapped back to the shipped example at
    //   exactly the moment they expected their own empty grid.
    //
    // The lesson worth keeping: the enquiry you drafted last is the one you
    // mean, whether or not anyone has answered it.
    const picked = (await run(
      `select r.id from rfx r
         where exists (select 1 from rfx_lines l where l.rfx_id = r.id)
         order by (r.id = $1) asc, r.created_at desc nulls last
         limit 1`,
      [RFX_ID],
    )).rows?.[0];
    const rfxId = String(picked?.id ?? RFX_ID);

    // The shipped example takes the same path as anything else. It used to
    // short-circuit to a constant that carried the HAND-WRITTEN qualification
    // verdict, which is exactly the thing being removed: the verdict has to be
    // derived from the stored answers whichever enquiry is on screen.
    const seededExample = rfxId === RFX_ID;

    /**
     * The questions THIS buyer asked, falling back to the shipped set.
     *
     * The fallback is right for the seeded example, whose questionnaire is
     * part of the fabricated corpus, and it is the only honest option for an
     * enquiry drafted before this column existed. It is NOT right as a general
     * default, which is what it used to be: every questionnaire read was
     * graded against the demo's ten questions whatever enquiry was live, so a
     * supplier's real answers to a buyer's real questions were dropped as
     * unknown question numbers and the verdict described an enquiry nobody
     * sent.
     */
    const rfxRow = (await run(
      `select questionnaire, knowingly_ambiguous from rfx where id = $1`,
      [rfxId],
    )).rows?.[0];
    const asked = rfxRow?.questionnaire;
    const questions = (Array.isArray(asked) && asked.length
      ? asked
      : catalog.questionnaire) as unknown as QuestionSpec[];

    const lineRows = (await run(
      `select no, sku, group_name, description, spec, uom, pack_size, qty, hsn,
              baseline_inr
         from rfx_lines where rfx_id = $1 order by no`,
      [rfxId],
    )).rows ?? [];
    if (!lineRows.length) return fallback;

    const lines: RfxLine[] = lineRows.map((l) => ({
      no: Number(l.no),
      sku: String(l.sku),
      group: String(l.group_name),
      desc: String(l.description),
      spec: (l.spec ?? {}) as Record<string, string>,
      uom: String(l.uom),
      pack_size: Number(l.pack_size ?? 1),
      qty: Number(l.qty),
      hsn: l.hsn ? String(l.hsn) : "",
      baseline_inr: Number(l.baseline_inr ?? 0),
    })) as unknown as RfxLine[];

    const vendorRows = (await run(
      `select code, legal_name, city, qualified, failed_mandatory,
              questionnaire_answers, read_answers, answers_provenance,
              answers_read_at, answers_source
         from vendors where rfx_id = $1 order by code`,
      [rfxId],
    )).rows ?? [];

    const knowinglyAmbiguous = (Array.isArray(rfxRow?.knowingly_ambiguous)
      ? rfxRow.knowingly_ambiguous
      : []) as KnowinglyAmbiguous[];

    return {
      rfxId,
      knowinglyAmbiguous,
      ctx: {
        lines: seededExample ? LINES : lines,
        vendors: vendorRows.map((v) => ({ code: String(v.code) })),
        // DERIVED, never read from a stored verdict. A supplier nobody has
        // assessed comes back qualified rather than disqualified, because
        // excluding a real bid from every scenario for want of a questionnaire
        // is a silent and expensive way to be wrong. The UI marks them as
        // unassessed so it never reads as a pass.
        qualification: Object.fromEntries(
          vendorRows.map((v) => {
            const verdict = verdictFor(v, questions);
            return [String(v.code), {
              qualified: verdict.assessed ? verdict.qualified : true,
            }];
          }),
        ),
        /**
         * Each supplier's stated whole-order discount, as READ off their
         * document, so the award total uses their terms and not the example's.
         *
         * A supplier we have not read contributes nothing here, which the
         * calculator treats as "no discount known" rather than "no discount
         * offered". Those are different, and only the second one is a fact.
         */
        statedDiscountPct: Object.fromEntries(
          (await run(
            // Ordered oldest first so a later revision's terms overwrite an
            // earlier one's in the object below. A supplier who re-quotes with
            // a different discount is quoting the new one.
            `select vendor_id, extraction_meta from responses
              where rfx_id = $1 order by revision asc, created_at asc`,
            [rfxId],
          )).rows?.flatMap((r) => {
            const meta = (r.extraction_meta ?? {}) as Record<string, unknown>;
            const terms = (meta.terms ?? {}) as Record<string, unknown>;
            const pct = terms.totalLevelDiscountPercent;
            return typeof pct === "number"
              ? [[String(r.vendor_id), pct] as [string, number]]
              : [];
          }) ?? [],
        ),
      },
      isSeededExample: seededExample,
      /** The questions this enquiry actually asked. Never the catalog's by default. */
      questions,
      degraded: null,
      baselineTotalInr: seededExample
        ? BASELINE_TOTAL_INR
        : lines.reduce((a, l) => a + Number(l.baseline_inr ?? 0) * Number(l.qty ?? 0), 0),
      questionnaireAnswers: Object.fromEntries(
        vendorRows.map((v) => [String(v.code), v.questionnaire_answers ?? {}]),
      ),
      vendorRows,
    };
  } catch (e) {
    // Loud, not silent. This used to swallow the error and quietly return the
    // shipped constants, which meant a missing column or a schema drift showed
    // up as the OLD hand-written qualification verdicts reappearing on screen
    // with nothing anywhere saying why. A fallback you cannot see is worse than
    // no fallback.
    console.error(
      "[activeRfx] could not load the enquiry from the database, falling back to " +
      "the shipped example. The screen may be showing stale qualification data:",
      e,
    );
    return {
      ...fallback,
      degraded:
        "The enquiry could not be read from the database, so this screen is " +
        "showing the shipped example and its stored qualification verdicts " +
        "rather than anything derived from what was read. Do not act on these " +
        "numbers. " + String(e).slice(0, 160),
    };
  }
}

// ---------------------------------------------------------------------------
// Storing an extraction
// ---------------------------------------------------------------------------

/**
 * Map a filename to a supplier by matching a known name or code in the path.
 *
 * A filename is a HINT, not a fact. It returns null rather than a best guess,
 * because putting one supplier's prices in another's column is a mistake nobody
 * downstream can detect: the grid looks complete and the award is wrong.
 */
export function guessVendor(filename: string, restrictTo?: string[]): string | null {
  const n = filename.toLowerCase();
  const codes = restrictTo ? new Set(restrictTo) : null;
  for (const v of VENDORS) {
    if (codes && !codes.has(v.code)) continue;
    if (n.includes(v.slug) || n.includes(v.name.split(" ")[0].toLowerCase())) return v.code;
  }
  // For an enquiry that is not the shipped example, the supplier codes are
  // whatever the buyer's own suppliers are called, so match on those directly.
  for (const c of restrictTo ?? []) {
    if (c.length > 2 && n.includes(c.toLowerCase())) return c;
  }
  return null;
}

/**
 * Create a supplier column for someone not on the list.
 *
 * Deliberately records NO qualification verdict. Nobody has assessed their
 * questionnaire, and the honest representation of "not assessed" is not
 * "passed". The UI shows them as unassessed; award scenarios that filter on
 * qualification still include them, because excluding a supplier for want of a
 * row would silently remove a real bid from the comparison.
 */
export async function ensureVendor(
  rfxId: string, code: string, sourceFilename?: string,
): Promise<{ code: string; name: string; created: boolean }> {
  const run = await q();
  const base = code.trim().replace(/[^A-Za-z0-9 _.&-]/g, "").slice(0, 40) || "SUPPLIER";

  // `responses.vendor_id` is a foreign key onto `vendors.id`, and the seeded
  // rows use the code AS the id. So the id has to be the code here too, which
  // makes supplier codes globally unique rather than unique per enquiry.
  //
  // Found by the generality test, which is the point of having one: this failed
  // at the database with a foreign-key violation the moment a supplier was
  // created for an enquiry other than the seeded example.
  //
  // The collision that follows is handled rather than ignored: if this code is
  // already taken by a DIFFERENT enquiry, a suffix is added instead of quietly
  // attaching this quotation to someone else's supplier record.
  const claimed = (await run(
    `select id, rfx_id, legal_name from vendors where lower(id) = lower($1)`,
    [base],
  )).rows?.[0];
  if (claimed && String(claimed.rfx_id) === rfxId) {
    return { code: String(claimed.id), name: String(claimed.legal_name), created: false };
  }

  let id = base;
  if (claimed) {
    for (let n = 2; n < 50; n++) {
      const candidate = `${base}_${n}`;
      const taken = (await run(
        `select 1 from vendors where lower(id) = lower($1)`, [candidate],
      )).rows?.length;
      if (!taken) { id = candidate; break; }
    }
  }

  await run(
    `insert into vendors
       (id, rfx_id, code, legal_name, city, gstin, contact, qualified,
        failed_mandatory, questionnaire_answers)
     values ($1,$2,$3,$4,'', '', $5, null, '[]'::jsonb, '{}'::jsonb)`,
    [
      id, rfxId, id, base,
      JSON.stringify({
        source: sourceFilename
          ? `created on upload of ${sourceFilename}`
          : "created on upload",
      }),
    ],
  );
  return { code: id, name: base, created: true };
}

export interface StoredResponse {
  responseId: string;
  vendorId: string;
  cellsStored: number;
  unmappedStored: number;
  /** Rows the database refused because they carried no provenance. */
  rejectedForNoProvenance: number;
}

export async function storeExtraction(opts: {
  /** Which enquiry this reply belongs to. Defaults to the seeded example. */
  rfxId?: string;
  vendorId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  fileHash: string;
  storagePath: string;
  /** The document's own bytes, so the provenance panel can reopen it later. */
  fileBytes?: Buffer;
  extraction: Extraction;
  rows: ExtractedRow[];
  meta: ExtractionMeta;
}): Promise<StoredResponse> {
  const run = await q();
  const rfxId = opts.rfxId ?? RFX_ID;
  const responseId = `r_${opts.fileHash.slice(0, 12)}`;

  await run(`delete from responses where id = $1`, [responseId]);

  // Which revision is this? Derived from what the document itself claims, and
  // deliberately NOT from a counter: re-uploading the same revised quote must
  // land on the same number every time, or the winner flips on a re-read.
  //
  // If the document names the quotation it replaces and we already hold that
  // quotation, sit one above it, so a Rev 3 that replaces Rev 2 sorts correctly.
  // If it names something we have never seen, it is still a later revision than
  // anything unrevised, so 2.
  const claimed = opts.extraction.supersedesRef?.trim() ?? "";
  let revision = 1;
  let supersedesId: string | null = null;
  if (claimed) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const prior = (await run(
      `select id, revision, extraction_meta from responses
        where rfx_id = $1 and vendor_id = $2`,
      [rfxId, opts.vendorId],
    )).rows ?? [];
    const target = prior.find((p) => {
      const ref = (p.extraction_meta as Record<string, unknown>)?.vendorRef;
      return typeof ref === "string" && ref && norm(ref) === norm(claimed);
    });
    revision = target ? Number(target.revision ?? 1) + 1 : 2;
    supersedesId = target ? String(target.id) : null;
  }
  await run(
    `insert into responses
       (id, rfx_id, vendor_id, filename, mime_type, byte_size, file_hash,
        storage_path, extraction_status, extraction_meta, revision, blanket_fallback,
        supersedes_id, file_base64)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'extracted',$9,$10,$11,$12,$13)`,
    [
      responseId, rfxId, opts.vendorId, opts.filename, opts.mimeType,
      opts.byteSize, opts.fileHash, opts.storagePath,
      JSON.stringify({
        ...opts.meta,
        vendorRef: opts.extraction.vendorRef,
        supersedesRef: opts.extraction.supersedesRef,
        terms: opts.extraction.terms,
        conditionalDiscounts: opts.extraction.conditionalDiscounts,
        statedTotal: opts.extraction.statedTotal,
        unreadableRegions: opts.extraction.unreadableRegions,
      }),
      revision,
      opts.extraction.blanketFallback
        ? JSON.stringify(opts.extraction.blanketFallback)
        : null,
      supersedesId,
      opts.fileBytes ? opts.fileBytes.toString("base64") : null,
    ],
  );

  let cells = 0, unmapped = 0, rejected = 0;

  for (const row of opts.rows) {
    if (row.rfxLineNo === null) {
      await run(
        `insert into unmapped_items
           (id, response_id, vendor_id, vendor_ref, description, price, uom,
            currency, qty, note, provenance)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          `u_${randomUUID().slice(0, 8)}`, responseId, opts.vendorId,
          opts.extraction.vendorRef, row.vendorDescription,
          row.price === null ? null : String(row.price), row.uom, row.currency,
          row.qty, row.note, JSON.stringify(row.provenance),
        ],
      );
      unmapped += 1;
      continue;
    }

    try {
      await run(
        `insert into extracted_cells
           (id, response_id, vendor_id, line_no, raw_status, raw_price, raw_uom,
            raw_currency, raw_qty, printed_price, handwritten, offered_make_model,
            vendor_note, raw_reference, status, confidence, provenance, verification,
            flags, trace)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'[]'::jsonb,'[]'::jsonb)`,
        [
          `${responseId}:${row.rfxLineNo}`, responseId, opts.vendorId, row.rfxLineNo,
          row.status, row.price === null ? null : String(row.price), row.uom,
          row.currency, row.qty,
          row.printedPrice === null ? null : String(row.printedPrice),
          row.handwritten, row.offeredMakeModel, row.note,
          // The reference column carries every pointer this row holds: a prior
          // order it points at, and a scope uplift the supplier quoted
          // elsewhere. Merged rather than given its own column so a row with
          // both survives a round trip.
          row.reference || row.scopeUpliftRef
            ? JSON.stringify({
                ...(row.reference ?? {}),
                ...(row.scopeUpliftRef
                  ? {
                      scopeUpliftRef: row.scopeUpliftRef,
                      scopeUpliftNote: row.scopeUpliftNote ?? null,
                    }
                  : {}),
              })
            : null,
          // Provisional. The real status comes from the calculator on read.
          "pending", String(row.confidence), JSON.stringify(row.provenance),
          opts.meta.verification ? JSON.stringify(
            opts.meta.verification.filter((v) => v.rfxLineNo === row.rfxLineNo),
          ) : null,
        ],
      );
      cells += 1;
    } catch (e) {
      // The NOT NULL provenance constraint doing its job.
      if (String(e).includes("provenance")) rejected += 1;
      else throw e;
    }
  }

  return {
    responseId, vendorId: opts.vendorId,
    cellsStored: cells, unmappedStored: unmapped, rejectedForNoProvenance: rejected,
  };
}

// ---------------------------------------------------------------------------
// Reading the comparison
// ---------------------------------------------------------------------------

export interface CellProvenance {
  locator: string; citedText: string; method: string; page?: number | null;
}

/**
 * What happened when a supplier sent the same quote twice.
 *
 * Recorded per vendor and surfaced, never silently applied. A buyer who is
 * about to sign needs to know that the number in front of them came from Rev 2
 * and what Rev 1 said, because "we already agreed a price" is the first thing a
 * supplier says when the award lands.
 */
export interface Supersession {
  vendorId: string;
  revision: number;
  /** The reference the newer document itself claimed to replace, verbatim. */
  supersedesRef: string | null;
  supersededFilenames: string[];
  winningFilenames: string[];
  /** Lines whose price differs between the superseded and the winning revision. */
  changedLines: Array<{ lineNo: number; from: number | null; to: number | null }>;
  /**
   * Lines the earlier revision priced and the later one does not mention.
   * Carried forward rather than dropped, and flagged, because silently losing a
   * price is worse than showing a stale one that says it is stale.
   */
  carriedForwardLines: number[];
}

export interface LoadedComparison {
  matrix: Matrix;
  provenance: Record<string, CellProvenance>;   // `${vendor}:${lineNo}`
  confidence: Record<string, number>;
  verification: Record<string, unknown>;
  supersessions: Supersession[];
  /** Cell keys whose value came from a superseded revision. */
  carriedForward: string[];
  /**
   * Whether each supplier was asked for what they did not send, and whether
   * they answered.
   *
   * On the payload rather than fetched separately because it changes the
   * meaning of an empty cell. "No price" and "no price, asked on the 10th,
   * due the 16th, nothing came back" are different facts, and only the second
   * one lets a buyer award around them and defend it.
   */
  chases: Array<{
    vendorId: string;
    chaseId: string;
    sentAt: string;
    dueAt: string | null;
    itemCount: number;
    answeredAt: string | null;
    overdue: boolean;
    closedReason: string | null;
  }>;
  vendorMeta: Record<string, {
    filenames: string[];
    vendorRef: string | null;
    terms: Record<string, unknown>;
    conditionalDiscounts: unknown[];
    statedTotal: Record<string, unknown>;
    unreadableRegions: string[];
    extractedAt: string | null;
    ms: number | null;
    model: string | null;
    cached: boolean;
  }>;
  unmapped: Array<Record<string, unknown>>;
  hasAnyExtraction: boolean;
  /** Suppliers whose cells came from the test harness, not from a real read. */
  fixtureVendors: string[];
}

/**
 * Load every stored cell and rebuild the comparison from scratch.
 *
 * `rawByVendor` is assembled from the RAW columns only, then handed to the same
 * `buildMatrix` the conformance test exercises. So the matrix the buyer sees is
 * produced by the code proven to agree with the Python reference on all 150
 * cells, not by a second, untested path.
 */
export async function loadComparison(
  active?: Awaited<ReturnType<typeof activeRfx>>,
): Promise<LoadedComparison> {
  const run = await q();
  const rfx = active ?? await activeRfx();
  const RFX = rfx.rfxId;

  const cellRows = (await run(
    `select c.*, r.filename, r.extraction_meta, r.revision,
            r.created_at as response_created
       from extracted_cells c
       join responses r on r.id = c.response_id
      where r.rfx_id = $1
      order by c.vendor_id, c.line_no, r.revision, r.created_at`,
    [RFX],
  )).rows ?? [];

  const rawByVendor: Record<string, Record<string, RawQuote>> = {};
  const provenance: Record<string, CellProvenance> = {};
  const confidence: Record<string, number> = {};
  const verification: Record<string, unknown> = {};

  const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

  // ---- Revision resolution -------------------------------------------------
  //
  // A vendor can legitimately have several responses. Two different reasons,
  // and they must not be treated the same way:
  //
  //   COMPLEMENTS. An email whose prices are in an attachment produces two
  //   responses at the same revision. Neither replaces the other; they merge,
  //   and where they overlap the later-read one (the attachment, read as a
  //   spreadsheet with cell addresses) is the more specific source.
  //
  //   SUPERSESSION. "Revised quotation, this replaces ZIS/NBR/2026/1184."
  //   Everything at a lower revision loses to the highest revision on file.
  //
  // So the rule is: partition by revision, take the top, and let the lower
  // revisions fill only the lines the top one never mentions. A revision that
  // covers 4 lines is an amendment, not a withdrawal of the other 26, and
  // dropping those 26 would put empty cells in front of a buyer who would read
  // them as "not quoted". Carried-forward cells are flagged, not laundered.
  const maxRevision: Record<string, number> = {};
  for (const row of cellRows) {
    const v = String(row.vendor_id);
    const rev = Number(row.revision ?? 1);
    maxRevision[v] = Math.max(maxRevision[v] ?? 1, rev);
  }

  const carriedForward: string[] = [];
  const winningCell = new Map<string, Record<string, unknown>>();
  const supersededCell = new Map<string, Record<string, unknown>>();

  for (const row of cellRows) {
    const key = `${row.vendor_id}:${row.line_no}`;
    const rev = Number(row.revision ?? 1);
    if (rev >= (maxRevision[String(row.vendor_id)] ?? 1)) winningCell.set(key, row);
    else supersededCell.set(key, row);
  }

  const resolvedRows: Array<Record<string, unknown>> = [];
  for (const [key, row] of supersededCell) {
    if (!winningCell.has(key)) {
      carriedForward.push(key);
      resolvedRows.push(row);
    }
  }
  resolvedRows.push(...winningCell.values());

  for (const row of resolvedRows) {
    const vendor = String(row.vendor_id);
    const lineNo = Number(row.line_no);
    // A pointer-priced line ("same as our March rates") carries its reference
    // here. Restoring it is what lets the calculator resolve the pointer; drop
    // it and a resolvable price silently becomes unresolvable.
    const ref = (row.raw_reference ?? null) as {
      basis?: string; refSku?: string | null; upliftPct?: number | null;
      rival?: string | null; scopeUpliftRef?: string | null;
      scopeUpliftNote?: string | null;
    } | null;

    rawByVendor[vendor] ??= {};
    rawByVendor[vendor][String(lineNo)] = {
      status: String(row.raw_status),
      price: num(row.raw_price),
      uom: row.raw_uom ? String(row.raw_uom) : undefined,
      ccy: row.raw_currency ? String(row.raw_currency) : undefined,
      qty_override: num(row.raw_qty),
      printed_price: num(row.printed_price),
      handwritten: Boolean(row.handwritten),
      offered: row.offered_make_model ? String(row.offered_make_model) : undefined,
      note: row.vendor_note ? String(row.vendor_note) : undefined,
      // A pointer at the supplier's own uplift line. Dropping it on read would
      // silently turn a partial offer back into one that looks complete.
      scope_uplift_ref: ref?.scopeUpliftRef ?? undefined,
      scope_uplift_note: ref?.scopeUpliftNote ?? undefined,
      basis: ref?.basis ?? undefined,
      ref_sku: ref?.refSku ?? undefined,
      uplift_pct: ref?.upliftPct ?? undefined,
      rival: ref?.rival ?? undefined,
    };
    const k = `${vendor}:${lineNo}`;
    provenance[k] = row.provenance as unknown as CellProvenance;
    confidence[k] = Number(row.confidence ?? 0);
    if (row.verification) verification[k] = row.verification;
  }

  // Cygnus's invented line 30A lives in unmapped_items, but the warranty scope
  // adjustment on lines 1-3 needs its price. Feed it back in under its own key
  // so the calculator can find it without anything being hardcoded.
  const unmapped = (await run(
    `select u.*, r.vendor_id as v from unmapped_items u
       join responses r on r.id = u.response_id
      where r.rfx_id = $1`,
    [RFX],
  )).rows ?? [];

  for (const u of unmapped) {
    const vendor = String(u.v ?? u.vendor_id);
    const ref = String(u.vendor_ref ?? "");
    const desc = String(u.description ?? "");
    // Match the vendor's own line label, e.g. "30A".
    const label = (ref.match(/\b(\d+[A-Z])\b/) ?? desc.match(/\b(\d+[A-Z])\b/))?.[1];
    if (label && u.price !== null) {
      rawByVendor[vendor] ??= {};
      rawByVendor[vendor][label] = {
        status: "unmapped",
        price: Number(u.price),
        uom: u.uom ? String(u.uom) : undefined,
        ccy: u.currency ? String(u.currency) : undefined,
      };
    }
  }

  const responses = (await run(
    `select vendor_id, filename, extraction_meta, blanket_fallback, revision, created_at
       from responses where rfx_id = $1 order by created_at`,
    [RFX],
  )).rows ?? [];

  // "Rest we will match Zenith" covers every line the vendor did not price.
  // Without this those lines read as silently omitted, which is wrong and
  // materially misleading: the vendor addressed them, and what they said
  // cannot be ranked. Applied as the vendor's default so the calculator sees it
  // on every unpriced line.
  for (const r of responses) {
    const fb = r.blanket_fallback as {
      status?: string; note?: string; rival?: string | null;
    } | null;
    if (!fb?.status) continue;
    const vendor = String(r.vendor_id);
    rawByVendor[vendor] ??= {};
    rawByVendor[vendor]["_default"] = {
      status: fb.status,
      note: fb.note,
      rival: fb.rival ?? undefined,
    };
  }

  const vendorMeta: LoadedComparison["vendorMeta"] = {};
  for (const r of responses) {
    const v = String(r.vendor_id);
    const m = (r.extraction_meta ?? {}) as Record<string, unknown>;
    vendorMeta[v] ??= {
      filenames: [], vendorRef: null, terms: {}, conditionalDiscounts: [],
      statedTotal: {}, unreadableRegions: [], extractedAt: null, ms: null,
      model: null, cached: false,
    };
    const slot = vendorMeta[v];
    slot.filenames.push(String(r.filename));
    slot.vendorRef ??= (m.vendorRef as string) ?? null;
    if (m.terms) slot.terms = m.terms as Record<string, unknown>;
    if (m.conditionalDiscounts) slot.conditionalDiscounts = m.conditionalDiscounts as unknown[];
    if (m.statedTotal) slot.statedTotal = m.statedTotal as Record<string, unknown>;
    if (m.unreadableRegions) slot.unreadableRegions = m.unreadableRegions as string[];
    slot.extractedAt = r.created_at ? String(r.created_at) : null;
    slot.ms = (m.ms as number) ?? null;
    slot.model = (m.model as string) ?? null;
    slot.cached = Boolean(m.cached);
  }

  // Requests already sent back to suppliers, newest first per supplier.
  const chaseRows = (await run(
    `select id, vendor_id, sent_at, due_at, items, answered_at, closed_reason
       from chases where rfx_id = $1 order by sent_at desc`,
    [RFX],
  ).catch(() => ({ rows: [] }))).rows ?? [];
  const seenVendor = new Set<string>();
  const nowMs = Date.now();
  const chases: LoadedComparison["chases"] = [];
  for (const c of chaseRows) {
    const v = String(c.vendor_id);
    if (seenVendor.has(v)) continue;
    seenVendor.add(v);
    chases.push({
      vendorId: v,
      chaseId: String(c.id),
      sentAt: String(c.sent_at),
      dueAt: c.due_at ? String(c.due_at) : null,
      itemCount: Array.isArray(c.items) ? c.items.length : 0,
      answeredAt: c.answered_at ? String(c.answered_at) : null,
      overdue: Boolean(
        c.due_at && !c.answered_at && new Date(String(c.due_at)).getTime() < nowMs,
      ),
      closedReason: c.closed_reason ? String(c.closed_reason) : null,
    });
  }

  // Assemble the supersession record for every vendor that sent more than one
  // revision. Built from the cells actually stored, so it cannot drift from
  // what the grid is showing.
  const supersessions: Supersession[] = [];
  for (const [vendorId, rev] of Object.entries(maxRevision)) {
    if (rev <= 1) continue;
    const mine = responses.filter((r) => String(r.vendor_id) === vendorId);
    const changedLines: Supersession["changedLines"] = [];
    for (const [key, old] of supersededCell) {
      if (!key.startsWith(`${vendorId}:`)) continue;
      const now = winningCell.get(key);
      if (!now) continue;
      const from = old.raw_price === null ? null : Number(old.raw_price);
      const to = now.raw_price === null ? null : Number(now.raw_price);
      if (from !== to) changedLines.push({ lineNo: Number(old.line_no), from, to });
    }
    supersessions.push({
      vendorId,
      revision: rev,
      supersedesRef: (mine
        .map((r) => (r.extraction_meta as Record<string, unknown>)?.supersedesRef)
        .find(Boolean) as string) ?? null,
      supersededFilenames: mine
        .filter((r) => Number(r.revision ?? 1) < rev).map((r) => String(r.filename)),
      winningFilenames: mine
        .filter((r) => Number(r.revision ?? 1) >= rev).map((r) => String(r.filename)),
      changedLines: changedLines.sort((a, b) => a.lineNo - b.lineNo),
      carriedForwardLines: carriedForward
        .filter((k) => k.startsWith(`${vendorId}:`))
        .map((k) => Number(k.split(":")[1]))
        .sort((a, b) => a - b),
    });
  }

  // Cells put there by the test harness rather than by reading a document.
  // Surfaced so the UI can warn, and so nobody can demo on them by accident.
  const fixtureVendors = [...new Set(
    Object.entries(provenance)
      .filter(([, p]) => p?.method === "test_fixture")
      .map(([k]) => k.split(":")[0]),
  )];

  return {
    matrix: buildMatrix(rawByVendor, rfx.ctx),
    provenance, confidence, verification, vendorMeta,
    supersessions, carriedForward, chases,
    unmapped: unmapped as Array<Record<string, unknown>>,
    hasAnyExtraction: cellRows.length > 0,
    fixtureVendors,
  };
}

/**
 * Store questionnaire answers read from a supplier's own response document.
 *
 * Answers only. The verdict is recomputed from them on every read, so it can
 * never drift from the evidence and a certificate expiring next week changes
 * the verdict without anybody migrating a row.
 */
export async function storeQuestionnaireAnswers(opts: {
  rfxId?: string;
  vendorId: string;
  answers: ReadAnswer[];
  provenance: Record<string, { locator: string; citedText: string }>;
  sourceFilename: string;
  /**
   * The documents an answer cited, which were opened and read.
   *
   * Their bytes are kept so the buyer can look at the certificate the verdict
   * turns on. A verdict about a document nobody can open is exactly the sort
   * of assertion the rest of this product refuses to make, and the brief asks
   * for "attached docs sitting alongside the numbers", not a summary of them.
   */
  attachments?: Array<{
    filename: string;
    mimeType: string;
    bytes: Buffer;
    citedFor: string[];
    evidence: Record<string, unknown>;
    confidence: number;
  }>;
}): Promise<{ stored: number; attachmentsStored: number }> {
  const run = await q();
  const rfxId = opts.rfxId ?? RFX_ID;
  await run(
    `update vendors
        set read_answers = $3, answers_provenance = $4,
            answers_read_at = now(), answers_source = $5
      where rfx_id = $1 and id = $2`,
    [
      rfxId, opts.vendorId,
      JSON.stringify(opts.answers), JSON.stringify(opts.provenance),
      opts.sourceFilename,
    ],
  );

  let attachmentsStored = 0;
  for (const a of opts.attachments ?? []) {
    try {
      await run(
        `insert into attachments
           (id, rfx_id, vendor_id, filename, mime_type, byte_size, file_base64,
            cited_for, evidence, reader_confidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (rfx_id, vendor_id, filename) do update
           set cited_for = excluded.cited_for,
               evidence = excluded.evidence,
               reader_confidence = excluded.reader_confidence,
               file_base64 = excluded.file_base64`,
        [
          `att_${randomUUID().slice(0, 12)}`, rfxId, opts.vendorId,
          a.filename, a.mimeType, a.bytes.length,
          // Base64 in a text column, for the same reason the response bytes
          // are: a serverless filesystem is read-only, and the two drivers
          // disagree about binary parameter encoding.
          a.bytes.toString("base64"),
          JSON.stringify(a.citedFor), JSON.stringify(a.evidence), a.confidence,
        ],
      );
      attachmentsStored += 1;
    } catch {
      // A stored answer is worth more than a stored attachment. If this write
      // fails the verdict still stands on what was read; the buyer just
      // cannot open the file, which the panel reports rather than hiding.
    }
  }

  return { stored: opts.answers.length, attachmentsStored };
}

/** Documents suppliers attached, for the panel and for serving. */
export async function loadAttachments(rfxId?: string) {
  const run = await q();
  try {
    const r = await run(
      `select vendor_id, filename, mime_type, byte_size, cited_for, evidence,
              reader_confidence
         from attachments where rfx_id = $1 order by vendor_id, filename`,
      [rfxId ?? RFX_ID],
    );
    const out: Record<string, Array<Record<string, unknown>>> = {};
    for (const row of r.rows ?? []) {
      const v = String(row.vendor_id);
      (out[v] ??= []).push({
        filename: String(row.filename),
        mimeType: String(row.mime_type),
        byteSize: Number(row.byte_size ?? 0),
        citedFor: (row.cited_for ?? []) as string[],
        evidence: (row.evidence ?? {}) as Record<string, unknown>,
        readerConfidence: row.reader_confidence == null
          ? null : Number(row.reader_confidence),
      });
    }
    return out;
  } catch {
    return {};
  }
}

/** Everything the comparison screen and the analyst both need. */
export async function buildComparisonPayload() {
  const rfx = await activeRfx();
  const loaded = await loadComparison(rfx);
  const ctx = rfx.ctx;
  const all = ctx.vendors.map((v) => v.code);
  const qualified = all.filter((c) => ctx.qualification[c]?.qualified);

  const coc = costOfCompliance(loaded.matrix, ctx);
  const strict = cheapestPerLine(loaded.matrix, qualified, {
    key: "qualified_strict",
    label: "Qualified vendors, excluding substitutions and below-spec offers",
    excludeCaveats: true,
    ctx,
  });

  // Supplier display data. For the seeded example this is the rich catalog
  // record; for an enquiry someone drafted it is whatever the database holds.
  // Merged rather than branched, so a drafted enquiry degrades to fewer
  // details instead of to a crash.
  const catalogVendor = (code: string) =>
    VENDORS.find((v) => v.code === code) as Record<string, unknown> | undefined;
  const dbVendor = (code: string) =>
    rfx.vendorRows.find((v) => String(v.code) === code);

  // Derived once, here, and handed to everything downstream so the grid, the
  // award note, the chase and the analyst cannot disagree about who is eligible.
  const verdicts = Object.fromEntries(
    rfx.vendorRows.map((v) => [String(v.code), verdictFor(v, rfx.questions)]),
  );

  return {
    rfx: rfx.isSeededExample ? catalog.rfx : { ...(catalog.rfx as object), id: rfx.rfxId },
    buyer: catalog.buyer,
    /** True when the screen is showing the shipped example rather than your own enquiry. */
    isSeededExample: rfx.isSeededExample,
    /**
     * Lines sent past the ambiguity gate on purpose, with the buyer's reason.
     * Surfaced so the award note can say which ones and why.
     */
    knowinglyAmbiguous: rfx.knowinglyAmbiguous,
    /**
     * Non-null when the database could not be read and this screen is NOT
     * live. Rendered as an undismissable banner, for the same reason the test
     * harness has one: the difference between real and stale must never be
     * something a viewer has to infer.
     */
    degraded: rfx.degraded,
    lines: ctx.lines,
    vendors: all.map((code) => {
      const c = catalogVendor(code);
      const d = dbVendor(code);
      return {
        code,
        slug: (c?.slug as string) ?? code.toLowerCase(),
        name: (d?.legal_name as string) ?? (c?.name as string) ?? code,
        city: (d?.city as string) ?? (c?.city as string) ?? "",
        reply_format: (c?.reply_format as string) ?? "",
        qualified: ctx.qualification[code]?.qualified ?? true,
        // Distinct from `qualified`. A supplier whose questionnaire nobody has
        // read is not the same as one who passed, and the screen must never
        // merge them. This is the state that used to render as "FAILED 6" from
        // a typed table beside a row saying "nothing read".
        assessed: verdicts[code]?.assessed ?? false,
        // DERIVED from the answers, not read from a stored verdict. Every entry
        // here carries the sentence that produced it.
        failedMandatory: verdicts[code]?.failedMandatory ?? [],
        assessments: verdicts[code]?.assessments ?? [],
        answersSource: (d?.answers_source as string) ?? null,
        answersReadAt: d?.answers_read_at ? String(d.answers_read_at) : null,
        meta: loaded.vendorMeta[code] ?? null,
      };
    }),
    // The questions this enquiry asked. Was always the catalog's, so a drafted
    // enquiry showed the demo's questionnaire in the supplier panel and the
    // analyst reasoned about questions the buyer never sent.
    questionnaire: rfx.questions,
    /**
     * Attachments actually held, per supplier, with what each one says.
     *
     * Separate from `questionnaireAnswers[].doc`, which is the filename the
     * supplier CITED. A cited document we do not hold and a cited document we
     * have opened and read are different facts leading to different actions,
     * and the panel has to be able to tell them apart: one is "their
     * certificate is expired", the other is "they told us about a certificate
     * we have never seen".
     */
    attachments: await loadAttachments(rfx.rfxId),
    /**
     * The answers as READ, and the verdict as COMPUTED. Not a typed table.
     *
     * This used to be `catalog.questionnaire_answers` whenever the enquiry was
     * the shipped one, which is to say during every demo. That file carries
     * hand-written `ok` booleans and hand-written `note` sentences, e.g.
     *
     *   "FAILS MANDATORY. The answer says Yes; the attached certificate is
     *    expired and is against the superseded 2013 standard."
     *
     * and it was handed to the analyst, the award note and the chase as though
     * it were a finding. The answers themselves are legitimately fabricated,
     * exactly like the quotation documents: a supplier said something and we
     * invented what. The VERDICT and the SENTENCE were not legitimate.
     *
     * So this is now projected from the assessments, which `assessQuestionnaire`
     * derives per request by comparing a revision year against the one asked
     * for and an expiry date against today. Same shape as before, so the award
     * note, the chase and the supplier panel needed no change; every value in
     * it is now derived from something that was read.
     *
     * `ok` is deliberately not `!blocksAward`: a DESIRABLE question that fails
     * does not block an award, and calling it "ok" would hide it. It means
     * "nothing contradicts this answer", which is a statement about evidence
     * rather than about consequences.
     */
    questionnaireAnswers: Object.fromEntries(
      Object.entries(verdicts).map(([code, verdict]) => [
        code,
        Object.fromEntries(verdict.assessments.map((a) => [a.questionNo, {
          answer: a.answer,
          doc: a.attachedDocument,
          ok: a.status === "supported",
          note: a.why,
          status: a.status,
          mandatory: a.mandatory,
          blocksAward: a.blocksAward,
          readerConfidence: a.confidence,
        }])),
      ]),
    ),
    assumptions: catalog.assumptions,
    baselineTotalInr: rfx.baselineTotalInr,
    matrix: loaded.matrix,
    provenance: loaded.provenance,
    confidence: loaded.confidence,
    verification: loaded.verification,
    unmapped: loaded.unmapped,
    hasAnyExtraction: loaded.hasAnyExtraction,
    fixtureVendors: loaded.fixtureVendors,
    supersessions: loaded.supersessions,
    carriedForward: loaded.carriedForward,
    chases: loaded.chases,
    trust: trustSummary(loaded.matrix, ctx),
    scenarios: {
      singleVendor: Object.fromEntries(
        all.map((c) => [c, singleVendor(loaded.matrix, c, false, ctx)]),
      ),
      allVendors: coc.naive,
      qualifiedOnly: coc.compliant,
      qualifiedStrict: strict,
      costOfComplianceInr: coc.deltaInr,
      costOfCompliancePct: coc.deltaPct,
      likeForLike: likeForLike([coc.naive, coc.compliant, strict]),
    },
  };
}

export type ComparisonPayload = Awaited<ReturnType<typeof buildComparisonPayload>>;
