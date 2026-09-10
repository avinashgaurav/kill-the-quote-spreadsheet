/**
 * Database client.
 *
 * One schema, two drivers, chosen by whether DATABASE_URL is set:
 *
 *   DATABASE_URL set    -> Neon serverless Postgres (what Vercel will use)
 *   DATABASE_URL unset  -> PGlite, embedded Postgres in WASM, persisted to
 *                          .pglite/ on disk. No server, no signup, no Docker.
 *
 * This matters for a build with a deadline: the app is fully runnable now,
 * with real Postgres semantics and real constraints, before anyone has created
 * a cloud database. Adding Neon later changes nothing but the env var.
 *
 * PGlite is a single embedded instance, so it is correct for local development
 * and wrong for Vercel, where each serverless invocation would get its own
 * empty copy. That is exactly why DATABASE_URL takes precedence.
 *
 * ONE THING TO KEEP IN STEP: the function region and the database region.
 *
 * The Neon HTTP driver makes one request per query, and this app makes around
 * twenty of them to render a comparison. With the database in Singapore and the
 * function on Vercel's US East default, every one of those crossed the Pacific
 * twice and the page sat behind a loading skeleton for two seconds warm and
 * eight cold. `vercel.json` pins the function to sin1 for that reason and no
 * other. Move the database and you must move the function with it, or the same
 * skeleton comes back and looks like a rendering problem rather than a
 * geography one.
 */

import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { schema } from "./schema";

export const usingNeon = Boolean(process.env.DATABASE_URL);

type Db =
  | ReturnType<typeof drizzlePglite<typeof schema>>
  | ReturnType<typeof drizzleNeon<typeof schema>>;

/**
 * Next.js reloads modules in dev, which would otherwise spawn a new PGlite
 * instance per reload and lock the data directory.
 */
const globalForDb = globalThis as unknown as {
  __quoteKillerDb?: Db;
  __quoteKillerQuery?: Query;
  __quoteKillerReady?: Promise<void>;
};

/**
 * Parameterised query, run through the native driver.
 *
 * Drizzle's own `execute` takes either a plain string or a SQL object it built
 * itself, so it has nowhere to put positional parameters. Rather than
 * interpolate values into the string, which would put user input straight into
 * SQL, we keep the driver handle and use its parameterised API. Both drivers
 * take the same ($1, $2, ...) placeholder form, so the call sites are identical
 * whether this is running on embedded Postgres or on Neon.
 */
export type Query = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<{ rows: T[] }>;

async function create(): Promise<{ db: Db; query: Query }> {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const client = neon(process.env.DATABASE_URL);
    const query: Query = async <T>(sql: string, params: unknown[] = []) => {
      const rows = (await client.query(sql, params)) as unknown as T[];
      return { rows: rows ?? [] };
    };
    return { db: drizzleNeon(client, { schema }), query };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
  const query: Query = async <T>(sql: string, params: unknown[] = []) => {
    const r = await client.query<T>(sql, params);
    return { rows: (r.rows ?? []) as T[] };
  };
  return { db: drizzlePglite(client, { schema }), query };
}

/**
 * Table DDL, applied idempotently at first use.
 *
 * Written by hand rather than generated, which drops drizzle-kit and its
 * vulnerable esbuild chain from the dependency tree. At eight tables that is a
 * good trade; at eighty it would not be.
 *
 * Note `provenance jsonb NOT NULL` on extracted_cells. That single constraint
 * is the schema-level half of the trust story: a value with no source cannot
 * physically be stored.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS rfx (
  id text PRIMARY KEY,
  title text NOT NULL,
  buyer jsonb NOT NULL,
  terms jsonb NOT NULL,
  issued_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  drafted_by_copilot boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS rfx_lines (
  id text PRIMARY KEY,
  rfx_id text NOT NULL REFERENCES rfx(id) ON DELETE CASCADE,
  no integer NOT NULL,
  sku text NOT NULL,
  group_name text NOT NULL,
  description text NOT NULL,
  spec jsonb NOT NULL,
  uom text NOT NULL,
  pack_size integer NOT NULL DEFAULT 1,
  qty integer NOT NULL,
  hsn text,
  baseline_inr numeric
);
CREATE UNIQUE INDEX IF NOT EXISTS rfx_lines_rfx_no_idx ON rfx_lines (rfx_id, no);

CREATE TABLE IF NOT EXISTS vendors (
  id text PRIMARY KEY,
  rfx_id text NOT NULL REFERENCES rfx(id) ON DELETE CASCADE,
  code text NOT NULL,
  legal_name text NOT NULL,
  city text,
  gstin text,
  contact jsonb,
  qualified boolean,
  failed_mandatory jsonb,
  questionnaire_answers jsonb
);

CREATE TABLE IF NOT EXISTS responses (
  id text PRIMARY KEY,
  rfx_id text NOT NULL REFERENCES rfx(id) ON DELETE CASCADE,
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  file_hash text NOT NULL,
  storage_path text NOT NULL,
  channel text,
  received_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  supersedes_id text,
  extraction_status text NOT NULL DEFAULT 'pending',
  extraction_error text,
  extraction_meta jsonb,
  /**
   * "Rest we will match Zenith." A statement about every line the vendor did
   * not price individually, so it belongs to the response rather than to any
   * line. Without it those lines look silently omitted, when in fact the
   * vendor addressed them and what they said cannot be ranked.
   */
  blanket_fallback jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS responses_vendor_idx ON responses (vendor_id);
