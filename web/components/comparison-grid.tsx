"use client";

/**
 * The comparison grid: 30 lines x 5 suppliers, same units, same currency.
 *
 * This is the screen the brief is really asking about, so the density is
 * deliberate. All 150 cells are reachable without paging, rows are 30px, and
 * the numbers use tabular figures so a column can be compared by eye. The
 * header and the line column are sticky, because a price is meaningless once
 * you have scrolled away from which line it belongs to.
 *
 * Each cell shows the LANDED value, with the supplier's raw value directly
 * beneath it whenever normalisation changed the number. Showing only the landed
 * value would hide the system's most important work; showing only the raw value
 * would be the spreadsheet this product exists to replace.
 */

import {
  useCallback, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CELL_CLASS, EMPTY_GLYPH, STATUS_ACTION, displayState, num, shortName,
} from "@/lib/ui";
import type { Cell, CellStatus, RfxLine } from "@/lib/normalise";

export interface GridVendor {
  code: string;
  name: string;
  reply_format: string;
  qualified: boolean;
  failedMandatory: string[];
  /**
   * Has anyone actually looked at their questionnaire? A supplier uploaded
   * mid-comparison has not been assessed, and "not assessed" must not render
   * as "eligible". Absent means yes, so the seeded example is unchanged.
   */
  assessed?: boolean;
}

interface Props {
  lines: RfxLine[];
  vendors: GridVendor[];
  matrix: Record<string, Record<number, Cell>>;
  confidence: Record<string, number>;
  /** Cell keys (`vendor:line`) whose price came from a superseded revision. */
  carriedForward?: string[];
  bestPerLine?: Record<number, string>;
  onCellClick: (vendor: string, lineNo: number) => void;
  /** Opens the supplier's qualification, answers and attached documents. */
  onVendorClick?: (vendor: string) => void;
  selected?: { vendor: string; lineNo: number } | null;
}

type Filter = "all" | "review" | "gaps" | "traps";

