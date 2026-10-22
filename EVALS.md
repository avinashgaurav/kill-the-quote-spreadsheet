# How well it reads quotes: first recorded tests on Claude

I ran the test three times on 2026-10-15, on a set of fictional documents. First a full run (the baseline). Then a repeat on the documents only. Then a full rerun after two fixes. These are early results on Claude, not a formal benchmark.

## How the tests were run

I ran the tests through the Claude Code command-line tool (CLI). It used the app's own instructions to the AI (the system prompt) and its required answer format (the JSON schema). This is not the way the live product calls the AI (the production API). I plan to rerun the tests through the API.

In detail: setting `LLM_PROVIDER=claude-cli` (off unless you turn it on, in `web/lib/llm.ts`) sends each call to `claude -p` with:

- the reading instructions from `lib/extract/run.ts`, passed with `--system-prompt` (they replace Claude Code's own instructions)
- the same content the Anthropic API path sends (the list of lines being quoted, guidance for the reader, the document as text, and a base64 image or a base64 PDF), sent as one user message in stream-json format
- the required answer format of the forced `report_extraction` tool (its `input_schema`), passed as `--json-schema`. The answer comes back in that format. It is then checked with the same Zod schema and `validateExtraction()` as the live product.
- no tools, no MCP, no hooks, CLAUDE.md, skills or plugins (`--safe-mode`), no settings files, no saved sessions, and `--effort high` (the same as the live product)

## What is measured

`npm run accuracy` (`web/scripts/accuracy.ts`) runs the real reading code (`extractDocument`) on each document. It then compares what was read with the correct answers, written down before the test (the answer key the generators built the documents from). The test script turns off the second read of cropped photo prices, so the main reader is scored on its own.

| What it measures | What it means |
|---|---|
| Found (recall) | Of the lines the supplier priced, how many came back with a price |
| Price | Of those, how many match the correct answer to the rupee |
| Unit | How many have the unit the supplier wrote (pack size must match) |
| Made up | Prices returned for lines the supplier never priced. The goal is zero |
| Unreadable admitted | Values the answer key marks unreadable that came back without a number |
| Confidence check | Whether the tool's confidence drops when its accuracy drops, per photograph |

The test script marks a run as failed if any of these happen: a made-up price, fewer than 85% of priced lines found, fewer than 90% of prices exactly right, a document that could not be read, a guess at a value that cannot be read, or wrong prices whose average confidence is above 0.75.

The fix came with one scoring change. A line the answer key prices at 0 is now scored from the reader's raw answer. Before, it was scored after the checker (`validateExtraction`) had run, and the checker deliberately blanks every zero so that a zero can never be the cheapest price on a line. A zero is zero in any unit, so its unit is not scored. This does not change the baseline score: there the reader gave no price for that line, which counts as a miss either way.

## The test documents

All data is fictional, made by `dataset/generators/` (no real company, supplier or price). Correct answers: `web/lib/data/raw-quotes.json`.

- 5 supplier replies, one in each format: Zenith xlsx, Cygnus pdf, Orbit docx, Vector jpg photo, Helios eml. 107 priced lines in total (30, 27, 27, 21, 2).
- 5 photographs of the same 22-line rate card, from easy to very hard (flat, handheld, curled page with a thumb in view, low light, steep angle). Each has 21 priced lines plus 1 value the answer key marks unreadable (because of glare).

## What changed before the rerun

Both fixes ship in the same pull request as these results:

1. **An empty citation no longer fails the whole read.** (A citation is the source text the reader quotes for each price.) In the baseline, one row from the Vector photo came back with `citedText: ""`. The format check (Zod's `min(1)`) threw an error, and a read with 21 prices was reported as failed. Now:
   - the row is kept and flagged by `validateExtraction`, with confidence capped at 0.4 (the same as a price with no unit);
   - the calculator gets a new `unsourced` flag, based on the saved source record, and leaves the value out of every total, just as it does for a disputed photo read;
   - the tool description asks for text that is not empty.

   I deliberately did **not** add `minLength` to the schema (the required answer format). Anthropic's strict tool formats do not support limits on text length, and `llm.ts` sends this format as it is. Adding it could break the live product instead of enforcing anything.
2. **Lines that are included or free are now priced at 0.** In the baseline, Orbit L30 ("included in our laptop prices at no additional charge") was found and quoted correctly, but came back as `bundled` with no price. The checker turns that combination into `illegible`, which tells a buyer to open the original document for a sentence that was read perfectly. The instructions and the price field now say such a line has price 0, status `quoted`. The normaliser (the code that puts prices on a common basis) already sends a 0 to review and never ranks it (automated test case 8).

New offline automated test cases 48 and 49 cover both fixes. `npm run test:all` still passes.

## Results, before and after

The AI model that answered every call in every run: `claude-opus-5` (the app's chosen main Anthropic model; the CLI reported it back in `modelUsage`).

### The five supplier documents

| Input | Baseline (run 1) | Repeat (run 2, documents only) | After fixes (run 3) |
|---|---|---|---|
| Zenith xlsx | 30/30, conf 0.96 | 30/30, conf 0.96 | 30/30, conf 0.96 |
| Cygnus pdf | 27/27, conf 0.95 | 27/27, conf 0.95 | 27/27, conf 0.95 |
| Orbit docx | 26/27 (L30 missed), conf 0.94 | 26/27 (L30 missed), conf 0.93 | **27/27**, conf 0.82 |
| Vector photo | **read failed** | 21/21, conf 0.89 | 21/21, conf 0.85 |
| Helios eml | 2/2, conf 0.87 | 2/2, conf 0.88 | 2/2, conf **0.40** |
| **Lines returned** | **85/86 scored (99%)**, Vector not read | **106/107 (99%)** | **107/107 (100%)** |
| Price exact / unit right | 100% / 100% | 100% / 100% | 100% / 100% |
| Made-up prices | 0 | 0 | 0 |
| Test script result | FAIL (Vector could not be read) | pass | pass |

Each cell shows how many priced lines came back out of all priced lines, then the average confidence (conf). Every returned price and unit matched the correct answers in all three runs.

### The five photographs

| Photograph | Baseline: exact / found / confidence | After fixes: exact / found / confidence |
|---|---|---|
| v1 easy, flat | 21/21 / 21 / 0.92 | 21/21 / 21 / 0.92 |
| v2 moderate, handheld | 21/21 / 21 / 0.87 | 21/21 / 21 / 0.89 |
| v3 hard, curled page and thumb | 21/21 / 21 / 0.90 | 21/21 / 21 / 0.81 |
| v4 very hard, low light | **6/21 (29%)** / 18 / 0.52 | **7/21 (33%)** / 20 / 0.46 |
| v5 very hard, steep angle | 21/21 / 21 / 0.84 | 21/21 / 21 / 0.85 |

The confidence check passed in both runs. On v4, every wrong price had confidence of 0.60 or less in the baseline, and 0.55 or less after the fix. Both are below 0.8, the level under which the screen marks a value as low-confidence. The calculator does not use confidence. In the app, it is the second read of the cropped photo (turned off in this test) that keeps disputed photo prices out of the totals. Average confidence on wrong prices was 0.50, then 0.47. The value hidden by glare was admitted as unreadable on every photograph in both runs, and no photograph was flagged as confidently wrong. The gap in accuracy between the best and worst photo was 71 points, then 67. The gap in confidence was 40, then 46. Neither fix was aimed at the photographs, so the change on v4 is normal variation from one run to the next.

**Headline:** after two fixes that came from this same set of documents, 107 of 107 priced lines came back with the exact price and unit, nothing was made up, and the test script passes. The low-light photograph is still mostly misread (33%), but at low confidence.

For context only, not measured again here: `WHAT-I-BUILT.md` reports an earlier local run on Gemini 3.1 Pro at 107/107, with the worst photograph at 52%.

## Every miss

### After fixes (run 3)

| # | Input | Line | What happened | Why it went wrong |
|---|---|---|---|---|
| 1 | v4 low light | L12 | Not returned (correct value 524,000) | Poor image: value left blank |
| 2 to 14 | v4 low light | L1, L2, L3, L7, L8, L9, L10, L18, L20, L22, L25, L27, L29 | Read 55,900 / 95,500 / 94,000 / 24,400 / 1,290 / 1,590 / 2,970 / 194,000 / 4,250 / 298 / 62,600 / 5,400 / 42,600 where the correct values were 57,900 / 99,500 / 84,000 / 12,400 / 1,180 / 1,540 / 2,870 / 184,000 / 4,150 / 268 / 61,800 / 8,400 / 41,900, at confidence 0.38 to 0.55 | Poor image: a digit misread, at low confidence (marked low-confidence on screen) |

**A side effect to review: Helios confidence fell from 0.87 to 0.40.** Both Helios prices are written in sentences with no unit ("61,200 for the 14" i5 ..."). In the rerun, the reader left the unit blank instead of filling one in. The existing rule for prices with no unit then capped both rows at 0.4. A separate test read showed the same thing. The prices are still exact, and the calculator still uses them (a missing unit falls back to the unit the buyer asked for). But both rows now show as needing review. This follows the "unit as written" rule more closely, but it is a change in behaviour, probably caused by the new instruction's wording "the unit if one is written". Orbit's average confidence also fell (0.94 to 0.82); I did not look into why.

This live run did not test the new handling of empty citations, because no row came back with one. Only the offline automated test covers it.

### Baseline (run 1) and repeat (run 2)

| # | Run | Input | Line | What happened | Why it went wrong | Fixed? |
|---|---|---|---|---|---|---|
| 1 | 1 and 2 | Orbit docx | L30 | Found and quoted, but returned as `bundled` with no price, which the checker turned into `illegible` | A line included at no charge (a zero price written in a sentence) was not priced | yes, run 3 |
| 2 | 1 | Vector photo | whole read | The format check (Zod) rejected `rows[5].provenance.citedText = ""` and threw away all 21 prices | One badly formed row failed the whole read | Yes, in code. It did not happen again in run 2 or run 3, so the fix is only proven by an offline test |
| 3 | 1 | v4 low light | L5, L7, L21 | Not returned | Poor image: value left blank | normal variation |
| 4 to 15 | 1 | v4 low light | L2, L4, L8, L9, L10, L13, L18, L20, L22, L25, L27, L29 | Digits misread, at confidence 0.35 to 0.60 | Poor image: a digit misread, at low confidence | normal variation |

No run had made-up prices, unit errors or guessed unreadable values.

## Time, tokens and cost

| Measure | Run 1 (baseline, `--all`) | Run 2 (documents only) | Run 3 (after fixes, `--all`) |
|---|---|---|---|
| Total time | 1,325 s | 403 s | 1,156 s |
| Time per document | 36.6 to 334.2 s | 37.9 to 97.4 s | 37.9 to 238.5 s |
| Input tokens (text sent in), not from cache, including cache writes | 111,463 | 10 | 106,067 |
| Input tokens read from cache | 56,880 | 72,294 | 63,273 |
| Output tokens (of which thinking, as reported) | 120,796 (46,386) | 43,086 (6,350) | 117,137 (38,001) |
| Cost reported by the CLI | $4.16 (9 reads that succeeded) | $1.11 | $4.02 |

The failed Vector read in run 1 also used tokens, but the test script could not record them because the call threw an error. Costs are the CLI's own estimates at list price (`total_cost_usd`). The runs were paid for by a Claude subscription, not an API key.

No run hit a usage limit or rate limit, and every rate-limit message from the CLI said `allowed`. By the end of run 3, 84% of the five-hour usage allowance was used. The CLI also reports that extra usage beyond the limit is unavailable (`out_of_credits`), so another full run in the same window could hit the limit.

## Not run

- The questions to the analyst (the assistant that answers the buyer's questions). `accuracy.ts` has no analyst mode. The analyst is a back-and-forth conversation with ten custom tools, which this CLI route does not support (it throws an error rather than fake it).
- Reading questionnaires and certificates (calls 4 and 5 in `AI-MAP.md`), which this test script does not cover.

## How this differs from the live product

- The CLI adds a one-line opening and a short block about the computer it runs on (working folder, platform, date) to the instructions. It also adds a short note about the account to the user message.
- The answer format is enforced by the CLI's StructuredOutput tool plus `--json-schema`, not by `tool_choice` with `strict: true`. If the model answers in plain text first, the CLI asks it again to use the tool.
- The answer length limit `max_tokens` (16,000 in the live product) and the cache point after the list of lines cannot be set; the CLI uses its own.
- PDF citations are not passed through, so `supportsCitations()` stays false and the Cygnus PDF read is marked `provenanceWeaker` (weaker evidence of the source), as on Gemini. Scoring does not use citations.
- Usage: on this route `input` includes cache writes, and cost is the CLI's figure, not the app's.
- The key for saved results includes the model id, which is the same as on the Anthropic route. So every run used `--fresh` and saved nothing to `.cache/`.
- Not checked yet, worth checking on the API rerun: the Anthropic docs say structured outputs cannot be used together with citations (a 400 error). The live product sends PDFs with `citations: {enabled: true}` alongside a `strict: true` forced tool. This route cannot test that combination.

## Reproduce

```bash
cd web
npm ci
npm run test:all                                   # offline suites, no key
LLM_PROVIDER=claude-cli npx tsx scripts/accuracy.ts --all --fresh \
  --json ../evals/results/accuracy-<date>-claude-cli-claude-opus-5.json
# documents only: drop --all. Model: CLAUDE_CLI_MODEL=<id>
```

Each CLI call is stopped after 300 s (change it with `CLAUDE_CLI_TIMEOUT_MS`; the slowest read in run 1 took 334 s). The route will not run under `NODE_ENV=production` unless `ALLOW_CLAUDE_CLI_EVAL=1`.

`--json <path>` is optional. Without it, the test script only prints the results. The planned live-product version is the same command with `ANTHROPIC_API_KEY` set and `LLM_PROVIDER` unset.

Raw output in `evals/results/`:
- run 1: `accuracy-2026-10-15-claude-cli-claude-opus-5.json`
- run 2: `accuracy-2026-10-15-claude-cli-claude-opus-5-docs-run2.json`
- run 3: `accuracy-2026-10-15-claude-cli-claude-opus-5-after-fix.json`

## Test on new cases (held-out run)

The 107/107 above was scored on the cases I used while building the tool: the reader's instructions and both fixes came from that same set. This run tests the reader on new test cases it had never been tuned on.

**Method.** I made five new fictional supplier replies to the same buyer request (the RFx). The request is an input to the tool, not an answer. `dataset/generators/build_heldout.py` built them into `dataset/heldout/`. The suppliers, prices, layouts and choice of lines are all new:

- Kestrel xlsx: two sheets, the supplier's own item codes, a GST (tax) column, a regret (a line the supplier declined to quote), a substitute product and a per-piece line.
- Tarang pdf: two pages with rate and amount columns side by side, one line in US dollars, a per-cartridge line and a regret.
- Nilgiri docx: a letter with numbers in Indian digit grouping inside sentences, a per-pair line and a free (zero) line.
- Tejas: one quotation sheet photographed twice (moderate, and very hard: low light, motion blur, slight curl), with two prices corrected by hand in pen and one price under glare.
- Saptarishi eml: plain text, with a per-box-of-25 line, a price given relative to another, and a regret.

That makes 77 priced lines across 6 inputs, plus 1 value on each photograph that the correct answers mark as unreadable. The correct answers (`dataset/heldout/answer-key.json`) were written down and saved first, in the commit titled "Add a held-out corpus and answer key, before any model call", before any AI read the set. The instructions to the AI and `web/lib` were not changed. `accuracy.ts --heldout` scores the set line by line, with the same scoring and the same pass or fail checks. One exception: the confidence check only runs on a photo read below 90% exact (the moderate photo, 15/15, was not checked this way). After the runs, I updated one check in the automated tests (`web/scripts/regression-test.ts`) to match an edited line in the test script; no scoring or app code changed. I ran the full test three times, with `--fresh` each time.

The note on how the tests were run (above) still applies: these runs used the Claude Code CLI route (`LLM_PROVIDER=claude-cli`, `claude-opus-5`, `CLAUDE_CLI_TIMEOUT_MS=400000`), not the live product's API.

| Measure | Cases used while building (run 3 above) | New cases, average (lowest to highest, 3 runs) |
|---|---|---|
| Priced lines with the exact price | 107/107 documents (100%) | 71.3/77 (92.6%), 70 to 72 |
| Lines returned | 107/107 | 76.7/77, 76 to 77 |
| Unit right (of lines returned) | 100% | 75.7, 75 to 76 (one scoring error each run, see below) |
| Made-up prices | 0 | 0, 0 to 0 |
| Unreadable value admitted | 5/5 photographs | 2/2 photographs, every run |
| Average confidence on wrong prices | 0.47 (photo set) | 0.65, 0.61 to 0.69 |
| Highest confidence on any wrong price | 0.55 | 0.70 |
| Test script result | pass | pass, 3 of 3 |

In every run: Kestrel 18/18, Tarang 13/13, Nilgiri 11/11, Tejas moderate photo 15/15 and Saptarishi 5/5, all exact. Every miss was on the very hard Tejas photograph, which read 10, 8 and 10 of 15 correctly. Without that photograph, the new set scores 62/62 in all three runs.

Two caveats. First, the two sets are not the same size or mix, so 92.6% against 100% is not a like-for-like drop. The 107 from the building cases counts documents only (its photos are scored separately), while the new set's 77 includes the very hard photograph. Second, the wrong prices had higher confidence than before (0.65 against 0.47 on average, up to 0.70). Every one is still below 0.8, the level at which the screen marks a value as low-confidence, and the test script's 0.75 confidence check passed in every run. But the margin is smaller.

### Every miss on the new cases

| # | Input | Line | Which runs | What happened | Why it went wrong |
|---|---|---|---|---|---|
| 1 | Tejas low light | L6 | 1, 2, 3 | Read 28,750 where the correct value was 20,750, confidence 0.63 to 0.70 | Poor image: a digit misread, at low confidence |
| 2 | Tejas low light | L7 | 1, 2, 3 | Read 13,850 where the correct value was 13,050, confidence 0.62 to 0.70 | Same |
| 3 | Tejas low light | L8 | 1, 2, 3 | Read 1,300 where the correct value was 1,360, confidence 0.60 to 0.69 | Same |
| 4 | Tejas low light | L28 | 1, 2, 3 | Read 58,900 where the correct value was 50,900, confidence 0.60 to 0.68 | Same |
| 5 | Tejas low light | L2 | 1, 2 | Read 1,86,400 where the correct value was 1,06,400, confidence 0.58 and 0.68 | Same (the 0 in Indian grouping read as 8) |
| 6 | Tejas low light | L18 | 3 | Read 1,06,500 where the correct value was 1,86,500, confidence 0.60 | Same, the other way round |
| 7 | Tejas low light | L11 | 2 | Read 2,500 where the correct value was 2,580, confidence 0.68 | Same |
| 8 | Tejas low light | L20 | 2 | Not returned | Poor image: value left blank |
| 9 | Kestrel xlsx | L13 | 1, 2, 3 | Unit returned as "Kit (2x16GB)" where the answer key says "kit" | A scoring error in the test script, not a reading error |

The Kestrel unit miss is a scoring error, not a reading error. The sheet's unit cell really says "Kit (2x16GB)". The unit matcher reads the "2" as a made-up pack size, because the answer key records the unit as "kit". The scoring code was frozen for this test, so the miss stays in the numbers.

The same matcher ignores "nos", "pc" and "each", so the unit check proves nothing on lines with those units. It only matters for pack, box, kit, cartridge and pair units. This was also true of the original set.

The two prices corrected in pen (Tejas L9 and L29) were read as the handwritten price in every run, on both photographs. The relative price and the three regrets (Saptarishi L21, L23; Kestrel L14; Tarang L16) never came back as a number. The free line (Nilgiri L30) came back as 0. The per-cartridge, per-pair and per-box-of-25 lines came back in the supplier's unit (the per-piece line passes the unit check whatever comes back, see above).

### Cost and limits

Each run took 354 s, 365 s and 444 s in total (26 to 170 s per document; the very hard photograph was the slowest). The CLI's own cost estimate was $1.50, $0.94 and $1.19. No run hit a usage limit or rate limit, and every rate-limit message said `allowed`.

Raw output: `evals/results/heldout-run1.json`, `heldout-run2.json`, `heldout-run3.json`.

```bash
cd web
python3 ../dataset/generators/build_heldout.py   # optional: rebuilds the set
LLM_PROVIDER=claude-cli CLAUDE_CLI_TIMEOUT_MS=400000 npx tsx scripts/accuracy.ts \
  --heldout --fresh --json ../evals/results/heldout-run1.json
```
