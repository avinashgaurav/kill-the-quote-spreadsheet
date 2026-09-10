# Start here: the whole thing in plain language

Deadline: **tomorrow, 10 September 2026, end of day.**

This is the simple version. `BUILD-PLAN.md` is the detailed version and is
unchanged. Read this one to know what you are building and in what order. Read
that one when you need to know exactly how a rule works.

Nothing gets cut from the scope. All three AI loops stay real, all fifteen
messy-input cases still get handled. What gets cut is polish: fewer chart
types, plainer screens, no animations. The build is compressed, not reduced.

---

## 1. What you are building, in five sentences

A buyer needs 30 different pieces of IT hardware. She asks five suppliers for
prices. All five reply in a different format, and none of them fills in her
template. Your software reads all five, puts every price into one table where
the numbers can actually be compared side by side, and shows her clearly which
numbers it is not sure about. Then she asks questions in plain English and gets
real answers, all the way to deciding who wins.

That is it. Three pieces of software:

| Piece | What it does | Is the AI real here? |
|---|---|---|
| **Co-pilot** | Buyer chats, and an RFx gets drafted | Yes |
| **Reader** | Reads whatever the suppliers send back | Yes, this is the hard one |
| **Analyst** | Buyer asks questions, gets answers | Yes |

Between the Reader and the Analyst sits a fourth piece that is **not** AI: a
plain calculator that does the maths. That separation is deliberate and it is
the single most important decision in the whole project. More on it in section 4.

---

## 2. Why the suppliers are the problem

Here is what the five suppliers actually sent. All five files are already built
and sitting in `dataset/`.

| Supplier | What they sent | The problem it creates |
|---|---|---|
| **Zenith** | Their own Excel file | Ignores your template completely. Different columns, prices typed as text, notes scattered below the table. Their grand total does not match the sum of their own lines. They then sent a second, revised version two days later |
| **Cygnus** | A 3-page PDF | Half the prices are in dollars, not rupees. The real discount is hidden in a footnote on page 3. They quoted a 1-year warranty when you asked for 3, then added the missing 2 years as a separate line they invented |
| **Orbit** | A Word letter | The prices are written inside sentences, not in a table. Three items are just missing, with no explanation. One laptop is quoted with 8GB when you asked for 16GB, and it is cheaper because of that |
| **Vector** | A photo of a printed page, taken at an angle | It is a photo. Two prices are crossed out in pen with new ones written above. One price has camera flash glare across it and genuinely cannot be read. And their prices are per piece where you asked per box |
| **Helios** | A five-line email | Only two actual prices. The rest says "same as our March order", "6% more than last year", and "we'll match Zenith". Not a single one of those is a price you can compare |

**The trap that matters most.** Vector looks like the cheapest supplier by
miles. Their network transceiver looks **89.9% cheaper** than Zenith's. It is
not cheaper at all. They quoted per piece, you asked per box of 10. Once you
multiply by 10, Vector is actually **0.7% more expensive**. A buyer who trusts
the raw numbers awards this to Vector and loses money.

And Vector also failed six of the six mandatory qualification questions,
including attaching an ISO certificate that expired in November 2025 while
answering "yes, we are certified". So the cheapest-looking supplier is not
allowed to win at all.

---

## 3. The moment the demo has to land

When you filter to only the suppliers who passed the questionnaire, the total
goes **up by ₹18.6 lakh (4.8%)**.

| Question the VP asks | Answer |
|---|---|
| Cheapest per line, any supplier | ₹3.88 crore |
| Cheapest per line, but only suppliers who qualified | ₹4.07 crore |
| So what does doing this properly cost? | **₹18.6 lakh more** |

Show that gap, then explain that the ₹18.6 lakh was never real money. It was
sitting inside a supplier who is disqualified, and half of it was a unit
conversion error. That is the whole pitch in thirty seconds.

**One more thing to demo, and it is the best one.** While checking the numbers,
the calculator found a genuine trap in its own output. Filtering to strict
compliance appears to *save* ₹30 lakh. It does not. It only looks cheaper
because it awards 29 items instead of 30. Both numbers are individually
correct, which is exactly why a human reviewer would miss it. The software now
refuses to compare two scenarios that cover different numbers of items without
first restating them on a like-for-like basis.

If you demo one thing, demo that. It shows the software catching a mistake that
a careful person would not.

---

## 4. The one design decision to be able to explain

**The AI reads. The AI decides what to work out. The AI never does the
arithmetic.**

The AI's job is to look at a crooked photo and understand "this says 4,150 per
piece". A plain calculator then does `4,150 x 10 = 41,500`. The AI is never
asked to multiply anything.

Why: a buyer signing off ₹4 crore should not be trusting addition done inside
an AI's answer. There is no way to check it and no reason to believe it. The
calculator's logic is written out in `dataset/generators/normalise.py`, it runs
in under a second, and it gives the same answer every time.

If Aerchain asks you one hard question, it will be about trust. This is the
answer.

