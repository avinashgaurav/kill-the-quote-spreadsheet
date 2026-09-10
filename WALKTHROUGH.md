# The recorded walkthrough

*The brief asks for "a recorded walkthrough of the analyst conversation — you choose
the questions worth asking." This is the running order, and why each question is on
the list. Nine minutes.*

The questions are chosen on one principle: **a question whose answer I already know
is not a demonstration.** Each one below is a question a buyer would actually ask,
and several of them make the tool refuse, contradict the obvious reading, or admit
something about itself.

---

## Before you press record

```bash
cd web && npm run api-check
```

Two tokens. It tells you whether the model is reachable and, if not, which of the
three ways a key can be dead this is: rejected, rate limited, or out of credit. Do
not discover that mid-recording.

```bash
npm run verify
```

Forty seconds, no API. If anything here is red, fix it before recording.

Then reset to a clean state so the arc starts from nothing:

```bash
curl -s -X POST 'http://localhost:3000/api/dev/fixture?wipe=true'
```

Recording with **Recordly** (`github.com/webadderallorg/Recordly`, macOS 14+,
prebuilt from its releases page). Its auto-zoom is genuinely useful here: the
interesting things on this screen are small, and a cell-level detail at 1440p is
unreadable in a shared video. Record the window, not the full screen.

---

## Part 1. Talk the enquiry into existence (90 seconds)

Type something that is **not** one of the four suggested openers, so nobody wonders
whether the openers are special:

> *"I need to refresh IT hardware for 14 retail sites in Tamil Nadu. Laptops for
> the store managers, a small server per region, network switches. Delivered in
> phases from March."*

**Say out loud:** the co-pilot asks about what it cannot guess and assumes defaults
for what it can, and tells you which. It will not invent a price.

Then let it draft, and go straight to the thing that matters:

**The hold.** A line whose unit is "box" with no count inside it gets the enquiry
held before it goes out. One supplier prices the box, the next prices a piece, and
the second bid looks five times cheaper while being dearer. Both answered the
question you actually asked, so nothing downstream can fix it.

**Then override it, with a reason.** This is the more interesting half. An
unclickable button gets worked around by editing the draft until the check stops
firing, and that leaves no record at all. The reason stays on the enquiry and turns
up in the award note.

---

## Part 2. Send it, and let the replies arrive (60 seconds)

Pick suppliers off the roster of ten. **Deselect one that has a reply on file and
select one that does not**, so the state that follows is not the scripted one.

Pick **WhatsApp** as the channel and say why it is not cosmetic: it cannot carry an
attachment, so the pack goes as a link, and the supplier who gets a link on their
phone is the one who replies with a photograph of a rate card. Your choice here
becomes the hardest input two minutes from now.

Replies land one at a time. **Name the one thing that is faked:** nothing is
emailed and no mailbox is polled. Everything that arrives is then read for real,
through the same path as a file you drag in. A button that makes prepared answers
appear is a scripted demo; a button that makes real documents arrive, which are
then genuinely read, is a stubbed transport.

The supplier you invited who has nothing on file comes back *"no response. Invited,
sent nothing"*. That is not a hole in the dataset. It is the commonest thing in
procurement and it is what Part 5 exists for.

---

## Part 3. The grid, and the five kinds of nothing (2 minutes)

Do not narrate the grid. Click three cells.

**1. A unit trap.** Cygnus's line 22: they quoted per piece, the enquiry asked per
box of 50. The number moved, so the cell is marked as one the calculator touched,
and the original sits struck through beneath it. Open it: the cell address, their
own words, and the conversion.

**2. The photograph.** Vector's line 6 is a `?`. A price is there and the reader
could not read it. Open it and you see the actual pixels, cropped from their
photograph, not a claim about them. **Then press "Ask them to confirm this
figure"** and read the message it writes: *"the figure is present on the document
you sent but we cannot read it with confidence. Please confirm it in writing, or
send a clearer copy."* Not "you did not provide pricing" — they did, and telling a
supplier otherwise reads as though nobody opened their file.

