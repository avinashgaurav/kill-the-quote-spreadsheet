# Kill the Quote Spreadsheet

A buyer talks an RFx into existence, it goes out to suppliers on a channel they choose,
the suppliers reply in whatever shape suits them, and the system reads all of it into one
side-by-side comparison the buyer can interrogate in plain English, all the way to a
defensible award.

Built for the Aerchain product take-home. Five suppliers, thirty line items, a
questionnaire, attached documents.

## Read these first

| | |
|---|---|
| **[WORKFLOW.md](WORKFLOW.md)** | The end-to-end flow, seven steps, plain English. Start here. |
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

## The one rule

The brief says: *stub the plumbing, but the AI loops must be real. Don't fake the
extraction, don't fake the reasoning, don't hardcode the answers to your demo questions.*

- **Stubbed:** the delivery hop only. The four enquiry documents are really generated.
- **Real:** drafting, reading and answering are model calls. Extraction is cached on
  `(model, prompt hash, file hash)`, so change one byte of a document or one word of the
  prompt and it genuinely re-reads.
- **Nothing hardcoded:** no branch on question text, no hardcoded amounts, and no
  arithmetic rule keyed to a supplier code or a line number. A regression test asserts
  the last one, because it used to be false.

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
| `parse-check` | 10 realistic model output shapes: omitted nulls, invented line numbers |
| `revision-test` | A replaced quote resolves, reports, and re-reads the same |
| `generality-test` | The product runs on an enquiry in a category it has never seen |
| `regression-test` | 24 bugs that actually shipped cannot come back unnoticed |
| `e2e-test` | 38 cases over HTTP, two thirds of them sad paths |
| `accuracy` | Recall, price exactness, unit correctness, invention rate, and whether **confidence falls when accuracy falls** |

## Layout

```
dataset/generators/   the fabricated corpus, and normalise.py: the REFERENCE calculator
dataset/out/          five supplier replies in five shapes, a photo stress set, 27 awkward files
web/lib/normalise.ts  the TypeScript calculator, proven against the Python one
web/lib/extract/      readers per format, the extraction contract, the reader loop
web/lib/chase.ts      what each supplier still owes, and how to ask for only that
web/scripts/          every test suite
```

`dataset/out/99-internal/ground-truth.json` is an oracle. The running app must never read
it; it exists to score extraction accuracy and to prove the demo is not scripted.
