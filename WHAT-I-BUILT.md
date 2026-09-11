# Kill the Quote Spreadsheet

**Live:** https://kill-the-quote-spreadsheet.vercel.app

A buyer talks an enquiry into existence. It goes out to suppliers on a channel
they pick. Suppliers reply in any format they like. The system reads every reply
into one comparison, same lines, same units, same currency, and the buyer then
questions it in plain English and awards from it.

Category: **enterprise IT hardware.** 30 line items, 10 suppliers invited of
whom 5 reply, a 10-question questionnaire with 6 mandatory, and attached
certificates. The dataset is fabricated, as the brief asked.

---

## The four days this removes

The buyer loses three days retyping five replies into Excel, then the VP asks
one question and loses the fourth.

The retyping is the obvious target and the easy one. The fourth day is the
valuable one, because *"split it cheapest per line, but only among suppliers who
cleared the quality questionnaire"* is not a formatting problem. It needs the
system to know who cleared the questionnaire, which needs somebody to have read
the certificates, which nobody has. That question now takes eight seconds, and
so does the one after it.

---

## The workflow, end to end

**1. Draft it by talking.** The buyer types what they need in ordinary English:
*"I need to refresh IT hardware for 14 retail sites in Tamil Nadu. Laptops for
the store managers, a small server per region, network switches. Delivered in
phases from March."* The co-pilot comes back with scope, line items, a supplier
questionnaire and commercial terms. It asks about what it cannot guess, assumes
defaults for the rest, and says which ones it assumed. It has no price field at
all, so it cannot invent a number.

**2. A gate before it leaves the building.** The enquiry is held if a line says
"box" without saying how many are inside, or is missing a quantity, a unit or a
line number. Each hold says what a supplier could legitimately do with the
ambiguity. The buyer can override any hold by typing a reason, and that reason
is printed in the award note. An unclickable button just gets worked around by
editing the draft until the check stops firing, which leaves no record at all.

**3. Choose a channel.** Email, a portal link, or WhatsApp. The choice has
consequences: WhatsApp cannot carry an attachment, so the pack goes as a link,
and on the way back that supplier's certificate does not arrive either, which is
why their questionnaire answer later has nothing behind it.

**4. Replies arrive in whatever shape.** Nobody is forced into a template.

| Supplier | What they sent | Lines priced |
|---|---|---|
| Zenith | Their own xlsx template, plus a Rev 2 that supersedes their Rev 1 | 30 of 30 |
| Cygnus | A 3-page PDF, nine lines in USD, discount in a footnote on page 2 | 24 of 30 |
| Orbit | A docx with the commercials written into sentences | 24 of 30 |
| Vector | A photograph of a printed rate card, taken at an angle on a phone | 21 of 30 |
| Helios | A five-line email: two lines priced, no questionnaire, no terms | 5 of 30 |

**5. One comparison.** 150 cells, 30 lines by 5 suppliers, in one screen. Same
lines, same units, same currency, with questionnaire answers and attached
documents beside the numbers.

**6. Go back and ask.** Where a figure could not be read, or a mandatory
question was left blank, the buyer can ask again without re-sending the whole
enquiry. The system works out what each supplier still owes and drafts a message
asking for only that, with a deadline. It separates two things that look
identical on screen and are not the same conversation: **a gap** (they never
sent it) and **a dispute** (they sent something that cannot be used as it
stands). Eight reasons to go back, and the buyer closes each with a reason.

**7. Then stop clicking and start asking.** Plain English, over the whole
comparison. Text, tables and charts, and four exports.

---

## The ugly edges

The brief names four. Here is what the system does with each, and what the buyer
sees.

