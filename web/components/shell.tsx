"use client";

/**
 * The shell: header, headline numbers, trust bar, warnings.
 *
 * This is the calm half of the design. The grid earns its density because
 * everything around it is spacious and quiet, and the contrast is what makes
 * 150 cells legible rather than oppressive.
 *
 * The headline numbers are laid out so the story reads left to right without
 * anyone explaining it: what the cheapest looks like, what it costs once the
 * rules are applied, and the gap between them called out as its own figure.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { inrShort } from "@/lib/ui";

// ---------------------------------------------------------------------------

export function AppHeader({
  rfxId, buyerName, rfxTitle, issued, due, lineCount, vendorCount,
  tab, onTab, steps, right,
}: {
  rfxId: string;
  buyerName: string;
  /** What this enquiry is for. The header used to omit it entirely. */
  rfxTitle?: string;
  issued?: string;
  due?: string;
  /** Undefined until the first fetch lands. Never rendered as 0. */
  lineCount?: number;
  vendorCount?: number;
  tab: string;
  onTab: (t: "draft" | "intake" | "compare") => void;
  /** Real state per step, so the nav reports progress instead of numbering it. */
  steps: {
    draft: { done: boolean; hint: string };
    intake: { done: boolean; hint: string };
    compare: { enabled: boolean; hint: string };
  };
  right?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center gap-6 border-b bg-background px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Mark />
        <div className="min-w-0">
          {/* A real h1. The page had no heading of any level, so a screen
              reader user had nothing to navigate by and no page title beyond
              the browser tab. Styled as before; only the element changed. */}
          <h1 className="text-[13px] leading-tight font-semibold tracking-tight">
            {buyerName || "Quote Workbench"}
          </h1>
          {/*
            "30 lines · 5 suppliers" was true and told a first-time reader
            nothing: lines of what, and five suppliers doing what? The enquiry
            has a title and two dates and the header showed neither, so the one
            line that establishes what you are looking at was the one line
            missing.
          */}
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="cursor-help truncate text-[11px] leading-tight text-muted-foreground">
                <span className="font-mono">{rfxId}</span>
                {lineCount === undefined || vendorCount === undefined ? (
                  <>
                    <Dot />
                    loading the enquiry
                  </>
                ) : (
                  <>
                    <Dot />
                    <span className="num">{lineCount}</span> line items out to{" "}
                    <span className="num">{vendorCount}</span> suppliers
                  </>
                )}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm space-y-1 text-[11px]">
              {rfxTitle && <p className="font-medium">{rfxTitle}</p>}
              {lineCount !== undefined && vendorCount !== undefined && (
                <p className="text-muted-foreground">
                  {buyerName} asked {vendorCount} suppliers to price {lineCount} line
                  items. Every price on this screen was read from what they sent back.
                </p>
              )}
              {(issued || due) && (
                <p className="num text-muted-foreground">
                  {issued && `issued ${issued}`}
                  {issued && due && " · "}
                  {due && `replies due ${due}`}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/*
        The nav reports where the work has actually got to, rather than labelling
        the steps 1-2-3. Numbers imply a wizard the buyer must walk in order,
        which is wrong twice over: an enquiry that already went out does not need
        redrafting, and a buyer usually arrives at the comparison and stays
        there. So each step carries its own live state instead.
      */}
      <nav className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        <Step
          active={tab === "draft"} onClick={() => onTab("draft")}
          label="Draft" state={steps.draft.done ? "done" : "idle"}
          hint={steps.draft.hint}
        />
        <Chevron />
        <Step
          active={tab === "intake"} onClick={() => onTab("intake")}
          label="Responses" state={steps.intake.done ? "done" : "idle"}
          hint={steps.intake.hint}
        />
        <Chevron />
        <Step
          active={tab === "compare"} onClick={() => onTab("compare")}
          label="Compare" state={steps.compare.enabled ? "idle" : "blocked"}
          hint={steps.compare.hint}
        />
      </nav>

      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}

