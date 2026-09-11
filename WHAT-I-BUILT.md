# Kill the Quote Spreadsheet

**Live:** https://kill-the-quote-spreadsheet.vercel.app

A buyer talks an enquiry into existence. It goes out to suppliers on whatever
channel they choose. Suppliers reply in any format they like. The system reads
every reply into one comparison, same lines, same units, same currency, and the
buyer questions it in plain English and awards from it.

## The short version

Five suppliers replied in five different formats, including a photograph of a
printed rate card taken at an angle and an email five lines long. The system
read all of it: **150 prices, and it can tell you where every single one came
from.** 54 of them are deliberately left out of the total, each with a reason
attached, because a number you cannot stand behind is worse than a gap you have
labelled.

Then the VP asks the question that used to cost a day. *Split it cheapest per
line, but only among suppliers who cleared the quality questionnaire.* **It
answers in ten seconds:** ₹4.05 crore across three suppliers, against ₹3.91
crore if you ignore the questionnaire. Doing it properly costs ₹13.6 lakh, and
now the buyer knows that before they sign rather than after.

Ask it something it cannot source and it refuses, and says why.

One number in this document is not flattering. On the fourth of five
photographs, the reader was 52% accurate and 90% confident. It is here because a tool that
handles ₹4 crore should be honest about its own edges, and because measuring
that is what led me to stop trusting confidence scores at all.

**Category:** enterprise IT hardware. **Who it is for:** a category buyer who
owns the enquiry, a VP who asks the hard question late, and a CFO who has to
accept the answer. **Size:** 30 line items, 10 suppliers invited of whom 5
reply, a 10-question questionnaire with 6 mandatory, and attached certificates.
The whole dataset is fabricated, as the brief asked.

---

## The four days this removes

Three days go into retyping five replies into Excel. Then the VP asks one
question and the fourth day goes too.

**The retyping is the easy day to win back.** Read the documents, put the numbers
in one place, done. Most of the work in this build is not that.

**The fourth day is the valuable one.** *"Split it cheapest per line, but only
among suppliers who cleared the quality questionnaire"* is not a formatting
problem. To answer it you need to know who actually cleared the questionnaire.
To know that, somebody has to have opened the certificates and checked the dates
on them. Nobody has. So the buyer spends a day opening PDFs, and still ends up
trusting what each supplier said about themselves.

**What the system does instead:** it reads the certificates as documents in
their own right, compares what they say against what the supplier claimed, and
holds the verdict against every award scenario. So the VP's question is not a
day of work. It is one sentence, answered in ten seconds, with the
qualification status of every supplier attached to the answer, including the two
nobody has checked yet.

The day the buyer gets back is not the typing day. It is the judgement day.

---

## The workflow, end to end

**1. Draft it by talking.** The buyer types what they need in ordinary English:
*"I need to refresh IT hardware for 14 retail sites in Tamil Nadu. Laptops for
the store managers, a small server per region, network switches. Delivered in
phases from March."* Four things then happen:

- The co-pilot writes the **scope**, the **line items** with units and
  quantities, a **supplier questionnaire**, and the **commercial terms**.
- It asks about anything it cannot reasonably guess, rather than inventing it.
- It fills sensible defaults for the rest, and tells the buyer which ones it
  assumed, so nothing is silently decided.
- It has no field for a price anywhere, so it cannot put a number in the
  buyer's mouth.

The buyer can then change anything by talking to it again. Four documents come
out of this: scope, line items, questionnaire, terms.

**2. A quality check before it goes out.** Some mistakes cannot be fixed later,
so the system stops them leaving the building. It holds the enquiry if a line:

- says "box" or "kit" without saying how many pieces are inside,
- is missing a unit, a quantity, or a line number,
- shares a line number with another line,
- or the questionnaire has no mandatory question, or has a mandatory question
  that requires no supporting document.

Each hold explains the consequence in plain terms. For the "box" case: *one
supplier will price the box and another will price a single piece; the second
bid looks several times cheaper while being dearer, and both of them answered
the question you actually asked.* Where the correction is obvious, the fix is one
click.

**The buyer can always send it anyway, by typing a reason.** That is deliberate.
A block that cannot be overridden just gets worked around, usually by editing
the line until the warning stops appearing, and then there is no record that
anyone ever noticed. Here the reason is stored and printed in the award note, so
the decision is visible later to the person who has to sign it off.

**3. Choose how it goes out.** Email, a portal link, or WhatsApp, chosen per
supplier. **This choice has a real consequence, and it comes back to bite
later.** WhatsApp cannot carry an attachment. So that supplier gets a link
instead of the document pack, and when they reply, their certificate does not
come through either. Their answer to *"are you ISO 27001 certified?"* then has
nothing behind it that anyone can check.

