# What I built

A buyer drafts an enquiry by talking to it. It goes out to suppliers on a
channel they pick. Suppliers reply in any format. The system reads every reply
into one comparison, same lines, same units, same currency, which the buyer can
then question in plain English and award from.

**Live:** https://kill-the-quote-spreadsheet.vercel.app

Everything in it is fabricated: the buyer, the ten suppliers, their quotations
and their certificates. No real company is involved.

---

## Try it in three minutes

The live site already has all five supplier replies read in, so you can start
at the interesting part.

1. Open the link. It lands on **Compare**, with 150 cells already read.
2. Click the cell on **line 13 (RAM-32K)** under Vector. It was quoted per DIMM
   against a line asked as a matched kit of two, so the raw number is half the
   landed one. The panel shows the sentence it was read from and the rule that
   changed it.
3. Read the bar above the grid. It says how many cells are in the total and how
   many are not.
4. In the **Ask** panel, type: *Split it cheapest per line, but only among
   suppliers who cleared the quality questionnaire.* Then: *What did that change
   against taking the cheapest from anyone?*
5. Then ask *Which of these suppliers has the best reputation in the market?*
   It refuses, and says why.

Drafting a new enquiry and sending it works too, and takes real model calls and
a few minutes. The **Draft** tab is where that starts.

To run it locally: `cd web && npm install && cp .env.example .env.local`, add an
API key, `npm run dev`. No database setup, it runs embedded Postgres into
`.pglite/`.

---

## The flow, in five steps

**1. Draft it by talking.** Type what you need in ordinary English. A co-pilot
builds the scope, the line items, a supplier questionnaire and the commercial
terms. It asks about what it cannot guess and assumes defaults for the rest. It
has no price field at all, so it cannot invent one. The shipped example is 30
lines and 10 questions, 6 of them mandatory.

**2. A gate before it leaves the building.** The enquiry is held if a line says
"box" without saying how many are inside, or is missing a quantity, a unit or a
line number. Each hold says in words what a supplier could legitimately do with
the ambiguity. You can override any hold by typing a reason, and that reason is
stored on the enquiry and printed in the award note, under "lines sent knowing
they were ambiguous".

**3. Send on a channel you choose.** Email, a portal link, or WhatsApp.
WhatsApp cannot carry an attachment, so the pack goes as a link, and on the way
back that supplier's certificate does not arrive either. Ten suppliers invited,
five reply.

**4. Replies arrive in whatever shape.** Nobody is forced into a template:

| Supplier | What they sent |
|---|---|
| Zenith | Their own xlsx template, plus a Rev 2 that supersedes their Rev 1 |
| Cygnus | A 3-page PDF, with the discount in a footnote on the last page |
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
it, not a price, needs your call. Five different next actions, so five different
marks.

**A trust bar whose parts are checked.** Every cell is in exactly one of five
buckets, and `101 + 6 + 3 + 40 + 0 = 150` is asserted on every run:

| Bucket | Now | Meaning |
|---|---|---|
| Usable | 101 | In the total. 14 of them off-spec but counted |
| No price | 40 | Declined, never mentioned, or not a rankable price |
| Needs a human | 6 | Could not be normalised safely |
| Derived, awaiting supplier | 3 | Taken from a prior order, not counted until confirmed |
| Not read | 0 | Ours to fix, not theirs |

The 49 "excluded" figure you see elsewhere is the middle three added up.

**Three qualification states, not two.** Passed, failed, and not assessed. A
supplier nobody has read is shown as not assessed, never as failed.
`questionnaire-test` pins this.

**The questionnaire is read against its own evidence.** A supplier answers "yes,
we are ISO 27001 certified" and attaches a certificate for the withdrawn 2013
revision. The attachment gets its own model call, and where the answer and the
document disagree the document wins.

**Award scenarios.** Cheapest from anyone; cheapest among suppliers who can
actually be awarded; a single supplier; and strict, which drops substitutions
and below-spec offers. Strict therefore covers fewer lines, so when two
scenarios do not cover the same lines the system says so and restates both on
the lines they share.

**Chase.** Works out what each supplier still owes, asks for only that, with a
deadline, and records it. It separates "they never sent it" from "they sent
something we cannot use as it stands".

**Ask, in plain English.** Ten tools that compute. There is no calculator tool
you can hand two numbers to and no SQL, so a number in an answer came from a
named tool. Answers come back as text, markdown tables and bar charts, and the
ones built from cell-level tools list the cells they used, which you can click.

**Four exports.** Award note, xlsx with the provenance in cell comments, CSV,
and a JSON audit bundle.

---

## What it says right now, on the live site

- Cheapest from anyone: **₹3.88 cr**
- Cheapest among suppliers who can actually be awarded: **₹4.05 cr**
- So doing it properly costs **₹16.7 lakh, 4.3%**

The cheaper number was never really available. It sat inside Vector, who failed
all six mandatory questions.

A fresh local run gives ₹4.07 cr and ₹18.6 lakh instead, because the local
figures come from the answer key and the deployed ones come from a real model
read of the same documents. Where the two differ, the live site is the one to
trust, and both are quoted from a read rather than from a fixture.

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

## What it does badly

[THE-NOTE.md](THE-NOTE.md) has the full list. The short version:

- On one of five photographs of the same rate card, the reader was **52%
  accurate and 90% confident**, which is the exact failure the design exists to
  prevent. Measured, not fixed.
- A drafted enquiry still borrows the shipped example's buyer and assumption
  ledger, and one analyst tool reads line descriptions from the shipped catalog.
- Supplier codes are globally unique rather than per enquiry.
- 30 lines and 5 replies is the tested size. Nothing has been run at 300 lines.

---

## What is tested

`npm run verify` runs types, lint and nine offline suites. Nothing in it needs
an API key or a network.

| Suite | What it checks |
|---|---|
| `conformance` | 442 assertions: two independent calculators, one Python and one TypeScript, agree on all 150 cells |
| `reader-test` | 47 cases: every format, all 11 photographs, 4 broken files |
| `regression-test` | 66 bugs that actually shipped, four of them found today |
| `questionnaire-test` | 16 cases: expired certificates, superseded standards, somebody else's certificate |
| `parse-check` | 10 realistic bad model outputs: omitted nulls, invented line numbers |
| `generality-test` | 8 cases on a category the product has never seen |
| `revision-test` | 7 cases: a replaced quotation resolves and reports what moved |
| `cache-test` | 6 cases: the extraction cache stores, returns and misses for the right reasons |
| `contrast-test` | Every colour that carries meaning, against its WCAG floor, both themes |

Two more need a key and cost money: `e2e-test` over real HTTP, and `accuracy`,
which scores recall, price exactness, unit correctness and invention rate
against a held-out answer key the app never reads.

---

## Stack

Next.js App Router, React, Tailwind, shadcn/ui. Embedded Postgres locally with
no setup, Neon in production, switched on `DATABASE_URL`. Anthropic or Gemini
behind one interface, switched on `LLM_PROVIDER`. Hosted on Vercel.
