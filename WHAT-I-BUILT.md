# What I built

A buyer drafts an enquiry by talking to it. It goes out to suppliers on a
channel they pick. Suppliers reply in any format. The system reads every reply
into one comparison, same lines, same units, same currency, which the buyer then
questions in plain English and awards from.

**Live:** https://kill-the-quote-spreadsheet.vercel.app

The dataset is fabricated, as the brief asked: a buyer, ten suppliers, their
quotations and their certificates.

---

## The flow

**1. Draft by talking.** Type what you need in ordinary English. A co-pilot
builds the scope, the line items, a supplier questionnaire and the commercial
terms. It asks about what it cannot guess and assumes defaults for the rest. It
has no price field, so it cannot invent one. The shipped enquiry is 30 lines and
10 questions, 6 of them mandatory.

**2. A gate before it leaves.** The enquiry is held if a line says "box"
without saying how many are inside, or is missing a quantity, a unit or a line
number. Each hold says what a supplier could legitimately do with the ambiguity.
Override it by typing a reason, and that reason is stored on the enquiry and
printed in the award note under "lines sent knowing they were ambiguous".

**3. Send on a channel you choose.** Email, a portal link, or WhatsApp.
WhatsApp cannot carry an attachment, so the pack goes as a link, and on the way
back that supplier's certificate does not arrive either. Ten suppliers invited,
five reply.

**4. Replies in whatever shape.** Nobody is forced into a template:

| Supplier | What they sent |
|---|---|
| Zenith | Their own xlsx template, plus a Rev 2 that supersedes their Rev 1 |
| Cygnus | A 3-page PDF, discount in a footnote on the last page |
| Orbit | A docx with prices written into sentences |
| Vector | A phone photograph of a printed rate card |
| Helios | A five-line email pricing 2 of 30 lines, and no questionnaire |

Plus a 31-file stress set: 22 awkward formats (odt, ods, csv, tsv, rtf, txt),
5 photographs of falling quality, and 4 deliberately broken files.

**5. One comparison, then ask it things.** Questionnaire answers and attached
documents sit alongside the numbers.

---

## What is in it

**The comparison grid.** 150 cells, 30 lines by 5 suppliers. Every cell carries
how it got there: the raw quote, the rule applied, the landed figure. Click one
to see the sentence it was read from. The grid is one tab stop and arrow keys
move between cells, rather than 150 separate tab stops.

**Five kinds of nothing, not one dash.** Declined, never mentioned, cannot read
it, not a price, needs your call. Five different next actions, so five marks.

**A trust bar whose parts are checked.** Every cell is in exactly one of five
buckets, and `101 + 6 + 3 + 40 + 0 = 150` is asserted on every run:

| Bucket | Cells | Meaning |
|---|---|---|
| Usable | 101 | In the total. 14 of them off-spec but counted |
| No price | 40 | Declined, never mentioned, or not a rankable price |
| Needs a human | 6 | Could not be normalised safely |
| Derived, awaiting supplier | 3 | Taken from a prior order, not counted until confirmed |
| Not read | 0 | Ours to fix, not theirs |

**Three qualification states, not two.** Passed, failed, and not assessed. A
supplier nobody has read is shown as not assessed, never as failed.

**The questionnaire is read against its own evidence.** A supplier answers "yes,
we are ISO 27001 certified" and attaches a certificate for the withdrawn 2013
revision. The attachment gets its own model call, and where the answer and the
document disagree, the document wins.

**Award scenarios.** Cheapest from anyone; cheapest among suppliers who can
actually be awarded; a single supplier; and strict, which drops substitutions
and below-spec offers. Strict covers fewer lines, so when two scenarios do not
cover the same lines the system says so and restates both on the lines they
share.

**Chase.** Works out what each supplier still owes, asks for only that, with a
deadline, and records it. It separates "they never sent it" from "they sent
something we cannot use as it stands".

**Ask, in plain English.** Ten tools that compute. No calculator tool you can
hand two numbers to and no SQL, so a number in an answer came from a named tool.
Answers come back as text, markdown tables and bar charts, and the ones built
from cell-level tools list the cells they used, which you can click.

**Four exports.** Award note, xlsx with the provenance in cell comments, CSV,
and a JSON audit bundle.

---

## What it computes

On the shipped enquiry, read live:

- Cheapest from anyone: **₹3.88 cr**
- Cheapest among suppliers who can actually be awarded: **₹4.05 cr**
- So doing it properly costs **₹16.7 lakh, 4.3%**

The cheaper number was never available. It sat inside Vector, who failed all six
mandatory questions.

---

## Where the AI is

Six model calls, listed completely in [AI-MAP.md](AI-MAP.md) with what each may
not do. Nothing else in the product talks to a model.

**The AI reads. The code counts.** The model reports what a document says, in
the supplier's own unit and currency. It never multiplies, converts, discounts
or adds. Every arithmetic step happens in ordinary code.

Only the delivery hop is stubbed. The four enquiry documents are really
generated, and everything that arrives is really read.

---

## What is tested

`npm run verify` runs types, lint and nine offline suites, none of which needs
an API key or a network.

| Suite | What it checks |
|---|---|
| `conformance` | 442 assertions: two independent calculators, one Python and one TypeScript, agree on all 150 cells |
| `reader-test` | 47 cases: every format, all 11 photographs, 4 broken files |
| `regression-test` | 66 bugs that actually shipped |
| `questionnaire-test` | 16 cases: expired certificates, superseded standards, somebody else's certificate |
| `parse-check` | 10 realistic bad model outputs: omitted nulls, invented line numbers |
| `generality-test` | 8 cases on a category the product has never seen |
| `revision-test` | 7 cases: a replaced quotation resolves and reports what moved |
| `cache-test` | 6 cases: the extraction cache stores, returns and misses for the right reasons |
| `contrast-test` | Every colour that carries meaning, against its WCAG floor, both themes |

Two more need a key: `e2e-test` over real HTTP, and `accuracy`, which scores
recall, price exactness, unit correctness and invention rate against a held-out
answer key the app never reads.

---

## Stack

Next.js App Router, React, Tailwind, shadcn/ui. Embedded Postgres locally with
no setup, Neon in production, switched on `DATABASE_URL`. Anthropic or Gemini
behind one interface, switched on `LLM_PROVIDER`. Hosted on Vercel.