That is not a flaw in the demo. It is the medium behaving normally, and the
system traces the gap back to the buyer's own choice two steps earlier, instead
of blaming the supplier.

**4. Replies arrive in whatever shape suits the supplier.** Nobody is forced
into a template. These are the five replies in the dataset, and they are the
formats the brief describes:

| Supplier | What they sent | Lines priced |
|---|---|---|
| Zenith | Their own Excel template, ignoring ours entirely | 30 of 30 |
| Cygnus | A 3-page PDF, nine lines priced in USD, discount buried in a footnote on page 2 | 24 of 30 |
| Orbit | A Word document with the commercials written into sentences | 24 of 30 |
| Vector | A photograph of a printed rate card, taken at an angle on a phone | 16 of 30 |
| Helios | A five-line email pricing two lines, no questionnaire, no terms | 2 of 30 |

Behind those five sits a stress set of 31 more files, to prove the readers are
not tuned to the demo: 22 awkward formats, 5 photographs of falling quality, and
4 files that are deliberately broken.

**5. One comparison.** 150 prices, 30 lines by 5 suppliers, on one screen. Same
lines, same units, same currency, with questionnaire answers and attached
documents sitting beside the numbers.

**6. Go back and ask.** When a price could not be read, or a mandatory question
was left blank, the buyer chases it without re-sending the whole enquiry. The
system works out exactly what each supplier still owes and drafts the message
asking for only that, with a deadline. It keeps two situations apart that look
identical on screen: **they never sent it**, and **they sent something we cannot
use**. Those are different conversations with different suppliers. Eight reasons
to go back are tracked, and the buyer closes each one with a reason. Nothing
closes itself.

**7. Then stop clicking and start asking.** Plain English, over the whole
comparison. Text, tables and charts, and four exports.

---

## What it does

**Drafting.** Write an enquiry by describing it, in any category. Ambiguous
lines are held before they go out, with a one-click fix or an override you have
to justify in writing. Four documents generated per enquiry.

**Sending and receiving.** Three channels, each with real consequences. Invite
any subset of a 10-supplier roster. Replies read from Excel, PDF, Word, email,
photographs, and seven more formats. Upload a quotation from a company that
appears nowhere in the dataset and it gets its own column. Send a revision and
it replaces the original, and reports what moved.

**The comparison.** Every price shows the original quote, the rule applied to
it, the final comparable figure, and the sentence it was read from. Five
different marks for five different kinds of blank. A summary bar that is checked
to add up. Questionnaire answers and certificates beside the numbers. The whole
grid is one keyboard stop, so you arrow around it instead of tabbing 150 times.

**Chasing.** A per-supplier list of what is still owed, split into what never
arrived and what arrived unusable, with a drafted message asking for only the
missing items and a deadline attached.

**Asking.** Plain-English questions across the whole comparison. Answers come
back as text, tables and charts, listing the exact cells they used, which you
can click through to the source. Four award scenarios. An assumption list, each
entry with its source and the alternative I rejected. And it refuses, with a
reason, rather than answering anything it cannot source.

**Exports.** An award note that leads with what the total rests on and why it is
not the cheapest. An Excel file with the reasoning inside the cell comments. A
CSV. And a full JSON audit trail.

---

## The ugly edges

The brief names four. Here is what happens on each one, and what the buyer sees.

**The angled photo.** Vector sent a photograph of a printed rate card. The eight
biggest numbers on it are read a second time, independently, from a cropped
close-up, on a different model that is never shown the first answer. **When the
two reads disagree, the price is taken out of every total and put in front of a
person**, carrying both readings. Five of Vector's prices are in that state
right now, and the disagreements are not subtle: 84,000 against 99,500, and
61,800 against 268.

**The supplier who priced 27 of 30 lines.** Four of our five did exactly this:
they usably priced 24, 24, 16 and 2 of the 30. Nothing is guessed or filled in.
The missing prices are marked and counted, and the system says plainly that a
supplier who priced 2 of 30 cannot be compared on an overall total, then gives
the per-line comparison instead.

**The one who quoted in USD.** Cygnus priced nine lines in dollars. The system
converts at 88.4, which is Cygnus's own stated rate from page 1 of their own
quote, and shows the rupee figure, the rate, and where the rate came from. It
also flags that the quote is ex-works Singapore, so it excludes freight and duty
and is not comparable with a delivered price.

**"Per box" versus "per piece".** Line 13 asks for a 32GB memory kit made of two
16GB sticks. Vector quoted ₹9,600 per stick. The kit is two sticks, so the real
comparable price is ₹19,200. On screen, ₹9,600 is the cheapest number on that
row and completely wrong, and this is the error nobody catches by reading,
because ₹9,600 is a perfectly believable price for memory.

**All four meet on line 13:**

