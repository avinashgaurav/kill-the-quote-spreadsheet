/**
 * TEST HARNESS. Known extraction output, so everything downstream of the
 * reader can be exercised without an API key.
 *
 * WHY THIS EXISTS
 * The reader is a real model call and needs a key. The calculator, the grid,
 * the provenance panel and the award scenarios do not. This writes the values
 * a correct read WOULD have produced into the same tables the reader writes
 * to, so those parts can be built and checked while a key is still missing.
 *
 * WHY IT CANNOT BE MISTAKEN FOR A REAL READ
 * Every cell carries `provenance.method = "test_fixture"`, and the UI shows an
 * undismissable banner naming the affected suppliers for as long as one exists.
 * The route that calls this is refused in production. Reading a real document
 * for a supplier replaces their fixture rows, and the banner clears when the
 * last fixture cell is gone.
 *
 * Do not demo on this. Use it to check the plumbing, then read the real files.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getQuery } from "./db/client";
import { seedRfx, seedAnswersFor, RFX_ID } from "./store";
import { LINES, VENDORS } from "./normalise";
import type { RawQuote } from "./normalise";

const FIXTURE = join(process.cwd(), "lib", "data", "raw-quotes.json");

const FORMAT_BY_VENDOR: Record<string, { file: string; mime: string; method: string }> = {
  V1: { file: "Zenith_Quotation_ZIS-NBR-2026-1184.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", method: "xlsx_cell" },
  V2: { file: "Cygnus_Quotation_CTI-Q-2026-0918.pdf", mime: "application/pdf", method: "pdf_text" },
  V3: { file: "Orbit_Offer_OSS-QT-2026-27-0442.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", method: "docx_prose" },
  V4: { file: "IMG_20260917_1142_vector_rate_card.jpg", mime: "image/jpeg", method: "vision_bbox" },
  V5: { file: "helios_reply_2026-09-17.eml", mime: "message/rfc822", method: "email_text" },
};

/**
 * Discard enquiries somebody drafted through the co-pilot, leaving the shipped
 * example.
 *
 * Needed because the active enquiry is "the one you are working on", and a
 * half-finished or abandoned draft therefore takes over the screen. During a
 * demo that is correct behaviour; between demos it is debris. This is the
 * "start over" the flow otherwise has no way to express.
 *
 * Development only, same as everything else in this file.
 */
export async function resetDrafts() {
  const query = await getQuery();
  const r = await query<{ id: string }>(
    `select id from rfx where id <> $1`, [RFX_ID],
  );
  await query(`delete from rfx where id <> $1`, [RFX_ID]);

  // Suppliers added by an upload are debris too.
  //
  // Reset used to drop only drafted ENQUIRIES, so a supplier created on the
  // shipped example survived it. The end-to-end suite creates one and the demo
  // suite then found six columns where it expected five, three of its ten
  // claims failing for a reason that had nothing to do with the product. A
  // test that leaves debris behind breaks the next test, and the fix belongs
  // in the reset rather than in the assertion.
  const shipped = VENDORS.map((v) => v.code);
  const extra = await query<{ id: string }>(
    `select id from vendors where rfx_id = $1 and id <> all($2::text[])`,
    [RFX_ID, shipped],
  );
  if (extra.rows.length) {
    await query(
      `delete from vendors where rfx_id = $1 and id <> all($2::text[])`,
      [RFX_ID, shipped],
    );
  }

  return {
    discarded: r.rows.map((x) => x.id),
    suppliersRemoved: extra.rows.map((x) => x.id),
  };
}

/**
 * Clear every response on the shipped enquiry, harness-written or genuinely read.
 *
 * Distinct from wipeFixture, which removes only harness cells, and needed once
 * the loops actually run: the demo suite asserts that the grid starts blank, and
 * after a real read there is real data that no amount of fixture-wiping removes.
 * A test that cannot get back to a known state is a test that passes once.
 *
 * Development only, like everything else here.
 */
export async function clearAllResponses() {
  const query = await getQuery();
  const n = await query<{ count: string }>(
    `select count(*)::text as count from responses where rfx_id = $1`, [RFX_ID],
  );
  await query(`delete from responses where rfx_id = $1`, [RFX_ID]);
  await query(
    `update vendors set read_answers = null, answers_provenance = null,
            answers_read_at = null, answers_source = null
      where rfx_id = $1`,
    [RFX_ID],
  );
  return { responsesRemoved: Number(n.rows[0]?.count ?? 0) };
}

export async function wipeFixture() {
  const query = await getQuery();
  const r = await query<{ count: string }>(
    `select count(*)::text as count from extracted_cells c
       join responses r on r.id = c.response_id
      where c.provenance->>'method' = 'test_fixture'`,
  );
  const n = Number(r.rows[0]?.count ?? 0);

  await query(
    `delete from responses where id in (
       select distinct r.id from responses r
         join extracted_cells c on c.response_id = r.id
        where c.provenance->>'method' = 'test_fixture')`,
  );
  await query(`delete from responses where extraction_meta->>'fixture' = 'true'`);
  return { removed: n };
}

