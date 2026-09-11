# What I decided, and what I left out

*One page. The features are in [WHAT-I-BUILT.md](WHAT-I-BUILT.md); the long
working is in [DECISIONS-v2.md](DECISIONS-v2.md).*

**Category: IT hardware.** Of the four the brief named, it has the most unit
traps per line. A unit trap survives review because the wrong number still looks
right.

## Six decisions

**1. The AI reads. The code counts.** The model reports what the document says,
in the supplier's own unit and currency. It never multiplies, converts,
discounts or adds. Two independent calculators, one in Python and one in
TypeScript, are proven to agree on all 150 cells. The cost of this: my code
returns `unresolvable` where a model would have guessed.

**2. Absence has to be earned.** If a document plainly has prices and the read
returns none, the code raises an error instead of returning an empty column. A
weaker model silently returned nothing and reported no problem, and an empty
column reads as "this supplier didn't quote".

**3. Provenance is a NOT NULL column, not a convention.** A number that cannot
say where it came from physically cannot be stored.

**4. The attachment governs.** A model asked "did they pass?" says yes, because
they said yes. So the certificate named in an answer gets its own read, and
comparing its date to today is left to code. Three qualification states, not
two: passed, failed, and not assessed.

**5. Five kinds of nothing, not one dash.** My first build drew declined, never
mentioned, unreadable, not-a-price and needs-review identically, which turned
five different next actions into one shrug.

**6. Two correct numbers can still mislead.** The strict award looks ₹45.3 lakh
cheaper than the eligible-suppliers award and is ₹5.0 lakh dearer on the lines
they share, because it covers 28 lines instead of 30. Both numbers are right,
which is why a careful person misses it. So whenever two scenarios cover
different lines, the system says so and restates both on the common basis.

## What I deliberately left out

**Real email transport.** Stubbed, as the brief permits. The documents are
genuinely generated; only the delivery hop is faked. The channel choice is not
faked: pick WhatsApp and a certificate genuinely does not arrive.

**Per-enquiry tenancy.** Supplier codes are globally unique. Fine for one buyer,
wrong for a real tenant model.

**Full independence from the shipped example.** Lines, suppliers, questionnaire
and verdicts are all per-enquiry, but a drafted enquiry still borrows the
example's buyer and assumption ledger, and `get_provenance` reads line
descriptions from the shipped catalog. Any category runs; not every corner of it
is clean yet.

**A rupee figure on each ambiguity hold.** The gate says what a supplier could
do with an ambiguous line, in words. What it would cost is the harder and more
useful number, and I did not get to it.

**Auto-closing a chase.** When a supplier answers, nothing marks it answered.
The buyer closes it with a reason. Matching a later upload to an open chase is
real work, not a one-line flag.

**`.msg` and iWork files.** Refused with instructions rather than half-read.

**A fix for the failure I can now prove.** Across five formats and 107 of 107
lines, the reader scored 100% on price, 100% on unit, and invented nothing. Then
I read the same rate card as five photographs of falling quality, and the fourth
came back **52% accurate, at 0.90 confidence on every wrong digit**. 59900 for
57900. 5600 for 9600. This is the failure the whole design is meant to prevent,
and it is the honest answer to "what does the screen show when it isn't sure":
on that photograph, it showed certainty. My harness had missed it by testing
only the easiest and hardest images, so a 48-point drop in the middle never
showed up. It scores every row now. Both figures come from `npm run accuracy`,
which is in the repo and needs an API key.

## The problem is one step upstream

Every ugly edge traces back to a line that was ambiguous when it left the
building. "32GB DDR5 RDIMM" without "as a matched kit of 2x16GB" comes back
three different ways from three suppliers, regardless of extraction quality. So
I built the gate that holds the enquiry until the line says how many are in a
box.

Working on that, a better problem appeared. **The reading was never the
bottleneck. The incomplete response is.** Helios sent five lines of email: 2 of
30 lines priced, no questionnaire, no terms. The 28 lines they left alone are
worth ₹2.89 crore at the cheapest bid on each, sitting behind a request nobody
sent.

"Their questionnaire is missing" and "we asked on the 10th, gave them until the
16th, and nothing came back" are different facts, and only the second lets a
buyer award around a supplier and defend it to a CFO.

With another week I would build that, and measure the accuracy I currently
cannot.