| Supplier | What they wrote | What it actually costs |
|---|---|---|
| Zenith | ₹18,900 per kit | ₹18,900 |
| Cygnus | USD 198 per kit | ₹17,503, but ex-works, so freight is on you |
| Orbit | ₹19,200 "per kit" | ₹19,200, same unit written differently, number untouched |
| Vector | ₹9,600 per stick, read off a photograph | ₹19,200, doubled |
| Helios | "rest we'll match Zenith" | Not a price. Left out |

**Suppliers invent their own lines, and those are kept too.** Cygnus priced
their laptops without the warranty we asked for, and put the warranty on a line
of their own invention: *"Warranty uplift years 1-3, onsite NBD, laptop lines
1-3"*, ₹7,900 each. It matches no line in our enquiry, so it is held separately
with its page reference, and the three laptop prices it affects are marked as
not comparable rather than compared as if they included the cover. Dropping that
line would have made Cygnus look cheaper than they are.

**And when there is no rule, it refuses.** Eleven prices are sitting with a
person right now, for four different reasons. Two are conversions with no rule:
Orbit quoted "per box of ten" and "per box of fifty", nothing maps those to the
unit we asked for, so the system says *"refused rather than guessed at a
factor"*. Three are Cygnus prices that exclude a warranty they quoted on a line
of their own. Five are the contested photograph reads above. One is a price that
exists on the page and could not be read. None is guessed, and none is counted.

**Why I stopped trusting the confidence score.** I read the same rate card as
five photographs of falling quality. The fourth came back 52% accurate, and
reported 90% confidence on every digit it got wrong. A safety check that only
looks at low-confidence numbers would have sailed straight past it.

So the second read is not triggered by confidence. **It is triggered by money.**
The eight largest numbers on any photograph get checked independently, however
confident the first read claims to be, and if the two disagree, the disagreement
wins and the price leaves the total.

A smaller number, below the largest eight, could still be read wrong and look
right, and nothing on the screen would know. That is the biggest risk left in
this build, and I would rather write it down than let you find it.

---

## What earns the trust

A buyer with ₹4 crore on the line needs to know what the total rests on before
they act on it. Four things do that work.

**Every price is in exactly one of five states, and they are checked to add up.**
96 + 11 + 3 + 40 + 0 = 150, verified on every run.

| State | Count | What it means |
|---|---|---|
| In the total | 96 | Counted. 14 carry a caveat and are flagged: 9 are Cygnus's ex-works USD prices, 5 are substitutions, a below-spec offer or a spec note |
| No price given | 40 | They declined, never mentioned it, or wrote something that is not a price |
| Needs a person | 11 | 5 contested photograph reads, 3 missing a warranty adjustment, 2 conversions with no rule, 1 price that could not be read |
| Waiting on the supplier | 3 | Taken from a previous order, not counted until they confirm |
| Not read yet | 0 | Our problem, not theirs |

99 prices carry a number and 51 do not. Of those 99, three are still waiting on
a supplier to confirm, so 96 go into the total and 54 stay out of it.

**Nobody is accused of failing something nobody checked.** Vector sent a
questionnaire and a certificate, both were read, and they failed all six
mandatory questions. Orbit failed three. Cygnus and Helios never sent a
questionnaire at all, so they are carried as **not assessed**. Not passed, not failed, and the system
says so every time it names them.

**The certificate beats the claim.** A supplier says *"yes, we are ISO 27001
certified"* and attaches a certificate for the 2013 version of the standard,
which was withdrawn. Ask a model "did they pass?" and it says yes, because they
said yes. So the certificate is read as its own document, and comparing its date
to today is left to code, which cannot be talked into a different answer.

**Every assumption is visible, sourced, and changeable.** Eight of them: the USD
rate of 88.4 and whose quote it came from, comparison at the quantity we asked
for, Cygnus's warranty basis, two discounts excluded and one applied at total
level, ex-GST throughout, freight and duty excluded. Each one names the
alternative I rejected, so a buyer who disagrees can see exactly what is at
stake. Editing them from the screen is the next step and is not built yet.

**No number in any answer was worked out in prose.** Ten tools do the
calculating. There is no general calculator the model can hand two numbers to,
and no database access. Every figure in an answer came from one of those ten
tools, and the answer lists the exact cells behind it.

---

## The award it produces

Cheapest per line, among suppliers who can actually be awarded:

| Supplier | Lines | Value |
|---|---|---|
| Zenith Infotech Solutions | 17 | ₹1.85 cr |
| Cygnus Technologies India | 12 | ₹1.46 cr |
| Helios Enterprise Solutions | 1 | ₹73.4 lakh |
| **Total** | **30** | **₹4.05 cr** |

