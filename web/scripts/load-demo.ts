/**
 * Load the demo: invite every supplier, read everything they send, for real.
 *
 *   npm run demo:load                     against http://localhost:3000
 *   npm run demo:load -- --live           against the deployed site
 *   npm run demo:load -- --url <base>     against anything else
 *   npm run demo:load -- --dry            say what it would do, spend nothing
 *
 * WHY THIS EXISTS. The deployed database starts empty, on purpose: the test
 * harness is refused in production, so the only way a cell gets a number there
 * is a real model call. That is the right rule and it makes "get the demo into
 * a state worth showing" a job rather than a click.
 *
 * It is also the moment most likely to go wrong in front of somebody. Eight
 * documents, five suppliers, a provider that may be rate limited or out of
 * credit, and a 300-second function ceiling. So this does it one supplier at a
 * time, reports each read as it lands, names the exact failure when one fails,
 * and prints what the whole thing cost.
 *
 * It reads for real. Nothing here writes a price.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

const LIVE = "https://kill-the-quote-spreadsheet.vercel.app";

interface FileResult {
  filename: string; ok: boolean; kind?: string; format?: string;
  rowsFound?: number; priced?: number; answersRead?: number; cached?: boolean;
  ms?: number; error?: string;
  attachmentsRead?: Array<{ file: string; states?: string | null; expires?: string | null }>;
  attachmentsNotHeld?: string[];
  attachmentsBlockedByChannel?: string[];
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const urlArg = args.indexOf("--url");
  const base = urlArg >= 0 ? args[urlArg + 1]
    : args.includes("--live") ? LIVE
    : "http://localhost:3000";
  const channelArg = args.indexOf("--channel");
  const channel = channelArg >= 0 ? args[channelArg + 1] : "email";

  console.log(`${B}Loading the demo against ${base}${X}`);
  console.log(`${D}channel: ${channel}${channel === "whatsapp"
    ? " (cannot carry an attachment, so certificates will not arrive)" : ""}${X}\n`);

  // Who is on the roster, and who has something to send.
  const rosterRes = await fetch(`${base}/api/rfx/inbox`, { cache: "no-store" });
  if (!rosterRes.ok) {
    console.log(`${R}Cannot reach ${base}: HTTP ${rosterRes.status}${X}`);
    process.exit(1);
  }
  const roster = await rosterRes.json() as {
    suppliers: Array<{ code: string; name: string; reply_on_file: boolean; documents: number }>;
  };
  const willReply = roster.suppliers.filter((s) => s.reply_on_file);

  console.log(`${willReply.length} of ${roster.suppliers.length} suppliers have a reply on file:`);
  for (const s of willReply) {
    console.log(`  ${s.code}  ${s.name.padEnd(38)} ${s.documents} document(s)`);
  }

  if (dry) {
    console.log(
      `\n${Y}--dry: nothing sent.${X} This would read ` +
      `${willReply.reduce((a, s) => a + s.documents, 0)} documents with real model ` +
      `calls, and cache every one, so a second run is free.\n`,
    );
    return;
  }

  // A dead key must be found in one cheap call, not five expensive failures.
  console.log(`\n${D}checking the model is reachable first...${X}`);
  const probe = await fetch(`${base}/api/comparison`, { cache: "no-store" });
  if (!probe.ok) {
    console.log(`${R}${base}/api/comparison returned ${probe.status}. Stopping.${X}`);
    process.exit(1);
  }

  let read = 0, failed = 0, cached = 0, docs = 0;
  const started = Date.now();
  /**
   * Stop on the one failure that will not fix itself.
   *
   * The first version only looked for this on a failed REQUEST, and the inbox
   * route returns ok:true with a per-file error, which is correct: one
   * unreadable document must not lose the other seven. So the check never
   * fired and an out-of-credit key produced eight identical futile attempts.
   * Retrying an exhausted balance is not resilience.
   */
  let outOfCredit = false;
  const looksOutOfCredit = (msg: unknown) =>
    /credits? are depleted|prepayment|OUT OF CREDIT|exceeded your current quota/i
      .test(String(msg));

  for (const s of willReply) {
    if (outOfCredit) break;
    process.stdout.write(`\n${B}${s.code} ${s.name}${X}\n`);
    try {
      const r = await fetch(`${base}/api/rfx/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierCode: s.code, channel }),
      });
      const j = await r.json() as {
        ok: boolean; replied?: boolean; results?: FileResult[]; error?: string;
        note?: string;
      };

      if (!j.ok) {
        outOfCredit = outOfCredit || looksOutOfCredit(j.error);
        console.log(
          `  ${R}failed${X}  ${outOfCredit
            ? "the model key is valid and the project is out of credit."
            : String(j.error).slice(0, 220)}`,
        );
        failed += 1;
        if (outOfCredit) break;
        continue;
      }

      for (const f of j.results ?? []) {
        docs += 1;
        if (!f.ok) {
          if (looksOutOfCredit(f.error)) {
            outOfCredit = true;
            console.log(`  ${R}${f.filename}${X}  ${D}not read${X}`);
            failed += 1;
            break;
          }
          console.log(`  ${R}${f.filename}${X}`);
          console.log(`    ${String(f.error).replace(/\s+/g, " ").slice(0, 220)}`);
          failed += 1;
          continue;
        }
        read += 1;
        if (f.cached) cached += 1;
        const what = f.kind === "questionnaire"
          ? `${f.answersRead} answers`
          : `${f.format ?? "document"}, ${f.priced ?? 0} of ${f.rowsFound ?? 0} lines priced`;
        console.log(
          `  ${G}${f.filename}${X}  ${D}${what}` +
          `${f.cached ? ", from cache" : `, ${((f.ms ?? 0) / 1000).toFixed(1)}s`}${X}`,
        );
        for (const a of f.attachmentsRead ?? []) {
          console.log(
            `    ${G}opened ${a.file}${X}  ${D}it states ${a.states ?? "no standard"}` +
            `${a.expires ? `, expires ${a.expires}` : ", no expiry printed"}${X}`,
          );
        }
        for (const a of f.attachmentsNotHeld ?? []) {
          console.log(`    ${Y}cites ${a}, which we do not hold${X}`);
        }
        for (const a of f.attachmentsBlockedByChannel ?? []) {
          console.log(`    ${Y}${a} did not arrive: ${channel} cannot carry it${X}`);
        }
      }
    } catch (e) {
      console.log(`  ${R}failed${X}  ${String(e).slice(0, 200)}`);
      failed += 1;
    }
  }

  // What the screen now rests on, from the app's own numbers rather than mine.
  const c = await (await fetch(`${base}/api/comparison`, { cache: "no-store" })).json() as {
    trust?: { total: number; usable: number; notRead: number };
    vendors?: Array<{ code: string; name: string; assessed: boolean; qualified: boolean;
                      failedMandatory: string[] }>;
  };

  console.log(`\n${"-".repeat(70)}`);
  console.log(
    `${read} document(s) read${cached ? ` (${cached} from cache, free)` : ""}, ` +
    `${failed} failed, in ${((Date.now() - started) / 1000).toFixed(0)}s`,
  );
  if (c.trust) {
    console.log(
      `the comparison now rests on ${c.trust.usable} of ${c.trust.total} cells, ` +
      `${c.trust.notRead} not read`,
    );
  }
  for (const v of c.vendors ?? []) {
    console.log(
      `  ${v.code}  ${v.name.slice(0, 34).padEnd(36)} ` +
      `${!v.assessed ? "NOT ASSESSED"
        : v.qualified ? "qualified"
        : `fails ${v.failedMandatory.length} mandatory`}`,
    );
  }
  console.log(
    outOfCredit
      ? `\n${R}${B}Stopped: the project is out of prepaid credit.${X} The key is valid, ` +
        `so this is not a configuration problem and retrying will not help. Top up the ` +
        `project the key belongs to, then run this again.\n` +
        `${D}Nothing partial was stored. A failed read stays a gap rather than becoming ` +
        `a half-filled column, which is why the screen still says what it does not know.${X}\n`
      : failed
        ? `\n${Y}Some reads failed. Nothing partial was stored: a failed read stays a ` +
          `gap rather than becoming a half-filled column.${X}\n`
        : `\n${G}${B}Demo loaded.${X} Every figure came from a real read, and all of it ` +
          `is cached, so re-running this costs nothing.\n`,
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