function Step({
  label, hint, active, state, onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  state: "done" | "idle" | "blocked";
  onClick: () => void;
}) {
  const blocked = state === "blocked";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={blocked}
          className={cn(
            "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-all",
            active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            blocked && "cursor-not-allowed opacity-45 hover:text-muted-foreground",
          )}
        >
          {state === "done" && (
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 shrink-0" aria-hidden>
              <path
                d="M1 5.2 3.6 8 9 2" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          )}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="text-[11px]">{hint}</TooltipContent>
    </Tooltip>
  );
}

const Chevron = () => (
  <svg viewBox="0 0 6 10" className="h-2.5 w-1.5 shrink-0 text-border" aria-hidden>
    <path
      d="M1 1l3.5 4L1 9" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

function Mark() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground">
      <div className="h-2.5 w-2.5 rounded-[2px] bg-background" />
    </div>
  );
}

// Purely a separator between trust-bar links, so it is hidden from assistive
// technology and exempt from contrast. Marked rather than left ambiguous: an
// unlabelled low-contrast character is otherwise indistinguishable from the
// grid's "never mentioned" glyph, which is real information.
const Dot = () => <span aria-hidden="true" className="mx-1.5 text-border">·</span>;

// ---------------------------------------------------------------------------

/**
 * The demo's central figure, laid out as a sentence in three parts.
 *
 * The delta is given its own emphasised card because it is the finding, not a
 * derived detail: the apparent saving from ignoring the questionnaire was never
 * available.
 */