Take the cheapest from anyone and it is ₹3.91 cr. **So doing this properly costs
₹13.6 lakh, or 3.5%.** That cheaper number was never really available: it sat
inside Vector, who cannot be awarded at any price.

**And two correct numbers can still mislead you.** The strict award, which drops
every price carrying a caveat, including Cygnus's nine ex-works USD lines, looks
₹45.3 lakh cheaper. On the lines they
both cover, it is ₹5.0 lakh more expensive. The difference is coverage: 28 lines
against 30. Both totals are right, which is precisely why a careful person picks
the wrong one. So whenever two scenarios cover different lines, the system says
so and restates both on the common lines, before it shows either headline.

---

## The analyst conversation

These are the questions I chose, and why each one earns its place.

| The question | Why it matters |
|---|---|
| Is Vector's ISO 27001 certificate actually valid? | Their answer and their own evidence disagree. Proves the certificate was really opened |
| Split it cheapest per line, but only among suppliers who cleared the quality questionnaire | The VP's question from the brief, word for word. The one that cost the fourth day |
| What did that change against taking the cheapest from anyone? | Makes the system put a price on its own compliance |
| Which numbers are you least sure about, biggest rupee impact first? | Asks it to rank its own uncertainty by money, not by count |
| What would we save by dropping the ISO 27001 requirement? | An uncomfortable question, to see whether it answers anyway |
| Chart the split award by supplier | Thirty lines, coloured by winner, in one picture |
| Draft the award recommendation and say what it rests on | The defensible decision the brief ends on |
| Which of these suppliers has the best reputation in the market? | It has to refuse. This is the most persuasive moment in the demo |

The answer to the VP's question is the award table above, and this arrives
attached to it without being asked:

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

The brief is strict about this. *Don't fake the extraction, don't fake the
reasoning, don't hardcode the answers to your demo questions.*

**Only the delivery is faked.** No email is sent and no mailbox is polled. The
four enquiry documents are genuinely written, and every document that arrives is
genuinely read. Reading is cached against the file itself, so change one byte of
a supplier's quote and it reads it again.

**There are no shortcuts anywhere.** No branches on the wording of a question.
No stored pass or fail verdict. No calculation rule keyed to a supplier name or
a line number.

**Two breaches of this were found and fixed, and finding them is the point.**
The analyst's questionnaire tool used to read a pass/fail flag and a hand-typed
sentence out of a data file, which meant the suggested demo question *"is
Vector's ISO 27001 certificate actually valid?"* was answered by handing the
model my own conclusion. And that conclusion could not even survive a real read:
the version year sits inside the attached PDF, which nothing had ever opened, so
reading the form alone made Vector look like it passed. Both are worked out from
the evidence now, with three tests pinning them.

**Six model calls, and nothing else in the product talks to a model.**

| # | The call | What it is asked | What it is not allowed to do |
|---|---|---|---|
| 1 | Draft the enquiry | Turn a sentence into scope, lines, questionnaire and terms | Invent a price. There is no price field |
| 2 | Read a quotation | What does this document say, line by line, in the supplier's own units | Convert, multiply, discount, add or rank |
| 3 | Re-read a crop | Read the number in this close-up, on a cheaper model | See the first read's answer |
| 4 | Read a questionnaire | What did they answer, and what did they attach | Decide whether it passes |
| 5 | Read an attached certificate | What does this document actually say | Be told what the supplier claimed |
| 6 | The analyst | Answer the buyer using these ten tools | Do arithmetic. Every number comes from a tool |

**The model reads. The code counts.** Every calculation happens in ordinary
code, and I wrote that calculator twice, in two languages, so the total cannot
drift between runs. A test proves the two agree on all 150 prices.

---

## How I know the reading is right

Most demos ask you to take the extraction on faith. This one is measured.

The readers are scored against an answer key the running product never touches.
Across five formats and 107 of 107 lines: **100% on price, 100% on unit, and
nothing invented.** Then the same rate card as five photographs of falling
quality, where the worst scored 52%. That number is in this document because it
is the honest edge of the claim, and because finding it is what changed the
design.

Nine more checks run offline, with no API key and no network. The two
independent calculators were compared cell by cell across 442 assertions. The
readers run against every format and all 11 photographs. Sixteen cases cover how a questionnaire
verdict is reached, including expired and superseded certificates. And 67 tests hold one case for every bug
that has ever shipped in this build, each with a sentence saying what it broke.

---

## Stack

Next.js, React and Tailwind, hosted on Vercel. Postgres, embedded locally so it
runs with no setup and managed in production. Deliberately model-agnostic:
Claude or Gemini behind a single interface, so a suspect read can be retested on
a different model rather than argued about. The comparison you are looking at
was read by Gemini 3.1 Pro, with a cheaper, faster model doing the independent
second read of photograph crops, because the value of that check is that it is
independent, not that it is clever.
