# What it does, in order

The tool has one job: get a buyer from *"I need to buy something"* to *"here is the
award, and here is why"*, without a spreadsheet.

Six steps. Each one says what you do, what the system does, and what it refuses to do.

---

## Step 1. Say what you need

**You type**, in your own words: *"I need 15 business laptops for the Bengaluru sales
team, delivered next month, 3-year onsite warranty."*

**The system** asks about what it cannot guess (quantities, locations, the warranty
term you actually need) and assumes sensible defaults for what it can (tax basis,
ordinary payment terms), telling you which it assumed. Then it drafts the four parts of
an enquiry:

| Part | Plain English |
|---|---|
| **Scope** | The story. What, for whom, delivered where, by when, what "done" means. |
| **Line items** | The shopping list as a table, each with a unit and a quantity. |
| **Questionnaire** | Prove you are allowed to sell this to us. Mandatory vs nice-to-know. |
| **Terms** | The rules of the deal, so five prices mean the same thing. |

**It will not** invent a price or an estimate. It has no view on what things cost, and a
made-up number that looks like intelligence is worse than no number.

---

## Step 2. Fix what would come back wrong

Before anything goes out, the enquiry is checked. Not by the model that wrote it, but by
code, so the model cannot certify its way past its own draft.

**The one that matters most:** a line whose unit is "box" without saying how many are
inside it. One supplier prices the box, another prices a single piece, and the second
bid looks five times cheaper while being dearer. **Both suppliers answered the question
you actually asked**, so nothing downstream can fix it.

Each problem comes back with three things:

- **What is wrong**, in your language
- **What it would cost** if it ships
- **A fix you can apply with one click** ("one box contains 25 pieces")

**And an escape hatch.** You can send it anyway, with a reason, and the reason is
recorded on the enquiry. That is deliberate: an unclickable button gets worked around by
editing the draft until the check stops firing, and that leaves no record at all. If a
supplier later quotes per piece against that line, the comparison can show it went out
ambiguous and who decided that.

---

## Step 3. Send it, and collect what comes back

**You pick who to invite** from a roster of ten suppliers, and **you pick a channel:**
email, supplier portal, or WhatsApp. Press send and the replies arrive, one at a time.

**Five of the ten reply. Five never do.** That asymmetry is deliberate and it is what
actually happens: you invite ten and five answer. A version where everybody replies
teaches the wrong lesson, because every interesting state in this product is one where
somebody did not. Invite a supplier with nothing on file and you get *"no response.
Invited, sent nothing"*, which is the case step 6 exists for.

**Exactly one thing is simulated.** Nothing is emailed and no mailbox is polled: a
supplier replies because their document is on file and you invited them. That is the
SMTP server the brief says to stub. Everything that arrives is then **read for real**,
through the identical path as a file you drag in: same model call, same schema, same
provenance, same loud failure on an empty read. No answer is pre-written and none is
stored beside a file.

A button that makes prepared answers appear is a scripted demo. A button that makes
real documents arrive, which are then genuinely read, is a stubbed transport. The
screen says which of those it is doing.

Documents arrive in the order they really would: the quotation first, from somebody in
sales, and the questionnaire afterwards from somebody in compliance, on a different
day in a different format. That gap is why a supplier can be priced and unassessed at
the same time.

**The channel is not cosmetic.** WhatsApp cannot carry an attachment, so the pack goes
as a link, and the supplier who gets a link on their phone is the one most likely to
reply with a photo of a rate card. Your choice at step 3 becomes the hardest input at
step 4.

---

## Step 4. Drop in whatever comes back

**Or upload it yourself.** Spreadsheet, PDF on letterhead, Word letter with prices in
sentences, phone photo of a printed rate card, five-line email, ODT, CSV, scanned PDF.
Nobody is forced into a template.

**A file from a supplier the system has never heard of works too.** If the filename
matches nobody, the upload is refused rather than guessed, because a price in the wrong
column is a mistake nobody downstream can detect. It then asks whose it is, offers the
roster, and takes a new name. That supplier gets their own column, is marked NOT
ASSESSED, can be chased, and appears in the award note.

