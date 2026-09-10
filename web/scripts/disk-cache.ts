/**
 * A cache that survives the process, for the harnesses only.
 *
 * The extraction cache in `lib/extract/run.ts` is a Map. That is right for the
 * app, where one server process serves many uploads, and wrong for a script,
 * where the Map is born and dies inside a single `npx tsx` run. So every
 * harness run paid full price to re-read the same five files, and the header
 * of the accuracy harness claimed the opposite: "a second run of the same
 * files is free". It was not free. It was about fifty cents a go, and I ran it
 * repeatedly while chasing a bug that had nothing to do with the reading.
 *
 * The key already contains the model, the prompt hash and the file hash, so
 * this needs no invalidation logic of its own: change the prompt or the model
 * and every entry is simply missed. Which is the behaviour you want, because a
 * cached result from a prompt you have since edited is worse than no result.
 *
 * Deliberately NOT wired into the app. Production caches in Postgres, where an
 * entry is auditable and shared; a JSON file on a function's disk would be
 * neither, and on Vercel would not survive the invocation anyway.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { CacheEntry, ExtractionCache } from "../lib/extract/run";

const DIR = join(process.cwd(), ".cache", "extractions");

/** One file per entry, named by a hash so the key can contain anything. */
const pathFor = (key: string) =>
  join(DIR, `${createHash("sha256").update(key).digest("hex").slice(0, 24)}.json`);

export function diskCache(opts: { enabled?: boolean } = {}): ExtractionCache {
  const enabled = opts.enabled !== false;
  return {
    async get(key) {
      if (!enabled) return null;
      const p = pathFor(key);
      if (!existsSync(p)) return null;
      try {
        const e = JSON.parse(readFileSync(p, "utf8")) as CacheEntry;
        // A file written by an older shape is a miss, not a crash. Better to
        // spend the call again than to score a reading that is not one.
        return e && e.key === key && e.extraction ? e : null;
      } catch {
        return null;
      }
    },
    async set(entry) {
      if (!enabled) return;
      mkdirSync(DIR, { recursive: true });
      writeFileSync(pathFor(entry.key), JSON.stringify(entry, null, 1));
    },
  };
}
