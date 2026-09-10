process.env.PGLITE_DIR = "/private/tmp/claude-501/-Users-raramuri-Desktop-Personal-AC/a90a87ae-6fe4-433d-bbe6-2c961023a3b8/scratchpad/probe-db";
import { buildComparisonPayload } from "../lib/store";
import { awardNote, comparisonWorkbook, comparisonCsv, auditBundle } from "../lib/documents";
import { writeFileSync } from "node:fs";

(async () => {
  const p = await buildComparisonPayload();
  console.log("hasAnyExtraction:", (p as unknown as {hasAnyExtraction:boolean}).hasAnyExtraction);
  console.log("trust:", JSON.stringify(p.trust));
  console.log("qualifiedOnly scenario:", p.scenarios.qualifiedOnly.linesAwarded, "lines,", p.scenarios.qualifiedOnly.totalInr);
  console.log("allVendors scenario:", p.scenarios.allVendors.linesAwarded, "lines,", p.scenarios.allVendors.totalInr);

  for (const [name, fn] of [
    ["awardNote", () => awardNote(p, { qualifiedOnly: true })],
    ["awardNote(all)", () => awardNote(p, { qualifiedOnly: false })],
    ["comparisonCsv", () => comparisonCsv(p)],
    ["comparisonWorkbook", () => comparisonWorkbook(p)],
    ["auditBundle", () => JSON.stringify(auditBundle(p)).length],
  ] as Array<[string, () => unknown]>) {
    try {
      const out = fn();
      const size = typeof out === "string" ? out.length : (out as Buffer)?.length ?? out;
      console.log(`OK    ${name} -> ${size}`);
      if (name === "awardNote") writeFileSync("/private/tmp/claude-501/-Users-raramuri-Desktop-Personal-AC/a90a87ae-6fe4-433d-bbe6-2c961023a3b8/scratchpad/award.html", String(out));
    } catch (e) {
      console.log(`THROW ${name} -> ${String(e).replace(/\s+/g," ").slice(0,200)}`);
    }
  }
})();
