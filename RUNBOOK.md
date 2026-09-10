# The runbook

*Every keystroke and every click, in order, with what appears after each one.
Every number and label below was read from the live payload, not remembered.*

Read this one, not WALKTHROUGH.md, when you are actually doing it. WALKTHROUGH.md
explains *why* each question is on the list; this one tells you what to press.

**Live:** https://kill-the-quote-spreadsheet.vercel.app

---

# PART A · Before you touch anything (5 minutes, no recording)

### A1. Is the credit actually live?

```bash
cd /Users/raramuri/Desktop/Personal/AC/web
npm run api-check
```

**What you want to see:**
```
provider gemini
cheap gemini-flash-latest        WORKS   in=12 out=3  said "OK"
main  gemini-3.1-pro-preview     WORKS   in=12 out=4  said "OK"
Both tiers reachable.
```

**If it still says `OUT OF CREDIT`**, the top-up has not reached the project the
key belongs to. Nothing else will work. Costs two tokens and takes 1.4 seconds,
so run it again rather than guessing.

### A2. Are the offline suites green?

```bash
npm run verify
```

Forty seconds, no API. You want `59/59` at the end and no red. If anything is
red, stop and tell me before spending anything.

### A3. Load the demo for real

```bash
npm run demo:load -- --live
```

**~$0.67.** This reads all eight documents through real model calls against the
deployed site. Watch for these lines, in this order:

```
V1 Zenith Infotech Solutions Pvt Ltd
  Zenith_Quotation_...xlsx        xlsx, 30 of 30 lines priced, 14.2s
  Zenith_Questionnaire_...xlsx    10 answers
V2 Cygnus Technologies India Pvt Ltd
  Cygnus_Quotation_...pdf         pdf, 27 of 30 lines priced, 22.1s
V3 Orbit Systems & Services
  Orbit_Offer_...docx             docx, 26 of 30 lines priced
  Orbit_Questionnaire_...docx     10 answers
V4 Vector Digital Systems
  IMG_2026...jpg                  photo, 21 of 30 lines priced
  Vector_Questionnaire_...pdf     10 answers + 1 attached doc(s) opened
    opened VDS_ISO27001.pdf       it states ISO/IEC 27001:2013, expires 2025-11-30
V5 Helios Enterprise Solutions Pvt Ltd
  helios_reply_...eml             eml, 2 of 30 lines priced
```

**The line that matters most** is `opened VDS_ISO27001.pdf — it states ISO/IEC
27001:2013, expires 2025-11-30`. That is the system reading the certificate
itself rather than trusting the form. If you do not see it, the money moment in
Part D will not land and you should tell me.

At the end:
```
the comparison now rests on 106 of 150 cells, 0 not read
  V1  Zenith ...    qualified
  V2  Cygnus ...    qualified
  V3  Orbit  ...    fails 3 mandatory
  V4  Vector ...    fails 6 mandatory
  V5  Helios ...    fails 6 mandatory
Demo loaded.
```

**If any read fails**, it says which and why in a sentence. Nothing partial is
stored, so a failure leaves a gap rather than a half-filled column. Re-run it;
successful reads are cached and cost nothing the second time.

---

# PART B · Your UI test (free, take as long as you like)

Open https://kill-the-quote-spreadsheet.vercel.app and land on **Compare**.

**Everything in this section costs nothing.** Reads are cached, the grid is
local. Only typing into the Ask box costs money (~$0.19 a question).

Work through this list and tell me anything that looks wrong:

