# Three RFx sets, for the interview

Each set is the same four things the brief names: **scope, line items, questionnaire, terms.**

Set 1 is what the product actually runs on. Sets 2 and 3 exist for one question you
will be asked: *"does this only work for IT hardware?"* The answer is that the four
parts and the ugly edges are the same shape in every category, and only the unit
traps change. Read Set 3 last: it is the one where a "line item" is not a thing at all.

---

## Set 1: IT hardware refresh (BUILT, this is the live demo)

**Buyer:** Kaveri Retail, 210 stores. **Value:** about Rs 4.27 crore at budget.

### Scope
Supply, delivery and 3-year onsite warranty of end-user compute, networking and
peripherals for a store-network refresh. Delivery to a central warehouse in Bengaluru
in three tranches. Prices asked ex-GST, in INR, DDP Bengaluru, 90-day validity.

### Line items (30, grouped)
| Group | Lines | Example | Asked in |
|---|---|---|---|
| End-user compute | 1 to 6 | Business laptop, i5, 16GB, 512GB | nos |
| Displays | 7 to 10 | 24" IPS monitor | nos |
| Networking | 11 to 16 | 48-port PoE+ switch, 10G SFP+ transceiver | nos, **box of 10** |
| Server and storage | 17 to 21 | 32GB DDR5 RDIMM | **kit of 2** |
| Peripherals and cable | 22 to 30 | Cat6A patch cord | **box of 50** |

The three bold rows are the whole point. A supplier quoting "per piece" against a line
asked "per box of 10" is off by 10x and the number still looks reasonable.

### Questionnaire (10 questions, 6 mandatory)
1. **M** OEM authorisation letter for every brand quoted (document required)
2. **M** ISO 27001 certificate, current, against the 2022 standard (document required)
3. **M** Average annual turnover, last 3 years, over Rs 25 crore
4. **M** Onsite service presence in all 14 states where we operate
5. **M** Confirm 3-year onsite warranty on all compute lines
6. **M** No sub-contracting of warranty service without written consent
7. Lead time in weeks for the largest single tranche
8. Escalation matrix, three levels, with names
9. Buy-back or trade-in of the equipment being replaced
10. Any line where you are quoting an equivalent rather than the exact make

### Terms asked
GST extra at actuals. DDP Bengaluru warehouse, freight and insurance in the price.
Payment 45 days from delivery and acceptance. Validity 90 days. INR only. No
part-shipment without prior approval. LD at 0.5% per week to a 5% cap.

---

## Set 2: Corrugated packaging (the brief's own example)

**Buyer:** a D2C brand, 4 fulfilment centres. **Value:** about Rs 3.1 crore a year.

### Scope
Annual rate contract for printed and plain corrugated shipping boxes, void fill and
tape, called off against a rolling 4-week forecast, delivered to four FCs. Rates asked
per 1,000 pieces, ex-GST, delivered.

### Line items (30, grouped)
| Group | Lines | Example | Asked in |
|---|---|---|---|
| Mailer boxes | 1 to 8 | 3-ply mailer, 250 x 200 x 75, 120 GSM kraft | **per 1,000 pcs** |
| Shipping cartons | 9 to 18 | 5-ply RSC, 450 x 350 x 300, 180 GSM | **per 1,000 pcs** |
| Printed variants | 19 to 24 | As line 3, 2-colour flexo, brand artwork | **per 1,000 pcs** |
| Void fill | 25 to 28 | Kraft paper honeycomb, 500mm roll | **per kg** and **per running metre** |
| Tape and strapping | 29 to 30 | BOPP tape 48mm x 65m | **per carton of 72** |

**The unit trap here is worse than in IT.** Packaging is quoted per 1,000 pieces, per
kilogram, per running metre, per bundle and per tonne, and the same supplier will
switch between them inside one quotation. A void-fill line quoted per kg against a
line asked per metre is not convertible without the GSM, which is a spec the supplier
may not have stated. That cell should come back **unresolvable**, not guessed.

Second trap: **corrugation is priced on paper, and paper moves.** Expect at least one
supplier to quote "current rates, subject to kraft paper index" which is a pointer,
not a price.