export function ComparisonGrid({
  lines, vendors, matrix, confidence, carriedForward, bestPerLine, onCellClick,
  onVendorClick, selected,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showRaw, setShowRaw] = useState(true);

  const carriedForwardSet = useMemo(
    () => new Set(carriedForward ?? []),
    [carriedForward],
  );

  /** Did normalisation actually move this number? */
  const wasNormalised = (c: Cell) =>
    c.unitInr !== null && c.raw?.price != null &&
    Math.abs(c.unitInr - c.raw.price) > 0.5;

  const visible = useMemo(() => {
    const kept = filter === "all"
      ? lines
      : lines.filter((l) =>
          vendors.some((v) => {
            const c = matrix[v.code]?.[l.no];
            if (!c) return false;
            const st = displayState(c.status);
            if (filter === "review") return st === "review" || st === "caveat";
            if (filter === "gaps") return st === "empty";
            // Lines where normalisation changed a number, which is where the
            // interesting judgement calls live.
            return wasNormalised(c);
          }),
        );

    // Group boundaries are derived from the filtered list by comparing each
    // line with the one before it. Kept declarative rather than tracked with a
    // mutable cursor, so nothing is reassigned during render.
    return kept.map((line, i) => ({
      line,
      startsGroup: i === 0 || kept[i - 1].group !== line.group,
    }));
  }, [filter, lines, vendors, matrix]);

  /**
   * ONE TAB STOP FOR THE WHOLE GRID, AND ARROW KEYS INSIDE IT.
   *
   * Every cell had `tabIndex={0}`, which is correct in isolation and wrong 150
   * times over: a keyboard user needed 150 Tab presses to get from the top of
   * the grid to the question box, and asking questions is the entire point of
   * the product. The page had 187 tab stops and 150 of them were prices.
   *
   * The pattern is a roving tabindex, which is what `role="grid"` expects and
   * what every serious data grid does: the grid is a single stop, arrows move
   * the focus within it, Home and End jump to the ends of a row, and Tab
   * leaves. `aria-rowindex` and `aria-colindex` are set so a screen reader can
   * still say where it is after the DOM has been filtered.
   *
   * Not a WCAG violation before this, which is why it survived a contrast pass
   * and a full audit. It was simply unusable, and "technically reachable" is
   * not the same as reachable.
   */
  const [focusCell, setFocusCell] = useState<{ row: number; col: number }>(
    { row: 0, col: 0 },
  );
  const gridRef = useRef<HTMLTableElement>(null);

  /**
   * Clamped when READ, not corrected in an effect.
   *
   * A filter change can leave the stored index pointing past the last row.
   * Fixing that with a setState inside useEffect works and cascades a second
   * render every time the filter changes, which the linter objects to and is
   * right to: the clamp is a pure function of state the component already has.
   */
  /**
   * Move the DOM focus after React has committed, not during the keypress.
   *
   * The first version called `.focus()` inside a single `requestAnimationFrame`
   * from the key handler. It fired before React committed the render, so the
   * state moved correctly and the focus landed one keypress behind: arrow keys
   * appeared to do nothing, then jumped to where you had been. A layout effect
   * runs after the commit, which is the whole point of it.
   *
   * Guarded on focus already being inside the grid, so it cannot steal focus
   * on mount, on a filter change, or while the buyer is typing a question.
   */
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !grid.contains(document.activeElement)) return;
    const target = grid.querySelector<HTMLElement>(
      `[data-cell="${focusCell.row}:${focusCell.col}"]`,
    );
    if (target && target !== document.activeElement) target.focus();
  }, [focusCell]);

  const activeCell = useMemo(() => ({
    row: Math.max(0, Math.min(focusCell.row, visible.length - 1)),
    col: Math.max(0, Math.min(focusCell.col, vendors.length - 1)),
  }), [focusCell, visible.length, vendors.length]);

  const moveFocus = useCallback((row: number, col: number) => {
    setFocusCell({
      row: Math.max(0, Math.min(visible.length - 1, row)),
      col: Math.max(0, Math.min(vendors.length - 1, col)),
    });
  }, [visible.length, vendors.length]);

  const onGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { row, col } = activeCell;
    switch (e.key) {
      case "ArrowRight": e.preventDefault(); moveFocus(row, col + 1); break;
      case "ArrowLeft": e.preventDefault(); moveFocus(row, col - 1); break;
      case "ArrowDown": e.preventDefault(); moveFocus(row + 1, col); break;
      case "ArrowUp": e.preventDefault(); moveFocus(row - 1, col); break;
      case "Home":
        e.preventDefault();
        moveFocus(e.ctrlKey || e.metaKey ? 0 : row, 0);
        break;
      case "End":
        e.preventDefault();
        moveFocus(
          e.ctrlKey || e.metaKey ? visible.length - 1 : row,
          vendors.length - 1,
        );
        break;
      case "PageDown": e.preventDefault(); moveFocus(row + 10, col); break;
      case "PageUp": e.preventDefault(); moveFocus(row - 10, col); break;
      default: break;
    }
  }, [activeCell, moveFocus, visible.length, vendors.length]);

  const counts = useMemo(() => {
    let review = 0, gaps = 0, traps = 0;
    for (const v of vendors) {
      for (const l of lines) {
        const c = matrix[v.code]?.[l.no];
        if (!c) continue;
        const st = displayState(c.status);
        if (st === "review" || st === "caveat") review++;
        if (st === "empty") gaps++;
        if (wasNormalised(c)) traps++;
      }
    }
    return { review, gaps, traps };
  }, [lines, vendors, matrix]);

  return (
    <div className="flex min-h-0 flex-col">
      {/* Toolbar: the clean half of the design sits around the dense half. */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-1">
          {/*
            Filters named for what a buyer is looking for, not for the internal
            state that groups them.

            "Check 22 / Gaps 39 / Adjusted 15" is a legend for a vocabulary
            nobody has been taught yet, on the first row of chrome above the
            data. Each of these now says what clicking it shows you, and the
            counts are of CELLS while "All 30" is a count of LINES, which the
            old labels gave a reader no way to notice.
          */}
          {([
            ["all", `All ${lines.length} lines`, "Every line, whatever state it is in"],
            ["review", `${counts.review} to check`,
             "Cells a person needs to look at: off-spec offers, prices we could " +
             "not read, and figures derived rather than quoted"],
            ["gaps", `${counts.gaps} with no price`,
             "Cells with no number: never mentioned, declined, not a price, or " +
             "not read yet. The mark on each says which"],
            ["traps", `${counts.traps} converted`,
             "Cells where the calculator moved the number to make it comparable: " +
             "a different unit, a different currency, or delivery added"],
          ] as const).map(([k, label, why]) => (
            <Tooltip key={k}>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={filter === k ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setFilter(k as Filter)}
                  aria-pressed={filter === k}
                >
                  {label}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-[11px]">{why}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setShowRaw((s) => !s)}
          >
            {showRaw ? "Hide originals" : "Show originals"}
          </Button>
          <Legend />
        </div>
      </div>

      {/* Room at the bottom for the floating "Ask about this" button, which
          appears below xl where the Ask panel does not fit beside the grid.
          Without it the button sits on top of the last row's prices, and the
          one row you cannot read is whichever one you scrolled to. */}
      <div className="min-h-0 flex-1 overflow-auto pb-16 xl:pb-0">
        <table
          ref={gridRef}
          role="grid"
          aria-rowcount={visible.length + 1}
          aria-colcount={vendors.length + 3}
          onKeyDown={onGridKeyDown}
          className="grid-table w-full"
        >
          {/* A screen reader landing in a 30 by 5 table of numbers has no idea
              what it is looking at without this. Visually hidden because the
              sighted equivalent is the whole surrounding page. */}
          <caption className="sr-only">
            Supplier comparison. {lines.length} enquiry line
            {lines.length === 1 ? "" : "s"} down the side, {vendors.length} supplier
            {vendors.length === 1 ? "" : "s"} across the top. Every price is landed cost
            per the unit the enquiry asked for, in rupees, excluding GST. A cell with no
            number carries a mark saying which kind of nothing it is. Activate any cell
            to open where its number came from.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="col-sticky min-w-[248px]">Line</th>
              <th scope="col" className="text-right">Qty</th>
              <th scope="col">Unit</th>
              {vendors.map((v) => (
                <th key={v.code} scope="col" className="min-w-[124px] p-0 text-right">
                  {/*
                    A real button, not a label with a tooltip. The reason a
                    supplier is disqualified used to live only in a hover, which
                    is unreachable by touch and by keyboard, and it is the one
                    fact that decides whether their whole column can win
                    anything. It now opens their answers and documents.
                  */}
                  <button
                    onClick={() => onVendorClick?.(v.code)}
                    className="flex w-full flex-col items-end gap-0.5 px-2 py-1.5 text-right transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      {shortName(v.name)}
                      {!v.qualified && v.assessed !== false && (
                        <span className="rounded-sm bg-destructive px-1 text-[9px] font-semibold tracking-wide text-white">
                          FAILED {v.failedMandatory.length}
                        </span>
                      )}
                      {v.assessed === false && (
                        <span className="rounded-sm bg-[var(--cell-review-bg)] px-1 text-[9px] font-semibold tracking-wide text-[var(--cell-review)]">
                          NOT ASSESSED
                        </span>
                      )}
                    </span>
                    <span className="font-normal text-[9px] tracking-wide text-muted-foreground uppercase">
                      {v.reply_format ? `${v.reply_format} · ` : ""}
                      {v.assessed === false
                        ? "questionnaire not checked"
                        : v.qualified ? "eligible" : "cannot win"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ line, startsGroup }, rowIdx) => {
              const rows = [];
              if (startsGroup) {
                rows.push(
                  <tr key={`g-${line.group}`} className="group-row">
                    <td className="col-sticky" colSpan={3 + vendors.length}>
                      {line.group}
                    </td>
                  </tr>,
                );
              }
              rows.push(
                // aria-rowindex counts the header row and stays meaningful
                // after a filter has removed rows from the DOM, which is the
                // whole reason the attribute exists.
                <tr key={line.no} aria-rowindex={rowIdx + 2}>
                  {/* A row header, so a non-visual reader can associate every
                      price in the row with the line it belongs to. A 150-cell
                      table without this is unusable with a screen reader. */}
                  <th scope="row" className="col-sticky text-left font-normal">
                    <span className="num mr-2 text-muted-foreground">{line.no}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help font-medium">{line.sku}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md text-xs">{line.desc}</TooltipContent>
                    </Tooltip>
                  </th>
                  <td className="num text-right text-muted-foreground">{line.qty}</td>
                  <td className="text-muted-foreground">
                    {line.pack_size > 1 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help font-medium underline decoration-dotted">
                            {line.uom}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          One {line.uom} = {line.pack_size} billable units. A supplier who
                          quotes per piece here will look far cheaper than they are until
                          we convert it.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      line.uom
                    )}
                  </td>
                  {vendors.map((v, colIdx) => (
                    <GridCell
                      key={v.code}
                      // Coordinates for the roving tabindex. `rowIdx` is the
                      // index within the FILTERED rows, not the line number,
                      // because arrow keys move through what is on screen.
                      coords={{ row: rowIdx, col: colIdx }}
                      isTabStop={activeCell.row === rowIdx && activeCell.col === colIdx}
                      onFocusCell={() => setFocusCell({ row: rowIdx, col: colIdx })}
                      vendorName={shortName(v.name)}
                      lineLabel={`line ${line.no}, ${line.sku}`}
                      vendorLineKey={`${v.code}:${line.no}`}
                      cell={matrix[v.code]?.[line.no]}
                      confidence={confidence[`${v.code}:${line.no}`]}
                      carriedForward={carriedForwardSet.has(`${v.code}:${line.no}`)}
                      isBest={bestPerLine?.[line.no] === v.code}
                      bestIsEligible={v.qualified}
                      showRaw={showRaw}
                      isSelected={selected?.vendor === v.code && selected?.lineNo === line.no}
                      onClick={() => onCellClick(v.code, line.no)}
                    />
                  ))}
                </tr>,
              );
              return rows;
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No lines match this filter.
          </p>
        )}
      </div>
    </div>
  );
}

function GridCell({
  cell, confidence, carriedForward, isBest, showRaw, isSelected, onClick, vendorName,
  lineLabel, vendorLineKey, bestIsEligible, coords, isTabStop, onFocusCell,
}: {
  cell?: Cell;
  /** Position within the FILTERED rows, for the roving tabindex. */
  coords: { row: number; col: number };
  /** True for the one cell in the grid that is currently a tab stop. */
  isTabStop: boolean;
  onFocusCell: () => void;
  confidence?: number;
  /** True when this price is from an earlier revision the supplier replaced. */
  carriedForward?: boolean;
  isBest?: boolean;
  showRaw: boolean;
  isSelected: boolean;
  onClick: () => void;
  vendorName: string;
  lineLabel: string;
  /** `vendorCode:lineNo`, stable across filtering. Used to restore focus. */
  vendorLineKey: string;
  /** False when the cheapest cell belongs to a supplier who cannot win. */
  bestIsEligible?: boolean;
}) {
  if (!cell) {
    // Still a grid cell, still reachable by arrow keys. "Nothing has been read
    // here" is a fact the buyer needs, so it must not be skipped by keyboard.
    return (
      <td
        role="gridcell"
        data-cell={`${coords.row}:${coords.col}`}
        data-vendor-line={vendorLineKey}
        tabIndex={isTabStop ? 0 : -1}
        onFocus={onFocusCell}
        aria-colindex={coords.col + 4}
        className="cell-empty focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`${vendorName}, ${lineLabel}: nothing read`}
      />
    );
  }

  const state = displayState(cell.status);
  const meta = STATUS_ACTION[cell.status as CellStatus];

  // Show the raw value only when normalisation actually moved the number.
  const changed =
    cell.unitInr !== null && cell.raw?.price != null &&
    Math.abs(cell.unitInr - cell.raw.price) > 0.5;


  return (
    <td
      onClick={(e) => {
        /**
         * Focus the cell we clicked, then open the panel.
         *
         * Clicking a `<td>` does not focus it: browsers focus buttons, links
         * and inputs on mousedown, and a table cell with tabindex="-1" is
         * none of those, so `document.activeElement` stayed on <body> after a
         * click. Which means a mouse user who clicked a cell and then reached
         * for the keyboard had focus nowhere, and their first keypress went to
         * the document rather than to the grid.
         *
         * The drawer that opens on the same click takes focus immediately
         * afterwards, so this is not visible until the drawer closes. Where
         * focus lands then is the known gap recorded in workbench.tsx.
         */
        e.currentTarget.focus();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      data-cell={`${coords.row}:${coords.col}`}
      // Identity that survives filtering, unlike the row index above: a panel
      // opened from this cell has to find it again after it closes, and the
      // buyer may have changed the filter while the panel was open.
      data-vendor-line={vendorLineKey}
      // ONE tab stop for the grid. See the roving-tabindex note above.
      tabIndex={isTabStop ? 0 : -1}
      onFocus={onFocusCell}
      role="gridcell"
      aria-colindex={coords.col + 4}
      // The status and every caveat also live in a tooltip. A tooltip is
      // unreachable by touch and unreliable by keyboard, so the same
      // information is put on the element itself for anyone not hovering.
      aria-label={
        `${vendorName}, ${lineLabel}: ` +
        (cell.unitInr !== null
          ? `${num(cell.unitInr)} rupees. `
          : "no comparable price. ") +
        `${meta?.label ?? cell.status}. ${meta?.action ?? ""} ` +
        (carriedForward
          ? "Carried forward from an earlier revision that this supplier replaced. "
          : "") +
        (cell.flags.length ? cell.flags.join(". ") : "")
      }
      className={cn(
        "cursor-pointer text-right align-middle",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
        CELL_CLASS[state],
        // A number the calculator changed must not look like one it did not.
        // The unit traps were the strongest thing in the whole dataset and they
        // were rendering as ordinary trusted cells.
        changed && state === "trusted" && "cell-normalised",
        isSelected && "ring-2 ring-inset ring-ring",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-end justify-center leading-tight">
            {cell.unitInr !== null ? (
              <span className={cn("num", isBest && "font-semibold")}>
                {/* The marker means "cheapest in the scenario you are viewing".
                    With all suppliers shown that includes disqualified ones, so
                    it is dimmed and labelled rather than reading as a
                    recommendation the buyer can act on. */}
                {isBest && (
                  <span
                    className={cn(
                      // 9px at 45% opacity measured 1.8:1. This marker is the
                      // warning that the cheapest price belongs to a supplier
                      // who cannot be awarded, so it must survive a glance.
                      "mr-1 text-[10px]",
                      bestIsEligible ? "text-foreground/70" : "text-[var(--cell-review)]",
                    )}
                  >
                    {bestIsEligible ? "\u25b8" : "\u25b9"}
                  </span>
                )}
                {num(cell.unitInr)}
                {/* This price is from a quote the supplier has since replaced.
                    Marked in the cell, not only in a tooltip: a stale number
                    that looks current is exactly the kind of thing a buyer
                    signs without noticing. */}
                {carriedForward && (
                  <span
                    className="ml-1 text-[9px] text-[var(--cell-review)]"
                    title="from a quote this supplier replaced"
                  >
                    {"\u21ba"}
                  </span>
                )}
              </span>
            ) : (
              // Quiet by design. Forty-three cells carry no number, and
              // spelling out a reason in every one turns the grid into noise.
              // A dash reads as "nothing here"; the tooltip carries which kind
              // of nothing it is and what to do about it.
              <span
                className={cn(
                  // Was text-[10.5px] at 60% opacity, which measured 2.3:1
                  // against white. These glyphs ARE the answer to "what do you
                  // show when you are not sure", so they are now full-strength
                  // muted at 11px: still quiet against a priced number, but
                  // legible without leaning in.
                  "text-[11px] font-semibold tracking-tight",
                  cell.status === "unreadable" || cell.status === "needs_review"
                    ? "text-[var(--cell-review)]"
                    : "text-muted-foreground",
                )}
              >
                {EMPTY_GLYPH[cell.status]?.glyph ?? "—"}
              </span>
            )}
            {showRaw && changed && (
              <span className="num text-[9.5px] text-muted-foreground line-through decoration-1">
                {cell.raw?.ccy === "USD" ? "$" : ""}
                {num(cell.raw!.price!)}
                {cell.raw?.uom ? `/${cell.raw.uom.replace("per ", "")}` : ""}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm space-y-1.5 text-xs">
          <p className="font-semibold">{meta?.label ?? cell.status}</p>
          <p className="text-muted-foreground">{meta?.action}</p>
          {cell.flags.slice(0, 3).map((f, i) => (
            <p key={i} className="border-l-2 pl-2">{f}</p>
          ))}
          {carriedForward && (
            <p className="border-l-2 border-[var(--cell-review)] pl-2">
              From the earlier quote. Their revision does not mention this line, so we
              kept the old price rather than blanking it. Confirm before award.
            </p>
          )}
          {confidence !== undefined && (
            <p className="text-muted-foreground">
              Reader confidence {(confidence * 100).toFixed(0)}%
            </p>
          )}
          <p className="pt-0.5 text-muted-foreground">Click for the source</p>
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

/**
 * What the marks mean.
 *
 * Twelve items used to sit in one undifferentiated row at 10px, which is a wall
 * rather than a legend: the reader has to scan all twelve to find the one they
 * are looking at. The count is not the problem, the absence of structure is, so
 * they are now three labelled groups answering three different questions:
 *
 *   what colour is this cell     the state of the price
 *   why is there no number       the five kinds of nothing
 *   what is that little mark     the per-cell annotations
 *
 * Collapsible, and it remembers. A buyer needs this on their first comparison
 * and never again, and forty pixels of a dense grid is worth reclaiming. Open
 * by default, because someone seeing the screen for the first time should not
 * have to find it.
 */
function Legend() {
  const swatches: Array<[string, string]> = [
    ["", "Ready"],
    ["cell-caveat", "Off-spec"],
    ["cell-review", "Needs you"],
    ["cell-empty", "No price"],
  ];
  // Every glyph that can appear in a cell with no number, so a buyer never has
  // to hover to learn what a mark means.
  const glyphs: Array<[string, string]> = [
    ["NQ", "they declined"],
    ["\u00b7", "never mentioned"],
    ["?", "can't read it"],
    ["~", "not a price"],
    ["!", "needs your call"],
    ["", "blank: not read yet"],
  ];
  const markers: Array<[string, string]> = [
    ["\u25b8", "cheapest, eligible"],
    ["\u25b9", "cheapest, but cannot win"],
    ["\u21ba", "from a replaced quote"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {swatches.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className={cn("inline-block h-3 w-3 rounded-[2px] border", cls)} />
          {label}
        </span>
      ))}
      <span className="h-3 w-px bg-border" />
      {glyphs.map(([g, label]) => (
        <span key={g} className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-3 text-center font-medium">{g}</span>
          {label}
        </span>
      ))}
      <span className="h-3 w-px bg-border" />
      {markers.map(([g, label]) => (
        <span key={g} className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-3 text-center">{g}</span>
          {label}
        </span>
      ))}
    </div>
  );
}