| # | Do this | You should see |
|---|---|---|
| 1 | Read the four numbers across the top | ₹4.27 cr estimate · ₹3.88 cr "cheapest, ignoring the questionnaire" · ₹4.07 cr "what you would commit" · **+₹18.6 L cost of compliance, 4.8% more** |
| 2 | Click **Explain** next to the cost of compliance | Why the cheaper number was never available |
| 3 | Read the trust bar | "Award computed on 106 of 150 cells", "44 cells left out", and chips for what is blocked on whom |
| 4 | Click **2 cells need your call** | The review queue, ordered by rupees at risk, not by count |
| 5 | Click **17 off-spec but counted** | The cells that are in the total but where the supplier offered something different |
| 6 | Click **8 assumptions behind these totals** | The FX rate, the tax basis, the freight assumption. Every total depends on these and you can see them |
| 7 | Click **where the model is used** | Six model calls, and beside each one what it may **not** do |
| 8 | Click **Vector, line 22 (PC-CAT6A)** | ₹13,400 with the original **₹268** struck through beneath it. They quoted per piece; you asked per box of 50. **Fifty times out, and the number still looked reasonable** |
| 9 | Click **Vector, line 6 (MON-27)** | A `?`. "A price is there and we cannot read it." Then the actual cropped pixels from their photograph |
| 10 | In that same panel, click **Ask them to confirm this figure** | It writes: *"the figure is present on the document you sent but we cannot read it with confidence. Please confirm it in writing, or send a clearer copy."* Not "you did not provide pricing" |
| 11 | Click **Cygnus, line 24 (UPS-10K)** | `NQ`. They declined. That is an answer, and there is no chase button, because asking again would be asking them to change their mind |
| 12 | Look down the **Helios** column | 25 cells marked `~`. Their whole reply was five lines of email ending "rest we'll match Zenith" |
| 13 | Click **Helios, line 5 (MON-24)** | ₹10,100, marked as **derived from a prior PO**, and kept out of every total until they confirm it |
| 14 | Click the **Vector** column header | NOT ASSESSED becomes "fails Q1, Q2, Q4, Q5, Q6, Q7", each with the sentence that produced it |
| 15 | In that panel, find **VDS_ISO27001.pdf** and click it | The certificate opens. Beneath the link: *"the document itself states ISO/IEC 27001:2013, valid to 2025-11-30"* |
| 16 | Click **All 30 lines / 22 to check / 39 with no price / 15 converted** | The grid filters. "15 converted" is every cell the calculator moved |
| 17 | Click **Hide originals** | The struck-through raw values disappear and come back |
| 18 | Press **Tab** until focus reaches the grid, then use **arrow keys** | One tab stop for the whole grid; arrows move cell to cell, Home/End for the row, Ctrl+End for the last cell. **Enter** opens the panel |
| 19 | Click **Award note** | A printable recommendation. Read the section on what was asked for and whether they replied |
| 20 | Click **Comparison (csv)** and open it | Every rate with a status column. A blank rate beside a status is **not** a zero |
| 21 | Click **Audit bundle (json)** | Every cell, source and calculation step |
| 22 | Go to **Responses**, drag in any random file from your machine | It refuses rather than guessing, and asks whose it is |
| 23 | Go to **Draft** | The four example openers, and a box you can type anything into |

---

# PART C · Set up to record

Install **Recordly** from https://github.com/webadderallorg/Recordly/releases
(macOS 14+). Record the **window**, not the full screen. Turn its auto-zoom on:
the interesting things here are small.

Then reset to a clean start so the story begins from nothing:

```bash
curl -s -X POST 'http://localhost:3000/api/dev/fixture?clear=all'
```

Use **localhost** for the recording, not the live URL. It is faster and the
database is yours to reset between takes.

Have this file open on a second screen.

---

# PART D · The recording (9 minutes)

Everything below is literal. **Bold** is what you type or click. *Italic* is what
to say.

---

## Take 1 · Draft (90 seconds)

**Click:** `Draft`

**Type this, exactly** (deliberately not one of the four examples, so nobody
wonders whether they are special):

> **I need to refresh IT hardware for 14 retail sites in Tamil Nadu. Laptops for the store managers, a small server per region, network switches. Delivered in phases from March.**

**Press:** `Send`

*Say while it thinks:* "It is asking about what it cannot guess and assuming
defaults for what it can, and telling me which it assumed. It has no view on
what things cost, so it will not invent a price."

**Wait for the four parts to appear on the right.** Scope, line items,
questionnaire, terms.

**Then find the held line.** Look for the amber warning about a unit. It will
say something like *"line N says 'box' without saying how many are inside"*.

*Say this:* "This is the whole product in one screen. One supplier prices the
box, the next prices a single piece, and the second bid looks five times cheaper
while being dearer. **Both of them answered the question I actually asked.**
Nothing downstream can fix that, so it gets fixed here."

**Now click the override, and type a reason:**

> **Going out today, chasing the March window. Will confirm pack size with bidders directly.**

*Say this:* "And this is the more interesting half. An unclickable button gets
worked around by editing the draft until the check stops firing, and that leaves
no record at all. That reason stays on the enquiry and turns up in the award
note."

---

## Take 2 · Send (60 seconds)

**Click:** `Responses`

**On the roster of ten: deselect one supplier that would reply, and select one
that would not** (`Trilok`, `Meghdoot`, `Arunoday`, `Kadamba` or `Sahyadri`).

