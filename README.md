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
| **[WALKTHROUGH.md](WALKTHROUGH.md)** | The recorded walkthrough, and why each question is on the list. |
| [DECISIONS-v2.md](DECISIONS-v2.md) | Every decision with its cost, the alternative I rejected, and what I got wrong. |
| [RFX-SETS.md](RFX-SETS.md) | The same four parts in three categories, to show the model is not IT-specific. |

## The brief, clause by clause

Checked against the code rather than asserted. Every YES below has a file behind
it, and two rows are PARTIAL on purpose.

| The brief asks for | Where it lives |
|---|---|
| "A buyer **talks** an RFx into existence with an AI co-pilot: scope, line items, questionnaire, terms" | `lib/copilot.ts`, a real tool loop. Type anything, in any category. The four suggested openers are examples, not paths. |
| "It goes out to vendors **over a channel you choose**" | `api/rfx/send` generates four real documents. The channel is consequential, not a label: WhatsApp cannot carry an attachment, so the pack goes as a link **and a supplier's certificate does not arrive**, which is why their questionnaire answer then has nothing behind it. Your choice at step 3 is the reason step 4 is harder. |
| "Vendors reply **however they like**; nobody is forced into your template" | Five native shapes in `dataset/out`: an xlsx on the supplier's own template, a 3-page PDF, a docx with prices in sentences, a phone photograph, a five-line email. Plus odt, ods, csv, tsv, rtf, txt, and a 27-file awkward-format corpus. |
| "reads **every** response, whatever shape it arrives in" | `lib/extract/run.ts`. One forced tool, no others. A read that finds nothing **throws** rather than returning an empty column. `npm run sees -- <file>` shows exactly what reaches the model for any file, including yours. |
| "a single side-by-side comparison: **same lines, same units, same currency**" | `lib/normalise.ts`, proven cell-for-cell against an independent Python implementation by 442 assertions. Aliases never change a number, conversions always do, and a conversion with no rule **refuses** instead of guessing. |
| "**questionnaire answers and attached docs** sitting alongside the numbers" | Both read, both openable. A questionnaire form names a filename and nothing more, so the named document is opened and read **in its own right** and the document governs where the two disagree. Click it in the supplier panel to read the certificate yourself. |
| "the buyer stops clicking and **starts asking**. Natural language, over the whole comparison" | `lib/analyst.ts`. Ten tools that compute, no `evaluate`, no SQL, no arithmetic in prose. Tools are bound to the **loaded** enquiry, so a supplier you uploaded is visible to every one of them. |
| "**Text answers, tables, charts, exports**" | Text and markdown tables. Bar charts, coloured by group, so "who wins each of thirty lines" is one chart. Four exports: award note, xlsx with provenance in cell comments, CSV, and a JSON audit bundle. |
| "**Real analysis on real extracted data**, all the way to a defensible award decision" | The award note leads with what the total rests on, why not the cheapest, the assumptions in force, the money deliberately not counted, and who was asked for what and whether they replied. |
| "five vendors, thirty line items, a questionnaire, attached documents" | 30 lines, 10 suppliers of whom 5 reply, 10 questions of which 6 are mandatory, certificates and OEM letters. **PARTIAL as deployed:** the live database is empty until somebody presses Send, because populating it takes real model calls. |
| "Fabricate a dataset a procurement person would nod at" | HSN codes per line, GSTIN and CIN, pack sizes that trap ("kit of 2", "box of 10", "box of 50"), MOQ, ex-works Singapore, a discount buried in footnote 3 on page 3, a prior-PO rate card, and a Rev 2 that supersedes a Rev 1. |
| **One rule:** "the AI loops must be real ... don't hardcode the answers to your demo questions" | Six model call sites, no lookup tables, and **two violations of this found and fixed** rather than avoided. See below. |

**The two violations, because finding them is the point.** The analyst's
questionnaire tool served a `passed` boolean and a hand-typed `finding`
sentence out of `catalog.json`, so the suggested question *"is Vector's ISO
27001 certificate actually valid?"* was answered by handing the model my own
conclusion. And the finding itself did not survive a real read at all: the
revision year and the expiry date live inside an attached PDF that nothing ever
opened, so a genuine read turned six mandatory failures into five. Both are now
derived, and `regression-test` has three cases pinning the second, including
one asserting that the **form alone must not** produce the finding.

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
- **Nothing hardcoded, and each of these was once false.** Zero branches on question
  text or on a drafting message. Zero hardcoded amounts. No arithmetic rule keyed to a
  supplier code or a line number. No stored qualification verdict, and no analyst tool
  reading one: the tool that answers *"is Vector's ISO 27001 certificate actually
  valid?"* used to serve a `passed` boolean and a `finding` sentence out of
  `catalog.json`, which is the one thing the brief forbids by name. Every one of these
  now has a regression test, because each was found rather than avoided.
- **Two branches on a filename, both deliberate.** Which supplier sent an unrecognised
  file, and whether a document is a questionnaire rather than a quotation. Both are
  hints that fail safe: the first refuses and asks rather than guessing, and the second
  is recoverable because a quotation read as a questionnaire returns no answers and
  throws loudly.
- **Your data, not the shipped data.** Draft any enquiry, invite any subset of the
  roster, upload a quotation from a company that appears nowhere in this repository:
  it gets its own column, is marked *not assessed*, can be chased, is visible to every
  analyst tool, and lands in the award note. Seven end-to-end cases cover exactly this,
  because the property worth protecting is not that the demo works but that the demo is
  not the only thing that does.

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

`npm run verify` is everything that costs nothing: types, lint, and the eight
offline suites.

| Suite | Checks | Key |
|---|---|---|
| `conformance` | 442 assertions: two independent calculators agree on all 150 cells | no |
| `reader-test` | 47 cases: every format plus all 11 photographs, and 4 broken files (3 refused with instructions, 1 truncated PDF correctly routed to vision) | no |
| `parse-check` | 10 realistic model output shapes: omitted nulls, invented line numbers | no |
| `revision-test` | A replaced quotation resolves, reports what moved, and re-reads the same | no |
| `generality-test` | The product runs on an enquiry in a category it has never seen | no |
| `questionnaire-test` | 16 cases. An expired certificate, a superseded standard, a threshold missed, somebody else's certificate: caught, each saying why, and the case that only works because the ATTACHMENT is opened | no |
| `contrast-test` | Every colour that carries meaning against its WCAG floor, both themes, oklch maths validated against a real browser first | no |
| `cache-test` | The extraction cache stores, returns, and misses for the right reasons | no |
| `sees` | What actually reaches the model for any document you give it | no |
| `regression-test` | 44 bugs that actually shipped cannot come back unnoticed | no |
| `e2e-test` | 42 cases over HTTP, mostly sad paths, including an interviewer's own file | yes |
| `accuracy` | Recall, price exactness, unit correctness, invention rate, and whether **confidence falls when accuracy falls** | yes |
| `api-check` | Whether the model is reachable, and which of the three ways a key can be dead this is. Two tokens | yes |
| `doc-numbers` | Prints every figure the documents claim, from the calculator. Run before editing a number in any doc | no |

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
