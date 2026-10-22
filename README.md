# Kill the Quote Spreadsheet

Suppliers reply to an RFx as spreadsheets, PDFs, emails and phone photos, and someone retypes it all into one sheet before anyone can compare a price.

**Live demo:** https://kill-the-quote-spreadsheet.vercel.app (browsing and exports are open; model calls need an access code from the author). All data is fictional.

![Demo: comparison grid, cell provenance, supplier panel, access code](docs/demo.gif)

> [!NOTE]
> **How well it reads (tests).** I tested it on fictional data: 5 supplier replies in 5 formats (107 priced lines) and 5 photos of one rate card.
>
> | Measure | Result |
> |---|---|
> | Priced lines read with the exact price and unit | **107 / 107** |
> | Prices made up for lines the supplier never priced | **0** |
> | Hardest photo (low light), prices read exactly | **7 / 21**. Every wrong price had confidence of 0.55 or below and was marked on screen as low-confidence |
>
> **Test on new cases** (new test cases the tool had never been tuned on: 5 new fictional supplier replies in all 5 formats, 6 inputs because one sheet was photographed twice, 77 priced lines). The correct answers were written down and saved before the AI read anything, the code was frozen, and I ran the test 3 times. **0 made up** in every run. The spreadsheet, PDF, Word file, email and a moderate photo were read **exactly in all 3 runs**. The very hard low-light photo read 10, 8 and 10 of 15 exactly. Every wrong price had confidence of 0.70 or below and was marked on screen as low-confidence. Overall **71.3 / 77 (93%)** exact.
>
> Limits: the data is fictional. The tests ran through the Claude Code command-line tool, not the way the live product calls the AI (its API). The live demo runs on Gemini, not on the Claude model tested here. The 107 / 107 above is on the same documents the two reading fixes came from. I wrote the correct answers for the new cases myself. How I tested, and every miss: [EVALS.md](EVALS.md).

## Why AI here, why code there

A model is used only where the input is free-form language or images. Anything that must
be exact and repeatable is ordinary code. The full list is in [AI-MAP.md](AI-MAP.md).

| Step | Done by | Why |
|---|---|---|
| Draft the RFx from a conversation | Model (`lib/copilot.ts`) | Turning "200 laptops for three offices" into lines and questions is language work. It has no price field, so it cannot invent one |
| Read each quotation, in any format | Model (`lib/extract/run.ts`) | Formats are unbounded (a photo, a price in a sentence), so rules cannot read them. It reports numbers as written and converts nothing |
| Second read of the 8 largest prices on a photo | Model, cheaper tier, shown only the crop | Its value is independence. If the two reads disagree, code removes the price from every total |
| Read questionnaire answers and attached certificates | Model (`lib/extract/questionnaire.ts`) | It reports what each document says and returns no verdict |
| Units, currency, landed cost, totals, award scenarios | Code (`lib/normalise.ts`) | Must give the same answer every time. Two separately written versions of this code agree on all 150 cells |
| Pass or fail on each question, and what each supplier still owes | Code (`lib/questionnaire.ts`, `lib/chase.ts`) | Comparing an expiry date to today is not a judgement call, and a model may echo the supplier's "yes" |
| Answer the buyer's questions | Model chooses among 10 calculator tools (`lib/analyst.ts`) | Language in, language out. Every number comes from a tool; there is no tool that does free arithmetic |

## Quick start

```bash
cd web && npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY (optional: the calculator, grid and exports work without it)
npm run dev                    # then `npm run fixture` in a second terminal to load demo data
```

## More

- [docs/PRD.md](docs/PRD.md): one-page PRD: problem, user, goals, non-goals, the AI boundary, metrics and risks.
- [WHAT-I-BUILT.md](WHAT-I-BUILT.md): the product: the workflow end to end, every feature, and what each ugly edge does. Start here.
- [DECISIONS.md](DECISIONS.md): the one-page note: what I decided, what I left out, and the better problem.
- [AI-MAP.md](AI-MAP.md): every model call, what it is asked, and what it may not do. Six of them.
- [EVALS.md](EVALS.md): how I tested the reading, the results, and every miss.
- [DECISION-LOG.md](DECISION-LOG.md): the long version: every decision with its cost, the alternative I rejected, and what I got wrong.
- [RFX-SETS.md](RFX-SETS.md): the same four parts in three categories, to show the model is not IT-specific.
- [docs/DESIGN-NOTES.md](docs/DESIGN-NOTES.md): screenshots, and every requirement checked against the code.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the two loops, the one rule, and the repo layout.
- [docs/SETUP.md](docs/SETUP.md): full setup, demo protection, and every test suite.

## License

[MIT](LICENSE) © 2026 Avinash Gaurav.
