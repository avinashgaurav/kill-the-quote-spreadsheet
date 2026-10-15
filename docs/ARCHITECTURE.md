# Architecture

How the model and the code split the work, the rule the build is held to, and where everything lives. Moved here from the [README](../README.md).

## Two loops, one rule

The model reads two kinds of document, and the split is the same in both:

| | The model reports | Code decides |
|---|---|---|
| **A quotation** | the number, in the supplier's own unit and currency | landed cost, in the asked unit, in rupees |
| **A questionnaire** | the answer, what they attached, and what the attachment *says* | whether that satisfies the question |

The second one is worth a sentence. A supplier answers *"Yes, we are ISO 27001
certified"* and attaches a certificate that expired and names the withdrawn 2013
revision. The answer and its own evidence disagree. A model asked "did they
pass?" might well say yes, because they said yes. Comparing a date to today is
not a judgement call, so code does it, and every verdict carries the sentence
that produced it.

There are three qualification states, not two: passed, failed, and **not assessed**.
The third is the one that matters, because without it a screen can claim a
failure it has no evidence for.


## The one rule

The constraint I held the build to: delivery plumbing may be stubbed, but reading,
reasoning and answering must be real model calls, and no demo question may be answered
from a stored answer.

- **Stubbed:** the delivery hop only. The four enquiry documents are really generated.
- **Real:** drafting, reading and answering are model calls. Extraction is cached on
  `(model, prompt hash, file hash)`, so change one byte of a document or one word of the
  prompt and it genuinely re-reads.
- **Nothing hardcoded, and each of these was once false.** Zero branches on question
  text or on a drafting message. Zero hardcoded amounts. No arithmetic rule keyed to a
  supplier code or a line number. No stored qualification verdict, and no analyst tool
  reading one: the tool that answers *"is Vector's ISO 27001 certificate actually
  valid?"* used to serve a `passed` boolean and a `finding` sentence out of
  `catalog.json`, which is exactly the shortcut this project rules out. Every one of these
  now has a regression test, because each was found rather than avoided.
- **Two branches on a filename, both deliberate.** Which supplier sent an unrecognised
  file, and whether a document is a questionnaire rather than a quotation. Both are
  hints that fail safe: the first refuses and asks rather than guessing, and the second
  is recoverable because a quotation read as a questionnaire returns no answers and
  throws loudly.
- **Your data, not the shipped data.** Draft any enquiry, invite any subset of the
  roster, upload a quotation from a company that appears nowhere in this repository:
  it gets its own column, is marked *not assessed*, can be chased, is visible to every
  analyst tool, and lands in the award note. Seven end-to-end cases cover exactly this,
  because the property worth protecting is not that the demo works but that the demo is
  not the only thing that does.

The AI reads. The code counts. Two independent implementations of the calculator, one in
Python and one in TypeScript, are proven to agree on all 150 cells.


## Layout

```
dataset/generators/   the fabricated corpus, and normalise.py: the REFERENCE calculator
dataset/out/          five supplier replies in five shapes, and a 31-file stress set
web/lib/normalise.ts  the TypeScript calculator, proven against the Python one
web/lib/extract/      readers per format, the extraction contract, the reader loop
web/lib/chase.ts      what each supplier still owes, and how to ask for only that
web/lib/questionnaire.ts  whether an answer holds, and the sentence that says why
web/app/api/rfx/inbox/    replies arriving: transport stubbed, reading real
web/scripts/          every test suite
```

`dataset/out/99-internal/ground-truth.json` is an oracle. The running app must never read
it; it exists to score extraction accuracy and to prove the demo is not scripted.
