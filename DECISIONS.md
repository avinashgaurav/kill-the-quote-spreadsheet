# What I decided, and what I left out

**Kill the Quote Spreadsheet** · https://kill-the-quote-spreadsheet.vercel.app

**I picked IT hardware.** Of the four categories offered, it has the most unit
traps per line: kits, boxes of 10, boxes of 50, per-piece, per-DIMM. A unit trap
is the edge that survives review, because the wrong number still looks right.

## Five decisions

**1. The AI reads. The code counts.** The model reports what a document says, in
the supplier's own unit and currency. It never multiplies, converts, discounts
or adds. I wrote the calculator twice, in Python and in TypeScript, so the total
cannot drift, and a test proves the two agree on all 150 cells. No number can be
stored without saying where it came from; that is a database constraint, not a
habit.

**2. The attachment governs, and there are three states.** A supplier says "yes,
we are ISO 27001 certified" and attaches a certificate for the withdrawn 2013
revision. A model asked "did they pass?" says yes, because they said yes. So the
certificate gets its own read, and comparing its expiry to today is left to
code. Passed, failed, and **not assessed**: the third matters most, because
without it a screen can claim a failure it has no evidence for.

**3. Five kinds of nothing, not one dash.** Declined, never mentioned, cannot
read it, not a price, needs your call. My first build drew all five identically,
turning five different next actions into one shrug. They are five different
conversations with five different suppliers, so they get five different marks.

**4. Two correct numbers can still mislead.** The strict award looks ₹45.3 lakh
cheaper than the eligible-suppliers award and is ₹5.0 lakh *dearer* on the lines
they share, because it covers 28 lines instead of 30. Both are right, which is
why a careful person misses it. So when two scenarios cover different lines, the
system says so and restates both on the common basis first.

**5. The gate is overridable on purpose.** The enquiry is held if a line says
"box" without saying how many are inside. Overridable with a typed reason rather
than a hard block, because an unclickable button gets worked around by editing
the draft until the check stops firing, and that leaves no record at all. The
reason prints in the award note, so the buyer who overrode it answers to the
CFO, not to me.

## What I got wrong

**The analyst was answering one of my own demo questions from a lookup table.**
Its questionnaire tool served a pass/fail boolean and a hand-typed finding out
of a catalog file, so *"is Vector's ISO 27001 certificate actually valid?"* was
answered by handing the model my own conclusion. That is the one thing the brief
forbids by name. Both are derived now.

**The award recommendation did not add up.** Found while writing the other
document. The tool gave the model thirty line amounts and no subtotal, so asked
to draft the award it summed them in prose: ₹1.48 cr and ₹2.49 cr against true
figures of ₹1.85 cr and ₹1.46 cr, three parts totalling ₹4.70 cr against the
₹4.05 cr it had quoted correctly two sentences earlier. On the one sentence a
buyer defends to a CFO. "The model must not do arithmetic" is only an
instruction until the tool stops requiring it, so the tool now returns the split
and the model quotes it.

**Confidence was the wrong trigger.** I read one rate card as five photographs
of falling quality. The fourth came back 52% accurate, at 0.90 confidence on
every wrong digit, so a low-confidence check would never have fired. The second
read is triggered by money now: the eight largest numbers on any photograph get
checked independently whatever the model claims. A cell below that threshold can still be
read, plausible and wrong, and that is the top open risk in the build. My
harness had missed all of it by testing only the easiest and hardest images.

## What I deliberately left out

- **Real email transport.** Stubbed, as permitted. The documents are genuinely
  generated; only delivery is faked. The channel choice is not faked: invite a
  supplier on WhatsApp and their certificate genuinely does not arrive.
- **Letting the buyer correct a cell.** They can change any assumption and
  chase a supplier for a better answer. They cannot type over a number the
  reader got wrong. That is the right next feature, and it needs an audit trail
  rather than a text box.
- **Per-enquiry tenancy.** Supplier codes are globally unique. Fine for one
  buyer, wrong for a real tenant model.
- **Full independence from the shipped example.** You can draft your own
  enquiry and it works, but it still borrows the example's buyer and assumption
  ledger, and one analyst tool reads line descriptions from the catalogue.
- **Scale.** 30 lines and 5 replies is what is tested, not 300 and 30.
- **A rupee figure on each ambiguity hold.** The gate says what a supplier could
  do with an ambiguous line. What it would cost is the better number. Not done.

## The interesting problem was somewhere else

Every ugly edge traces back to **a line that was ambiguous when it left the
building.** "32GB DDR5 RDIMM" without "as a matched kit of 2x16GB" comes back
three different ways from three suppliers, however good the extraction gets. So
I built the gate that holds an enquiry until the line says how many are in the
box.

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
