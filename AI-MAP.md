# Where the AI is used, and where it deliberately is not

Six model calls. Nothing else in this product talks to a model, and this file is
the complete list. If a number on the screen cannot be traced to one of these
six calls or to code computing over their output, it is a bug.

The rule the whole design follows: **the AI reads, the code counts.** A model is
asked what a document *says*. It is never asked what that *means*, never asked
to do arithmetic, and never asked whether somebody passed.

---

## The six calls

| # | Where | What it is asked | What it may NOT do |
|---|---|---|---|
| 1 | **Draft the enquiry**<br>`lib/copilot.ts` → `api/copilot` | Turn "I need 200 laptops for three offices" into scope, 30 line items, a questionnaire and terms. 3 tools, up to 8 turns. | Invent a price or an estimate. It has no view on what things cost. |
| 2 | **Read a quotation**<br>`lib/extract/run.ts` | What does this document say, line by line, in the supplier's own unit and currency? One forced tool, no others. | Convert, multiply, discount, add, or rank. Report a number it cannot read. Return a value with no source. |
| 3 | **Re-read a photograph's crop**<br>`lib/extract/run.ts:393` | Just this one value, cropped out, with no surrounding context. Cheap model, thinking off. | See the rest of the document. Two reads that agree is evidence; two that disagree drops the confidence. |
| 4 | **Read a questionnaire response**<br>`lib/extract/questionnaire.ts` | What did they answer, and what did they attach? Answer and evidence kept strictly apart. | Decide whether they pass. It returns no verdict at all. |
| 5 | **Read an attached document**<br>`lib/extract/questionnaire.ts:338` | What do *you* say about yourself: which standard, with its revision year exactly as printed, which expiry date, issued to whom? | Judge whether it satisfies the question it was attached to. |
| 6 | **Answer the buyer**<br>`lib/analyst.ts` → `api/analyst` | Choose which questions to put to the calculator, and explain what comes back. 10 tools, up to 12 turns. | Compute anything. There is deliberately no `evaluate` tool, no SQL, and no way to hand it two numbers and ask for their sum. |

All six go through one seam, `lib/llm.ts`, so the provider is a one-line change
and every call is bounded the same way: a thinking budget, an output ceiling
sized to the real output, and a wall-clock retry budget.

---

## What code does instead, and why it has to

| The judgement | Who makes it | Why not the model |
|---|---|---|
| Landed cost per the unit you asked for | `lib/normalise.ts` | Two independent implementations, one in Python and one in TypeScript, proven to agree on all 150 cells by 442 assertions. You cannot do that to a model. |
| Whether an answer satisfies a question | `lib/questionnaire.ts` | Comparing a revision year to the one asked for, and an expiry date to today, is not a judgement call. Every verdict carries the sentence that produced it. |
| Which supplier is cheapest on a line | `lib/normalise.ts` | Deterministic, and it has to be identical in the grid, the analyst, the chase and the award note. |
| Whether two totals are comparable | `likeForLike()` | Two scenarios over different line sets have incomparable totals. A model would compare them because they are both numbers. |
| What a supplier still owes | `lib/chase.ts` | Splits "never sent it" from "sent something we cannot use", which are different conversations. |
| Whether a cell can be awarded | `isAwardable()` | A price derived from a prior order is excluded until the supplier confirms it. Awarding against an offer nobody made is not an award. |

---

## The trade this costs me

My code returns `unresolvable` where a model would have improvised a number.
That is the deal: **31 of 150 cells carry no usable price**, and a model asked
to fill them in would have produced something plausible for most of them. A
plausible price is worse than an admitted gap, because a gap gets chased and a
plausible price gets awarded.

---

## Where a model call would be wrong, and I did not make one

- **Matching a file to a supplier.** Filename matching in code. If it matches
  nobody the upload is *refused*, not guessed, because a price in the wrong
  column is a mistake nobody downstream can detect.
- **Telling a questionnaire from a quotation.** A regex on the filename. Wrong
  guesses are recoverable: a quotation read as a questionnaire returns no
  answers and throws loudly.
- **Deciding which attachment backs an answer.** The supplier's own citation
  decides. A file that merely arrived in the same email is never treated as
  evidence, and is never read or charged for.
- **Any arithmetic, anywhere.**

---

## What is stubbed, precisely

Exactly one thing: **the delivery hop.** No SMTP server, no WhatsApp API, no
mailbox polled. A supplier "replies" because their document is on file and you
invited them.

The channel is *not* stubbed, and it has consequences: WhatsApp cannot carry an
attachment, so the pack goes out as a link and a supplier's certificate does not
come back, which is why their questionnaire answer then has nothing behind it.

Everything that arrives is read through the identical path as a file you drag
in: same model call, same schema, same provenance, same loud failure on an empty
read. A button that makes prepared answers appear is a scripted demo. A button
that makes real documents arrive, which are then genuinely read, is a stubbed
transport. The screen says which of those it is doing.

---

## How to check any of this yourself

```bash
cd web
npm run api-check      # is the model reachable, and which tier
npm run sees -- <file> # exactly what reaches the model for any document
npm run verify         # 9 suites, no API key, 40 seconds
npm run accuracy       # is the reading actually right (needs a key)
```

`regression-test` includes cases 17, 21, 21b, 21c and 25, each of which exists
because this rule was once broken here: a qualification verdict from a typed
table, an analyst tool serving a hand-written finding, an attached certificate
nothing ever opened, and an award note calling an unassessed supplier
qualified. Each was found rather than avoided, and each now fails the build if
it returns.
