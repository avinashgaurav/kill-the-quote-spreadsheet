# What I decided, and what I left out

*The one-page note. Longer working is in DECISIONS-v2.md; the flow is in WORKFLOW.md.*

**Category:** IT hardware. It has the densest unit traps per line of the four the brief
named, and unit traps are the edge that survives review because the number still looks
right.

---

## The six decisions everything else follows from

**1. The AI reads. The code counts.** The model reports what the document says, in the
supplier's own unit and currency. It never multiplies, converts, discounts, or adds.
Every arithmetic step happens in ordinary code, in a fixed order, and there are two
independent implementations of that calculator (Python and TypeScript) proven to agree
on all 150 cells by 442 assertions. You cannot do that to a model. The cost: my code
returns `unresolvable` where a model would have improvised. I'll take that trade.

**2. Absence has to be earned.** A read that returns nothing from a document that
plainly has prices *throws*. It used to succeed silently and put an empty column in
front of a buyer who would read it as "this supplier didn't quote". A weaker model did
exactly that to me, in 43 seconds, reporting no problem at all.

**3. Provenance is a NOT NULL column, not a convention.** A number that can't say where
it came from physically cannot be stored.

**4. Both readers report; code decides, and the attachment governs.** The same split runs twice. On a quotation the
model gives the number in the supplier's own unit and code computes landed cost. On a
questionnaire the model gives the answer, what they attached, and what the attachment
*says*, and code decides whether that satisfies the question. A supplier answers *"Yes,
we are ISO 27001 certified"* and attaches a certificate that expired and names the
withdrawn 2013 revision; a model asked "did they pass?" says yes, because they said yes.
Comparing a date to today is not a judgement call. And their response is a *form*, with
room for a filename and nothing else, so the named certificate is opened and read on its
own: read only the form and the honest answer is "nothing contradicts them", which is a
pass. I know because that is what it did until I checked. Three qualification states, not two:
passed, failed, and **not read** — and the third is the one that stops a screen claiming
a failure it has no evidence for.

**5. Five kinds of nothing, not one dash.** Declined, never mentioned, can't read it,
not a price, needs your call. Five different next actions, so five different marks. My
first build rendered all five identically, which turned five decisions into one shrug.

**6. Two correct numbers can still mislead.** One award scenario looks ₹77.5 lakh cheaper
and is ₹4.1 lakh *dearer* like-for-like, because it awards 27 lines instead of 30. Both numbers are
right, which is exactly why a careful person misses it. Whenever two scenarios don't
cover the same set of lines, the system says so and restates both on the common basis.
Nobody asked for this and no test would have caught it.

**The headline it produces:** ₹3.88 cr → **₹4.07 cr**, so doing this properly costs
**₹18.6 lakh (4.8%)**. The cheaper number was never available. It sat inside a supplier
who failed six mandatory items.

---

## What I deliberately left out

**Real email transport.** Stubbed, as permitted. The four documents are genuinely
generated; only the delivery hop is faked. The channel (email / portal / WhatsApp) is a
real choice, because a channel that can't carry an attachment sends a link, and the
supplier who gets a link on their phone is the one who replies with a photograph.

**Multi-tenancy.** Supplier codes are globally unique, not per enquiry. Fine for one
buyer; wrong for a real tenant model.

**A real mailbox.** Replies arrive because you invited a supplier whose document is on
file, not because anything was emailed or polled. The reading is real; the transport is
the stub the brief permits. The channel is not: choose WhatsApp and a supplier's
attached certificate genuinely does not arrive, because the medium cannot carry it, and
their answer then has nothing behind it.

**Auto-closing a chase.** When a supplier answers, nothing marks it answered
automatically. The buyer closes it with a reason. Matching a later upload to an open
request is a real feature, not a flag.

**`.msg` and iWork files.** Refused with instructions rather than half-read.

**A confident wrong number, which I can now prove happens.** Accuracy is measured:
across five formats, 107 of 107 lines, 100% price, 100% unit, nothing invented. Then I
read the same rate card as five photographs of falling quality, and the fourth came back
**52% accurate at 0.90 confidence on every wrong digit**. 59900 for 57900. 5600 for 9600.

That is the precise failure this design exists to prevent, so it is the honest answer to
*what does it show the buyer when it isn't sure*: on that photograph, it showed
certainty. My harness had missed it by comparing only the easiest and hardest images, so
a 48-point drop in the middle passed as a pass. It scores every row now. Whether the crop
re-read catches it in the product is open, and I would rather hand you a measured failure
than an unmeasured claim.

---

## The interesting problem is one step upstream

Every ugly edge traces back to an RFx line that was ambiguous when it left the building.
"32GB DDR5 RDIMM" without "as a matched kit of 2×16GB" comes back three different ways
from three suppliers, forever, no matter how good the extraction is.

So I built the gate: the enquiry is **held** if a line says "box" without saying how
many are inside. Each hold carries what it would cost and a one-click fix, and you can
override with a reason that stays on the enquiry. That's the smaller, more boring
product, and it deletes a lot of the chaos before it exists.

Then, working on it, a second one appeared that I think is better still. **The reading
was never the bottleneck. The incomplete response is.** One supplier here sent five
lines of email: 2 of 30 lines actually priced, no questionnaire, no terms. That's ₹2.89 crore sitting
behind a request nobody sent. So the system works out what each supplier still owes,
asks for only that, with a deadline, and records it, splitting "they never sent it" from
"they sent something we can't use as it stands" because those are different
conversations.

The point isn't the chasing. It's that **"their questionnaire is missing" and "we asked
on the 10th, gave them until the 16th, and nothing came back" are different facts**, and
only the second one lets a buyer award around a supplier and defend it to a CFO.

If I had another week I'd spend it there, and on measuring the accuracy I currently
can't.
