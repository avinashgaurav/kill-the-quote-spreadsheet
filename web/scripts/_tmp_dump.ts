import raw from "../lib/data/raw-quotes.json";
import { buildMatrix, trustSummary, LINES, VENDORS, isAwardable, hasNumber } from "../lib/normalise";
const m = buildMatrix((raw as unknown as { quotes: Parameters<typeof buildMatrix>[0] }).quotes);
let noNumber = 0, notAwardable = 0, awardable = 0;
const per: Record<string, Record<string, number>> = {};
for (const v of VENDORS.map(x=>x.code)) {
  per[v] = {};
  for (const l of LINES) {
    const c = m[v][l.no];
    per[v][c.status] = (per[v][c.status] ?? 0) + 1;
    if (!hasNumber(c)) noNumber++;
    if (isAwardable(c.status)) awardable++; else notAwardable++;
  }
}
console.log(JSON.stringify(per, null, 1));
console.log({ noNumber, notAwardable, awardable });
// per-supplier: cells with no landed value
for (const v of VENDORS.map(x=>x.code)) {
  const noLanded = LINES.filter(l => m[v][l.no].unitInr === null).length;
  const tilde = LINES.filter(l => m[v][l.no].status === "non_comparable").length;
  console.log(v, "noLanded", noLanded, "non_comparable", tilde);
}
// which lines are unreadable / needs_review / caveat, and by whom
for (const v of VENDORS.map(x=>x.code)) {
  for (const l of LINES) {
    const c = m[v][l.no];
    if (["unreadable","needs_review","resolved_from_reference"].includes(c.status))
      console.log(v, "line", l.no, c.status, JSON.stringify(c.flags?.slice(0,2)));
  }
}
// unit conversions: which cells had a uom conversion
for (const v of VENDORS.map(x=>x.code)) {
  for (const l of LINES) {
    const c = m[v][l.no];
    const tr = (c.trace ?? []) as Array<{rule?:string; result?:string}>;
    const conv = tr.find(s => /per pc|normalised|kit|box|x\d/i.test(String(s.rule ?? "")));
    if (conv) console.log("CONV", v, "line", l.no, String(conv.rule).slice(0,90));
  }
}
