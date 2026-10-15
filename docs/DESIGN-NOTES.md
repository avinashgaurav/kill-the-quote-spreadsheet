# Design notes

What the product is, what it looks like, and every requirement checked against the code. Moved here from the [README](../README.md).

## What it is

A buyer talks an RFx into existence, it goes out to suppliers on a channel they choose,
the suppliers reply in whatever shape suits them, and the system reads all of it into one
side-by-side comparison the buyer can interrogate in plain English, all the way to a
defensible award.

An independent product case study in AI-assisted procurement. The demo runs on a fully
**fictional** dataset: thirty line items, a questionnaire, attached documents, and a roster
of ten made-up suppliers of whom five reply. No real company, supplier or price is used.

**Live demo:** https://kill-the-quote-spreadsheet.vercel.app. Browsing is open: the
comparison grid, cell provenance, supplier panels and all four exports. Anything that calls
a model (drafting an enquiry, reading an upload or a reply, asking the analyst) needs an
access code. Ask the author for one.


## Screenshots

![The comparison grid: thirty lines, five suppliers, coverage and contested cells flagged](screenshots/comparison-grid.png)
*The comparison grid: every price landed in rupees per the asked unit, with off-spec, contested and missing cells marked.*

![Cell provenance panel for a price the reader could not read](screenshots/cell-provenance.png)
*Any cell opens its provenance: what the supplier wrote, where it came from, and every step that made it comparable.*

![Supplier panel showing questionnaire verdicts and the evidence behind them](screenshots/supplier-panel.png)
*The supplier panel: each questionnaire verdict with the sentence that produced it, including the expired certificate.*

![Access-code dialog shown before any model call on the public demo](screenshots/access-code.png)
*On the public demo, every model call asks for an access code first; browsing and exports stay open.*

Screenshots use the fictional dataset loaded through the local test harness, so the "test data" banner is expected. Its totals differ from the live site's: the harness holds every price as typed (cheapest from anyone ₹3.88 cr), while the live site reads the documents and excludes contested photo prices (₹3.91 cr).


## The problem, requirement by requirement

The requirements I set for the product, checked against the code rather than
asserted. Every row names the file behind it.

| Requirement | Where it lives |
|---|---|
| The buyer **drafts the RFx by conversation** with an AI co-pilot: scope, line items, questionnaire, terms | `lib/copilot.ts`, a real tool loop. Type anything, in any category. The four suggested openers are examples, not paths. |
| The buyer **picks the channel** the RFx goes out on | `api/rfx/send` generates four real documents. The channel is consequential, not a label: WhatsApp cannot carry an attachment, so the pack goes as a link **and a supplier's certificate does not arrive**, which is why their questionnaire answer then has nothing behind it. Your choice at step 3 is the reason step 4 is harder. |
| Suppliers **reply in their own format**, not a buyer template | Five native shapes in `dataset/out`: an xlsx on the supplier's own template, a 3-page PDF, a docx with prices in sentences, a phone photograph, a five-line email. Plus a 31-file stress set: 22 awkward formats (odt, ods, csv, tsv, rtf, txt), 5 photographs of falling quality, and 4 deliberately broken files. |
| **Every** reply is read, whatever its format | `lib/extract/run.ts`. One forced tool, no others. A read that finds nothing **throws** rather than returning an empty column. `npm run sees -- <file>` shows exactly what reaches the model for any file, including yours. |
| One side-by-side comparison with **lines, units and currency aligned** | `lib/normalise.ts`, proven cell-for-cell against an independent Python implementation by 442 assertions. Aliases never change a number, conversions always do, and a conversion with no rule **refuses** instead of guessing. |
| **Questionnaire answers and attachments** shown next to the prices | Both read, both openable. A questionnaire form names a filename and nothing more, so the named document is opened and read **in its own right** and the document governs where the two disagree. Click it in the supplier panel to read the certificate yourself. |
| The buyer **questions the whole comparison** in plain English | `lib/analyst.ts`. Ten tools that compute, no `evaluate`, no SQL, no arithmetic in prose. Tools are bound to the **loaded** enquiry, so a supplier you uploaded is visible to every one of them. |
| Answers come back as **text, tables, charts or exports** | Text and markdown tables. Bar charts, coloured by group, so "who wins each of thirty lines" is one chart. Four exports: award note, xlsx with provenance in cell comments, CSV, and a JSON audit bundle. |
| Analysis runs **on extracted data** and ends in an award the buyer can defend | The award note leads with what the total rests on, why not the cheapest, the assumptions in force, the money deliberately not counted, and who was asked for what and whether they replied. |
| Realistic scale: several suppliers, dozens of lines, a questionnaire, attachments | 30 lines, 10 suppliers of whom 5 reply, 10 questions of which 6 are mandatory, certificates and OEM letters. |
| A fictional dataset a procurement professional would find credible | HSN codes per line, GSTIN and CIN, pack sizes that trap ("kit of 2", "box of 10", "box of 50"), MOQ, ex-works Singapore, a discount buried in footnote 3 on page 3, a prior-PO rate card, and a Rev 2 that supersedes a Rev 1. Known inconsistency, left as the supplier wrote it: Cygnus's terms say the 88.4 rate is "shown on page 1", but it sits on page 2. |
| **The core constraint:** the AI loops are real, and no demo question is answered from a stored answer | Six model call sites, no lookup tables, and **two violations of this found and fixed** rather than avoided. See below. |

**The two violations, because finding them is the point.** The analyst's
questionnaire tool served a `passed` boolean and a hand-typed `finding`
sentence out of `catalog.json`, so the suggested question *"is Vector's ISO
27001 certificate actually valid?"* was answered by handing the model my own
conclusion. And the finding itself did not survive a real read at all: the
revision year and the expiry date live inside an attached PDF that nothing ever
opened. Reading only the form, the honest answer to "does anything contradict
them?" was no, so Vector's six mandatory failures dropped to five and the
screen showed them passing the ISO question. Opening the attachment puts it
back to six, which is what the live site reads today. Both are now derived, and
`regression-test` has three cases pinning the second, including one asserting
that the **form alone must not** produce the finding.


## Evals

Measured on a fully fictional corpus: 5 supplier replies in 5 formats (107 priced lines) and 5 photos of one rate card, from easy to very hard. Method and every miss: [EVALS.md](../EVALS.md).

| Measure | Result |
|---|---|
| Priced lines read exactly, price and unit | 107 / 107, after two fixes derived from this same corpus |
| Prices invented for lines the supplier never priced | 0 |
| Hardest photo (low light) | 7 / 21 exact. Every wrong price came back at confidence 0.55 or below and is flagged low-confidence in the UI. Confidence does not gate the calculator's totals: in the app, the photo cross-check (`verifyPhotos`) re-reads the largest figures from a crop on a second model and keeps any it disagrees on out of every total. This eval ran with that cross-check off. |

The fixes had a side effect: mean confidence on Helios fell from 0.87 to 0.40 (prices still exact; both rows now show as needing review) and on Orbit from 0.94 to 0.82. Run through the Claude Code CLI with the app's own prompts and schema, not the production API path; an API rerun is planned.