**3. Helios.** Twenty-two cells marked `~`. Their whole reply was five lines of
email ending "rest we'll match Zenith". They have bid on everything and priced
almost nothing, and three of their five figures were **derived** from a prior
purchase order, marked as derived, and kept out of every total until they confirm.
You cannot award against an offer nobody made.

**Then the trust bar,** in one sentence: 106 of 150 cells are in the total, and the
44 that are not are split by whose problem each one is.

---

## Part 4. The money moment (90 seconds)

Three numbers across the top. The middle one, **₹3.88 cr**, is labelled "cheapest,
ignoring the questionnaire" and includes suppliers who cannot be awarded at any
price. It stays on the screen because hiding it would be its own dishonesty.

The real number is **₹4.07 cr**. Doing this properly costs **₹18.6 lakh, 4.8%**.
The cheaper number was never available.

Now the question worth asking:

> **"Is Vector's ISO 27001 certificate actually valid?"**

Vector answered *"Yes"*. They attached `VDS_ISO27001.pdf`. The system opened that
PDF, read the certificate itself, and found the 2013 revision with an expiry of 30
November 2025. The question asked for 2022.

**This is the sentence to say on camera:** their questionnaire response is a form,
and a form has room for a filename and nothing more. If you only read the form you
get "answered yes, attached something, nothing contradicts it" — a pass. The
contradiction lives inside the attachment, so the attachment is opened and read as
a document in its own right, and where the form and the document disagree the
document governs. A model asked "did they pass?" says yes, because they said yes.
Comparing a date to today is not a judgement call, so code does it, and the verdict
is recomputed on every read rather than stored. A certificate expiring next week
changes the answer without anybody editing a row.

Then click "ask them to resolve these 6", so the failure has an action attached to
it and not just a red badge.

---

## Part 5. The interrogation (3 minutes)

Type your own questions. These five are chosen because each one produces something
a slide cannot.

**1.** *"Split it cheapest per line, but only among suppliers who cleared the
quality questionnaire."*
The flagship. Watch the tool calls: it computes, it does not add up in prose.

**2.** *"Compare that against taking the cheapest from anyone."*
It leads with coverage before money, unprompted, because two totals over different
line sets are not comparable.

**3.** *"Which numbers are you least sure about, biggest rupee impact first?"*
The one that shows the product knows its own weak points, ordered by money rather
than by count. A tool that can rank its own uncertainty is a different kind of tool.

**4.** *"What would we save by dropping the ISO requirement?"*
Ask a question with an uncomfortable answer. It will compute it, and it will tell
you what you are giving up. Do not skip it because the answer is awkward.

**5.** *"Draft the award recommendation and say what it rests on."*
Then export it, and read the section that says who was asked for what, when it was
due, and whether they replied. *"Their questionnaire is missing"* and *"we asked on
the 10th, gave them until the 16th, and nothing came back"* are different facts,
and only the second lets a buyer award around a supplier and defend it to a CFO.

**Then ask one thing it cannot do**, and let it refuse. That refusal is the most
persuasive thing in the recording.

---

## Part 6. Break it on purpose (60 seconds)

Do this last and do not cut it.

**Upload a document from a supplier who does not exist.** It refuses rather than
guessing, because a price in the wrong column is a mistake nobody downstream can
detect. Then name them, and watch them get their own column, marked NOT ASSESSED,
chaseable, visible to the analyst, and present in the award note.

**Drag in something absurd.** A `.msg` file, a corrupt spreadsheet, a photograph of
a wall. It refuses with instructions rather than half-reading, and a read that
finds nothing throws instead of quietly putting an empty column in front of you.

Close on the honest gap: on the hardest photograph of the degradation set, the
reader was **52% accurate at 0.90 confidence**. Say it out loud. It is the sharpest
possible answer to "what does it show the buyer when it isn't sure", and a
walkthrough that ends on a measured failure is worth more than one that ends on a
green tick.

---

## What not to do on camera

- Do not read the legend aloud. Click cells instead.
- Do not narrate a passing test suite. Show it once, in the terminal, and move on.
- Do not apologise for the stubbed transport. Name it once, precisely, and continue.
- Do not use the four suggested openers or the eight suggested questions verbatim.
  They are there so the tool is usable cold, and typing them makes a live demo look
  like a rehearsal.
