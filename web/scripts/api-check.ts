/**
 * Is the model reachable, and which one is it?
 *
 * Thirty seconds before a live demo is the wrong time to discover that a key
 * has expired, that a project is out of prepaid credit, or that the provider
 * seam is pointed at a model nobody meant to use. All three have happened
 * here. The failures look identical from the UI, so this separates them:
 *
 *   401 / 403        the key is wrong or revoked
 *   429 + "credits"  the key is fine and the project is out of money
 *   429 + no message the key is fine and you are being rate limited
 *   works            the provider, the model and the key all agree
 *
 * Two tokens out. It costs a fraction of a paisa, and both tiers are checked
 * because the analyst uses the cheap one for routing and the readers use the
 * main one, so half the product can be dead while the other half works.
 *
 *   npx tsx scripts/api-check.ts
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

async function main() {
  const { callLlm, activeModel, activeProvider } = await import("../lib/llm");
  console.log(`provider ${activeProvider()}`);
  let dead = 0;

  for (const tier of ["cheap", "main"] as const) {
    const label = `${tier.padEnd(5)} ${activeModel(tier).padEnd(26)}`;
    try {
      const r = await callLlm({
        system: "Reply with one word.",
        parts: [{ kind: "text", text: "Say OK." }],
        // 16 was wrong and would have made this script lie. On a thinking
        // model maxOutputTokens covers thinking, so a 16-token ceiling
        // truncates inside the thinking and returns no text at all, and the
        // old check only asked whether the call threw. The one script whose
        // job is proving the model generates would have printed WORKS while
        // generating nothing. effort "low" turns thinking off for this.
        maxTokens: 256, effort: "low", kind: tier, retryBudgetMs: 8000,
      });

      if (!r.text.trim() && !r.toolCalls.length) {
        console.log(
          `${label} NO OUTPUT   the call succeeded and produced nothing. ` +
          `stop reason: ${r.stopReason}`,
        );
        dead += 1;
        continue;
      }

      console.log(
        `${label} WORKS   in=${r.usage.input} out=${r.usage.output}` +
        (r.usage.thinking ? ` (${r.usage.thinking} thinking)` : "") +
        `  said ${JSON.stringify(r.text.trim().slice(0, 24))}`,
      );
    } catch (e) {
      const msg = String(e).replace(/\s+/g, " ");
      // Name the cause rather than reprinting the payload, because the
      // remedies are completely different and only one of them is yours.
      const cause =
        /credits are depleted|billing/i.test(msg) ? "OUT OF CREDIT (key is valid; top up the project)"
        : /429|RESOURCE_EXHAUSTED|rate/i.test(msg) ? "RATE LIMITED (key is valid; wait)"
        : /401|403|API key|PERMISSION/i.test(msg) ? "KEY REJECTED (wrong, revoked, or not set)"
        : "UNREACHABLE";
      console.log(`${label} ${cause}`);
      console.log(`      ${msg.slice(0, 200)}`);
      dead += 1;
    }
  }

  console.log(
    dead
      ? `\n${dead} of 2 tiers unusable. Reading, drafting and the analyst all need the ` +
        `main tier; nothing in the product invents an answer when it is missing.`
      : `\nBoth tiers reachable.`,
  );
  process.exit(dead ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
