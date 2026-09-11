# What I built

A buyer talks an enquiry into existence, it goes out to suppliers on a channel
they choose, the suppliers reply in whatever shape suits them, and the system
reads all of it into one side-by-side comparison the buyer can interrogate in
plain English, through to an award they can defend.

**Live:** https://kill-the-quote-spreadsheet.vercel.app

---

## The flow, in five steps

**1. Draft it by talking.** Type what you need in ordinary English. A co-pilot
builds the scope, 30 line items, a 10-question supplier questionnaire (6 of them
mandatory) and the commercial terms. It asks about what it cannot guess, assumes
sensible defaults for the rest, and tells you which ones it assumed. It will not
invent a price. Any category works, not just IT.

**2. A gate before it leaves the building.** The enquiry is held if a line says
"box" without saying how many are inside. Each hold shows what that ambiguity
would cost and offers a one-click fix. You can override it by typing a reason,
and that reason stays on the enquiry and turns up in the award note.

**3. Send on a channel you choose.** Email or WhatsApp. The choice has
consequences rather than being a label: WhatsApp cannot carry an attachment, so
the pack goes as a link, and on the way back that supplier's certificate does
not arrive either. Ten suppliers invited, five reply.

**4. Replies arrive in whatever shape.** Nobody is forced into a template:

| Supplier | What they sent |
|---|---|
| Zenith | Their own xlsx template, plus a Rev 2 that supersedes their Rev 1 |
| Cygnus | A 3-page PDF quotation |
| Orbit | A docx with prices written into sentences |
| Vector | A phone photograph of a printed rate card |
| Helios | A five-line email, 2 of 30 lines priced, no questionnaire |

Plus a 32-file stress set: odt, ods, csv, tsv, rtf, txt, broken files, and
photographs of falling quality.

**5. One comparison, then ask it things.** Same lines, same units, same
currency, with questionnaire answers and attached documents alongside the
numbers. Then you stop clicking and start asking.

---

## What is in it

**The comparison grid.** 150 cells (30 lines x 5 suppliers). Every cell carries
how it got there: the raw quote, the rule applied, the landed figure. Click any
cell to see the sentence in the source document it came from. One tab stop and
arrow keys, not 150 tab stops.

**Five kinds of nothing, not one dash.** Declined, never mentioned, cannot read
it, not a price, needs your call. Five different next actions, so five different
marks on screen.

**A trust bar that adds up.** Of 150 cells right now: 101 usable (14 of those
off-spec but counted), 49 excluded, 6 needing a human, 3 derived and awaiting
the supplier, 1 unreadable, 0 unread. The five parts are asserted to sum to the
total.

**Three qualification states, not two.** Passed, failed, and **not assessed**. A
supplier nobody has read is not a supplier who failed, and the screen never
claims a failure it has no evidence for.

**The questionnaire is read against its own evidence.** A supplier answers "yes,
we are ISO 27001 certified" and attaches a certificate for the withdrawn 2013
revision. The attachment is opened and read in its own right, and where the
answer and its evidence disagree, the document governs.

**Award scenarios.** Cheapest from anyone, cheapest among suppliers who can
actually be awarded, single supplier, and a strict like-for-like basis. When two
scenarios do not cover the same lines, the system says so and restates both on
the common basis.

**Chase.** The system works out what each supplier still owes, asks for only
that, with a deadline, and records it. It separates "they never sent it" from
"they sent something we cannot use as it stands", because those are different
conversations.

**Ask, in plain English.** Ten tools that compute. There is no calculator tool
you can hand two numbers to, no SQL, no arithmetic in prose. Answers come back
as text, markdown tables and bar charts, and every answer cites the cells it
used so you can click through to the source document.

**Four exports.** Award note, xlsx with the provenance in cell comments, CSV,
and a JSON audit bundle.

---

## What it says right now, on the live site

- Cheapest from anyone: **₹3.88 cr**
- Cheapest among suppliers who can actually be awarded: **₹4.05 cr**
- So doing it properly costs **₹16.7 lakh, 4.3%**

The cheaper number was never really available. It sat inside a supplier who
failed six mandatory items. These figures move by a few cells between reads,
because the reading is a real model call and nothing is fixtured.

---

## Where the AI is, and is not

Six model calls, listed completely in `AI-MAP.md`: drafting the enquiry, reading
a quotation, reading a questionnaire, reading an attached document, a cheap
second read of photograph crops, and the analyst. Nothing else talks to a model.

**The AI reads. The code counts.** The model reports what a document says, in the
supplier's own unit and currency. It never multiplies, converts, discounts or
adds. Every arithmetic step happens in ordinary code.

Only the delivery hop is stubbed. The four enquiry documents are really
generated, and everything that arrives is really read.

---

## How I know it is right

| Suite | What it proves |
|---|---|
| 442 assertions | Two independent calculators, one Python and one TypeScript, agree on all 150 cells |
| 47 reader cases | Every format, all 11 photographs, and 4 broken files |
| 65 regressions | Every bug that actually shipped, including three found this week |
| 16 questionnaire cases | Expired certificates, superseded standards, somebody else's certificate |
| 10 parse cases | Realistic bad model output: omitted nulls, invented line numbers |
| 8 generality cases | The product runs on a category it has never seen |
| accuracy harness | Recall, price exactness, unit correctness, invention rate, and whether confidence falls when accuracy falls |

`npm run verify` runs everything that costs nothing: types, lint and eight
offline suites.

---

## Stack

Next.js App Router, React, Tailwind, shadcn/ui. Embedded Postgres (PGlite)
locally with no setup, Neon in production, switched on one environment
variable. Anthropic or Gemini behind one interface, switched on another. Hosted
on Vercel.