**Questionnaire responses are read by their own loop.** The model reports the answer,
what they attached, and what the attachment itself says: the standard it names, its
expiry date, who it was issued to. Code then decides whether that satisfies the
question.

**The system reads each one** with a real model call and turns it into structured facts,
each traceable to the exact spreadsheet cell, PDF page, paragraph, or pixel box it came
from.

For photographs it goes further: each value's box is cropped out and **read again** by a
separate call with no surrounding context. Two reads that agree is evidence. Two that
disagree drops the confidence and sends the cell to a person.

**Every document reports how sure it is:** average confidence, weakest confidence, and
which line is weakest. Three numbers, not one, because a document can average 93% and
still contain the single 30% cell that decides the award.

**It refuses to:**
- guess a price it cannot read (that comes back as `?`, "can't read it")
- convert a unit when the supplier never gave the fact needed to convert it
- store a number that cannot say where it came from (a database constraint, not a rule)
- report success on a read that found nothing

---

## Step 5. Look at one comparison

30 lines by 5 suppliers. Same units, same currency, computed by code, never by the model.

**When a cell has no number, it says which kind of nothing:**

| Mark | Means | You do |
|---|---|---|
| `NQ` | They declined | Nothing. It is an answer. |
| `·` | Never mentioned it | Chase them |
| `?` | A value is there and we can't read it | Open the original |
| `~` | Not a price ("same as our March rates") | Ask for a number |
| `!` | Needs your judgement | Decide |

**Click any number** to see where it came from: the cell address, the page, the crop of
the photograph, and the supplier's own words.

**The trust bar** says what the total rests on: how many cells are in it, how many are
blocked on you, how many are blocked on the supplier, how many have no price. Those four
groups do not overlap, and a test asserts they sum to the total on every run.

**Qualification has three states, not two.** Passed, failed, and **not read**. A
supplier whose questionnaire nobody has opened is not the same as one who passed, and
the screen must never merge them. Every failure carries the sentence that produced it:

> *Answered "Yes" and attached ISO/IEC 27001:2013, EXPIRED 2025-11-30, but the question
> asks for the 2022 revision. The 2013 revision was superseded, so this certificate does
> not evidence the answer.*

An unassessed supplier stays in the award scenarios, because excluding a real bid for
want of a document nobody chased is its own kind of wrong.

**The guard worth knowing about:** if two award scenarios do not cover the same set of
lines, the system says so and restates both on the common basis. One scenario looks
₹77.5 lakh cheaper and is ₹4.1 lakh dearer like-for-like, because it awards 27 lines
of 30.
Both numbers are correct, which is why a careful person misses it.

---

## Step 6. Go back and ask for what is missing

The commonest reply in procurement is a spreadsheet and nothing else: no questionnaire,
no terms, six of thirty lines priced. So this is a step, not an afterthought.

**The system works out what each supplier still owes**, ordered by money at risk, and
splits it into two kinds because they are different conversations:

- **Never sent** → *"please send us a price for lines 15, 16 and 17"*
- **Sent, but we cannot use it as it stands** → *"please confirm the figure on line 14,
  we cannot read it on the copy you sent"*

Telling a supplier they "did not provide pricing" when they did reads as though nobody
opened their file, and it burns the goodwill you need for the items that matter.

**Every request carries a deadline** (6 days by default, yours to change). "No reply"
means nothing without a date it was due.

**It refuses to send an empty or redundant request.** Nothing they already sent is
re-requested.

**If they still do not answer**, you can proceed, and the decision is recorded with a
reason. The award note then says *"asked on the 10th, due the 16th, no response"* rather
than *"missing"*. Those are different facts, and only the first one lets you award
around them and defend it.

---

## Step 7. Ask questions, then award

**You type questions in plain English** over the whole comparison. Real model calls, not
canned answers. It has ten tools it can use to query the actual data, and every answer
cites the cells it used.

> *"Why isn't Vector's transceiver the cheapest?"*
> *"Which numbers am I least sure about, biggest rupee impact first?"*
> *"Compare strict compliance against normal compliance."*
> *"Draft the award recommendation and say what it rests on."*

