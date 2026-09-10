# Kill the Quote Spreadsheet

A buyer talks an RFx into existence, it goes out to suppliers on a channel they choose,
the suppliers reply in whatever shape suits them, and the system reads all of it into one
side-by-side comparison the buyer can interrogate in plain English, all the way to a
defensible award.

Built for the Aerchain product take-home. Thirty line items, a questionnaire,
attached documents, and a roster of ten suppliers of whom five reply.

**Live:** https://kill-the-quote-spreadsheet.vercel.app

## Read these first

| | |
|---|---|
| **[WORKFLOW.md](WORKFLOW.md)** | The end-to-end flow, plain English. Start here. |
| **[THE-NOTE.md](THE-NOTE.md)** | One page: what I decided, what I left out, and the better problem. |
| [DECISIONS-v2.md](DECISIONS-v2.md) | Every decision with its cost, the alternative I rejected, and what I got wrong. |
| [RFX-SETS.md](RFX-SETS.md) | The same four parts in three categories, to show the model is not IT-specific. |

## Run it

```bash
cd web
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY
npm run dev
```

No database setup. With `DATABASE_URL` unset it runs embedded Postgres (PGlite) into
`.pglite/`, so the whole app works before anyone has created a cloud database. Set
`DATABASE_URL` to a Neon connection string for production and nothing else changes.

**Without an API key** the calculator, grid, provenance, exports and every award scenario
still work. The three AI loops refuse honestly rather than answering from a lookup table.

## Two loops, one rule

The model reads two kinds of document, and the split is the same in both:

| | The model reports | Code decides |
|---|---|---|
| **A quotation** | the number, in the supplier's own unit and currency | landed cost, in the asked unit, in rupees |
| **A questionnaire** | the answer, what they attached, and what the attachment *says* | whether that satisfies the question |

The second one is worth a sentence. A supplier answers *"Yes, we are ISO 27001
certified"* and attaches a certificate that expired and names the withdrawn 2013
revision. The answer and its own evidence disagree. A model asked "did they
pass?" might well say yes, because they said yes. Comparing a date to today is
not a judgement call, so code does it, and every verdict carries the sentence
that produced it.

There are three qualification states, not two: passed, failed, and **not read**.
The third is the one that matters, because without it a screen can claim a
failure it has no evidence for.

## The one rule

The brief says: *stub the plumbing, but the AI loops must be real. Don't fake the
extraction, don't fake the reasoning, don't hardcode the answers to your demo questions.*

- **Stubbed:** the delivery hop only. The four enquiry documents are really generated.
- **Real:** drafting, reading and answering are model calls. Extraction is cached on
  `(model, prompt hash, file hash)`, so change one byte of a document or one word of the
  prompt and it genuinely re-reads.
- **Nothing hardcoded.** Zero branches on question text, on a drafting message, or on
  a filename. Zero hardcoded amounts. No arithmetic rule keyed to a supplier code or a
  line number, and no stored qualification verdict. Each of those was once false and
  each now has a regression test.
- **Your data, not the shipped data.** Draft any enquiry, invite any subset of the
  roster, upload a quotation from a company that appears nowhere in this repository:
  it gets its own column, is marked *not assessed*, can be chased, and lands in the
  award note. Seven end-to-end cases cover exactly this, because the property worth
  protecting is not that the demo works but that the demo is not the only thing that
  does.

The AI reads. The code counts. Two independent implementations of the calculator, one in
Python and one in TypeScript, are proven to agree on all 150 cells.

## Tests

```bash
cd web
npm run test:all            # calculator, readers, parser, revisions, generality, regressions
npm run dev                 # then, in another shell:
python3 scripts/demo-test.py    # ten walkthrough claims against the brief
python3 scripts/e2e-test.py     # happy and sad paths over real HTTP
npm run accuracy            # needs a key: is the reading actually right?
```

| Suite | Checks |
|---|---|
| `conformance` | 442 assertions: two independent calculators agree on all 150 cells |
| `reader-test` | 47 cases: every format plus all 11 photographs; four corrupt files must fail |
| `revision-test` | A replaced quotation resolves, reports what moved, and re-reads the same |
| `parse-check` | 10 realistic model output shapes: omitted nulls, invented line numbers |
| `revision-test` | A replaced quote resolves, reports, and re-reads the same |
| `generality-test` | The product runs on an enquiry in a category it has never seen |
| `questionnaire-test` | An expired certificate, a superseded standard, a threshold missed, somebody else's certificate: caught, and each says why |
| `regression-test` | 27 bugs that actually shipped cannot come back unnoticed |
| `e2e-test` | 45 cases over HTTP, mostly sad paths, including an interviewer's own file |
| `accuracy` | Recall, price exactness, unit correctness, invention rate, and whether **confidence falls when accuracy falls** |

## Layout

```
dataset/generators/   the fabricated corpus, and normalise.py: the REFERENCE calculator
dataset/out/          five supplier replies in five shapes, a photo stress set, 27 awkward files
web/lib/normalise.ts  the TypeScript calculator, proven against the Python one
web/lib/extract/      readers per format, the extraction contract, the reader loop
web/lib/chase.ts      what each supplier still owes, and how to ask for only that
web/lib/questionnaire.ts  whether an answer holds, and the sentence that says why
web/app/api/rfx/inbox/    replies arriving: transport stubbed, reading real
web/scripts/          every test suite
```

`dataset/out/99-internal/ground-truth.json` is an oracle. The running app must never read
it; it exists to score extraction accuracy and to prove the demo is not scripted.
