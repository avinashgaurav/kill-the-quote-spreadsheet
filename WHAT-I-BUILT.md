# Kill the Quote Spreadsheet

**Live:** https://kill-the-quote-spreadsheet.vercel.app

A buyer talks an enquiry into existence. It goes out to suppliers on a channel
they pick. Suppliers reply in any format they like. The system reads every reply
into one comparison, same lines, same units, same currency, and the buyer then
questions it in plain English and awards from it.

**The short version.** 150 cells read from five replies in five formats,
including a phone photograph and a five-line email. One comparison, normalised
to the asked unit and to rupees, where every cell can say where it came from and
49 of them are deliberately excluded and labelled. The VP's question answers in
twelve seconds: ₹4.05 cr across three suppliers, against ₹3.88 cr if you ignore
the questionnaire, so compliance costs ₹16.7 lakh. It refuses to answer what it
cannot source. The measured limit: on one degraded photograph the reader was 52%
accurate and 90% confident, which is in this document because it is the honest
edge of the claim.

**Category:** enterprise IT hardware. **Personas:** a category buyer who owns
the enquiry, a VP who asks the hard question late, and a CFO who has to accept
the answer. **Size:** 30 line items, 10 suppliers invited of whom 5 reply, a
10-question questionnaire with 6 mandatory, and attached certificates. The
dataset is fabricated, as the brief asked.

---

## The four days this removes

The buyer loses three days retyping five replies into Excel, then the VP asks
one question and loses the fourth.

The retyping is the obvious target and the easy one. The fourth day is the
valuable one, because *"split it cheapest per line, but only among suppliers who
cleared the quality questionnaire"* is not a formatting problem. It needs the
system to know who cleared the questionnaire, which needs somebody to have read
the certificates, which nobody has. That question now takes twelve seconds, and
so does the one after it.

---

## The workflow, end to end

**1. Draft it by talking.** The buyer types what they need in ordinary English:
*"I need to refresh IT hardware for 14 retail sites in Tamil Nadu. Laptops for
the store managers, a small server per region, network switches. Delivered in
phases from March."* The co-pilot returns scope, line items, a supplier
questionnaire and commercial terms. It asks about what it cannot guess, assumes
defaults for the rest, and says which ones it assumed. It has no price field at
all, so it cannot invent a number.

**2. A gate before it leaves the building.** The enquiry is held if a line says
"box" without saying how many are inside, or is missing a quantity, a unit or a
line number. Each hold says what a supplier could legitimately do with the
ambiguity. The buyer can override any hold by typing a reason, and that reason
is printed in the award note. An unclickable button just gets worked around by
editing the draft until the check stops firing, which leaves no record at all.

**3. Choose a channel.** Email, a portal link, or WhatsApp, per supplier. The
choice has consequences: WhatsApp cannot carry an attachment, so the pack goes
as a link, and on the way back whichever supplier you invited that way has their
certificate stripped too. Their answer to *"are you ISO 27001 certified?"* then
has nothing behind it, and the reason is a choice the buyer made two steps
earlier.

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
question was left blank, the buyer asks again for only that, with a deadline,
without re-sending the whole enquiry. The system works out what each supplier
still owes and drafts the message. It separates two things that look identical
on screen and are not the same conversation: **a gap** (they never sent it) and
**a dispute** (they sent something that cannot be used as it stands). Eight
reasons to go back: no price, unreadable price, not a price, a price derived
from a prior order, a price carried forward, a question unanswered, a question
answered with no document, and a term not stated. The buyer closes each with a
reason; nothing closes itself.

**7. Then stop clicking and start asking.** Plain English, over the whole
comparison. Text, tables and charts, and four exports.

---

## The ugly edges

The brief names four. Here is what the system does with each, and what the buyer
sees.

