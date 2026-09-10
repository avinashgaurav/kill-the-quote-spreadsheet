/**
 * The extraction cache that actually caches.
 *
 * WHAT THIS REPLACES. `app/api/extract/route.ts` defined a `dbCache` whose
 * `get` selected on `extraction_meta->>'cacheKey'` (never written) for fields
 * called `extraction` and `meta` (never written either), and whose `set` was
 * an empty function with a comment claiming the write happened in
 * `storeExtraction`. It did not. So the lookup returned null on every call for
 * the life of the project, every re-upload of an identical file was paid for
 * again in full, and the route's own header comment said:
 *
 *   "Results are cached on (model, prompt hash, file hash) so a second run of
 *    the same file is instant."
 *
 * The most expensive kind of bug: one that reads as a solved problem.
 *
 * WHY IT MATTERED SO MUCH HERE. Preparing a demo means reading the same eight
 * documents over and over. Two routes ingest them, and they did not even share
 * the broken cache: the invite flow fell through to a module-level `Map` that
 * is empty on every serverless cold start, so pressing Send and then also
 * dragging the same files in read all eight twice.
 *
 * WHAT IS AND IS NOT CACHED. The key is (model, prompt hash, file hash), so:
 * edit the prompt and every entry misses, which is correct, because a reading
 * produced by a prompt you have since changed is worse than no reading; change
 * one byte of the document and it genuinely re-reads. A read that FAILED
 * validation or came back suspiciously empty is never stored, so "try again"
 * is always a real retry rather than a replay of the failure.
 *
 * It is a cache, not a source of truth. Nothing a buyer sees is served from
 * here: the cells, the provenance and the audit record all live in their own
 * tables. Drop this table and the app is slower and more expensive, and says
 * exactly the same things.
 */

import { getQuery } from "../db/client";
import type { CacheEntry, ExtractionCache } from "./run";

/**
 * @param kind  Which reader's output this is. Quotation extractions,
 *              questionnaire reads and single attached documents all key on
 *              their own prompt hash already, so this is for humans reading
 *              the table rather than for correctness.
 */
export async function dbCache(kind = "quotation"): Promise<ExtractionCache> {
  const query = await getQuery();

  return {
    async get(key) {
      try {
        const r = await query(
          `select extraction, meta from extraction_cache where cache_key = $1`,
          [key],
        );
        const row = r.rows?.[0];
        if (!row?.extraction) return null;
        return {
          key,
          extraction: row.extraction as never,
          meta: (row.meta ?? {}) as never,
        };
      } catch {
        // A cache that cannot be read must never break an upload. Missing is
        // the correct behaviour for a cache miss and for a broken cache alike;
        // the only cost of being wrong here is money, and the cost of throwing
        // would be the buyer's document.
        return null;
      }
    },

    async set(entry: CacheEntry) {
      try {
        const meta = entry.meta as unknown as Record<string, unknown>;
        await query(
          `insert into extraction_cache
             (cache_key, file_hash, model_id, kind, extraction, meta)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (cache_key) do update
             set extraction = excluded.extraction,
                 meta       = excluded.meta,
                 created_at = now()`,
          [
            entry.key,
            String(meta.fileHash ?? ""),
            String(meta.model ?? ""),
            kind,
            JSON.stringify(entry.extraction),
            // `cached` is deliberately forced false in what we store. It
            // describes THIS read, and a later hit sets it to true on the way
            // out; storing true would make the second hit report the third.
            JSON.stringify({ ...meta, cached: false }),
          ],
        );
      } catch {
        // Same reasoning as above, in the other direction.
      }
    },
  };
}