*Say:* "Ten on the panel. I am picking deliberately badly, because every
interesting state in this product is one where somebody did not reply."

**Click:** `Whatsapp`

*Say:* "WhatsApp cannot carry an attachment. So the pack goes out as a link, the
supplier who gets a link on their phone is the one who replies with a
photograph, and **on the way back their certificate does not arrive either.**
Watch what that costs me in two minutes."

**Click:** `Send to N suppliers`

**Point at the supplier you invited who has nothing on file.** It says *"no
response. Invited, sent nothing."*

*Say:* "That is not a gap in my dataset. You invite ten and five answer, and
that state is what the chase step exists for."

*Say, once, precisely:* "**Exactly one thing here is faked: the delivery.**
Nothing was emailed and no mailbox was polled. Everything that arrived was then
read for real, through the same path as a file I drag in. A button that makes
prepared answers appear is a scripted demo. A button that makes real documents
arrive, which are then genuinely read, is a stubbed transport. The screen says
which one it is doing."

---

## Take 3 · The grid (2 minutes)

**Click:** `Compare`

*Do not narrate the grid.* Click exactly three cells.

**Click: Vector, line 22, `PC-CAT6A`**

You will see **₹13,400** with **₹268** struck through beneath it.

*Say:* "They quoted two hundred and sixty-eight rupees. Per piece. I asked per
box of fifty. **The number is fifty times out and it still looks completely
reasonable.** The calculator moved it, so the cell is marked as one it touched,
and the original is right there underneath."

**Click: Vector, line 6, `MON-27`**

*Say:* "A question mark. A price is on that document and the reader could not
read it." **Point at the crop.** "Those are the actual pixels from their
photograph, not a claim about them."

**Click: `Ask them to confirm this figure`**

**Read the message out loud:** *"the figure is present on the document you sent
but we cannot read it with confidence. Please confirm it in writing, or send a
clearer copy."*

*Say:* "Not 'you did not provide pricing'. They did. Telling a supplier
otherwise reads as though nobody opened their file, and it burns the goodwill
you need for the items that matter."

**Scroll to the Helios column.**

*Say:* "Twenty-five of these are tildes. Their entire reply was five lines of
email ending 'rest we'll match Zenith'. **They have bid on everything and priced
almost nothing.** And three of their five figures were worked out from a prior
purchase order, marked as derived, and kept out of every total until they
confirm them. You cannot award against an offer nobody made."

**Point at the trust bar.** *"One hundred and six of a hundred and fifty cells
are in that total, and the forty-four that are not are split by whose problem
each one is."*

---

## Take 4 · The money moment (90 seconds)

**Point at the three numbers.**

*Say:* "Three-point-eight-eight crore. And it is labelled 'cheapest, ignoring
the questionnaire', because it includes suppliers who cannot be awarded at any
price. It stays on the screen, because hiding it would be its own kind of
dishonesty."

*Say:* "The real number is **four-point-oh-seven crore**. Doing this properly
costs **eighteen point six lakh, four point eight per cent**. The cheaper number
was never available."

**Click the Vector column header.** Point at *fails Q1, Q2, Q4, Q5, Q6, Q7*.

**Now the sentence to get right, in the Ask box, type:**

> **Is Vector's ISO 27001 certificate actually valid?**

**While it answers, click into the Vector panel and click `VDS_ISO27001.pdf`.**

*Say this, slowly:* "Vector answered **Yes**. They attached a certificate. Their
questionnaire response is a **form**, and a form has room for a filename and
nothing else. So if you only read the form, you get 'answered yes, attached
something, nothing contradicts it' — **a pass.**

The contradiction is inside the PDF. So the system opens the attachment and
reads it as a document in its own right: **ISO/IEC 27001:2013, expired the
thirtieth of November 2025.** I asked for the 2022 revision.

And where the form and the document disagree, **the document governs.** A model
asked 'did they pass?' says yes, because they said yes. Comparing a date to
today is not a judgement call, so code does it, and the verdict is recomputed on
every read rather than stored. A certificate that expires next week changes the
answer without anybody editing a row."

**Then click:** `Ask them to resolve these 6`

*Say:* "So the failure has an action attached to it, not just a red badge."

---

## Take 5 · The interrogation (3 minutes)

Type these into the Ask box, one at a time. **Do not click the suggested
buttons** — typing makes it obvious nothing is canned.

**1.** > **Split it cheapest per line, but only among suppliers who cleared the quality questionnaire**