**The second half of the trust answer:** every number on screen can be clicked
to show the exact place it came from. The actual Excel cell. The actual sentence
in the PDF. The actual cropped piece of the photograph. Not a description of the
source, the source itself.

**The third half:** the software is allowed to say it does not know. Out of 150
number-slots in the comparison, **106 are trustworthy and 43 are not.** It shows
that ratio openly rather than filling the gaps in. A supplier who did not quote,
a supplier who refused to quote, and a price the camera flash destroyed are
three different things and are shown three different ways. Software that always
produces a number is less useful, not more, because now the buyer has to check
all 150 instead of the 12 that need her.

---

## 5. Hosting and database: what to pick

**Vercel** for hosting, as you planned.

**Neon** for the database. Pick Neon, not Supabase.

| | Neon | Supabase |
|---|---|---|
| Free tier | Yes, 0.5 GB, no card needed | Yes, 500 MB |
| Setup time | ~2 minutes from inside Vercel | ~10 minutes, separate signup |
| Gives you | Postgres | Postgres + auth + file storage + realtime |
| Do you need those extras? | **No. You cut auth and multi-user on purpose** | Paying setup time for features you cut |
| Sleeps when idle | Yes, wakes in ~1 second | Yes, and pauses fully after 7 days idle |

Neon wins on the only thing that matters tomorrow: it installs from the Vercel
dashboard in two minutes and hands you the connection string automatically.
Supabase's advantages are all things this project deliberately does not use.

**Setup, in order:**

```bash
npm i -g vercel
npx create-next-app@latest quote-killer --ts --tailwind --app --yes
cd quote-killer
vercel link
```

Then in the Vercel dashboard: **Storage → Marketplace → Neon → Create**. It
sets `DATABASE_URL` for you. Pull it down and add the rest:

```bash
vercel env pull .env.local
npm i drizzle-orm @neondatabase/serverless @anthropic-ai/sdk zod
npm i -D drizzle-kit
```

Add your Anthropic key to `.env.local` as `ANTHROPIC_API_KEY`, then also add it
in the Vercel dashboard under Settings → Environment Variables, or the deployed
version will fail while local works.

**Warning about Supabase's free tier if you pick it anyway:** it pauses the
database after 7 days of inactivity. If Aerchain runs your demo two weeks after
you send it, the app is dead on arrival. Neon wakes back up. This alone settles
it.

**Store the supplier files as files, not in the database.** Put the 32 dataset
files in the repo under `public/dataset/` and read them off disk. Vercel Blob is
the proper answer for a real product, and it is 20 minutes you do not have.
Files in the repo work, deploy automatically, and the demo never notices.

---

## 6. The plan for tomorrow

14 working hours. The order matters more than the timings: each step needs the
one before it.

### Tonight, before you sleep (1 hour)

Do the boring setup now so tomorrow is all building.

1. Create the Next.js app, link Vercel, add Neon, pull the env vars.
2. Copy `dataset/out/` into `public/dataset/`.
3. Deploy the empty app once: `vercel deploy`. **Do this tonight.** A first
   deploy always has one surprise, and you do not want it at 11pm tomorrow.
4. Make one real API call to Claude and print the answer, to prove the key works.

### Tomorrow

| Time | Build | You are done when |
|---|---|---|
| **9:00 - 10:00** | Database tables and load the 30 line items | You can query the 30 items from the deployed app |
| **10:00 - 13:30** | **The Reader.** Five separate readers: Excel, PDF, Word, email, photo. Each one saves where every number came from | All five suppliers read. The glare price comes back as "cannot read", not as a guess |
| **13:30 - 15:30** | **The Calculator.** Translate `normalise.py` into TypeScript, rule by rule | Your version produces the same 107 numbers as the Python. Compare them automatically |
| **15:30 - 18:00** | **The Table.** The comparison grid, three colours of cell, click-for-source panel | You can click any number and see the original Excel cell or photo crop |
| **18:00 - 20:30** | **The Analyst.** Chat that answers questions using the calculator, never doing maths itself | The VP's question works. A question about an untrustworthy number gets refused |
| **20:30 - 21:30** | **The Co-pilot** and exports | Chat drafts an RFx. Excel and JSON export work |
| **21:30 - 23:00** | Deploy, record the walkthrough, write the one-page note | Live URL works. Video recorded. Note written |

### The two things most likely to go wrong

**The Reader takes longer than 3.5 hours.** It is the biggest block and the
hardest. If you are behind at 13:30, do this: run the Reader once on all five
suppliers, save the results to the database, and let the app read the saved
results. Then in the demo, re-run one document live in front of them.

This is **not** cheating and you should say so out loud in the demo: "extraction
is real, these results are cached so the demo is fast, and here it is running
live on this document right now." Caching a real result is normal engineering.
Hardcoding an answer is what the brief forbids, and you are not doing that.

**The Calculator disagrees with the Python.** Good, that is the test working.
Fix the TypeScript, do not fix the Python. The Python was verified against the
dataset first, so it is the reference.

