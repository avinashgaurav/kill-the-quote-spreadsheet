# PRD: Kill the Quote Spreadsheet

Independent product case study. All data is fictional.

## Problem and evidence

Suppliers reply to an RFx as spreadsheets, PDFs, emails and phone photos, and someone retypes it all into one sheet. A follow-up question ("cheapest per line, among suppliers who passed the questionnaire") then means opening certificates by hand.

- **Assumption, not validated:** retyping costs about three days per sourcing event, and the follow-up question about one more. No buyer interviews or time studies exist yet.
- **Evidence in the repo:** a fictional event with 30 lines, 10 invited suppliers and 5 replies in 5 formats (`dataset/out`), plus a 31-file stress set. It models the traps: pack-size units, USD quotes, partial bids, expired certificates.

## Target user and job to be done

A category manager running a mid-size RFx. *When replies arrive in mixed formats, I want one like-for-like comparison I can question and defend, so I can award without retyping or trusting numbers I cannot trace.*

## Goals

1. Every reply read into the same lines, units and currency.
2. Every number traceable to its source document.
3. Uncertainty shown, never hidden or guessed.
4. Questions answered in plain English, ending in a defensible award note.

## Non-goals

Real email delivery (stubbed), ERP integration, multi-tenancy, supplier portals, negotiation, editing prices (needs an audit trail first).

## The AI boundary: model reads, code counts

The model extracts what a document says, in the supplier's own unit and currency, including questionnaire answers and attachments. Code does every conversion, total and verdict.

**Why AI:** reply formats are unbounded (a photo, a price in a sentence), so rules cannot read them. **Why not AI for maths or verdicts:** they must be exact and repeatable, and a model asked "did they pass?" may echo the supplier's "yes".

## Success metrics

| Metric | Definition | Baseline | Release threshold |
|---|---|---|---|
| **North star:** time to award-ready | Last supplier reply received to a comparison with no unresolved cells | Not yet measured | TBD (measured in EVALS.md) |
| Price exactness | Extracted prices matching the answer key exactly | TBD (measured in EVALS.md) | TBD |
| Invented-value rate | Extracted values with no source in the document | TBD (measured in EVALS.md) | 0% |
| Contested-value rate | Prices where two independent reads disagree, routed to a person | TBD (measured in EVALS.md) | TBD |
| Cost per normalised quote | Model spend to read one quotation fully | Estimated only (`npm run cost-model`); not measured | TBD |

**Guardrails already enforced by tests (`npm run test:all`):** two independent calculators agree on all 150 cells (442 assertions); 69 regression cases for shipped bugs; 16 questionnaire-verdict cases.

## Risks

- A small price misread on a photo can look right; only the eight largest numbers per photo get a second read.
- Model confidence did not track accuracy on degraded photos, so confidence cannot gate trust.
- Suppliers added at upload stay "not assessed".

## What's next

1. Commit an evaluation run (EVALS.md) to fill the baselines above.
2. Time three real or role-played RFx events to test the time assumption.
3. Buyer corrections with an audit trail.
4. A second read for every photo price, not just the largest eight.
