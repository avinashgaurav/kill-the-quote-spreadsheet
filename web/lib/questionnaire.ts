/**
 * Deciding whether a supplier's questionnaire answer actually holds.
 *
 * This file exists because of a contradiction somebody spotted on the screen:
 * Vector's row said "nothing read" next to "FAILED 6". The verdicts were a
 * table I had typed. The system could not have known them, because nothing had
 * opened Vector's questionnaire, and the four supplier questionnaire responses
 * sitting in the corpus had no code path that read them.
 *
 * So the same split as the prices. The model READS what the document says: the
 * answer in the supplier's words, what they attached, and what the attachment
 * itself states. This file DECIDES whether that satisfies the question, in
 * ordinary code, for the same three reasons the arithmetic is in code:
 *
 *   it is checkable    every rule below is a pure function with a test
 *   it is fixable      a wrong threshold is one line, not a prompt rewrite
 *   it is auditable    each verdict carries the sentence that produced it
 *
 * The interesting case, and the reason this is worth building rather than
 * asserting: a supplier answers "Yes, we are ISO 27001 certified" and attaches
 * a certificate that expired last year against a standard withdrawn in 2022.
 * The answer and its own evidence disagree. A model asked "did they pass?"
 * might say yes, because they said yes. Comparing a date to today is not a
 * judgement call, so code does it.
 */

export type AnswerStatus =
  /** Answered, and nothing contradicts it. */
  | "supported"
  /** They never answered. */
  | "unanswered"
  /** Answered, but the question asked for evidence and none came. */
  | "no_evidence"
  /** Evidence arrived and does not support the answer. */
  | "evidence_contradicts"
  /** Answered, and the answer itself misses a threshold the question set. */
  | "answer_falls_short";

export interface QuestionSpec {
  no: string;
  /** "M" or "mandatory" means a failure disqualifies them at any price. */
  kind: string;
  q: string;
  doc_required: boolean;
}

/**
 * What a reader is expected to report for one question. Facts only: no verdict,
 * no "ok" boolean. A reader that returns a pass/fail has done this file's job
 * badly, because nobody downstream can then tell a reading from a judgement.
 */
export interface ReadAnswer {
  questionNo: string;
  /** Their words, verbatim. Null when the question is unanswered. */
  answer: string | null;
  /** What they attached, as they named it. Null when nothing was attached. */
  attachedDocument: string | null;
  /** What the attachment itself says, when it could be read. */
  evidence: {
    /** The standard or scheme the document names, e.g. "ISO/IEC 27001:2013". */
    standard: string | null;
    /** Expiry or validity date on the document, ISO 8601. */
    validUntil: string | null;
    /** Who the document was issued to. */
    issuedTo: string | null;
    /** The document in one sentence, in its own terms. */
    summary: string | null;
  } | null;
  confidence: number;
}

export interface Assessment {
  questionNo: string;
  mandatory: boolean;
  status: AnswerStatus;
  /** The sentence that produced this verdict. Shown to the buyer verbatim. */
  why: string;
  /** True when this specific verdict blocks an award. */
  blocksAward: boolean;
  answer: string | null;
  attachedDocument: string | null;
  confidence: number;
}

export interface Verdict {
  qualified: boolean;
  failedMandatory: string[];
  assessments: Assessment[];
  /** True when nobody has read this supplier's questionnaire at all. */
  assessed: boolean;
}

const isMandatory = (kind: string) => kind === "M" || kind === "mandatory";

// ---------------------------------------------------------------------------
// The individual checks. Each one is deliberately narrow and says why.
// ---------------------------------------------------------------------------

/**
 * A standard with a year in it, e.g. "ISO/IEC 27001:2022" or "ISO 9001:2015".
 *
 * Matched on both sides: the year the QUESTION asks for and the year the
 * CERTIFICATE names. A 2013 certificate against a 2022 question is a real
 * failure and the commonest way an expired compliance claim survives review,
 * because the answer says "Yes" and the attachment looks official.
 */
const STANDARD = /\b(ISO(?:\/IEC)?\s*\d{4,5})\s*:\s*(\d{4})\b/i;

function standardMismatch(question: string, evidenceStandard: string | null) {
  const asked = STANDARD.exec(question);
  const got = evidenceStandard ? STANDARD.exec(evidenceStandard) : null;
  if (!asked || !got) return null;
  const sameFamily = asked[1].replace(/\s+/g, "").toLowerCase()
    === got[1].replace(/\s+/g, "").toLowerCase();
  if (!sameFamily) {
    return `the question asks for ${asked[0]} and the document is ${got[0]}, ` +
           `which is a different standard`;
  }
  if (asked[2] !== got[2]) {
    return `the question asks for the ${asked[2]} revision and the document is ` +
           `${got[0]}. The ${got[2]} revision was superseded, so this certificate ` +
           `does not evidence the answer`;
  }
  return null;
}

