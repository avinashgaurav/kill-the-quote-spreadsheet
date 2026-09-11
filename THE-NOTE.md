# What I decided, and what I left out

*One page. The long working is in `DECISIONS-v2.md`; the features are in
`WHAT-I-BUILT.md`.*

**Category: IT hardware.** It has the densest unit traps per line of the four
the brief named, and a unit trap is the edge that survives review, because the
number still looks right.

## Six decisions everything else follows from

**1. The AI reads. The code counts.** The model reports what the document says,
in the supplier's own unit and currency. It never multiplies, converts,
discounts or adds. Two independent calculators, Python and TypeScript, are
proven to agree on all 150 cells. You cannot do that to a model. The cost: my
code returns `unresolvable` where a model would have guessed.

**2. Absence has to be earned.** A read that finds nothing in a document that
plainly has prices throws. It used to succeed silently and put an empty column
in front of a buyer, who reads that as "this supplier didn't quote". A weaker
model did exactly that to me in 43 seconds and reported no problem.

**3. Provenance is a NOT NULL column, not a convention.** A number that cannot
say where it came from physically cannot be stored.

**4. The attachment governs.** A supplier answers "yes, we are ISO 27001
certified" and attaches a certificate for the withdrawn 2013 revision. A model
asked "did they pass?" says yes, because they said yes. So the certificate is
opened and read on its own, and comparing a date to today is left to code. Three
qualification states, not two: passed, failed, and **not assessed**.

**5. Five kinds of nothing, not one dash.** Declined, never mentioned, cannot
read it, not a price, needs your call. Five next actions, so five marks. My
first build drew all five identically, turning five decisions into one shrug.

**6. Two correct numbers can still mislead.** One scenario looks ₹77.5 lakh
cheaper and is ₹4.1 lakh dearer like-for-like, because it awards 27 lines
instead of 30. Both numbers are right, which is exactly why a careful person
misses it. Nobody asked for this and no test would have caught it.

## What I deliberately left out

**Real email transport.** Stubbed, as the brief permits. The documents are
genuinely generated; only the delivery hop is faked. The channel choice is not
faked: pick WhatsApp and a certificate genuinely does not arrive.

**Multi-tenancy.** Supplier codes are globally unique, not per enquiry. Fine for
one buyer, wrong for a real tenant model.

**Auto-closing a chase.** When a supplier answers, nothing marks it answered.
The buyer closes it with a reason. Matching a later upload to an open request is
a real feature, not a flag.

**`.msg` and iWork files.** Refused with instructions rather than half-read.

**A fix for the failure I can now prove.** Across five formats, 107 of 107
lines: 100% on price, 100% on unit, nothing invented. Then I read the same rate
card as five photographs of falling quality, and the fourth came back **52%
accurate at 0.90 confidence on every wrong digit**. That is the exact failure
this design exists to prevent, and the honest answer to "what does it show when
it isn't sure": on that photograph, it showed certainty. My harness had missed
it by testing only the easiest and hardest images, so a 48-point drop in the
middle passed as a pass. It scores every row now. Better a measured failure than
an unmeasured claim.

## The more interesting problem is one step upstream

Every ugly edge traces back to a line that was ambiguous when it left the
building. "32GB DDR5 RDIMM" without "as a matched kit of 2x16GB" comes back
three ways from three suppliers, forever, however good the extraction gets. So I
built the gate that holds the enquiry until the line says how many are in a box.

Working on that, a better problem appeared. **The reading was never the
bottleneck. The incomplete response is.** One supplier here sent five lines of
email: 2 of 30 lines priced, no questionnaire, no terms. That is ₹2.89 crore
sitting behind a request nobody sent. "Their questionnaire is missing" and "we
asked on the 10th, gave them until the 16th, and nothing came back" are
different facts, and only the second lets a buyer award around a supplier and
defend it to a CFO.

Another week goes there, and on measuring the accuracy I currently cannot.