*Point at the tool calls.* "It computes. It does not add up in prose. There is
deliberately no calculator tool it can hand two numbers to."

**2.** > **What did that change against taking the cheapest from anyone?**

*Say:* "Watch it lead with **coverage** before money, unprompted. Two totals
over different sets of lines are not comparable, and the one covering fewer
lines usually looks cheaper for that reason alone."

**3.** > **Which numbers are you least sure about, biggest rupee impact first?**

*Say:* "Ordered by money, not by count. A tool that can rank its own uncertainty
is a different kind of tool."

**4.** > **What would we save by dropping the ISO 27001 requirement?**

*Say nothing first. Let it answer.* Then: "I asked a question with an
uncomfortable answer and it computed it, and told me what I would be giving up.
Do not skip this one because the answer is awkward."

**5.** > **Chart the split award by supplier**

Thirty bars, coloured by who wins each line.

**6.** > **Draft the award recommendation and say what it rests on**

**Click:** `Award note`. **Scroll to the chase section.**

*Say:* "'Their questionnaire is missing' and 'we asked on the tenth, gave them
until the sixteenth, and nothing came back' are **different facts**. Only the
second one lets a buyer award around a supplier and defend it to a CFO."

**7.** Now ask it something it cannot do:

> **Which of these suppliers has the best reputation in the market?**

*Say:* "It refuses, and says why. It answers from the extracted data or it does
not answer. **That refusal is the most persuasive thing in this recording.**"

---

## Take 5b · The question they will ask anyway (30 seconds)

**Click:** `where the model is used`

*Say:* "Six model calls. Nothing else in this tool talks to a model. And beside
each one, what it may **not** do: drafting may not invent a price, reading may
not convert or rank, the questionnaire reader may not decide whether anybody
passed, and the analyst may not compute at all.

**The model reads. The code counts.** Two implementations of that calculator,
one in Python and one in TypeScript, proven to agree on all hundred and fifty
cells by four hundred and forty-two assertions. You cannot do that to a model.

What it costs me: my code returns 'cannot resolve' where a model would have
improvised. Thirty-one of a hundred and fifty cells carry no usable price. **A
plausible price is worse than an admitted gap**, because a gap gets chased and a
plausible price gets awarded."

---

## Take 6 · Break it on purpose (60 seconds)

**Do this last. Do not cut it.**

**Go to `Responses`. Drag in any file from your Downloads folder.**

*Say:* "It refuses rather than guessing, because a price in the wrong column is a
mistake nobody downstream can detect." **Then name a supplier and watch the
column appear**, marked NOT ASSESSED, chaseable, visible to the analyst, and
present in the award note.

**Drag in something absurd** — a screenshot, a `.zip`, anything.

*Say:* "Refused with instructions rather than half-read. And a read that finds
nothing **throws**, rather than quietly putting an empty column in front of
somebody who would read it as 'this supplier didn't quote'."

**Close on this, and say it plainly:**

*"One last thing, and it is the honest answer to 'what does it show you when it
isn't sure'. I read the same rate card as five photographs of falling quality.
The fourth one came back **fifty-two per cent accurate, at nought point nine
confidence on every single wrong digit.** Fifty-nine thousand nine hundred for
fifty-seven thousand nine hundred.

That is the exact failure this whole design exists to prevent, and on that
photograph it showed me certainty. My own test harness had missed it, because it
was only comparing the easiest and hardest images and the bad one was in the
middle. It scores every row now.

I would rather hand you a measured failure than an unmeasured claim."*

---

# What not to do on camera

- Do not read the legend aloud. Click cells.
- Do not narrate a passing test suite. Show it once in the terminal, move on.
- Do not apologise for the stubbed transport. Name it once, precisely, continue.
- Do not use the four example openers or the eight suggested questions verbatim.
  They exist so the tool is usable cold; typing them makes a live demo look
  rehearsed.
- Do not say "as you can see". Point at the thing.

---

# If something breaks mid-take

| Symptom | Do this |
|---|---|
| A question returns "the model provider is rate limiting or the account is out of credit" | The top-up ran out. `npm run api-check` confirms in 1.4s |
| A read fails | It says which document and why. Re-run `npm run demo:load`; successful reads are cached and free |
| The grid is empty and says "not read yet" | The database was cleared. Run `npm run demo:load` again |
| A banner says "NOT LIVE — do not act on these numbers" | The database could not be read. Reload; if it persists, tell me |
| You want to start the recording over | `curl -s -X POST 'http://localhost:3000/api/dev/fixture?clear=all'` |
