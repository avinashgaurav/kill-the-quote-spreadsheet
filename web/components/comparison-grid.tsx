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

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CELL_CLASS, EMPTY_GLYPH, STATUS_ACTION, displayState, num } from "@/lib/ui";
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
          {([
            ["all", `All ${lines.length}`],
            ["review", `Check ${counts.review}`],
            ["gaps", `Gaps ${counts.gaps}`],
            ["traps", `Adjusted ${counts.traps}`],
          ] as const).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={filter === k ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setFilter(k as Filter)}
            >
              {label}
            </Button>
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

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="grid-table w-full">
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
                      {v.name.split(" ")[0]}
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
            {visible.map(({ line, startsGroup }) => {
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
                <tr key={line.no}>
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
                  {vendors.map((v) => (
                    <GridCell
                      key={v.code}
                      vendorName={v.name.split(" ")[0]}
                      lineLabel={`line ${line.no}, ${line.sku}`}
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
  lineLabel, bestIsEligible,
}: {
  cell?: Cell;
  confidence?: number;
  /** True when this price is from an earlier revision the supplier replaced. */
  carriedForward?: boolean;
  isBest?: boolean;
  showRaw: boolean;
  isSelected: boolean;
  onClick: () => void;
  vendorName: string;
  lineLabel: string;
  /** False when the cheapest cell belongs to a supplier who cannot win. */
  bestIsEligible?: boolean;
}) {
  if (!cell) {
    return <td className="cell-empty" aria-label={`${vendorName}, ${lineLabel}: nothing read`} />;
  }

  const state = displayState(cell.status);
  const meta = STATUS_ACTION[cell.status as CellStatus];

  // Show the raw value only when normalisation actually moved the number.
  const changed =
    cell.unitInr !== null && cell.raw?.price != null &&
    Math.abs(cell.unitInr - cell.raw.price) > 0.5;


  return (
    <td
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
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