### Questionnaire (10 questions, 6 mandatory)
1. **M** FSC or equivalent chain-of-custody certificate (document required)
2. **M** BIS certification for the ply and bursting strength quoted (document required)
3. **M** Confirm ability to hold 2 weeks of buffer stock at your cost
4. **M** Confirm delivery to all four FCs, or name which you cannot serve
5. **M** Bursting strength in kgf/cm2, tested, per line quoted
6. **M** Price validity and the index against which you will seek revision
7. Minimum order quantity per SKU, and per delivery
8. Artwork change lead time and plate cost, if any
9. Recycled content percentage by weight
10. Any line where your board grade differs from the one specified

### Terms asked
GST extra. Delivered to four named FCs, freight in the price. Payment 30 days.
Rate held for 6 months, then revision only against a named public index with 30 days'
notice. Rejection right on bursting strength failure. No MOQ above 5,000 pieces.

---

## Set 3: Freight lanes (the hardest of the three, use this one to show range)

**Buyer:** a manufacturer moving finished goods ex-plant. **Value:** about Rs 6.5 crore a year.

### Scope
Annual rate contract for full-truckload primary freight across 30 named lanes,
awarded lane by lane, with a fallback carrier per lane. Rates asked per trip, ex-GST,
inclusive of all tolls and driver costs.

### Line items (30 lanes)
| Group | Lines | Example | Asked in |
|---|---|---|---|
| Long-haul, north | 1 to 8 | Pune to Delhi NCR, 32ft SXL, 9 T payload | **per trip** |
| Long-haul, east | 9 to 14 | Pune to Kolkata, 32ft MXL, 15 T | **per trip** |
| Regional | 15 to 24 | Pune to Nashik, 19ft, 7 T | **per trip** |
| Milk runs | 25 to 28 | Pune, 3 drops in Chakan, 19ft | **per trip, 3 drops** |
| Spot cover | 29 to 30 | Any lane, 24-hour notice | **per km** |

**Why this set is the hard one.** A "line item" here is not an object, it is a lane
plus a vehicle type plus a payload plus a service level, and carriers routinely quote
**per tonne** or **per km** against a line asked **per trip**. Converting per-tonne to
per-trip needs the payload, and the payload the carrier assumed is often not the
payload in the enquiry. That is an **unresolvable** cell, and a system that guesses it
will be wrong by 40% and look confident.

Second trap: **the price is not the price.** Detention after 6 hours, multi-point
charges, toll pass-through, fuel surcharge linked to a diesel index and unloading
labour are all quoted separately, and the cheapest per-trip rate is regularly the
dearest landed. The scope adjustment logic the product already uses for a warranty
uplift is the same mechanism.

### Questionnaire (10 questions, 6 mandatory)
1. **M** Valid national permit and fitness for the fleet quoted (document required)
2. **M** Goods-in-transit insurance, cover value per trip (document required)
3. **M** Owned versus attached fleet, as a percentage, per lane group
4. **M** Confirm GPS tracking with an API feed, and name the provider
5. **M** Placement guarantee: vehicles per week per lane, and the penalty if missed
6. **M** Confirm no unloading charge is payable by us at destination
7. Detention terms: free hours, then rate per hour
8. Fuel surcharge mechanism, and the index it is tied to
9. Average transit time per lane group, and your on-time record last year
10. Any lane where you would sub-contract rather than run your own vehicle

### Terms asked
GST under RCM. Rate inclusive of all tolls, permits, driver batta and loading.
Payment 21 days against POD. Rate held 12 months, fuel surcharge reviewable quarterly
against a named index. Placement failure penalty at the spot-rate differential.
Damage claims settled within 45 days.

---

## The one slide that ties all three together

The four parts never change. Only the trap changes.

| | IT hardware | Corrugated | Freight |
|---|---|---|---|
| The unit trap | per piece vs per box of 10 | per kg vs per running metre | per tonne vs per trip |
| Is it convertible? | Yes, pack size is in the spec | **No**, needs GSM the supplier omitted | **No**, needs the payload they assumed |
| The price that is not a price | "same as our March rates" | "subject to kraft index" | "plus fuel surcharge at actuals" |
| The hidden cost | warranty uplift on a separate line | plate cost, MOQ | detention, multi-point, unloading |
| The disqualifier | expired ISO certificate | no BIS test report | no goods-in-transit cover |

When a conversion needs a fact the supplier did not give you, the correct output is
**unresolvable**, not an estimate. That is the same rule in all three categories and
it is the single most defensible design decision in the product.
