/**
 * Does the extraction cache actually cache?
 *
 *   npm run cache-test
 *
 * A test that exists because the answer was no, silently, for the life of the
 * project. `dbCache().get()` selected on a JSON field nothing wrote, returned
 * null every single time, and `set()` was an empty function whose comment said
 * the write happened somewhere else. It did not. Meanwhile the route's header
 * comment promised "a second run of the same file is instant", the UI reported
 * `cached: false` forever, and every demo rehearsal re-read the same eight
 * documents at full price.
 *
 * Nothing failed. No test covered it, because caching looks like a performance
 * concern until you notice it is the difference between one dollar and eight.
 *
 * So this asserts the four properties that make a cache trustworthy, without
 * spending anything: it stores, it returns what it stored, an edited prompt
 * misses, and a different file misses. Store and retrieve are exercised
 * against a real database through the real interface.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PGLITE_DIR ??= mkdtempSync(join(tmpdir(), "cachetest-"));

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
let pass = 0, fail = 0;
function check(what: string, ok: boolean, detail: string) {
  if (ok) { pass += 1; console.log(`  ${G}pass${X}  ${B}${what}${X}`); }
  else { fail += 1; console.log(`  ${R}FAIL${X}  ${B}${what}${X}`); }
  console.log(`        ${D}${detail}${X}`);
}

async function main() {
  const { dbCache } = await import("../lib/extract/cache");
  const { cacheKey, fileHash } = await import("../lib/extract/run");
  const { seedRfx } = await import("../lib/store");
  await seedRfx();

  const cache = await dbCache();
  const bytes = Buffer.from("a quotation, for the purposes of a cache key");
  const other = Buffer.from("a different quotation entirely");
  const key = cacheKey(fileHash(bytes), "test-model");

  const before = await cache.get(key);
  check(
    "a key never written is a miss",
    before === null,
    "returns null rather than throwing, so a cold cache cannot break an upload",
  );

  const extraction = {
    vendorRef: "TEST-1", rows: [{ lineNo: 1, price: 1234 }],
  } as never;
  await cache.set({
    key, extraction,
    meta: { model: "test-model", fileHash: fileHash(bytes), format: "xlsx" } as never,
  });

  /**
   * Compared by value, not by serialisation.
   *
   * The first version of this assertion compared JSON.stringify of both sides
   * and failed on a cache that was working perfectly: the column is jsonb,
   * which normalises key order, so a correct round trip can come back with the
   * same facts in a different order. Asserting on the bytes of a serialisation
   * would make this test fail whenever the extraction schema gained a field.
   */
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sorted(x)]),
          )
        : v;

  const hit = await cache.get(key);
  check(
    "what was stored comes back",
    Boolean(hit)
      && JSON.stringify(sorted(hit!.extraction)) === JSON.stringify(sorted(extraction)),
    hit
      ? `round-tripped every field of the extraction (${JSON.stringify(hit.extraction).length} bytes)`
      : "NOTHING CAME BACK. This is the exact bug the file exists to prevent.",
  );

  check(
    "the stored meta does not claim to have been cached",
    (hit?.meta as unknown as { cached?: boolean })?.cached === false,
    "`cached` describes the read that produced it. A later hit flips it on the " +
    "way out, so storing true would make the second hit report the third.",
  );

  check(
    "a different file misses",
    (await cache.get(cacheKey(fileHash(other), "test-model"))) === null,
    "one byte of difference in the document is a different read",
  );

  check(
    "a different model misses",
    (await cache.get(cacheKey(fileHash(bytes), "another-model"))) === null,
    "a reading is a reading BY something, so the model is part of the key",
  );

  // The property that matters most and is the least obvious.
  const { PROMPT_HASH } = await import("../lib/extract/run");
  check(
    "the prompt is part of the key",
    key.includes(PROMPT_HASH),
    `key = model:promptHash:fileHash. Edit the prompt and every entry misses, ` +
    `which is right: a reading produced by a prompt you have since changed is ` +
    `worse than no reading at all.`,
  );

  console.log(
    fail
      ? `\n${R}${B}${fail} failure(s).${X} A cache that silently never hits is the ` +
        `most expensive kind of bug: it reads as a solved problem.\n`
      : `\n${G}${B}${pass}/${pass} pass${X}  the cache stores, returns, and misses ` +
        `for the right reasons.\n`,
  );
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });
  process.exit(1);
});
