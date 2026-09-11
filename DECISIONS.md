# What I decided, and what I left out

**Kill the Quote Spreadsheet** · https://kill-the-quote-spreadsheet.vercel.app

**I picked IT hardware.** Of the four categories offered, it has the most unit
traps per line: kits, boxes of 10, boxes of 50, per-piece, per-DIMM. A unit trap
is the edge that survives review, because the wrong number still looks right.

## Six decisions

**1. The AI reads. The code counts.** The model reports what a document says, in
the supplier's own unit and currency. It never multiplies, converts, discounts
or adds. I wrote the calculator twice, in Python and in TypeScript, and a test
proves the two agree on all 150 cells. You cannot get that guarantee from a
model. The cost: my code says "cannot resolve this" where a model would have
produced something plausible. Worth it.

**2. Absence has to be earned.** If a document plainly has prices and the read
returns none, the code errors rather than handing back an empty column. A weaker
model gave me that empty column and reported no problem. To a buyer it reads as
"this supplier didn't quote", which is a supplier losing business to my bug.

**3. Provenance is a database constraint, not a convention.** A number that
cannot say where it came from cannot be stored. Structural, because I would not
have remembered the rule.

**4. The attachment governs.** A supplier says "yes, we are ISO 27001 certified"
and attaches a certificate for the withdrawn 2013 revision. A model asked "did
they pass?" says yes, because they said yes. So the certificate gets its own
read, and comparing its expiry to today is left to code. Three qualification
states, not two: passed, failed, and **not assessed**. The third matters most,
because without it a screen can claim a failure it has no evidence for.

**5. Five kinds of nothing, not one dash.** Declined, never mentioned, cannot
read it, not a price, needs your call. My first build drew all five identically,
turning five different next actions into one shrug.

**6. Two correct numbers can still mislead.** The strict award looks ₹45.3 lakh
cheaper than the eligible-suppliers award and is ₹5.0 lakh *dearer* on the lines
they share, because it covers 28 lines instead of 30. Both are right, which is
why a careful person misses it. So when two scenarios cover different lines, the
system says so and restates both on the common basis first.

## What I deliberately left out

- **Real email transport.** Stubbed, as permitted. The documents are genuinely
  generated; only delivery is faked. The channel choice is not faked: pick
  WhatsApp and a certificate genuinely does not arrive.
- **Per-enquiry tenancy.** Supplier codes are globally unique. Fine for one
  buyer, wrong for a real tenant model.
- **Full independence from the shipped example.** You can draft your own
  enquiry and it works, but it still borrows the example's buyer and assumption
  ledger, and one analyst tool reads line descriptions from the catalogue.
- **Scale.** 30 lines and 5 replies is what is tested, not 300 and 30.
- **A rupee figure on each ambiguity flag.** The gate says what a supplier could
  do with an ambiguous line. What it would cost is the better number. Not done.
- **Auto-closing a chase.** The buyer closes a request with a reason. Matching a
  later upload to an open request is real work, and I would rather it be
  obviously manual than quietly wrong.

**And a failure I can prove rather than a fix for it.** Across five formats and
107 of 107 lines, the reader scored 100% on price, 100% on unit, and invented
nothing. Then I read the same rate card as five photographs of falling quality,
and the fourth came back **52% accurate, at 0.90 confidence on every wrong
digit**. 59,900 for 57,900. That is the exact failure this design exists to
prevent, and the honest answer to "what does it show when it isn't sure": on
that photograph, it showed certainty. My own harness had missed it by testing
only the easiest and hardest images. It scores every row now. Better a measured
failure than an unmeasured claim.

## The interesting problem was somewhere else

Every ugly edge traces back to **a line that was ambiguous when it left the
building.** "32GB DDR5 RDIMM" without "as a matched kit of 2x16GB" comes back
three different ways from three suppliers, forever, however good the extraction
gets. So I built the gate that holds an enquiry until the line says how many are
in the box.

Then a better problem appeared, and I think it is the real one. **The reading
was never the bottleneck. The incomplete response is.** Helios sent five lines
of email: 2 of 30 lines priced, no questionnaire, no terms. The 28 lines they
left alone are worth **₹2.89 crore** at the cheapest bid on each. No amount of
model quality fixes that. It is ₹2.89 crore behind a request nobody sent.

So the system works out what each supplier still owes, asks for only that, with
a deadline, and keeps "they never sent it" apart from "they sent something we
cannot use". The point is not the chasing. It is that **"their questionnaire is
missing" and "we asked on the 10th, gave them until the 16th, and nothing came
back" are different facts**, and only the second lets a buyer award around a
supplier and defend it to a CFO.

Get good at reading documents and stay bad at closing the loop, and buyers end
up with beautiful comparisons of incomplete data. Another week goes there.