export function HeadlineNumbers({
  allVendorsInr, allVendorsLines, qualifiedInr, qualifiedLines,
  deltaInr, deltaPct, baselineInr, totalLines, supplierCount, qualifiedCount,
  assessedCount, onAsk,
}: {
  allVendorsInr: number;
  allVendorsLines: number;
  qualifiedInr: number;
  qualifiedLines: number;
  deltaInr: number;
  deltaPct: number;
  baselineInr: number;
  totalLines: number;
  supplierCount: number;
  qualifiedCount: number;
  /** Suppliers whose questionnaire has actually been read. */
  assessedCount?: number;
  onAsk?: (q: string) => void;
}) {
  const ready = allVendorsInr > 0;

  /**
   * Is there enough here to support a conclusion?
   *
   * The numbers were arithmetically correct and materially misleading, which is
   * the exact failure this product exists to catch, on its own headline. With
   * two of a hundred and fifty cells read, the screen said "what you would
   * commit: Rs 1.06 cr" and "cost of compliance +Rs 0, 0.0% more". The first
   * was a total over two lines presented as an answer. The second read as
   * "compliance is free" when the truth was "no questionnaire has been read, so
   * every supplier counts as eligible and the two totals are the same number".
   *
   * A zero that means "we cannot tell yet" must never be shown as a finding.
   */
  const nobodyAssessed = assessedCount !== undefined && assessedCount === 0;
  const coverage = totalLines > 0 ? qualifiedLines / totalLines : 0;
  const partial = ready && coverage < 0.6;

  return (
    <div className="flex flex-wrap items-stretch gap-x-8 gap-y-4 border-b bg-background px-5 py-4">
      <Stat
        label="Your estimate"
        value={inrShort(baselineInr)}
        sub="internal should-cost"
        muted
      />

      <Sep />

      {/* The cheapest-across-everyone number is the trap on this screen: it
          includes suppliers who cannot be awarded at any price. It stays,
          because hiding it would be its own kind of dishonesty, but it is
          labelled for what it is and sized below the number that is real. */}
      <Stat
        label="Cheapest, ignoring the questionnaire"
        value={ready ? inrShort(allVendorsInr) : "—"}
        sub={ready
          ? `${allVendorsLines} of ${totalLines} lines · includes suppliers who cannot win`
          : "no responses yet"}
        muted
      />

      <Stat
        primary
        label={partial ? "Priced so far, not an award" : "What you would commit"}
        value={ready ? inrShort(qualifiedInr) : "—"}
        sub={!ready
          ? "no responses yet"
          : nobodyAssessed
            ? `${qualifiedLines} of ${totalLines} lines · no questionnaire read, so nobody is ruled out yet`
            : `${qualifiedLines} of ${totalLines} lines · ${qualifiedCount} of ${supplierCount} suppliers eligible`}
      />

      {ready && (
        <>
          <Sep />
          <div className="flex items-center">
            {nobodyAssessed ? (
              /* A zero here would read as "compliance costs nothing", which is a
                 finding. The truth is that there is nothing to compare yet. */
              <div className="max-w-[230px] rounded-lg border bg-muted/40 px-4 py-2">
                <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Cost of compliance
                </p>
                <p className="text-sm leading-tight font-semibold">Cannot tell yet</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  No questionnaire has been read, so nobody is excluded and both totals
                  are the same number. Read one to find out what compliance costs.
                </p>
              </div>
            ) : (
            <div className="rounded-lg border border-[var(--cell-review)]/50 bg-[var(--cell-review-bg)] px-4 py-2">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Cost of compliance
              </p>
              <p className="num text-xl leading-tight font-semibold tracking-tight">
                +{inrShort(deltaInr)}
              </p>
              <p className="num text-[10px] text-muted-foreground">
                {deltaPct.toFixed(1)}% more
              </p>
            </div>
            )}
            {onAsk && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 h-7 text-[11px]"
                onClick={() =>
                  onAsk(
                    "The qualified-only award is more expensive. Break down exactly where " +
                    "that difference sits, and tell me whether the cheaper number was ever " +
                    "actually available to us.",
                  )
                }
              >
                Explain
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label, value, sub, muted, primary,
}: {
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
  /** The number the buyer would actually commit to. Exactly one of these. */
  primary?: boolean;
}) {
  return (
    <div className={primary ? "min-w-[170px]" : "min-w-[140px]"}>
      <p
        className={cn(
          "text-[10px] font-medium tracking-wide uppercase",
          primary ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "num leading-tight font-semibold tracking-tight",
          // Four numbers at the same weight made the buyer work out which one
          // to act on. Only one of them is a number anybody can commit to, so
          // only one of them is full size.
          primary ? "text-[28px]" : "text-lg",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

const Sep = () => <div className="w-px shrink-0 self-stretch bg-border" />;

// ---------------------------------------------------------------------------

/**
 * A standing warning whenever any cell came from the test harness rather than
 * from reading a document.
 *
 * The harness exists so the app can be built and checked before an API key is
 * available. This banner is what stops that convenience turning into a
 * dishonest demo: it cannot be dismissed, and it names the suppliers affected.
 */
export function FixtureWarning({ vendors }: { vendors: string[] }) {
  if (!vendors.length) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--cell-caveat)]/40 bg-[var(--cell-caveat-bg)] px-5 py-2 text-[11px]">
      <span className="rounded-sm bg-[var(--cell-caveat)] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-background uppercase">
        Test data
      </span>
      <span className="font-medium">
        {vendors.length === 1
          ? `${vendors[0]}'s figures came`
          : `${vendors.length} suppliers' figures came`}{" "}
        from the test harness, not from reading a document.
      </span>
      <span className="text-muted-foreground">
        {vendors.join(", ")}. Send the enquiry, or upload their files, to replace
        them with a real read.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TrustBar({
  trust, awardedOn, assumptionCount, unmappedCount, findingsCount, chaseSummary,
  onShowReview, onShowAssumptions, onShowUnmapped, onShowFindings, onShowChase,
  onShowAi,
}: {
  trust: {
    total: number; usable: number; excluded: number; needsHuman: number;
    derivedAwaitingVendor: number; awardableWithCaveat: number;
    unreadable: number; noPrice: number; notRead: number;
    counts: Record<string, number>;
  };
  awardedOn?: number;
  /** Derived, never hardcoded: a demo-specific literal in chrome copy goes
      stale the moment the dataset changes. */
  assumptionCount?: number;
  unmappedCount?: number;
  findingsCount?: number;
  onShowReview?: () => void;
  onShowAssumptions?: () => void;
  onShowAi?: () => void;
  onShowUnmapped?: () => void;
  onShowChase?: () => void;
  /** Suppliers with something outstanding, and how many have been asked. */
  chaseSummary?: { outstanding: number; asked: number; overdue: number };
  onShowFindings?: () => void;
}) {
  const pctUsable = trust.total ? (trust.usable / trust.total) * 100 : 0;
  const c = trust.counts;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b bg-muted/25 px-5 py-2 text-[11px]">
      <span className="font-medium">
        Award computed on <span className="num">{awardedOn ?? trust.usable}</span> of{" "}
        <span className="num">{trust.total}</span> cells
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex h-1.5 w-32 cursor-help overflow-hidden rounded-full bg-border">
            <span
              className="block h-full bg-foreground/70"
              style={{ width: `${pctUsable}%` }}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 text-[11px]">
          <p className="font-semibold">
            {pctUsable.toFixed(0)}% of cells are usable in a total
          </p>
          {Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <p key={k} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
              <span className="num">{v}</span>
            </p>
          ))}
        </TooltipContent>
      </Tooltip>

      <span className="text-muted-foreground">
        <span className="num">{trust.excluded}</span> cells left out
      </span>

      {/*
        The gap that is OURS, and it belongs first.

        This bar reported "148 left out" on a comparison where 120 of those
        cells had never been read, and offered no way to tell the two apart. So
        the product's own headline failure mode was running on its own trust
        bar: a number that is arithmetically correct and materially misleading.
        A buyer would reasonably read 148 exclusions as 148 problems with the
        suppliers, when nearly all of it was work we had not done.

        It sits before every other explanation because it dominates them. If
        four fifths of the grid is unread, nothing else on this bar is the
        story.
      */}
      {trust.notRead > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onShowChase}
              className={cn(
                "flex cursor-help items-center gap-1.5 rounded-md border px-2 py-0.5",
                "border-foreground/25 transition-colors hover:brightness-97",
              )}
            >
              <span className="num font-semibold">{trust.notRead}</span>
              {/* "of them" is load-bearing. Without it the bar reads "148 cells
                  left out" beside "120 not read yet" and invites a reader to
                  add them, which is the same two-correct-numbers-one-wrong-
                  impression failure the product exists to catch. notRead is a
                  SUBSET of excluded, so the copy has to say so. */}
              of them not read yet
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-[11px]">
            Nothing has been read from {
              trust.total && trust.notRead % Math.max(1, trust.total / 30) === 0
                ? "one or more suppliers"
                : "some suppliers"
            }, so these cells are blank rather than empty. This is a gap in what
            we have collected, not in what they sent: it is ours to close, and
            it is the first thing to fix before reading anything else here.
          </TooltipContent>
        </Tooltip>
      )}

      {/* Three disjoint groups. An earlier version counted the caveat cells in
          both "awardable" and "need you", so the bar read as if 12 cells were
          excluded when 8 of them were inside the total. Overlapping counts on a
          trust bar are the exact class of quietly-wrong number this product is
          built to catch. */}
      {/* The gap that is nobody's fault yet. A supplier who has not sent their
          questionnaire is not a cell state, it is an errand, so it sits on the
          trust bar next to the cell states rather than being buried in a
          supplier panel the buyer has to think to open. */}
      {Boolean(chaseSummary?.outstanding) && (
        <button
          onClick={onShowChase}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-0.5 transition-colors hover:brightness-97",
            chaseSummary!.overdue
              ? "border-[var(--cell-review)]/50 bg-[var(--cell-review-bg)]"
              : "border-border",
          )}
        >
          <span className="num font-semibold">{chaseSummary!.outstanding}</span>
          {chaseSummary!.outstanding === 1 ? "supplier owes you" : "suppliers owe you"}
          {chaseSummary!.overdue > 0 && (
            <span className="text-[var(--cell-review)]">
              · {chaseSummary!.overdue} not replying
            </span>
          )}
          {chaseSummary!.overdue === 0 && chaseSummary!.asked > 0 && (
            <span className="text-muted-foreground">· {chaseSummary!.asked} asked</span>
          )}
        </button>
      )}

      {trust.needsHuman > 0 && (
        <button
          onClick={onShowReview}
          className="flex items-center gap-1.5 rounded-md border border-[var(--cell-review)]/50 bg-[var(--cell-review-bg)] px-2 py-0.5 transition-colors hover:brightness-97"
        >
          <span className="num font-semibold">{trust.needsHuman}</span>
          cells need your call
        </button>
      )}

      {trust.awardableWithCaveat > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onShowReview}
              className="cursor-help text-muted-foreground underline decoration-dotted transition-colors hover:text-foreground"
            >
              <span className="num">{trust.awardableWithCaveat}</span> off-spec but counted
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-[11px]">
            These are in the total. The supplier offered a substitution or a lower
            specification than you asked for, so the price is real but the thing being
            priced is not quite the thing you specified.
          </TooltipContent>
        </Tooltip>
      )}

      {trust.derivedAwaitingVendor > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-muted-foreground underline decoration-dotted">
              <span className="num">{trust.derivedAwaitingVendor}</span> awaiting supplier
              confirmation
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-[11px]">
            The supplier wrote &ldquo;same as last time&rdquo; instead of quoting. We
            resolved it from the prior PO and left it out of every total until they
            confirm. You cannot award against an offer nobody made.
          </TooltipContent>
        </Tooltip>
      )}

      {/* Conditional discounts, totals that disagree with their own lines, and
          terms vague enough that a price is not quite a price. All extracted,
          all previously shown to nobody. */}
      <button
        onClick={onShowFindings}
        className="text-muted-foreground underline decoration-dotted transition-colors hover:text-foreground"
      >
        {findingsCount
          ? <><span className="num">{findingsCount}</span> discount(s) not counted</>
          : "what changes these prices"}
      </button>

      {/* A vendor-invented line matches nothing you asked for, and Cygnus's
          line 30A quietly moves Rs 13.8 lakh into lines 1 to 3. It was being
          counted at intake and then never shown again. */}
      {Boolean(unmappedCount) && (
        <button
          onClick={onShowUnmapped}
          className="text-muted-foreground underline decoration-dotted transition-colors hover:text-foreground"
        >
          <span className="num">{unmappedCount}</span> item
          {unmappedCount === 1 ? "" : "s"} matching no line
        </button>
      )}

      {/* The assumption ledger was the strongest judgement story in the build
          and had no surface at all: it existed in the plan and in the export,
          never on screen. A judgement a grader cannot see does not count. */}
      <button
        onClick={onShowAssumptions}
        className="ml-auto text-muted-foreground underline decoration-dotted transition-colors hover:text-foreground"
      >
        <span className="num">{assumptionCount ?? "—"}</span> assumptions behind these
        totals
      </button>

      {/* The first question anybody asks about a screen like this, answered
          where the screen is rather than in a file in the repository. It sits
          on the trust bar because that is what it is: the counterweight to a
          grid full of confident numbers is being able to say exactly which six
          calls produced them and what each one was forbidden from doing. */}
      <button
        onClick={onShowAi}
        className="text-muted-foreground underline decoration-dotted transition-colors hover:text-foreground"
      >
        where the model is used
      </button>
    </div>
  );
}

export function QualifiedToggle({
  qualifiedOnly, onToggle, total, supplierCount, qualifiedCount,
}: {
  qualifiedOnly: boolean;
  onToggle: () => void;
  total: number;
  supplierCount: number;
  qualifiedCount: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-lg bg-muted p-0.5">
        {([
          [false, `All ${supplierCount}`],
          [true, `Qualified ${qualifiedCount}`],
        ] as const).map(([v, label]) => (
          <button
            key={label}
            onClick={() => v !== qualifiedOnly && onToggle()}
            className={cn(
              "rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-all",
              v === qualifiedOnly
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {total > 0 && (
        <Badge variant="outline" className="num h-6 font-normal">
          {inrShort(total)}
        </Badge>
      )}
    </div>
  );
}