| The edge | What it does | What the buyer sees |
|---|---|---|
| **The angled photo** | Vector's rate card is a phone photograph. The eight highest-value numbers on it get a second, independent read of just that crop, on a different model that is not shown the first answer | The number, the crop it came from, and the result of the second read. If the two disagree, confidence is forced down and the cell moves to "needs your call" |
| **The supplier who quoted 27 of 30 lines** | Four of the five did this: they priced 24, 24, 21 and 5 of 30. Nothing is interpolated, estimated or filled in | The missing cells are marked, counted and excluded from every total. Only Zenith priced all 30, so the answer says the others cannot be compared on an overall total and gives the per-line split instead |
| **The one who quoted in USD** | Cygnus priced nine lines in USD. Converted at 88.4, the supplier's own stated rate from page 1 of their quote | The rupee figure, the rate, where the rate came from, and a warning that the quote is ex-works Singapore so it is not a delivered cost and is not comparable with a FOR-destination price |
| **"Per box" is someone else's "per 100 pieces"** | Line 13 asks for a 32GB matched kit of 2x16GB. Vector quoted ₹9,600 per DIMM. The kit is two DIMMs, so the comparable figure is ₹19,200 | ₹9,600 is the cheapest number on that row and the wrong one. The cell shows ₹19,200, the doubling, and the sentence it was read from |

All four edges meet on line 13:

| Supplier | What they wrote | Comparable figure |
|---|---|---|
| Zenith | ₹18,900 per kit | ₹18,900 |
| Cygnus | USD 198 per kit | ₹17,503, flagged ex-works |
| Orbit | ₹19,200 "per kit" | ₹19,200, unit synonym, number unchanged |
| Vector | ₹9,600 per DIMM, off the photograph | ₹19,200, doubled |
| Helios | "rest we'll match Zenith" | Not a price. Excluded |

**Where there is no rule, it refuses.** Five cells could not be converted
safely, and the trace on each says *"refused rather than guessed at a factor"*.
They are excluded from every total and put in front of a human. A wrong number
that looks right is worse than a gap that is labelled.

**The confidence score is not the safeguard, and I can prove it.** I read the
same rate card as five photographs of falling quality. The fourth came back 52%
accurate, at 0.90 confidence on every wrong digit. So the second read is not
triggered by low confidence, which would never have fired on that image. It is
triggered by **money**: the eight largest numbers on any photograph get checked
independently, whatever the model claims about them, and a disagreement
overrides the confidence rather than the other way round. What remains open is
that a cell below that threshold can still be read, plausible and wrong, and
nothing on the screen would know. That is the top open risk in this build.

---

## What earns the trust

A buyer with ₹4 crore on the line needs to know what the total does and does not
rest on before they act on it.

**Every cell is in exactly one of five buckets, and they are checked to add up.**
101 + 6 + 3 + 40 + 0 = 150, asserted on every run.

| Bucket | Cells | What it means |
|---|---|---|
| Usable | 101 | In the total. 14 of them off-spec but counted |
| No price | 40 | Declined, never mentioned, or not a rankable price |
| Needs a human | 6 | 5 refused conversions, and 1 price that exists and could not be read |
| Derived, awaiting supplier | 3 | Taken from a prior order, not counted until confirmed |
| Not read | 0 | Ours to fix, not theirs |

That reconciles with the reply table above: 104 cells carry a number (101 usable
plus 3 awaiting confirmation), and 46 do not (40 with no price, 6 needing a
person).

**Three qualification states, not two.** Passed, failed, and **not assessed**.
Vector sent a questionnaire and a certificate, both were read, and they failed
all six mandatory questions. Cygnus and Helios never sent a questionnaire, so
they are carried as **not assessed**: not passed, not failed, and the system
says so every time it names them. Dropping a real bid because nobody chased a
document is the expensive mistake; claiming a failure you have no evidence for
is the dangerous one.

**The attachment governs.** A supplier answers *"yes, we are ISO 27001
certified"* and attaches a certificate for the withdrawn 2013 revision. The
certificate gets its own read, and where the answer and the document disagree,
the document wins. A model asked "did they pass?" says yes, because they said
yes, so comparing a date to today is left to code.

