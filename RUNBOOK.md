# Runbook

**Every number and cell below was read from a live model run on 11 Sep, not
remembered.** If something on your screen disagrees with this file, tell me.

Live: https://kill-the-quote-spreadsheet.vercel.app · Local: http://localhost:3000

---

# 1 · Before you record

Three commands. Do them in order.

```bash
cd /Users/raramuri/Desktop/Personal/AC/web
npm run api-check
```
Want: `Both tiers reachable.` Two tokens, 1.4 seconds.

```bash
npm run verify
```
Want: `62/62` and nothing red. Forty seconds, free.

```bash
npm run demo:load
```
Want: `8 document(s) read, 0 failed` and `Demo loaded.`
**~$0.67 the first time, free every time after** (cached on the file's hash).

**The one line to watch for**, because the best 90 seconds of the demo depends
on it:

```
opened VDS_ISO27001.pdf   it states ISO/IEC 27001:2013, expires 2025-11-30
```

That is the system opening the certificate itself. If it is not there, stop and
tell me.

Then open http://localhost:3000. **It lands on Compare**, with the grid full.

---

# 2 · Your UI test — free, click everything

Nothing here costs money except typing in the Ask box (~$0.19 a question).

| # | Click / do | You should see |
|---|---|---|
| 1 | Look at the top | **₹4.27 cr** estimate · **₹3.88 cr** "cheapest, ignoring the questionnaire" · **₹4.07 cr** "what you would commit" · **+₹18.6 L, 4.8% more** |
| 2 | **Explain** | Why the cheaper number was never available |
| 3 | Trust bar | "Award computed on **97 of 150** cells" |
| 4 | **2 cells need your call** | Review queue, ordered by rupees at risk |
| 5 | **8 assumptions behind these totals** | The FX rate, the tax basis. Every total rests on these |
| 6 | **where the model is used** | Six model calls, and what each may **not** do |
| 7 | **Vector, line 22 (PC-CAT6A)** | **₹13,400** with **₹268** struck through. They wrote per PC; you asked per box of 50 |
| 8 | **Vector, line 13 (RAM-32K)** | ₹19,200 from ₹9,600 per DIMM. A kit is two DIMMs |
| 9 | **Cygnus, line 12 (SRV-2U)** | USD 6,180 → ₹5,46,312, **and** an ex-works warning: duty and freight fall on you |
| 10 | **Orbit, line 30 (WTY-EXT)** | A **?**. "A price is there and we cannot read it" |
| 11 | Same panel → **Ask them to confirm this figure** | *"the figure is present on the document you sent but we cannot read it with confidence"* |
| 12 | **Cygnus, line 24 (UPS-10K)** | **NQ**. They declined. No chase button, because that is an answer |
| 13 | **Cygnus, line 1 (LT-BUS-14)** | Refused: they priced 1-year warranty and put 3-year on "line 30A", which does not map. It will not compare on an unequal basis |
| 14 | Scroll to **Helios** | **25** cells marked `~`. Five lines of email ending "rest we'll match Zenith" |
| 15 | **Helios, line 5 (MON-24)** | ₹10,100 **derived from a prior PO**, kept out of every total until they confirm |
| 16 | **Vector** column header | fails **Q1, Q2, Q4, Q5, Q6, Q7**, each with the sentence that produced it |
| 17 | Same panel → **VDS_ISO27001.pdf** | The certificate opens. Below it: *"the document itself states ISO/IEC 27001:2013, valid to 2025-11-30"* |
| 18 | **Zenith** column header | Note the documents it **cites but we do not hold** — an honest different state |
| 19 | The four filters | All 30 lines / to check / no price / converted |
| 20 | **Tab** to the grid, then **arrow keys** | One tab stop; arrows move, **Enter** opens |
| 21 | **Award note** | Read the chase section |
| 22 | **Comparison (csv)** | Every rate with a status column |
| 23 | **Responses** → drag any random file in | Refused, and it asks whose it is |

---

# 3 · Reset before recording

```bash
curl -s -X POST 'http://localhost:3000/api/dev/fixture?clear=all'
npm run demo:load
```

Record the **window**, not the screen. Recordly's auto-zoom on.

---

# 4 · The recording — 9 minutes

**Bold = type or click.** *Italic = say.*

## Part 1 · Draft · 90s

**Click `Draft`.** Type:

> **I need to refresh IT hardware for 14 retail sites in Tamil Nadu. Laptops for the store managers, a small server per region, network switches. Delivered in phases from March.**

**Click `Send`** — the button, not the Enter key.

*While it thinks:* "It asks about what it cannot guess and assumes defaults for
what it can, and tells me which it assumed. It has no view on what things cost,
so it will not invent a price."

**Find the amber hold** about a unit with no count inside it.

*Say:* "This is the whole product in one screen. One supplier prices the box,
the next prices a single piece, and the second bid looks five times cheaper
while being dearer. **Both of them answered the question I actually asked.**"

**Click the override. Type:**

> **Going out today, chasing the March window. Will confirm pack size with bidders directly.**

*Say:* "And this is the more interesting half. An unclickable button gets worked
around by editing the draft until the check stops firing, and that leaves no
record at all. That reason stays on the enquiry and turns up in the award note."

## Part 2 · Send · 60s

**Click `Responses`.** **Deselect one supplier who would reply; select one who
would not** (Trilok, Meghdoot, Arunoday, Kadamba or Sahyadri).

**Click `Whatsapp`.**

*Say:* "WhatsApp cannot carry an attachment. So the pack goes out as a link, the
supplier who gets a link on their phone is the one who replies with a
photograph, and **on the way back their certificate does not arrive either.**"

**Click `Send to N suppliers`.** Point at the one who sent nothing: *"no
response. Invited, sent nothing."*

*Say once, precisely:* "**Exactly one thing here is faked: the delivery.**
Nothing was emailed and no mailbox was polled. Everything that arrived was then
read for real. A button that makes prepared answers appear is a scripted demo. A
button that makes real documents arrive, which are then genuinely read, is a
stubbed transport."

## Part 3 · The grid · 2 min

**Click `Compare`.** Three cells. Do not narrate the rest.

**1. Vector, line 22 (PC-CAT6A).** ₹13,400, with ₹268 struck through.

*Say:* "They wrote two hundred and sixty-eight rupees. Per piece. I asked per box
of fifty. **The number is fifty times out and it still looks completely
reasonable.**"

**2. Orbit, line 30 (WTY-EXT).** A `?`.

*Say:* "A price is on that document and the reader could not read it." **Click
`Ask them to confirm this figure`** and read it out: *"the figure is present on
the document you sent but we cannot read it with confidence."*

*Say:* "Not 'you did not provide pricing'. They did. Telling a supplier otherwise
reads as though nobody opened their file."

**3. Scroll to Helios.**

*Say:* "Twenty-five of these are tildes. Their whole reply was five lines of
email ending 'rest we'll match Zenith'. **They have bid on everything and priced
almost nothing.** Three of their five figures were worked out from a prior
purchase order, marked as derived, and kept out of every total until they
confirm. You cannot award against an offer nobody made."

## Part 4 · The money moment · 90s

*Say:* "Three-point-eight-eight crore, labelled 'cheapest, ignoring the
questionnaire', because it includes suppliers who cannot be awarded at any
price. It stays on screen, because hiding it would be its own kind of
dishonesty.

The real number is **four-point-oh-seven crore**. Doing this properly costs
**eighteen point six lakh, four point eight per cent.** The cheaper number was
never available."

**In the Ask box, type:**

> **Is Vector's ISO 27001 certificate actually valid?**

**While it answers: click the Vector column, then click `VDS_ISO27001.pdf`.**

*Say slowly:* "Vector answered **Yes**. They attached a certificate. Their
response is a **form**, and a form has room for a filename and nothing else. Read
only the form and you get 'answered yes, attached something, nothing contradicts
it' — **a pass.**

The contradiction is inside the PDF. So the system opens the attachment and
reads it in its own right: **ISO/IEC 27001:2013, expired the thirtieth of
November 2025.** I asked for the 2022 revision.

Where the form and the document disagree, **the document governs.** A model asked
'did they pass?' says yes, because they said yes. Comparing a date to today is
not a judgement call, so code does it, and the verdict is recomputed on every
read. A certificate that expires next week changes the answer without anybody
editing a row."

**Click `Ask them to resolve these 6`.**

## Part 5 · The interrogation · 3 min

Type each one. Do not click the suggested buttons.

**1.** > **Split it cheapest per line, but only among suppliers who cleared the quality questionnaire**

*"It computes. It does not add up in prose. There is deliberately no calculator
tool it can hand two numbers to."*

**2.** > **What did that change against taking the cheapest from anyone?**

*"Watch it lead with coverage before money, unprompted."*

**3.** > **Which numbers are you least sure about, biggest rupee impact first?**

*"Ordered by money, not by count."*

**4.** > **What would we save by dropping the ISO 27001 requirement?**

*Let it answer.* "I asked a question with an uncomfortable answer and it computed
it, and told me what I would be giving up."

**5.** > **Chart the split award by supplier**

**6.** > **Draft the award recommendation and say what it rests on**

**Click `Award note`**, scroll to the chase section.

*"'Their questionnaire is missing' and 'we asked on the tenth, gave them until
the sixteenth, and nothing came back' are **different facts**. Only the second
lets a buyer award around a supplier and defend it to a CFO."*

**7.** > **Which of these suppliers has the best reputation in the market?**

*"It refuses, and says why. **That refusal is the most persuasive thing in this
recording.**"*

## Part 5b · The question they will ask · 30s

**Click `where the model is used`.**

*"Six model calls. Nothing else talks to a model. And beside each one, what it
may **not** do: drafting may not invent a price, reading may not convert or rank,
the questionnaire reader may not decide whether anybody passed, the analyst may
not compute at all.

**The model reads. The code counts.** Two implementations of that calculator,
Python and TypeScript, proven to agree on all hundred and fifty cells by four
hundred and forty-two assertions.

What it costs me: my code returns 'cannot resolve' where a model would have
improvised. **A plausible price is worse than an admitted gap**, because a gap
gets chased and a plausible price gets awarded."*

## Part 6 · Break it · 60s

**Drag any file from Downloads into `Responses`.** Refused, not guessed. **Name a
supplier** and watch the column appear, NOT ASSESSED.

**Drag in something absurd.** Refused with instructions.

**Close on this:**

*"One last thing, and it is the honest answer to 'what does it show you when it
isn't sure'. I read the same rate card as five photographs of falling quality.
The fourth came back **fifty-two per cent accurate, at nought point nine
confidence on every single wrong digit.** Fifty-nine thousand nine hundred for
fifty-seven thousand nine hundred.

That is the exact failure this design exists to prevent, and on that photograph
it showed me certainty. My own harness had missed it, because it only compared
the easiest and hardest images and the bad one was in the middle. It scores
every row now.

I would rather hand you a measured failure than an unmeasured claim."*

---

# 5 · Don't

- Read the legend aloud. Click cells.
- Narrate a passing test suite.
- Apologise for the stubbed transport. Name it once, continue.
- Use the four example openers or the eight suggested questions verbatim.
- Say "as you can see". Point at the thing.

---

# 6 · If it breaks

| Symptom | Fix |
|---|---|
| "the model provider is rate limiting or the account is out of credit" | Credit ran out. `npm run api-check` confirms in 1.4s |
| A read fails | It names the file and why. Re-run `npm run demo:load`; successful reads are cached and free |
| Grid empty, "not read yet" | `npm run demo:load` |
| Banner: "NOT LIVE — do not act on these numbers" | The database could not be read. See the next row |
| Every API returns `RuntimeError: Aborted()` | The embedded Postgres is corrupt. `kill $(pgrep -f "next dev")`, `mv web/.pglite /tmp/`, restart `npm run dev`, then `npm run demo:load`. Costs one re-read |
| Start a take over | `curl -s -X POST 'http://localhost:3000/api/dev/fixture?clear=all'` then `npm run demo:load` |

**Do not edit any file while recording.** A config change mid-run restarts the
server, and a restart during a database write is what corrupted it once today.