### What to sacrifice if you run out of time, in this order

Sacrifice from the bottom up. Never from the top.

1. Chart variety. One bar chart is enough. **Cut first.**
2. The RFx co-pilot's polish. A plain chat box that outputs line items is fine.
3. Export formats. Excel and JSON only. Skip the PDF award note, use browser print.
4. Visual design. Plain and clear beats pretty and late.
5. The "click for source" panel. **Only if truly desperate**, and if it goes,
   say so in the note, because it is a third of your trust story.
6. Any handling of a messy-input case. **Never cut these.** They are what is
   being assessed.
7. The AI being real. **Never.** This is the one rule the brief gives you.

---

## 7. What to hand over

The brief asks for three things.

1. **A working prototype** they can drive live. A Vercel URL.
2. **A recorded walkthrough** of the question-and-answer part. Five to eight
   minutes. Suggested questions, in this order:
   - "Show me the cheapest supplier per line"
   - "Now only suppliers who passed the questionnaire" ← the ₹18.6 lakh moment
   - "Why is Vector's transceiver not the cheapest?" ← the unit trap
   - "Which numbers are you not sure about, biggest first?"
   - "Is Vector's ISO certificate valid?" ← answer contradicts attachment
   - "Compare strict compliance against normal" ← it refuses, correctly
3. **A one-page note** on what you decided and what you left out. Section 4 of
   this document plus the "Deliberately out" list from `BUILD-PLAN.md` is
   already 80% of that note.

And the brief's last line invites a fourth thing: tell them if you think the
interesting problem is elsewhere. It is section 9 of `BUILD-PLAN.md`, and the
short version is: most of this mess exists because the original request was
vague. A tool that refuses to send an unclear RFx would delete much of the
problem before it happens. Say it in three sentences and move on.

---

## 8. The dataset, and where everything lives

```
AC/
├── START-HERE.md          this file, the simple version
├── BUILD-PLAN.md          the detailed version, unchanged
└── dataset/
    ├── generators/        the code that builds the data
    │   ├── catalog.py         all the data in one place
    │   ├── build_all.py       rebuilds everything: python3 build_all.py
    │   └── normalise.py       THE CALCULATOR SPEC. Port this to TypeScript
    └── out/               32 files, ready to use
        ├── 00-rfx/            what the buyer sent out
        ├── 01-vendor-zenith/  ... through 05-vendor-helios/
        └── 99-internal/       the answer key, never read by the app
```

**The RFx pack, now as five separate documents as you asked:**

| File | What is in it |
|---|---|
| `01_Scope_of_Work.pdf` | What is being bought, where it ships, timeline, what is in and out of scope, award basis |
| `02_Line_Items.xlsx` | The 30 items with quantities and units. Includes a "Read this first" tab warning about the four traps |
| `03_Vendor_Questionnaire.xlsx` | 10 questions, 6 mandatory. States that where an answer and its attachment disagree, the attachment wins |
| `04_Commercial_Terms.pdf` | 18 terms: tax, delivery, payment, warranty, penalties, conditional discounts, MOQ, free goods |
| `05_Instructions_to_Bidders.pdf` | 12 numbered instructions, including the unit-of-measure warning the suppliers then ignore |

Splitting these is realistic, and it creates a trap on purpose: the
questionnaire comes back on a different day, in a different format, from a
different person than the prices. Nothing forces them to agree, and for Vector
they do not.

**Two files you should know about:**

`99-internal/ground-truth.json` is the answer key. It holds the correct value
for all 150 slots. **The app must never read it while running.** Use it to
score how accurate your Reader is, and to prove to Aerchain that the demo is
not scripted. That is a strong thing to show them.

`04-vendor-vector/variants/` holds five photos of the same page, from clean and
flat to dark and blurry. Use them to report accuracy as a curve rather than one
number from one flattering photo. The rule to state: accuracy is allowed to drop
on the hard photos. What must not happen is the software staying confident while
getting them wrong.

**To rebuild the whole dataset after any change:**

```bash
cd dataset/generators && python3 build_all.py
```

---

## 9. Numbers to have memorised before the demo

| | |
|---|---|
| Items being bought | 30 |
| Suppliers | 5 |
| Buyer's own budget estimate | ₹4.27 crore |
| Number slots in the comparison | 150 |
| Trustworthy | 107 |
| Needing a human | 12 |
| Cheapest per line, all suppliers | ₹3.88 crore |
| Cheapest per line, qualified only | ₹4.07 crore |
| **Cost of doing it properly** | **₹18.6 lakh, 4.8%** |
| Suppliers who passed the questionnaire | 2 of 5 |
| Vector's transceiver, as it looks | 89.9% cheaper than Zenith |
| Vector's transceiver, once units are fixed | 0.7% more expensive |

Every one of these comes out of `dataset/out/99-internal/award-scenarios.txt`,
which is regenerated by running the code. If you change the data, re-run it and
re-learn the numbers.