export async function seedFixture() {
  await seedRfx();
  const query = await getQuery();

  // Restore the seeded questionnaire answers too.
  //
  // seedRfx writes them, but returns early once the enquiry exists, so after a
  // clear the answers stayed null and every supplier came back unassessed,
  // therefore qualified, therefore "cheapest among qualified" equalled
  // "cheapest among everyone" and the money moment vanished. The harness exists
  // to put everything downstream of the reader into a known state, and the
  // questionnaire answers are downstream of the reader.
  for (const v of VENDORS) {
    const code = v.code;
    const answers = seedAnswersFor(code);
    if (!answers.length) continue;
    await query(
      `update vendors
          set read_answers = $2, answers_read_at = now(), answers_source = $3
        where rfx_id = $1 and id = $4`,
      [
        RFX_ID, JSON.stringify(answers),
        "seeded from the fabricated dataset, NOT read from a document", code,
      ],
    );
  }
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    quotes: Record<string, Record<string, RawQuote>>;
  };

  let cells = 0, unmapped = 0;

  for (const v of VENDORS) {
    const rows = fixture.quotes[v.code] ?? {};
    const fmt = FORMAT_BY_VENDOR[v.code];
    const responseId = `fixture_${v.code}`;

    // A vendor-level fallback covering every line not priced individually.
    const dflt = rows["_default"];

    await query(`delete from responses where id = $1`, [responseId]);
    await query(
      `insert into responses
         (id, rfx_id, vendor_id, filename, mime_type, byte_size, file_hash,
          storage_path, extraction_status, extraction_meta, blanket_fallback)
       values ($1,$2,$3,$4,$5,0,$6,$7,'extracted',$8,$9)`,
      [
        responseId, RFX_ID, v.code, fmt.file, fmt.mime, `fixture_${v.code}`,
        `(fixture, no file on disk)`,
        JSON.stringify({
          fixture: true,
          model: "NONE - test fixture, not a model read",
          format: v.reply_format,
          cached: false,
          ms: 0,
          terms: {},
          conditionalDiscounts: [],
          statedTotal: {},
          unreadableRegions: [],
        }),
        dflt
          ? JSON.stringify({
              status: dflt.status,
              note: dflt.note ?? "",
              rival: dflt.rival ?? null,
              provenance: {
                locator: "TEST FIXTURE",
                citedText: dflt.note ?? "",
                method: "test_fixture",
              },
            })
          : null,
      ],
    );

    for (const [key, raw] of Object.entries(rows)) {
      if (key === "_default") continue;
      const lineNo = Number(key);

      // A vendor-invented line such as Cygnus's 30A.
      if (!Number.isInteger(lineNo)) {
        await query(
          `insert into unmapped_items
             (id, response_id, vendor_id, vendor_ref, description, price, uom,
              currency, qty, note, provenance)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            `fixture_u_${v.code}_${key}`, responseId, v.code, key,
            raw.desc ?? `vendor line ${key}`,
            raw.price === undefined ? null : String(raw.price),
            raw.uom ?? null, raw.ccy ?? null, raw.qty ?? null, raw.note ?? null,
            JSON.stringify({
              locator: `vendor line ${key}`,
              citedText: raw.desc ?? `line ${key}`,
              method: "test_fixture",
            }),
          ],
        );
        unmapped += 1;
        continue;
      }

      if (!LINES.some((l) => l.no === lineNo)) continue;

      await query(
        `insert into extracted_cells
           (id, response_id, vendor_id, line_no, raw_status, raw_price, raw_uom,
            raw_currency, raw_qty, printed_price, handwritten, offered_make_model,
            vendor_note, raw_reference, status, confidence, provenance, flags, trace)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16,'[]'::jsonb,'[]'::jsonb)`,
        [
          `${responseId}:${lineNo}`, responseId, v.code, lineNo,
          raw.status,
          raw.price === undefined ? null : String(raw.price),
          raw.uom ?? null, raw.ccy ?? null, raw.qty_override ?? null,
          raw.printed_price === undefined ? null : String(raw.printed_price),
          Boolean(raw.handwritten), raw.offered ?? null, raw.note ?? null,
          raw.basis || raw.ref_sku || raw.rival || raw.scope_uplift_ref
            ? JSON.stringify({
                ...(raw.basis || raw.ref_sku || raw.rival
                  ? {
                      basis: raw.basis ?? "other",
                      refSku: raw.ref_sku ?? null,
                      upliftPct: raw.uplift_pct ?? null,
                      rival: raw.rival ?? null,
                    }
                  : {}),
                ...(raw.scope_uplift_ref
                  ? {
                      scopeUpliftRef: raw.scope_uplift_ref,
                      scopeUpliftNote: raw.scope_uplift_note ?? null,
                    }
                  : {}),
              })
            : null,
          "0.5",
          JSON.stringify({
            locator: `TEST FIXTURE, not read from ${fmt.file}`,
            citedText:
              `This value came from the test fixture, not from reading a document. ` +
              `Upload ${fmt.file} to replace it with a real read.`,
            method: "test_fixture",
          }),
        ],
      );
      cells += 1;
    }
  }

  return { cells, unmapped };
}