/**
 * A money threshold the question sets, e.g. "at least Rs 50 crore".
 *
 * Compared against a figure in their own answer. "Rs 19 crore approx" against
 * "at least Rs 50 crore" is a failure the supplier told us about themselves,
 * and it is arithmetic, so code does it rather than asking a model to judge.
 */
const MONEY = /(?:rs\.?|inr|₹)\s*([\d,.]+)\s*(crore|cr|lakh|lac|million|mn)?/i;
const SCALE: Record<string, number> = {
  crore: 1e7, cr: 1e7, lakh: 1e5, lac: 1e5, million: 1e6, mn: 1e6,
};

function parseMoney(s: string): number | null {
  const m = MONEY.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n * (m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1);
}

function thresholdShortfall(question: string, answer: string) {
  if (!/\bat least\b|\bminimum\b|\bnot less than\b|\bor more\b/i.test(question)) return null;
  const need = parseMoney(question);
  const got = parseMoney(answer);
  if (need === null || got === null || got >= need) return null;
  const fmt = (v: number) =>
    v >= 1e7 ? `Rs ${(v / 1e7).toFixed(2)} crore` : `Rs ${v.toLocaleString("en-IN")}`;
  return `the question sets a floor of ${fmt(need)} and their own answer states ` +
         `${fmt(got)}, which is below it`;
}

/**
 * Items the question names as mandatory, e.g.
 *   "Bengaluru, Pune and Gurugram are mandatory"
 *
 * Every one of them has to appear in the answer. This is the check that
 * separates a supplier who serves the buyer's actual sites from one who lists
 * five cities in another region, and it is the difference between reading an
 * answer and evaluating it. A supplier answering Q5 with a plausible list of
 * cities looks like a pass until you notice two of the three required ones are
 * absent.
 */