| The edge | What it does | What the buyer sees |
|---|---|---|
| **The angled photo** | Vector's rate card is a phone photograph. It is read, and low-confidence figures get a second, independent read of just that crop | The number, with the crop it came from, and a confidence mark. Where the two reads disagree the cell goes to "needs your call" |
| **The supplier who quoted 27 of 30 lines** | Four of the five did this: they priced 24, 24, 21 and 5 of 30. Nothing is interpolated, estimated or filled in | The missing cells are marked, counted and excluded from every total. Only one supplier priced all 30, so the answer says the others cannot be compared on an overall total, and gives the per-line split instead |
| **The one who quoted in USD** | Cygnus priced nine lines in USD. Converted at 88.4, the supplier's own stated rate from page 1 of their quote | The rupee figure, the rate, where the rate came from, and a warning that the quote is ex-works Singapore so it is not a delivered cost |
| **"Per box" is someone else's "per 100 pieces"** | Line 13 asks for a 32GB matched kit of 2x16GB. Vector quoted ₹9,600 per DIMM. Code doubles it to ₹19,200 | ₹9,600 is the cheapest number on that row and the wrong one. The cell shows ₹19,200, the ×2, and why |

**Line 13 is the whole assignment in one row.** All four edges meet on it:

| Supplier | What they wrote | Landed |
|---|---|---|
| Zenith | ₹18,900 per kit | ₹18,900 |
| Cygnus | USD 198 per kit | ₹17,503, flagged ex-works |
| Orbit | ₹19,200 "per kit" | ₹19,200, unit synonym, number unchanged |
| Vector | ₹9,600 per DIMM | ₹19,200, doubled |
| Helios | "rest we'll match Zenith" | Not a price. Excluded |

**And where there is no rule, it refuses.** Five cells on the live comparison
could not be converted safely, and the trace on each says *"refused rather than
guessed at a factor"*. They are excluded from every total and put in front of a
human. A wrong number that looks right is worse than a gap that is labelled.

---

## What earns the trust

A buyer with ₹4 crore on the line needs to know what the total does and does not
rest on before they act on it.

**Every cell is in exactly one of five buckets, and they are checked to add up.**
On the live comparison: `101 + 6 + 3 + 40 + 0 = 150`, asserted on every run.

| Bucket | Cells | What it means |
|---|---|---|
| Usable | 101 | In the total. 14 of them off-spec but counted |
| No price | 40 | Declined, never mentioned, or not a rankable price |
| Needs a human | 6 | Could not be normalised safely |
| Derived, awaiting supplier | 3 | Taken from a prior order, not counted until confirmed |
| Not read | 0 | Ours to fix, not theirs |

**Three qualification states, not two.** Passed, failed, and **not assessed**. A
supplier nobody has read is never shown as failed. Two of the five here are not
assessed, and the system says so every time it names them.

**The attachment governs.** A supplier answers *"yes, we are ISO 27001
certified"* and attaches a certificate for the withdrawn 2013 revision. The
attachment gets its own read, and where the answer and the document disagree,
the document wins. A model asked "did they pass?" says yes, because they said
yes, so comparing a date to today is left to code.

**Every assumption is on a ledger, with its source.** Eight of them here: the
FX rate and whose quote it came from, whether a footnote discount is in or out,
ex-GST throughout, freight and duty excluded. The buyer can change any of them
and watch the total move.

**Nothing is added up in prose.** The analyst has ten tools that compute. There
is no calculator tool you can hand two numbers to, and no SQL, so a number in an
answer came from a named tool, and the answer lists the cells it used.

**It refuses rather than guesses.** Ask *"which supplier has the best reputation
in the market?"* and it declines, says it only answers from the extracted data,
and then offers the one thing it does have: who supplied enterprise references
against question 8.

---

## The headline it produces

- Cheapest from anyone: **₹3.88 cr**
- Cheapest among suppliers who can actually be awarded: **₹4.05 cr**
- So doing it properly costs **₹16.7 lakh, 4.3%**

The cheaper number was never available. It sat inside Vector, who failed all six
mandatory questions and cannot be awarded at any price.

**And two correct numbers can still mislead.** The strict award, which drops
substitutions and below-spec offers, looks ₹45.3 lakh cheaper and is ₹5.0 lakh
*dearer* on the lines they share, because it covers 28 lines instead of 30. Both
numbers are right, which is why a careful person misses it. So whenever two
scenarios cover different lines, the system says so and restates both on the
common basis before showing either total.

---

## Feature list

**Drafting**
- Talk an enquiry into existence: scope, line items, questionnaire, terms
- Works in any category, not just IT
- Underspecified lines flagged before send, with what a supplier could do with them
- Override any flag with a reason that reaches the award note
- Four documents generated per enquiry, downloadable