**Eight assumptions, each with its source, each changeable.** The FX rate of
88.4, sourced to Cygnus's own quote page 1, with the RBI reference rate as the
stated alternative. Comparison at the asked quantity. Cygnus's warranty basis.
Cygnus's footnote discount and Vector's handwritten early-payment discount, both
excluded. Zenith's 2.5%, applied at total level only. Ex-GST throughout. Freight
and duty excluded. The buyer changes any of them and the total moves.

**Nothing is added up in prose.** Ten tools compute: overview, query lines, run
an award scenario, compare scenarios, check the questionnaire, list excluded
cells, list conditional offers, list assumptions, get provenance, make a chart.
No calculator tool you can hand two numbers to, and no SQL. Every figure in an
answer came from one of those ten, and the answer lists the cells it used.

---

## The award it produces

Cheapest per line among suppliers who can actually be awarded:

| Supplier | Lines | Value |
|---|---|---|
| Zenith Infotech Solutions | 17 | ₹1.85 cr |
| Cygnus Technologies India | 12 | ₹1.46 cr |
| Helios Enterprise Solutions | 1 | ₹73.4 lakh |
| **Total** | **30** | **₹4.05 cr** |

Against ₹3.88 cr if you take the cheapest from anyone, so **doing it properly
costs ₹16.7 lakh, 4.3%.** The cheaper number was never available: it sat inside
Vector, who cannot be awarded at any price.

**And two correct numbers can still mislead.** The strict award, which drops
substitutions and below-spec offers, looks ₹45.3 lakh cheaper and is ₹5.0 lakh
*dearer* on the lines they share, because it covers 28 lines instead of 30. Both
numbers are right, which is why a careful person misses it. So whenever two
scenarios cover different lines, the system says so and restates both on the
common basis before showing either total.

---

## The analyst conversation

These are the questions I chose, and why each one is on the list.

| The question | Why it is worth asking |
|---|---|
| Is Vector's ISO 27001 certificate actually valid? | The answer and its own evidence disagree. Tests whether the attachment was really opened |
| Split it cheapest per line, but only among suppliers who cleared the quality questionnaire | The VP's question from the brief, verbatim. The one that cost the fourth day |
| What did that change against taking the cheapest from anyone? | Makes the system price its own compliance, and lead with coverage before money |
| Which numbers are you least sure about, biggest rupee impact first? | Asks the system to rank its own uncertainty by money |
| What would we save by dropping the ISO 27001 requirement? | A question with an uncomfortable answer, to see whether it computes it anyway |
| Chart the split award by supplier | Thirty lines, coloured by winner, in one picture |
| Draft the award recommendation and say what it rests on | The defensible award decision the brief ends on |
| Which of these suppliers has the best reputation in the market? | It must refuse. This is the most persuasive moment in the demo |

The answer to the VP's question is the award table above, and it arrives with
this attached to it, unprompted:

> **Important Qualification Note:** While Zenith was assessed and passed the
> questionnaire, **Cygnus and Helios were NOT ASSESSED**. Nobody has read their
> questionnaires yet. They are included in this scenario because the system
> carries unread suppliers as eligible rather than dropping their bids, but they
> have not actually cleared the quality checks.

That paragraph is the product. Two more, shortened:

- *What would we save by dropping the ISO 27001 requirement?* **"Nothing (₹0).**
  The only supplier who failed the ISO 27001 question is Vector Digital Systems.
  However, they also failed five other mandatory questions, so dropping just
  this one would not make them eligible."
- *Which supplier has the best reputation in the market?* **"I do not have data
  on these suppliers' market reputations.** My answers are based strictly on the
  data extracted from their quotations." It then offers the one thing it does
  have: who supplied enterprise references against question 8.

---

## The one rule: nothing is hardcoded

The brief says *don't fake the extraction, don't fake the reasoning, don't
hardcode the answers to your demo questions.* Only the delivery hop is stubbed.
Nothing is emailed and no mailbox is polled. The four enquiry documents are
really generated, and everything that arrives is really read. Extraction is
cached on the model, the prompt and the file, so change one byte of a supplier's
document and it reads it again.

