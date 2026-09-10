import raw from "../lib/data/raw-quotes.json";
import catalog from "../lib/data/catalog.json";
import { buildMatrix, LINES, VENDORS, inrShort, inr } from "../lib/normalise";
import { gapsForSupplier } from "../lib/chase";
const m = buildMatrix((raw as unknown as { quotes: Parameters<typeof buildMatrix>[0] }).quotes);
const qs = (catalog as any).questionnaire;
const ans = (catalog as any).questionnaire_answers ?? {};
for (const v of VENDORS as any[]) {
  const g: any = gapsForSupplier({
    vendorId: v.code, vendorName: v.name, matrix: m, lines: LINES as any,
    questionnaire: qs, answers: (ans[v.code] ?? {}) as any, terms: {},
  });
  console.log("----", v.code, v.name, JSON.stringify(Object.keys(g)));
  console.log("  totalAtRisk", g.totalAtRiskInr, inrShort(g.totalAtRiskInr ?? 0));
  for (const i of (g.items ?? [])) console.log("   ", i.kind, "lines", (i.lineNos||[]).length, inr(i.atRiskInr));
}