CREATE INDEX IF NOT EXISTS responses_hash_idx ON responses (file_hash);

CREATE TABLE IF NOT EXISTS extracted_cells (
  id text PRIMARY KEY,
  response_id text NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  raw_status text NOT NULL,
  raw_price numeric,
  raw_uom text,
  raw_currency text,
  raw_qty integer,
  printed_price numeric,
  handwritten boolean NOT NULL DEFAULT false,
  offered_make_model text,
  vendor_note text,
  raw_reference jsonb,
  status text NOT NULL,
  landed_unit_inr numeric,
  landed_extended_inr numeric,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  trace jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  provenance jsonb NOT NULL,
  verification jsonb,
  needs_confirmation boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cells_response_line_idx
  ON extracted_cells (response_id, line_no);
CREATE INDEX IF NOT EXISTS cells_vendor_idx ON extracted_cells (vendor_id);
CREATE INDEX IF NOT EXISTS cells_status_idx ON extracted_cells (status);

CREATE TABLE IF NOT EXISTS unmapped_items (
  id text PRIMARY KEY,
  response_id text NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  vendor_id text NOT NULL,
  vendor_ref text,
  description text NOT NULL,
  price numeric,
  uom text,
  currency text,
  qty integer,
  note text,
  provenance jsonb NOT NULL,
  resolved_to_line_no integer
);

CREATE TABLE IF NOT EXISTS assumptions (
  id text PRIMARY KEY,
  rfx_id text NOT NULL REFERENCES rfx(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  source text NOT NULL,
  alternative text,
  note text,
  confidence text,
  set_by text NOT NULL DEFAULT 'system',
  set_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS assumptions_rfx_key_idx ON assumptions (rfx_id, key);

/**
 * A request back to a supplier for what they did not send.
 *
 * Kept as its own record rather than a flag on the response, because the fact
 * that matters at award time is not "their questionnaire is missing". It is
 * "we asked them for it on the 18th, gave them until the 22nd, and they did not
 * answer". Those are different facts and only the second one is defensible in
 * front of a CFO.
 *
 * The items column is the snapshot of what was outstanding AT THE MOMENT OF
 * ASKING, not a live query. If a supplier answers half of it, the chase still
 * records what was asked, so nobody can rewrite history by re-running the check.
 */
CREATE TABLE IF NOT EXISTS chases (
  id text PRIMARY KEY,
  rfx_id text NOT NULL REFERENCES rfx(id) ON DELETE CASCADE,
  vendor_id text NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  channel text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  items jsonb NOT NULL,
  message text NOT NULL,
  /* Set when a later response actually closes the gap. */
  answered_at timestamptz,
  /* What the buyer decided when the deadline passed without an answer. */
  closed_reason text
);
CREATE INDEX IF NOT EXISTS chases_vendor_idx ON chases (rfx_id, vendor_id);

/*
 * Extraction results, keyed on (model, prompt hash, file hash).
 *
 * A table of its own rather than a field on the response row. A response is an
 * audit record of one document arriving from one supplier on one enquiry, and
 * the same bytes read again are the same read. Burying a full extraction
 * inside the meta of an audit row would conflate "what we hold" with "what we
 * already paid to compute".
 *
 * There was a dbCache before this and it never once returned a hit. Its get
 * looked up a JSON field nothing wrote, for two keys nothing wrote either, and
 * its set was an empty function whose comment claimed the write happened in
 * storeExtraction. It did not. So every upload of a file already read was paid
 * for again at full price, on a route whose own header promised the opposite.
 *
 * NOTE for the next person editing this comment: no semicolons. The DDL is
 * split on semicolons before execution, so one in here cuts the comment in
 * half and leaves the rest of it as SQL.
 *
 * The key contains the prompt hash, so improving a prompt correctly misses
 * every entry rather than serving a stale reading produced by an old one.
 */
CREATE TABLE IF NOT EXISTS extraction_cache (
  cache_key text PRIMARY KEY,
  file_hash text NOT NULL,
  model_id text NOT NULL,
  kind text NOT NULL DEFAULT 'quotation',
  extraction jsonb NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extraction_cache_file_idx ON extraction_cache (file_hash);

CREATE TABLE IF NOT EXISTS analyst_turns (
  id text PRIMARY KEY,
  rfx_id text NOT NULL REFERENCES rfx(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text,
  refused boolean NOT NULL DEFAULT false,
  refusal_reason text,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  cited_cell_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumption_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_id text,
  usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

/**
 * Additive migrations, applied after the DDL on every start.
 *
 * CREATE TABLE IF NOT EXISTS is a no-op against a table that already exists, so
 * a column added to the DDL never reaches a database somebody already has. The
 * failure is silent and nasty: the app runs, the insert referencing the new
 * column throws, and a defensively-caught write turns into a feature that
 * quietly does nothing.
 *
 * Found exactly that way. Two end-to-end cases failed with no error on screen
 * because a send was still returning ok while its persistence had been rejected.
 *
 * Every statement here must be idempotent and safe to run against both a fresh
 * database and an existing one, which is what IF NOT EXISTS buys.
 */
const MIGRATIONS = [
  /*
   * The uploaded document itself, base64 in a text column.
   *
   * It used to be written to .uploads/ on disk, which works locally and fails
   * on Vercel with EROFS: a serverless filesystem is read-only. So uploading
   * anything on the deployed site was broken outright, and the provenance panel
   * would have had nothing to open even if it had not been.
   *
   * Base64 text rather than bytea because the Neon HTTP driver and PGlite
   * disagree about binary parameter encoding, and a 33% size penalty on a
   * half-megabyte photograph is not worth a driver-specific code path.
   */
  `ALTER TABLE responses ADD COLUMN IF NOT EXISTS file_base64 text`,
  /*
   * A supplier's questionnaire answers, as READ from their response document,
   * plus where each one came from.
   *
   * The verdict is deliberately NOT stored. It is derived from these answers on
   * every read, so a threshold change, or a certificate that expires between
   * now and award, recomputes rather than going stale. A stored verdict is the
   * hand-written table this whole path exists to remove.
   */
  `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS read_answers jsonb`,
  `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS answers_provenance jsonb`,
  `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS answers_read_at timestamptz`,
  `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS answers_source text`,
  `ALTER TABLE rfx ADD COLUMN IF NOT EXISTS knowingly_ambiguous jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE responses ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1`,
  `ALTER TABLE responses ADD COLUMN IF NOT EXISTS supersedes_id text`,
  `ALTER TABLE responses ADD COLUMN IF NOT EXISTS blanket_fallback jsonb`,
];

async function connect(): Promise<{ db: Db; query: Query }> {
  if (!globalForDb.__quoteKillerDb || !globalForDb.__quoteKillerQuery) {
    const made = await create();
    globalForDb.__quoteKillerDb = made.db;
    globalForDb.__quoteKillerQuery = made.query;
  }
  const db = globalForDb.__quoteKillerDb;
  const query = globalForDb.__quoteKillerQuery;

  if (!globalForDb.__quoteKillerReady) {
    globalForDb.__quoteKillerReady = (async () => {
      // One round trip, not twenty.
      //
      // Splitting the DDL and firing each statement separately costs a network
      // round trip per statement. Against embedded Postgres that is free;
      // against Neon in Singapore it was about 2.7 seconds on every cold start,
      // which the buyer sees as a loading skeleton before anything appears.
      //
      // Every statement is CREATE ... IF NOT EXISTS or ALTER ... ADD COLUMN IF
      // NOT EXISTS, so the whole thing is idempotent and safe to send as one
      // script. PGlite and Neon both accept multiple statements in one call.
      const script = [
        ...DDL.split(";").map((s) => s.trim()).filter(Boolean),
        ...MIGRATIONS,
      ].join(";\n") + ";";
      try {
        await query(script);
      } catch {
        // A driver that refuses multi-statement input falls back to one at a
        // time. Slower, and still correct, which is the right way round.
        for (const stmt of script.split(";").map((s) => s.trim()).filter(Boolean)) {
          await query(stmt);
        }
      }
    })();
  }
  await globalForDb.__quoteKillerReady;
  return { db, query };
}

/** Parameterised SQL. Tables are created on first use. */
export async function getQuery(): Promise<Query> {
  return (await connect()).query;
}

/** The drizzle instance, for typed query building. */
export async function getDb(): Promise<Db> {
  return (await connect()).db;
}

export { schema };
