/**
 * The questionnaire verdicts, derived rather than asserted.
 *
 * This suite exists because of a contradiction on the screen: a supplier's row
 * said "nothing read" next to "FAILED 6". The verdicts came from a table
 * somebody had typed. The system could not have known them.
 *
 * So the question every case here answers is: given only what a reader could
 * report from the document, does the code reach the right verdict AND say why?
 *
 * The "why" matters as much as the verdict. A red badge that cannot explain
 * itself is the same problem in a different colour.
 */

import { assessQuestionnaire, type QuestionSpec, type ReadAnswer } from "../lib/questionnaire";
import catalog from "../lib/data/catalog.json";

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
let pass = 0, fail = 0;

function check(name: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? `${G}pass${X}` : `${R}FAIL${X}`}  ${B}${name}${X}\n        ${D}${detail}${X}`);
  if (ok) pass += 1; else fail += 1;
}

const QUESTIONS = catalog.questionnaire as unknown as QuestionSpec[];
const ASOF = new Date("2026-09-18T00:00:00Z");   // the RFx due date, pinned

const answer = (o: Partial<ReadAnswer> & { questionNo: string }): ReadAnswer => ({
  answer: null, attachedDocument: null, evidence: null, confidence: 0.9, ...o,
});

console.log("\n" + "=".repeat(78));
console.log(`${B}QUESTIONNAIRE${X}  verdicts derived from what the document says`);
console.log("=".repeat(78) + "\n");

// ---- the headline case ----------------------------------------------------
//
// Vector answers "Yes" to ISO 27001:2022 and attaches a certificate against
// the withdrawn 2013 revision that expired last year. Two independent reasons
// it fails, and a model asked "did they pass?" would plausibly say yes,
// because they said yes.
{
  const v = assessQuestionnaire({
    questions: QUESTIONS,
    supplierName: "Vector Digital Systems",
    asOf: ASOF,
    answers: [answer({
      questionNo: "Q2",
      answer: "Yes",
      attachedDocument: "VDS_ISO27001.pdf",
      evidence: {
        standard: "ISO/IEC 27001:2013",
        validUntil: "2025-11-30",
        issuedTo: "Vector Digital Systems",
        summary: "Information security management certificate",
      },
    })],
  });
  const a = v.assessments.find((x) => x.questionNo === "Q2")!;
  check(
    "an expired certificate against a withdrawn standard fails, and says which",
    a.status === "evidence_contradicts" && a.blocksAward && /2022|2013/.test(a.why),
    a.why,
  );
  check(
    "a supplier who answered Yes is still not qualified",
    v.qualified === false && v.failedMandatory.includes("Q2"),
    `qualified=${v.qualified}, failed=[${v.failedMandatory}]. The answer said yes; ` +
    `the evidence said otherwise, and the evidence governs.`,
  );
}

// ---- expiry alone, correct standard --------------------------------------
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: [answer({
      questionNo: "Q2", answer: "Yes", attachedDocument: "cert.pdf",
      evidence: { standard: "ISO/IEC 27001:2022", validUntil: "2026-01-15",
                  issuedTo: null, summary: null },
    })],
  });
  const a = v.assessments.find((x) => x.questionNo === "Q2")!;
  check(
    "the right standard, but expired, still fails",
    a.status === "evidence_contradicts" && /expired on 2026-01-15/.test(a.why),
    a.why,
  );
}

// ---- valid certificate passes -------------------------------------------
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: [answer({
      questionNo: "Q2", answer: "Yes", attachedDocument: "cert.pdf",
      evidence: { standard: "ISO/IEC 27001:2022", validUntil: "2027-11-08",
                  issuedTo: null, summary: null },
    })],
  });
  const a = v.assessments.find((x) => x.questionNo === "Q2")!;
  check(
    "a current certificate against the right standard passes",
    a.status === "supported" && !a.blocksAward,
    a.why,
  );
}

// ---- "Yes" with nothing attached ----------------------------------------
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: [answer({ questionNo: "Q1", answer: "Yes" })],
  });
  const a = v.assessments.find((x) => x.questionNo === "Q1")!;
  check(
    "a mandatory Yes with no document does not count as a pass",
    a.status === "no_evidence" && a.blocksAward,
    a.why,
  );
}

// ---- their own number is below the floor the question set ---------------
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: [answer({ questionNo: "Q7", answer: "Rs 19 crore approx" })],
  });
  const a = v.assessments.find((x) => x.questionNo === "Q7")!;
  check(
    "an answer below a threshold the question set fails on arithmetic",
    a.status === "answer_falls_short" && /50/.test(a.why) && /19/.test(a.why),
    a.why,
  );
}
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: [answer({ questionNo: "Q7", answer: "Rs 240 crore in FY26",
                       attachedDocument: "audited-accounts.pdf" })],
  });
  const a = v.assessments.find((x) => x.questionNo === "Q7")!;
  check(
    "an answer above the threshold passes",
    a.status === "supported",
    a.why,
  );
}

// ---- somebody else's certificate ---------------------------------------
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF, supplierName: "Vector Digital Systems",
    answers: [answer({
      questionNo: "Q2", answer: "Yes", attachedDocument: "group-cert.pdf",
      evidence: { standard: "ISO/IEC 27001:2022", validUntil: "2028-01-01",
                  issuedTo: "Karthik Holdings Pvt Ltd", summary: null },
    })],
  });
  const a = v.assessments.find((x) => x.questionNo === "Q2")!;
  check(
    "a related company's certificate is not the bidder's certificate",
    a.status === "evidence_contradicts" && /issued to/.test(a.why),
    a.why,
  );
}

// ---- the distinction the whole file exists for -------------------------
{
  const none = assessQuestionnaire({ questions: QUESTIONS, answers: [], asOf: ASOF });
  check(
    "a supplier nobody has read is UNASSESSED, not failed and not qualified",
    none.assessed === false && none.qualified === false && !none.failedMandatory.length,
    `assessed=${none.assessed}, qualified=${none.qualified}, failed=[] — this is the ` +
    `state that used to render as "FAILED 6" from a hand-written table while the ` +
    `same row said "nothing read".`,
  );

  // A realistic full response. "Yes" is not an answer to "list your locations",
  // and the assessor is right to reject it, so each question gets an answer of
  // the shape it actually asks for.
  const plausible = (q: QuestionSpec) =>
    /\bat least\b|\bminimum\b/i.test(q.q) && /rs|crore/i.test(q.q)
      ? "Rs 240 crore in each of the last three years"
      : /are mandatory/.test(q.q)
        ? "Bengaluru, Pune and Gurugram plus 14 tier-2 cities"
        : "Yes";
  const read = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: QUESTIONS.map((q) => answer({
      questionNo: q.no, answer: plausible(q),
      attachedDocument: q.doc_required ? "cert.pdf" : null,
      evidence: q.doc_required
        ? { standard: null, validUntil: "2028-01-01", issuedTo: null, summary: null }
        : null,
    })),
  });
  check(
    "a supplier who answered everything with current evidence qualifies",
    read.assessed === true && read.qualified === true,
    `assessed=${read.assessed}, qualified=${read.qualified}, failed=[${read.failedMandatory}]`,
  );
}

// ---- unanswered mandatory vs unanswered desirable ----------------------
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: [answer({ questionNo: "Q1", answer: "Yes", attachedDocument: "oem.pdf",
                       evidence: { standard: null, validUntil: "2028-01-01",
                                   issuedTo: null, summary: null } })],
  });
  const q5 = v.assessments.find((x) => x.questionNo === "Q5")!;
  const q8 = v.assessments.find((x) => x.questionNo === "Q8")!;
  check(
    "an unanswered MANDATORY question blocks; an unanswered desirable one does not",
    q5.status === "unanswered" && q5.blocksAward &&
      q8.status === "unanswered" && !q8.blocksAward,
    `Q5 (mandatory) blocks=${q5.blocksAward}; Q8 (desirable) blocks=${q8.blocksAward}. ` +
    `Both unanswered, different consequences.`,
  );
}

// ---- the named-requirement check --------------------------------------
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: [answer({
      questionNo: "Q5",
      answer: "Chennai, Coimbatore, Madurai, Bengaluru, Hyderabad",
    })],
  });
  const a = v.assessments.find((x) => x.questionNo === "Q5")!;
  check(
    "an answer that omits cities the question named as mandatory fails",
    a.status === "answer_falls_short" && /Pune/.test(a.why) && /Gurugram/.test(a.why),
    a.why,
  );
}

// ---- every verdict must be able to explain itself ---------------------
{
  const v = assessQuestionnaire({
    questions: QUESTIONS, asOf: ASOF,
    answers: QUESTIONS.map((q) => answer({ questionNo: q.no, answer: "Yes" })),
  });
  const mute = v.assessments.filter((a) => !a.why || a.why.length < 25);
  check(
    "no verdict is silent",
    mute.length === 0,
    `${v.assessments.length} assessments, ${mute.length} without an explanation. A red ` +
    `badge that cannot say why is the same problem as a typed table.`,
  );
}

console.log("\n" + "=".repeat(78));
if (fail === 0) {
  console.log(`${G}${B}${pass}/${pass} pass${X}  verdicts come from the evidence, not from a table.`);
} else {
  console.log(`${R}${B}${pass}/${pass + fail} passed, ${fail} FAILED${X}`);
}
console.log("=".repeat(78));
process.exit(fail ? 1 : 0);