**Sending and receiving**
- Three channels, with real consequences per channel
- Invite any subset of a 10-supplier roster
- Replies in xlsx, pdf, docx, eml, photographs, odt, ods, csv, tsv, rtf, txt
- Upload a quotation from a company that appears nowhere in the dataset
- A revision supersedes an earlier quote and reports what moved

**The comparison**
- 150 cells, one screen, normalised to the asked unit and to rupees
- Per-cell provenance: the raw quote, the rule applied, the landed figure, the sentence it was read from
- Five distinct marks for five kinds of missing, each with its own next action
- Trust bar whose parts are checked to sum to the total
- Questionnaire answers and attached documents alongside the numbers
- Keyboard navigable as one grid, not 150 tab stops

**Chasing**
- Per-supplier list of what is still owed
- Gap versus dispute, kept separate
- Drafted message asking for only the missing items, with a deadline
- Closed by the buyer with a reason, never automatically

**Asking**
- Plain-English questions over the whole comparison
- Text answers, markdown tables, bar charts
- Answers cite the cells they used, clickable through to the source
- Four award scenarios, including a strict like-for-like basis
- An assumption ledger the buyer can change
- Refuses, with a reason, rather than answering from outside the data

**Exports**
- Award note: the total, why not the cheapest, what it rests on, the assumptions, the money deliberately not counted, who was asked for what and whether they replied
- xlsx with the provenance in cell comments
- CSV
- JSON audit bundle

---

## Where the AI is, and where it is not

Six model calls. Nothing else in the product talks to a model.

| # | The call | What it is asked | What it may not do |
|---|---|---|---|
| 1 | Draft the enquiry | Turn a sentence into scope, lines, questionnaire and terms | Invent a price. There is no price field |
| 2 | Read a quotation | What does this document say, line by line, in the supplier's own unit and currency | Convert, multiply, discount, add or rank |
| 3 | Re-read a crop | Read these four digits again, from this crop, on a cheaper model | See the first read's answer |
| 4 | Read a questionnaire | What did they answer, and what did they attach | Decide whether it passes |
| 5 | Read an attached document | What does this certificate actually say | Be told what the answer claimed |
| 6 | The analyst | Answer the buyer's question using these ten tools | Do arithmetic. Every number comes from a tool |

**The AI reads. The code counts.** The model reports what a document says. Every
arithmetic step happens in ordinary code, in a fixed order, and there are two
independent implementations of that calculator, one in Python and one in
TypeScript, proven to agree on all 150 cells.

**Only the delivery hop is stubbed**, as the brief permits. Nothing is emailed
and no mailbox is polled. The four enquiry documents are really generated, and
everything that arrives is really read. Extraction is cached on the model, the
prompt and the file, so change one byte of a document and it genuinely re-reads.

---

## What is tested

`npm run verify` runs types, lint and nine suites, none of which needs an API
key or a network.

| Suite | What it checks |
|---|---|
| `conformance` | 442 assertions: the Python and TypeScript calculators agree on all 150 cells |
| `reader-test` | 47 cases: every format, all 11 photographs, 4 deliberately broken files |
| `regression-test` | 66 bugs that actually shipped, each with the sentence saying what it broke |
| `questionnaire-test` | 16 cases: expired certificates, superseded standards, somebody else's certificate |
| `parse-check` | 10 realistic bad model outputs: omitted nulls, invented line numbers |
| `generality-test` | 8 cases on a category the product has never seen |
| `revision-test` | 7 cases: a replaced quotation resolves and reports what moved |
| `cache-test` | 6 cases: the extraction cache stores, returns and misses for the right reasons |
| `contrast-test` | Every colour that carries meaning, against its WCAG floor, both themes |

Two more need a key: `e2e-test` over real HTTP, and `accuracy`, which scores
recall, price exactness, unit correctness and invention rate against a held-out
answer key the running app never reads.

There is also a 31-file stress set the readers are run against: 22 awkward
formats, 5 photographs of falling quality, and 4 deliberately broken files.

---

## Stack

Next.js App Router, React, Tailwind, shadcn/ui. Embedded Postgres locally with
no setup, Neon in production, switched on one environment variable. Anthropic or
Gemini behind one interface, switched on another. Hosted on Vercel.
