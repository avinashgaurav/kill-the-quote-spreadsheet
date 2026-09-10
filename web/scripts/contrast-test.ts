/**
 * Do the colours that carry meaning actually meet their contrast floor?
 *
 *   npm run contrast-test
 *
 * WHY THIS EXISTS. Three times in this build the SAME bug has shipped: the
 * marks that say "the system is not sure about this number" were the least
 * visible things on the page. The uncertainty glyphs sat at 2.34:1. The
 * "cheapest but disqualified" marker was drawn at 45% opacity. The amber rule
 * on a derived price measured 2.56:1 while the red rule beside it, meaning
 * something less urgent, measured 4.73:1.
 *
 * That is not a coincidence, it is a bias: doubt gets drawn softly, because
 * softly is what doubt feels like. On a screen where a buyer is about to
 * commit four crore rupees it is exactly backwards, and it is precisely what
 * the brief asks about: "what does it SHOW THE BUYER when it isn't sure?"
 *
 * WHAT IT CHECKS. Two different WCAG floors, because they are different jobs:
 *
 *   1.4.3  text and glyphs                  4.5:1
 *   1.4.11 non-text meaningful marks        3:1     (rules, stripes, borders)
 *
 * Both themes, since a token can pass in light and fail in dark.
 *
 * WHY NOT IN A BROWSER. A headless browser would measure rendered text nodes
 * too, which is strictly better, and it would add a 300 MB dependency to catch
 * bugs that have all three times lived in the design tokens rather than in a
 * component. So this reads the tokens out of globals.css and does the colour
 * maths itself, which means it runs in under a second with no API key, no
 * browser and no server, and can sit in the free suite that runs on every
 * change. The component-level check stays a manual pass before a demo.
 *
 * AND IT VALIDATES ITS OWN MATHS FIRST. A hand-written oklch to sRGB
 * conversion that is subtly wrong would bless a failing colour and report
 * success, which is worse than not testing at all. So the converter is first
 * checked against values measured in a real browser (Chrome, painting each
 * token to a canvas and reading the pixel back). If the maths drifts, that
 * fails before any colour is judged.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

/** oklch -> oklab -> linear sRGB -> gamma-encoded sRGB, clamped. */
function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;

  const lr = +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const lg = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const lb = -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S;

  const enc = (u: number) => {
    const v = u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return [enc(lr), enc(lg), enc(lb)];
}