There are no branches on question text, no stored pass or fail verdict, and no
arithmetic rule keyed to a supplier or a line number.

**Two violations of this were found and fixed, and finding them is the point.**
The analyst's questionnaire tool used to serve a pass/fail boolean and a
hand-typed finding out of a catalog file, so the suggested demo question *"is
Vector's ISO 27001 certificate actually valid?"* was answered by handing the
model my own conclusion. And that finding did not survive a real read either:
the revision year lives inside the attached PDF, which nothing ever opened, so
reading the form alone made Vector look like it passed the ISO question. Both
are derived now, and three regression tests pin them, including one asserting
that the form alone must not produce the finding.

**Six model calls, and nothing else in the product talks to a model.**

| # | The call | What it is asked | What it may not do |
|---|---|---|---|
| 1 | Draft the enquiry | Turn a sentence into scope, lines, questionnaire and terms | Invent a price. There is no price field |
| 2 | Read a quotation | What does this document say, line by line, in the supplier's own unit and currency | Convert, multiply, discount, add or rank |
| 3 | Re-read a crop | Read the number in this crop, on a cheaper model | See the first read's answer |
| 4 | Read a questionnaire | What did they answer, and what did they attach | Decide whether it passes |
| 5 | Read an attached document | What does this certificate actually say | Be told what the answer claimed |
| 6 | The analyst | Answer the buyer's question using these ten tools | Do arithmetic. Every number comes from a tool |

**The AI reads. The code counts.** Every arithmetic step happens in ordinary
code, and I wrote that calculator twice, in Python and in TypeScript, so the
total cannot drift between two runs. A test proves the two agree on all 150
cells.

---

## Features

**Drafting** · talk an enquiry into existence, in any category · underspecified
lines held before send · override with a reason that reaches the award note ·
four documents generated per enquiry

**Sending and receiving** · three channels with real per-channel consequences ·
invite any subset of a 10-supplier roster · replies in xlsx, pdf, docx, eml,
photographs, odt, ods, csv, tsv, rtf, txt · upload a quotation from a company
that appears nowhere in the dataset and it gets its own column · a revision
supersedes an earlier quote and reports what moved

**The comparison** · per-cell provenance: raw quote, rule applied, landed
figure, the sentence it came from · five distinct marks for five kinds of
missing · trust bar checked to sum to the total · questionnaire answers and
attached documents alongside · the whole grid is one keyboard tab stop, not 150

**Chasing** · per-supplier list of what is owed · gap versus dispute · drafted
message asking for only the missing items, with a deadline · closed by the
buyer with a reason

**Asking** · plain-English questions · text, tables, bar charts · answers cite
the cells they used, clickable to source · four award scenarios · a changeable
assumption ledger · refuses, with a reason, rather than answering from outside
the data

**Exports** · award note: the total, why not the cheapest, what it rests on, the
assumptions, the money deliberately not counted, who was asked for what and
whether they replied · xlsx with the provenance in cell comments · CSV · JSON
audit bundle

---

## How I know the reading is right

The readers are scored against a held-out answer key the running app never
touches. Across five formats and 107 of 107 lines: **100% on price, 100% on
unit, nothing invented.** Then the same rate card as five photographs of falling
quality, where the fourth scored 52%. That number is in this document because it
is the honest limit of the claim.

Nine further suites run offline with no API key: the two independent calculators
agreed cell-for-cell across 442 assertions, 47 reader cases cover every format
and all 11 photographs (Vector's rate card, five quality variants of it, and
five more in a 31-file stress set that includes 4 deliberately broken files), 16
questionnaire cases cover expired and superseded certificates, and 67 regression
tests hold one case for every bug that actually shipped.

---

## Stack

Next.js App Router, React, Tailwind, shadcn/ui, hosted on Vercel. Postgres,
embedded locally with no setup and Neon in production. Model-agnostic by design,
Anthropic or Gemini behind one interface, so a suspect read can be retested on a
different model.
