/**
 * Display helpers.
 *
 * The only interesting decision here is `displayState`: ten precise statuses
 * collapse onto three visual states, and the collapse is one-way. The grid
 * shows three states because a buyer cannot hold ten in their head while
 * scanning; the cell detail, the tooltip and the analyst all keep the specific
 * status, because "the supplier declined" and "we could not read it" lead to
 * completely different actions.
 */

import type { CellStatus } from "./normalise";

export type DisplayState = "trusted" | "review" | "caveat" | "empty";

export function displayState(status: CellStatus): DisplayState {
  switch (status) {
    case "comparable":
      return "trusted";
    case "comparable_with_caveat":
      return "caveat";
    case "resolved_from_reference":
    case "needs_review":
    case "unreadable":
      return "review";
    default:
      return "empty";
  }
}

/**
 * The glyph a cell shows when it has no number.
 *
 * An em dash for all of them was the original, and it collapsed five different
 * buyer actions into one shrug: chase the supplier, accept their answer, open
 * the original document, or ask for a real price. The graded question is
 * literally "what does it show the buyer when it isn't sure", so each kind of
 * nothing gets its own mark, and the legend explains all of them.
 *
 * Glyphs are chosen to be distinguishable without colour, since roughly one man
 * in twelve cannot separate the amber from the grey.
 */
export const EMPTY_GLYPH: Partial<Record<CellStatus, { glyph: string; short: string }>> = {
  unreadable: { glyph: "?", short: "can't read it" },
  declined: { glyph: "NQ", short: "they declined" },
  omitted: { glyph: "·", short: "never mentioned" },
  non_comparable: { glyph: "~", short: "not a price" },
  unresolvable: { glyph: "~", short: "no basis to price it" },
  needs_review: { glyph: "!", short: "needs your call" },
  unmapped: { glyph: "+", short: "no matching line" },
  // Blank, not a mark. There is nothing to report about this cell, because
  // nothing has been read. A glyph here would be a claim.
  not_read: { glyph: "", short: "not read yet" },
};

export const CELL_CLASS: Record<DisplayState, string> = {
  trusted: "",
  review: "cell-review",
  caveat: "cell-caveat",
  empty: "cell-empty",
};

/** What the buyer should do about this cell. The point of keeping ten statuses. */
export const STATUS_ACTION: Record<CellStatus, { label: string; action: string }> = {
  comparable: {
    label: "Ready",
    action: "Nothing to do. Normalised and ready to rank.",
  },
  comparable_with_caveat: {
    label: "Off-spec",
    action: "They quoted something different. Decide if that is acceptable.",
  },
  resolved_from_reference: {
    label: "From a prior order",
    action: "Ask them to confirm. Not in any total until they do.",
  },
  needs_review: {
    label: "Cannot normalise",
    action: "Needs your call. Not in any total.",
  },
  unreadable: {
    label: "Cannot read it",
    action: "A price is there and we cannot read it. Open the original.",
  },
  declined: {
    label: "They declined",
    action: "That is an answer, not a gap. Nothing to chase.",
  },
  not_read: {
    label: "Not read yet",
    action:
      "Nothing has been read from this supplier. This is not a gap in their " +
      "quotation, it is a gap in ours. Collect their reply, or upload it.",
  },
  omitted: {
    label: "Missing",
    action: "They never mentioned it. Worth chasing.",
  },
  non_comparable: {
    label: "Not a price",
    action: "Cannot be ranked. Ask for a firm number.",
  },
  unresolvable: {
    label: "No basis to price it",
    action: "They pointed at something we do not have. Ask for a real price.",
  },
  unmapped: {
    label: "No matching line",
    action: "Does not match anything you asked for. Decide where it belongs.",
  },
};

// ---------------------------------------------------------------------------

/**
 * Render a unit for display without doubling the preposition.
 *
 * Suppliers write units both ways: "nos", "kit", "box of 10", but also "per pc"
 * and "per DIMM". Prefixing "per " unconditionally produces "per per pc", which
 * looks like a bug in exactly the panel whose whole job is to look trustworthy.
 */
export const perUnit = (uom?: string | null) => {
  const u = String(uom ?? "").trim();
  if (!u) return "";
  return /^per\b/i.test(u) ? u : `per ${u}`;
};

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Bare digits with Indian grouping, for inside a dense grid cell. */
export const num = (n: number) => Math.round(n).toLocaleString("en-IN");

export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
}

/** Signed, for deltas where direction is the message. */
export function inrDelta(n: number): string {
  const s = inrShort(Math.abs(n));
  return n >= 0 ? `+${s}` : `-${s}`;
}

export const pct = (n: number, dp = 1) => `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(dp)}%`;

export const VENDOR_TINT = [
  "oklch(0.55 0.13 250)",
  "oklch(0.55 0.13 160)",
  "oklch(0.58 0.13 300)",
  "oklch(0.58 0.14 40)",
  "oklch(0.55 0.10 200)",
];
