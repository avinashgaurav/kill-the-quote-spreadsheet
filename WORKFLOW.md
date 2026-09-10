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

## Step 3. Send it

**You pick a channel:** email, supplier portal, or WhatsApp.

The four documents are really generated and downloadable. Only the delivery hop is
faked, which the brief permits.

**The channel is not cosmetic.** WhatsApp cannot carry an attachment, so the pack goes
as a link, and the supplier who gets a link on their phone is the one most likely to
reply with a photo of a rate card. Your choice at step 3 becomes the hardest input at
step 4.

---

## Step 4. Drop in whatever comes back

**You upload** whatever the suppliers sent. Spreadsheet, PDF on letterhead, Word letter
with prices in sentences, phone photo of a printed rate card, five-line email, ODT, CSV,
scanned PDF. Nobody is forced into a template.

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

**The guard worth knowing about:** if two award scenarios do not cover the same set of
lines, the system says so and restates both on the common basis. One scenario looks
₹30 lakh cheaper and is ₹1 lakh dearer like-for-like, because it awards fewer lines.
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
- Let harness data look like a real read.

---

# What is real and what is stubbed

| | |
|---|---|
| **Real** | Drafting, reading, and answering: three model calls, no lookup tables |
| **Real** | The calculator, proven against an independent implementation, 442 assertions |
| **Real** | The four enquiry documents, generated and downloadable |
| **Real** | The chase record: what was asked, when, and whether they answered |
| **Stubbed** | The delivery hop. No SMTP server, no WhatsApp API. The brief permits this. |

---

# Testing

| Suite | Checks | Result |
|---|---|---|
| Conformance | Two calculators agree on all 150 cells | 442 assertions ✅ |
| Readers | Every format, all 11 images, 4 corrupt files must fail | 47/47 ✅ |
| Parser | 10 realistic model output shapes | 10/10 ✅ |
| Revisions | A replaced quote resolves, reports, re-reads the same | 7/7 ✅ |
| Generality | Runs on an enquiry it has never seen | 8/8 ✅ |
| Regressions | Ten bugs that shipped cannot return unnoticed | 10/10 ✅ |
| End to end | Happy and sad paths over real HTTP | 38/38 ✅ |
| Demo | Ten walkthrough claims against the brief | 10/10 ✅ |
| Contrast | Every text node measured in the browser | 0 failures ✅ |
| Build, types, lint, audit | Production build, 0 vulnerabilities | ✅ |

**One gap:** extraction *accuracy* against a live model is unmeasured. The harness exists
and runs; it needs an API key.