const relLum = ([r, g, b]: Rgb) => {
  const f = (x: number) => {
    const u = x / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const ratio = (a: Rgb, b: Rgb) => {
  const [x, y] = [relLum(a), relLum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const hex = (c: Rgb) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------------------
// Tokens, read out of the stylesheet rather than restated here
// ---------------------------------------------------------------------------

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

/**
 * Every `--token: oklch(L C H)` in the file, in source order, split by theme.
 *
 * A token defined more than once in a theme takes its LAST value, which is
 * what the cascade does. Values carrying an alpha (`/ 10%`) are skipped: a
 * translucent border's contrast depends on what is behind it, so asserting a
 * fixed ratio for it would be a lie dressed as a test.
 */
function tokens(): { light: Record<string, Rgb>; dark: Record<string, Rgb> } {
  const light: Record<string, Rgb> = {};
  const dark: Record<string, Rgb> = {};
  let target = light;

  for (const line of css.split("\n")) {
    if (/^\s*\.dark\s*\{/.test(line)) target = dark;
    else if (/^\s*:root\s*\{/.test(line)) target = light;

    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*oklch\(([^)]*)\)\s*;/i);
    if (!m) continue;
    if (m[2].includes("/")) continue;
    const n = m[2].trim().split(/\s+/).map(Number);
    if (n.length < 3 || n.some(Number.isNaN)) continue;
    target[m[1]] = oklchToRgb(n[0], n[1], n[2]);
  }
  return { light, dark };
}

const { light, dark } = tokens();

// ---------------------------------------------------------------------------
// The converter has to prove itself before it judges anything
// ---------------------------------------------------------------------------
//
// Measured in Chrome by painting each token to a 1x1 canvas and reading the
// pixel back, so these are what the browser actually renders, not a second
// opinion from another formula.

const BROWSER_TRUTH: Array<[string, string]> = [
  ["--cell-review", "#a45300"],
  ["--cell-review-bg", "#fef4df"],
  ["--cell-caveat", "#cc3336"],
  ["--cell-caveat-bg", "#fff0ee"],
  ["--cell-empty", "#e4e4e4"],
];

/**
 * Which token does a rule ACTUALLY draw its left rule with?
 *
 * Read out of the stylesheet rather than assumed, because the first version of
 * this file asserted the token I intended `.cell-review` to use and passed
 * while the rule was still being drawn in a different, failing colour. A test
 * that checks the fix you meant to make rather than the one in the file is
 * worse than no test: it reports the bug as closed.
 */
function ruleToken(cls: string): string {
  const block = css.slice(css.indexOf(`.${cls} {`));
  const m = block.slice(0, block.indexOf("}")).match(/box-shadow:\s*inset[^;]*var\((--[a-z0-9-]+)\)/i);
  if (!m) {
    console.log(`${R}FAIL${X}  .${cls} no longer draws a left rule at all.`);
    process.exitCode = 1;
    return "--foreground";
  }
  return m[1];
}

let failed = 0;
console.log(`${B}Colour maths, checked against a real browser first${X}`);
for (const [name, expected] of BROWSER_TRUTH) {
  const got = light[name];
  if (!got) {
    // A renamed or deleted token must not silently stop being checked.
    console.log(`  ${R}FAIL${X}  ${name} is no longer defined in :root, so its ` +
                `browser-measured value cannot be verified. Update BROWSER_TRUTH.`);
    failed += 1;
    continue;
  }
  const want = [1, 3, 5].map((i) => parseInt(expected.slice(i, i + 2), 16)) as Rgb;
  const off = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
  const ok = off <= 2;
  if (!ok) failed += 1;
  console.log(
    `  ${ok ? G + "ok  " : R + "FAIL"}${X}  ${name.padEnd(22)} ` +
    `computed ${hex(got)}  browser ${expected}  ${D}off by ${off}/255${X}`,
  );
}
if (failed) {
  console.log(
    `\n${R}${B}The oklch conversion disagrees with the browser.${X} Every ratio below ` +
    `would be computed from the wrong colour, so nothing else is checked.\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The assertions
// ---------------------------------------------------------------------------

interface Pair {
  what: string;
  fg: string;
  bg: string;
  /** 4.5 for text and glyphs (1.4.3); 3 for a mark that is not text (1.4.11). */
  floor: number;
  why: string;
}

const PAIRS: Pair[] = [
  {
    what: "body text",
    fg: "--foreground", bg: "--background", floor: 4.5,
    why: "everything else is a rounding error next to this one",
  },
  {
    what: "secondary copy",
    fg: "--muted-foreground", bg: "--background", floor: 4.5,
    why: "carries most of the 10 and 11px explanatory text in the grid chrome",
  },
  {
    what: "uncertainty glyph ? ! on its own tint",
    fg: "--cell-review", bg: "--cell-review-bg", floor: 4.5,
    why: "the marks that say the system cannot read a value. Was 2.34:1",
  },
  {
    what: `derived-price rule (${ruleToken("cell-review")})`,
    fg: ruleToken("cell-review"), bg: "--background", floor: 3,
    why:
      "a non-text mark meaning 'we worked this number out, the supplier never " +
      "quoted it'. Was drawn in --cell-review-stripe at 2.56:1, while the red " +
      "rule beside it, meaning something LESS urgent, was at 4.73:1",
  },
  {
    what: `off-spec rule (${ruleToken("cell-caveat")})`,
    fg: ruleToken("cell-caveat"), bg: "--background", floor: 3,
    why: "the same job in the other colour, and the one that was already right",
  },
  {
    what: "off-spec text on its own tint",
    fg: "--cell-caveat", bg: "--cell-caveat-bg", floor: 4.5,
    why: "'they quoted something different' has to be readable to be actionable",
  },
  {
    what: "destructive text",
    fg: "--destructive", bg: "--background", floor: 4.5,
    why: "the FAILED badges on a supplier who cannot win the award",
  },
];

/**
 * Informational, deliberately not a failure.
 *
 * The diagonal hatch behind an empty cell is at roughly 1.3:1, and that is the
 * right answer rather than a bug: in every case where a cell is empty AND the
 * emptiness means something, a glyph carries the meaning and the glyph is
 * held to 4.5:1 above. The one cell with no glyph is `not_read`, which means
 * "we have nothing to report here", and shouting a fact we do not have would
 * be worse than whispering. Printed anyway so the number is on the record and
 * a future change to it is a decision rather than a drift.
 */
const NOTED: Pair[] = [
  {
    what: "empty-cell hatch",
    fg: "--cell-empty", bg: "--background", floor: 3,
    why: "secondary to the glyph, which is itself held to 4.5:1",
  },
];

for (const [theme, T] of [["light", light], ["dark", dark]] as const) {
  console.log(`\n${B}${theme}${X}`);
  for (const p of [...PAIRS, ...NOTED]) {
    const noted = NOTED.includes(p);
    const fg = T[p.fg], bg = T[p.bg];
    if (!fg || !bg) {
      // A theme that does not override a token inherits it, so fall back to
      // light before reporting anything missing.
      const f = fg ?? light[p.fg], b = bg ?? light[p.bg];
      if (!f || !b) {
        console.log(`  ${R}FAIL${X}  ${p.what}: ${!f ? p.fg : p.bg} is not defined`);
        failed += 1;
        continue;
      }
    }
    const r = ratio(fg ?? light[p.fg], bg ?? light[p.bg]);
    const pass = r >= p.floor;
    if (!pass && !noted) failed += 1;
    const tag = noted ? `${Y}note${X}` : pass ? `${G}ok  ${X}` : `${R}FAIL${X}`;
    console.log(
      `  ${tag}  ${p.what.padEnd(38)} ${r.toFixed(2).padStart(5)}:1 ` +
      `${D}(needs ${p.floor}:1)${X}`,
    );
    if (!pass && !noted) console.log(`        ${D}${p.why}${X}`);
  }
}

console.log(
  failed
    ? `\n${R}${B}${failed} contrast failure(s).${X} A mark that means "do not trust this ` +
      `number" has to be at least as visible as one that means "this is fine".\n`
    : `\n${G}${B}pass${X}  every colour that carries meaning clears its floor, in both themes.\n`,
);
process.exit(failed ? 1 : 0);