**It refuses** to answer from anything but the extracted data, and says so when it
cannot answer.

**Then export:** the award note, the full comparison, and an audit bundle. The award note
includes who was asked for what, when it was due, and whether they answered.

---

# What it will not do, in one list

Reading this list is the fastest way to understand the product.

- Do arithmetic with the AI. The AI reads; code counts.
- Guess a price it cannot read.
- Convert a unit without the fact needed to convert it.
- Store a number with no source.
- Report success on a read that found nothing.
- Send an ambiguous enquiry without you saying, on the record, that you meant to.
- Send a supplier a request for something they already sent.
- Count a conditional discount in a ranking.
- Compare two totals that cover different sets of lines without saying so.
- Recommend awarding to a supplier who failed a mandatory question.
- Show a supplier nobody has assessed as "eligible".
- Store a qualification verdict. It is recomputed from the answers every read, so a
  certificate that expires next week changes it without anybody editing a row.
- Guess which supplier sent an unrecognised file.
- Invent a reply for a supplier who did not send one.
- Let harness data look like a real read.

---

# What is real and what is stubbed

| | |
|---|---|
| **Real** | Drafting, reading, and answering: three model calls, no lookup tables |
| **Real** | The calculator, proven against an independent implementation, 442 assertions |
| **Real** | The four enquiry documents, generated and downloadable |
| **Real** | The chase record: what was asked, when, and whether they answered |
| **Real** | Every qualification verdict, derived from answers that were actually read |
| **Stubbed** | The delivery hop only. No SMTP server, no WhatsApp API, no mailbox polled. The brief permits this. |

---

# Testing

`npm run verify` runs everything below that costs nothing: types, lint, and the
eight suites. No API key, no network, about forty seconds.

| Suite | Checks | Result | Needs a key |
|---|---|---|---|
| Conformance | Two calculators agree on all 150 cells | 442 assertions ✅ | no |
| Readers | Every format, all 11 photographs, and 4 broken files: 3 refused with instructions, 1 (a truncated PDF) correctly routed to vision | 47/47 ✅ | no |
| Parser | 10 realistic model output shapes | 10/10 ✅ | no |
| Revisions | A replaced quote resolves, reports, re-reads the same | 7/7 ✅ | no |
| Generality | Runs on an enquiry it has never seen, in another category | 8/8 ✅ | no |
| Questionnaire | Verdicts derived from evidence, each able to say why, and the finding that needs the ATTACHMENT opened | 16/16 ✅ | no |
| Contrast | Every colour that carries meaning, against its WCAG floor, in both themes, with the oklch maths checked against a real browser first | pass ✅ | no |
| Cache | The extraction cache stores, returns, and misses for the right reasons | 6/6 ✅ | no |
| Regressions | 39 bugs that shipped cannot return unnoticed | 39/39 ✅ | no |
| End to end | Happy and sad paths over HTTP, plus an interviewer's own file | 42 cases | yes |
| Demo | Ten walkthrough claims against the brief | 10/10 | yes |
| Accuracy | Recall, price exactness, unit correctness, invention rate, and whether confidence falls when accuracy falls | measured, see below | yes |
| Build, types, lint, audit | Production build, warning-free, 0 vulnerabilities | ✅ | no |

**Measured extraction accuracy** (Gemini 3.1 Pro): across an xlsx, a 3-page PDF, a
docx with prices in prose, a photograph and a 5-line email, **107 of 107 lines
returned, 100% price exactness, 100% unit correctness, nothing invented**, with
confidence tracking difficulty unprompted (1.00 / 1.00 / 0.81 / 0.95 / 0.40).

**And the finding that matters more.** On the five-photograph degradation set, the
fourth (low light, motion blur) read at **52% price accuracy with 0.90 confidence on
every wrong digit**: 59900 for 57900, 5600 for 9600, 260 for 268. Confidence did not
fall when accuracy did, which is the one failure this whole design exists to prevent.
The harness now scores every photograph rather than the easiest and hardest only,
which is how the case in the middle went unnoticed. Whether the crop re-read catches
it in the product is the open question; that needs credit to answer.
