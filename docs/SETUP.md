# Setup and tests

How to run the app locally, protect a public deployment, and run every test suite. Moved here from the [README](../README.md).

## Run it

```bash
cd web
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY
npm run dev
```

No database setup. With `DATABASE_URL` unset it runs embedded Postgres (PGlite) into
`.pglite/`, so the whole app works before anyone has created a cloud database. Set
`DATABASE_URL` to a Neon connection string for production and nothing else changes.

**Without an API key** the calculator, grid, provenance, exports and every award scenario
still work. The three AI loops refuse honestly rather than answering from a lookup table.

**Loading demo data.** A fresh clone starts with an empty comparison. To fill it without a
key, leave `npm run dev` running and, from `web/` in a second terminal, run
`npm run fixture`. That posts to the dev-only `/api/dev/fixture` route, which writes the
shipped quotes (`web/lib/data/raw-quotes.json`) as test-harness cells, each marked
`test_fixture` under a banner that stays until they are gone; `npm run fixture:wipe` removes
them. With a key, `npm run demo:load` instead reads every supplier's real documents through
the model (`-- --dry` shows what it would do first).


## Demo protection

Set `DEMO_ACCESS_CODE` on a public deployment and every route that calls a model (analyst,
co-pilot, extract, inbox) asks for it once, then trusts a signed seven-day cookie. In production
the code also needs `DEMO_COOKIE_SECRET` (32+ characters); without it the unlock and every model
route answer 503 rather than sign with a weak key. Browsing the grid and the exports needs no
code. Usage is counted in model calls, in Postgres: each request is charged the most calls it can
make (an analyst question 12, a co-pilot message 8, an upload one per file, an inbox delivery one
per document), against `DEMO_RATE_LIMIT` per IP per 10 minutes (default 60) and
`DEMO_DAILY_CALL_CAP` per UTC day across everyone (default 300). Requests that fail cheap checks
(uploads over 15 MB or 40 files, a conversation over 40 messages or 60,000 characters, a message
over 8,000 characters) are refused with 413 before any allowance is spent. Off Vercel the
forwarded-IP headers can be spoofed, so the daily cap is the real backstop. Everything lives in
`web/lib/demo-guard.ts`; see `web/.env.example`.


## Tests

```bash
cd web
npm run test:all            # ten offline suites: calculator, readers, parser, revisions, generality, questionnaire, contrast, cache, regressions, demo guard
npm run dev                 # then, in another shell:
python3 scripts/demo-test.py    # ten walkthrough claims against the requirements
python3 scripts/e2e-test.py     # happy and sad paths over real HTTP
npm run accuracy            # needs a key: is the reading actually right?
```

`npm run verify` is everything that costs nothing: types, lint, and the ten
offline suites in `npm run test:all`.

| Suite | Checks | Key |
|---|---|---|
| `conformance` | 442 assertions: two independent calculators agree on all 150 cells | no |
| `reader-test` | 47 cases: every format plus all 11 photographs, and 4 broken files (3 refused with instructions, 1 truncated PDF correctly routed to vision) | no |
| `parse-check` | 10 realistic model output shapes: omitted nulls, invented line numbers | no |
| `revision-test` | A replaced quotation resolves, reports what moved, and re-reads the same | no |
| `generality-test` | The product runs on an enquiry in a category it has never seen | no |
| `questionnaire-test` | 16 cases. An expired certificate, a superseded standard, a threshold missed, somebody else's certificate: caught, each saying why, and the case that only works because the ATTACHMENT is opened | no |
| `contrast-test` | Every colour that carries meaning against its WCAG floor, both themes, oklch maths validated against a real browser first | no |
| `cache-test` | The extraction cache stores, returns, and misses for the right reasons | no |
| `sees` | What actually reaches the model for any document you give it | no |
| `regression-test` | 69 cases: bugs that actually shipped cannot come back unnoticed | no |
| `guard-test` | 15 cases: access code, signed cookie, per-IP limit, daily cap, oversized requests refused before any spend | no |
| `e2e-test` | 42 cases over HTTP, mostly sad paths, including a newcomer's own file | yes |
| `accuracy` | Recall, price exactness, unit correctness, invention rate, and whether **confidence falls when accuracy falls** | yes |
| `api-check` | Whether the model is reachable, and which of the three ways a key can be dead this is. Two tokens | yes |
| `doc-numbers` | Prints every figure the documents claim, from the calculator. Run before editing a number in any doc | no |
