import { buildMatrix, LINES } from "../lib/normalise";
import { gapsForSupplier, chaseMessage } from "../lib/chase";
import catalog from "../lib/data/catalog.json";

const questionnaire = (catalog as unknown as { questionnaire: Array<{no:string;kind:string;q:string;doc_required:boolean}> }).questionnaire;

// A supplier who was invited and has sent NOTHING. Every cell is `not_read`.
const m = buildMatrix({});
console.log("statuses for an unread supplier:", [...new Set(Object.values(m.V1 ?? {}).map(c => c.status))]);

const g = gapsForSupplier({
  vendorId: "V1", vendorName: "Zenith Infotech Solutions Pvt Ltd",
  matrix: m, lines: LINES, questionnaire, answers: {}, terms: {},
});
console.log("\nitems:", g.items.length, "gaps:", g.gapCount, "disputes:", g.disputeCount);
console.log("kinds:", g.items.map(i => i.kind).join(", "));
console.log("any price item?", g.items.some(i => i.kind.startsWith("price_")));

const msg = chaseMessage({
  gaps: g, rfxId: "NBR/2026/PROC/0142", rfxTitle: "IT hardware refresh",
  buyerName: "Procurement", dueAt: new Date(Date.now()+6*864e5).toISOString(),
});
console.log("\n--- SUBJECT:", msg.subject);
console.log(msg.body.split("\n").slice(0, 6).join("\n"));
console.log("...");
console.log("mentions a quotation/price at all?", /price|quotation|rate/i.test(msg.body.split("STILL TO SEND")[0]));

// ---- empty-array scope: does a present-but-empty scope widen? ----
console.log("\n=== chaseMessage with onlyLines: [] (what the route builds from lineNos: []) ===");
const scoped = chaseMessage({
  gaps: g, rfxId: "X", rfxTitle: "t", buyerName: "b",
  dueAt: new Date(Date.now()+6*864e5).toISOString(),
  onlyLines: [], onlyQuestions: undefined,
});
console.log("items returned:", scoped.items.length, "(0 = refused by the route, >0 = the full list goes out)");
const kindsEmpty = chaseMessage({
  gaps: g, rfxId: "X", rfxTitle: "t", buyerName: "b",
  dueAt: new Date(Date.now()+6*864e5).toISOString(), selected: [],
});
console.log("with selected: [] ->", kindsEmpty.items.length, "items");