const NAMED_MANDATORY =
  /([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*(?:\s*,\s*[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*)*\s+and\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*)\s+are\s+mandatory/;

function missingNamedRequirements(question: string, answer: string): string | null {
  const m = NAMED_MANDATORY.exec(question);
  if (!m) return null;
  const items = m[1]
    .split(/\s*,\s*|\s+and\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
  if (items.length < 2) return null;
  const hay = answer.toLowerCase();
  const missing = items.filter((i) => !hay.includes(i.toLowerCase()));
  if (!missing.length) return null;
  return `the question names ${items.join(", ")} as mandatory and the answer does not ` +
         `include ${missing.join(" or ")}`;
}

/** A yes-shaped answer. Only these count as an affirmative. */
const AFFIRMATIVE = /^\s*(yes|y|confirmed?|we (do|are|have|confirm)|agreed?|available)\b/i;

// ---------------------------------------------------------------------------

/**
 * Assess one supplier's questionnaire.
 *
 * `asOf` is injected rather than read from the clock so a test can pin it and
 * so an audit run months later reproduces the verdict that was actually made
 * at award time. A certificate that has since expired must not retroactively
 * change a decision somebody already signed.
 */
export function assessQuestionnaire(opts: {
  questions: QuestionSpec[];
  answers: ReadAnswer[];
  supplierName?: string;
  asOf?: Date;
}): Verdict {
  const { questions, answers } = opts;
  const asOf = opts.asOf ?? new Date();
  const byNo = new Map(answers.map((a) => [a.questionNo, a]));

  // Nobody has read anything. Distinct from "read and failed", and the whole
  // reason this function exists: an unassessed supplier must never render as
  // qualified, and must never render as failed either.
  if (!answers.length) {
    return {
      qualified: false, failedMandatory: [], assessments: [], assessed: false,
    };
  }

  const assessments: Assessment[] = questions.map((q) => {
    const mandatory = isMandatory(q.kind);
    const a = byNo.get(q.no);
    const base = {
      questionNo: q.no, mandatory,
      answer: a?.answer ?? null,
      attachedDocument: a?.attachedDocument ?? null,
      confidence: a?.confidence ?? 0,
    };

    if (!a || a.answer === null || !String(a.answer).trim()) {
      return {
        ...base, status: "unanswered" as AnswerStatus,
        why: mandatory
          ? "Mandatory and unanswered. They cannot be awarded until they answer it."
          : "Unanswered. Not disqualifying, but it was part of what we asked.",
        blocksAward: mandatory,
      };
    }

    const answer = String(a.answer);

    // The answer omits something the question named as mandatory.
    const missing = missingNamedRequirements(q.q, answer);
    if (missing) {
      return {
        ...base, status: "answer_falls_short" as AnswerStatus,
        why: `Answered "${answer.slice(0, 55)}", but ${missing}.`,
        blocksAward: mandatory,
      };
    }

    // The answer misses a number the question set. Their own figure, so this is
    // the least arguable kind of failure there is.
    const short = thresholdShortfall(q.q, answer);
    if (short) {
      return {
        ...base, status: "answer_falls_short" as AnswerStatus,
        why: `Answered "${answer.slice(0, 60)}", but ${short}.`,
        blocksAward: mandatory,
      };
    }

    // The question asked for evidence and none arrived. "Are you certified"
    // gets a Yes; only the document says whether the certificate is current.
    if (q.doc_required && !a.attachedDocument) {
      return {
        ...base, status: "no_evidence" as AnswerStatus,
        why: mandatory
          ? `Answered "${answer.slice(0, 40)}" with no supporting document. The ` +
            `question asks for one, so the answer cannot be checked and does not ` +
            `yet count as a pass.`
          : `Answered without the document the question asks for, so nothing here ` +
            `has been verified.`,
        blocksAward: mandatory,
      };
    }

    // Evidence arrived. Does it actually support what they said?
    if (a.evidence) {
      const mismatch = standardMismatch(q.q, a.evidence.standard);
      if (mismatch) {
        return {
          ...base, status: "evidence_contradicts" as AnswerStatus,
          why: `Answered "${answer.slice(0, 30)}" and attached ` +
               `${a.attachedDocument}, but ${mismatch}.`,
          blocksAward: mandatory,
        };
      }

      if (a.evidence.validUntil) {
        const until = new Date(a.evidence.validUntil);
        if (!Number.isNaN(until.getTime()) && until < asOf) {
          return {
            ...base, status: "evidence_contradicts" as AnswerStatus,
            why: `Answered "${answer.slice(0, 30)}" and attached ` +
                 `${a.attachedDocument}, which expired on ` +
                 `${until.toISOString().slice(0, 10)}. An expired certificate does ` +
                 `not evidence a current claim.`,
            blocksAward: mandatory,
          };
        }
      }

      // Issued to somebody else. Rare, and worth catching, because a group
      // company's certificate is not the bidding entity's certificate.
      const issued = a.evidence.issuedTo;
      const supplier = opts.supplierName;
      if (issued && supplier) {
        const key = (s: string) =>
          s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|inc|india)\b/g, "")
            .replace(/[^a-z0-9]/g, "");
        if (key(issued) && key(supplier) && !key(issued).includes(key(supplier).slice(0, 6))) {
          return {
            ...base, status: "evidence_contradicts" as AnswerStatus,
            why: `The attached ${a.attachedDocument} is issued to "${issued}", not to ` +
                 `${supplier}. A related company's certificate is not the bidding ` +
                 `entity's certificate.`,
            blocksAward: mandatory,
          };
        }
      }
    }

    // A mandatory yes/no question answered with something that is not a yes.
    if (mandatory && /^\s*(do|are|is|was|can|will|confirm|have)\b/i.test(q.q)
        && !AFFIRMATIVE.test(answer) && !q.doc_required) {
      return {
        ...base, status: "answer_falls_short" as AnswerStatus,
        why: `The question requires a confirmation and the answer is ` +
             `"${answer.slice(0, 60)}", which does not confirm it.`,
        blocksAward: true,
      };
    }

    // A pass has to say what made it a pass, not just echo the answer back.
    // "Answered Yes." is the same unaccountable badge as a typed table, only
    // green. So the sentence names the evidence, or names the fact that none
    // was required.
    const passWhy = a.attachedDocument
      ? a.evidence?.validUntil
        ? `Answered "${answer.slice(0, 40)}". ${a.attachedDocument} supports it and ` +
          `is valid to ${a.evidence.validUntil.slice(0, 10)}.`
        : `Answered "${answer.slice(0, 40)}", supported by ${a.attachedDocument}. No ` +
          `expiry date was found on it, so its currency is unverified.`
      : q.doc_required
        ? `Answered "${answer.slice(0, 40)}" and a document was attached, so nothing ` +
          `contradicts it.`
        : `Answered "${answer.slice(0, 55)}". This question asks for a statement, not ` +
          `evidence, so the answer stands as given.`;

    return {
      ...base, status: "supported" as AnswerStatus,
      why: passWhy,
      blocksAward: false,
    };
  });

  const failedMandatory = assessments.filter((a) => a.blocksAward).map((a) => a.questionNo);
  return {
    qualified: failedMandatory.length === 0,
    failedMandatory,
    assessments,
    assessed: true,
  };
}
