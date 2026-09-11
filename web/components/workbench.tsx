"use client";

/**
 * The workbench.
 *
 * One screen, three panes, matching the order the work actually happens in:
 * intake, then the comparison, then the questions. The buyer never navigates
 * away from the grid to ask something, because the answer usually needs to be
 * checked against a cell.
 *
 * Layout is the "clean shell around a dense core" decision: generous, calm
 * chrome and a deliberately tight grid, because 150 cells of price data want
 * density and everything around them wants air.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { shortName } from "@/lib/ui";
import { ComparisonGrid, type GridVendor } from "./comparison-grid";
import {
  AppHeader, HeadlineNumbers, FixtureWarning, DegradedWarning, TrustBar,
  QualifiedToggle,
} from "./shell";
import { Intake } from "./intake";
import { ProvenancePanel } from "./provenance-panel";
import { AnalystChat } from "./analyst-chat";
import { CopilotPanel } from "./copilot-panel";
import { ExportBar } from "./export-bar";
import { ChasePanel } from "./chase-panel";
import {
  SupplierPanel, ReviewQueuePanel, AssumptionsPanel, UnmappedPanel, FindingsPanel,
  AiPanel, buildReviewQueue,
} from "./side-panels";
import type { Cell, RfxLine } from "@/lib/normalise";

interface Payload {
  rfx: { id: string; title: string; due?: string };
  buyer: { short_name: string; legal_name: string };
  lines: RfxLine[];
  vendors: Array<GridVendor & {
    slug: string;
    city?: string;
    meta: {
      filenames: string[];
      unreadableRegions: string[];
      terms?: Record<string, unknown>;
      conditionalDiscounts?: Array<Record<string, unknown>>;
      statedTotal?: Record<string, unknown>;
    } | null;
  }>;
  matrix: Record<string, Record<number, Cell>>;
  provenance: Record<string, { locator: string; citedText: string; method: string;
                               page?: number | null }>;
  confidence: Record<string, number>;
  verification: Record<string, Array<{ bbox: [number, number, number, number] | null;
    firstRead: number | null; secondRead: number | null; agreed: boolean; note: string }>>;
  unmapped: Array<Record<string, unknown>>;
  hasAnyExtraction: boolean;
  fixtureVendors: string[];
  supersessions: Array<{
    vendorId: string; revision: number; supersedesRef: string | null;
    supersededFilenames: string[]; winningFilenames: string[];
    changedLines: Array<{ lineNo: number; from: number | null; to: number | null }>;
    carriedForwardLines: number[];
  }>;
  /** Cell keys (`vendor:line`) whose price came from a superseded revision. */
  carriedForward: string[];
  chases: Array<{
    vendorId: string; chaseId: string; sentAt: string; dueAt: string | null;
    itemCount: number; answeredAt: string | null; overdue: boolean;
    closedReason: string | null;
  }>;
  baselineTotalInr: number;
  questionnaire: Array<{ no: string; kind: string; q: string; doc_required: boolean }>;
  questionnaireAnswers: Record<
    string,
    Record<string, { answer: string | null; doc: string | null; ok: boolean; note?: string }>
  >;
  /** Non-null when the database could not be read and the screen is not live. */
  degraded?: string | null;
  /** Documents held per supplier, keyed by code. Empty until one is read. */
  attachments?: Record<string, Array<{
    filename: string;
    mimeType: string;
    citedFor: string[];
    evidence: { standard?: string | null; validUntil?: string | null;
                issuedTo?: string | null; summary?: string | null };
    readerConfidence?: number | null;
  }>>;
  assumptions: Record<string, {
    value: unknown; source: string; alternative?: string; note: string; confidence?: string;
  }>;
  trust: {
    total: number; usable: number; excluded: number; needsHuman: number;
    derivedAwaitingVendor: number; awardableWithCaveat: number;
    unreadable: number; noPrice: number; notRead: number;
    counts: Record<string, number>;
  };
  scenarios: {
    allVendors: { totalInr: number; linesAwarded: number;
                  picks: Record<number, { vendor: string }> };
    qualifiedOnly: { totalInr: number; linesAwarded: number;
                     picks: Record<number, { vendor: string }> };
    costOfComplianceInr: number;
    costOfCompliancePct: number;
    singleVendor: Record<string, { totalInr: number; linesPriced: number }>;
  };
}

type Tab = "draft" | "intake" | "compare";

export function Workbench({
  suggestions, copilotPrompts,
}: {
  suggestions: string[];
  copilotPrompts: string[];
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>("intake");
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Set when a button elsewhere in the UI wants the analyst to answer. */
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  /**
   * One right-hand drawer, several contents. A cell's provenance, a supplier's
   * qualification, the review queue and the assumption ledger are all "the
   * detail behind what you are looking at", so they share one surface rather
   * than opening four competing panels.
   */

  const [drawer, setDrawer] = useState<
    | { kind: "cell"; vendor: string; lineNo: number }
    | { kind: "vendor"; vendor: string }
    | { kind: "review" }
    | { kind: "unmapped" }
    | { kind: "findings" }
    | { kind: "chase" }
    | { kind: "assumptions" }
    // Not a data panel. It answers "so what is the AI actually doing here?",
    // which is the first thing anybody asks and should not require reading a
    // file in the repository.
    | { kind: "ai" }
    | null
  >(null);
  /** The Ask panel is a drawer below the breakpoint where it fits beside the grid. */
  const [askOpen, setAskOpen] = useState(false);

  /** How many suppliers have actually had a document read. */
  const readCount = payload?.vendors.filter((v) => v.meta).length ?? 0;

  /**
   * Refresh the comparison.
   *
   * `jump` controls whether landing data also moves the buyer to the grid. It
   * has to be optional: replies arrive one supplier at a time, and refreshing
   * after each one used to yank the screen to the comparison after the FIRST
   * arrival, so nobody could watch the rest land. Auto-advancing is right on a
   * first load and wrong in the middle of something.
   */
  const load = useCallback(async (jump = true) => {
    try {
      const res = await fetch("/api/comparison", { cache: "no-store" });
      const json = await res.json();
      if (json.error) {
        // Previously this fell through silently and the user got a blank white
        // page with no way to tell whether the app was broken or still loading.
        setLoadError(String(json.error));
        return;
      }
      setLoadError(null);
      setPayload(json);
      if (jump && json.hasAnyExtraction) setTab("compare");
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Canonical fetch-in-effect shape: an ignore flag so a response that arrives
   * after unmount, or after a newer request, cannot write stale state.
   */
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/comparison", { cache: "no-store" });
        const json = await res.json();
        if (ignore) return;
        if (json.error) {
          setLoadError(String(json.error));
          return;
        }
        setLoadError(null);
        setPayload(json);
        if (json.hasAnyExtraction) setTab("compare");
      } catch (e) {
        if (!ignore) setLoadError(String(e));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const bestPerLine = useMemo(() => {
    if (!payload) return {};
    const s = qualifiedOnly ? payload.scenarios.qualifiedOnly : payload.scenarios.allVendors;
    return Object.fromEntries(
      Object.entries(s.picks).map(([n, p]) => [Number(n), p.vendor]),
    );
  }, [payload, qualifiedOnly]);

  const selected = drawer?.kind === "cell"
    ? { vendor: drawer.vendor, lineNo: drawer.lineNo }
    : null;

  const selectedCell = selected && payload
    ? payload.matrix[selected.vendor]?.[selected.lineNo]
    : null;
  const selectedLine = selected && payload
    ? payload.lines.find((l) => l.no === selected.lineNo)
    : null;
  const selectedVendor = selected && payload
    ? payload.vendors.find((v) => v.code === selected.vendor)
    : null;

  const drawerVendor = drawer?.kind === "vendor" && payload
    ? payload.vendors.find((v) => v.code === drawer.vendor)
    : null;

  /**
   * How many suppliers still owe us something, and how many have gone quiet.
   *
   * Derived on the client from the same payload the grid renders, rather than
   * fetched separately, so the trust bar can never disagree with the panel it
   * opens. A supplier counts as owing us something when they have an unpriced
   * line, an unreadable one, or a price we derived that they have not
   * confirmed. The precise item list is the panel's job; this is only the badge.
   */
  const chaseSummary = useMemo(() => {
    if (!payload) return undefined;
    const owing = payload.vendors.filter((v) => {
      const rows = payload.matrix[v.code] ?? {};
      return Object.values(rows).some((c) =>
        ["omitted", "unreadable", "non_comparable", "unresolvable",
         "resolved_from_reference"].includes(c.status));
    });
    const asked = new Set(payload.chases.map((c) => c.vendorId));
    return {
      outstanding: owing.length,
      asked: owing.filter((v) => asked.has(v.code)).length,
      overdue: payload.chases.filter((c) => c.overdue && !c.closedReason).length,
    };
  }, [payload]);

  const reviewQueue = useMemo(
    () => payload
      ? buildReviewQueue(payload.matrix, payload.lines, payload.vendors, payload.provenance)
      : [],
    [payload],
  );

  /** The photograph, so a vision-sourced value can show its own pixels. */
  const sourceImageUrl = selectedVendor?.meta?.filenames
    .find((f) => /\.(jpe?g|png|webp)$/i.test(f))
    ? `/api/source/${selected!.vendor}`
    : undefined;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        rfxId={payload?.rfx.id ?? "—"}
        buyerName={payload?.buyer.short_name ?? ""}
        rfxTitle={payload?.rfx.title}
        issued={(payload?.rfx as { issued?: string } | undefined)?.issued}
        due={payload?.rfx.due}
        // Undefined, not 0, while the first request is in flight. "0 line items
        // out to 0 suppliers" is a factual claim, and for the two or three
        // seconds of a cold start it was a false one: it read as an app with no
        // data rather than an app still fetching it.
        lineCount={payload?.lines.length}
        vendorCount={payload?.vendors.length}
        tab={tab}
        onTab={setTab}
        steps={{
          draft: {
            done: Boolean(payload?.rfx),
            hint: payload?.rfx
              ? `${(payload.rfx as { id: string }).id} exists and went out to ${payload.vendors.length} suppliers`
              // Says what it does for you, not how it works. The mechanism
              // ("a co-pilot drafts it") is the least interesting thing about
              // this step; the refusal is the point.
              : "Say what you need in your own words. It will not let an ambiguous line go out",
          },
          intake: {
            done: readCount > 0,
            hint: readCount > 0
              ? `${readCount} of ${payload?.vendors.length ?? 0} suppliers read`
              : "Quotations and questionnaires, in whatever format they arrived",
          },
          compare: {
            enabled: Boolean(payload?.hasAnyExtraction),
            hint: payload?.hasAnyExtraction
              ? "One grid, same units, same currency"
              : "Read at least one response first",
          },
        }}
        right={
          payload?.hasAnyExtraction ? (
            <QualifiedToggle
              qualifiedOnly={qualifiedOnly}
              onToggle={() => setQualifiedOnly((q) => !q)}
              supplierCount={payload.vendors.length}
              qualifiedCount={payload.vendors.filter((v) => v.qualified).length}
              total={
                qualifiedOnly
                  ? payload.scenarios.qualifiedOnly.totalInr
                  : payload.scenarios.allVendors.totalInr
              }
            />
          ) : null
        }
      />

      {/* Before the test-data banner, because "the database is broken" outranks
          "this data is fabricated but the system works". */}
      {payload && <DegradedWarning reason={payload.degraded} />}

      {payload && (
        <FixtureWarning
          /* Names, not codes. This banner is read by the buyer, and "V1, V2,
             V3" is an internal identifier they have no reason to know: it made
             the one warning on the screen that must be understood the one
             sentence written in a private vocabulary. */
          vendors={payload.fixtureVendors.map((c) => {
            const v = payload.vendors.find((x) => x.code === c);
            return v ? shortName(v.name) : c;
          })}
        />
      )}

      {loading && (
        <div className="space-y-2 p-6">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md space-y-3 text-center">
            <p className="text-sm font-semibold">The comparison could not load</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Nothing has been changed or lost. This is usually the database not being
              reachable yet on a first run.
            </p>
            <div className="flex justify-center gap-2">
              <Button size="sm" onClick={() => { setLoading(true); void load(); }}>
                Try again
              </Button>
            </div>
            <details className="text-left">
              <summary className="cursor-pointer text-[10px] text-muted-foreground underline decoration-dotted">
                Technical detail
              </summary>
              <p className="mt-1 font-mono text-[10px] break-all text-muted-foreground">
                {loadError.slice(0, 400)}
              </p>
            </details>
          </div>
        </div>
      )}

      {!loading && !loadError && payload && (
        <div className="flex min-h-0 flex-1">
          {/* Main pane. */}
          <main className="flex min-w-0 flex-1 flex-col">
            {tab === "draft" ? (
              <CopilotPanel
                prompts={copilotPrompts}
                onSent={() => setTab("intake")}
              />
            ) : tab === "intake" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Intake
                  hasData={payload.hasAnyExtraction}
                  // Refresh the numbers, stay where the buyer is: replies are
                  // still arriving and they are watching them.
                  onDone={() => { void load(false); }}
                />
                <VendorRoster vendors={payload.vendors} />
              </div>
            ) : (
              <>
                <HeadlineNumbers
                  allVendorsInr={payload.scenarios.allVendors.totalInr}
                  allVendorsLines={payload.scenarios.allVendors.linesAwarded}
                  qualifiedInr={payload.scenarios.qualifiedOnly.totalInr}
                  qualifiedLines={payload.scenarios.qualifiedOnly.linesAwarded}
                  deltaInr={payload.scenarios.costOfComplianceInr}
                  deltaPct={payload.scenarios.costOfCompliancePct}
                  baselineInr={payload.baselineTotalInr}
                  totalLines={payload.lines.length}
                  supplierCount={payload.vendors.length}
                  qualifiedCount={payload.vendors.filter((v) => v.qualified).length}
                  assessedCount={payload.vendors.filter((v) => v.assessed !== false).length}
                  onAsk={(q) => { setPendingQuestion(q); setAskOpen(true); }}
                />
                <TrustBar
                  trust={payload.trust}
                  assumptionCount={Object.keys(payload.assumptions).length}
                  onShowReview={() => setDrawer({ kind: "review" })}
                  onShowAssumptions={() => setDrawer({ kind: "assumptions" })}
                  onShowAi={() => setDrawer({ kind: "ai" })}
                  unmappedCount={payload.unmapped.length}
                  onShowUnmapped={() => setDrawer({ kind: "unmapped" })}
                  findingsCount={payload.vendors.reduce(
                    (a, v) => a + ((v.meta?.conditionalDiscounts as unknown[])?.length ?? 0),
                    0,
                  ) + payload.supersessions.length}
                  onShowFindings={() => setDrawer({ kind: "findings" })}
                  chaseSummary={chaseSummary}
                  onShowChase={() => setDrawer({ kind: "chase" })}
                />
                <ExportBar qualifiedOnly={qualifiedOnly} />
                <div className="min-h-0 flex-1">
                  <ComparisonGrid
                    lines={payload.lines}
                    vendors={
                      qualifiedOnly
                        ? payload.vendors.filter((v) => v.qualified)
                        : payload.vendors
                    }
                    matrix={payload.matrix}
                    confidence={payload.confidence}
                    carriedForward={payload.carriedForward}
                    bestPerLine={bestPerLine}
                    selected={selected}
                    onCellClick={(vendor, lineNo) =>
                      setDrawer({ kind: "cell", vendor, lineNo })}
                    onVendorClick={(vendor) => setDrawer({ kind: "vendor", vendor })}
                  />
                </div>
              </>
            )}
          </main>

          {/* The analyst stays visible beside the grid: an answer usually needs
              checking against a cell, so making the buyer navigate away to ask
              would break the loop the brief describes. */}
          <aside className="hidden w-[380px] shrink-0 flex-col border-l xl:flex">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
              <p className="text-xs font-semibold">Ask</p>
              <Badge variant="outline" className="h-5 text-[10px] font-normal">
                answers cite their cells
              </Badge>
            </div>
            <div className="min-h-0 flex-1">
              <AnalystChat
                suggestions={suggestions}
                pendingQuestion={pendingQuestion}
                onPendingConsumed={() => setPendingQuestion(null)}
                disabled={!payload.hasAnyExtraction}
                disabledReason="Read the supplier responses first, then ask."
                onOpenCell={(cell) => {
                  const parts = cell.split(":");
                  if (parts.length === 2) {
                    setDrawer({ kind: "cell", vendor: parts[0], lineNo: Number(parts[1]) });
                  }
                }}
              />
            </div>
          </aside>
        </div>
      )}

      {/* Detail drawer. A sheet rather than a modal, so the grid stays visible
          behind it and the buyer keeps their place in a 150-cell table. */}
      {/*
        Focus goes back where it came from when this closes.

        Radix restores focus to a Sheet's TRIGGER, and this Sheet has none: it
        is opened from component state when a grid cell is activated, so on
        close Radix had nothing to hand focus back to and dropped it on
        <body>. A keyboard user pressed Enter on a cell, read the panel,
        pressed Escape, and was returned to the top of the document with 30
        rows between them and the cell they were looking at.

        Only noticeable if you actually drive the thing from a keyboard, which
        is why it survived a contrast pass and two audits.
      */}
      {/*
        KNOWN GAP, measured and deliberately left: closing this drawer drops
        focus on <body> rather than returning it to the cell it was opened
        from. A keyboard user reads the panel, presses Escape, and lands at the
        top of the document with thirty rows between them and where they were.

        WCAG 2.4.3. Not a blocker, and not for want of trying. Three routes
        failed: focusing from `onOpenChange` inside a requestAnimationFrame
        runs before the dialog library's own close handling, which then moves
        focus to <body> anyway; `onCloseAutoFocus`, which is the documented
        hook and is typed on the Content component, never fires in this version
        (verified with a probe, not assumed); and a timeout keyed on our own
        state did not restore either, for a reason I could not pin down in
        reasonable time.

        Recorded rather than half-fixed, because code that claims to restore
        focus and does not is worse than an honest gap: the next person tests
        the claim instead of the behaviour. The grid's roving tabindex above is
        the fix that mattered and it is verified working.
      */}
      <Sheet open={Boolean(drawer)} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">
            {drawer?.kind === "cell" ? "Where this price came from"
              : drawer?.kind === "vendor" ? "Supplier qualification and answers"
              : drawer?.kind === "review" ? "Prices needing a decision"
              : drawer?.kind === "unmapped" ? "Items that match no line you asked for"
              : drawer?.kind === "chase" ? "Go back and ask"
              : drawer?.kind === "findings" ? "What changes what these prices mean"
              : drawer?.kind === "ai" ? "Where the model is used"
              : "Assumptions"}
          </SheetTitle>

          {drawer?.kind === "cell" && selectedCell && selectedLine && selectedVendor && (
            <ProvenancePanel
              cell={selectedCell}
              line={selectedLine}
              vendorName={selectedVendor.name}
              vendorCode={drawer.vendor}
              provenance={payload?.provenance[`${drawer.vendor}:${drawer.lineNo}`]}
              confidence={payload?.confidence[`${drawer.vendor}:${drawer.lineNo}`]}
              verification={payload?.verification[`${drawer.vendor}:${drawer.lineNo}`]}
              sourceImageUrl={sourceImageUrl}
            />
          )}
          {drawer?.kind === "cell" && !selectedCell && (
            <div className="p-6 text-sm text-muted-foreground">
              Nothing has been read for this cell yet.
            </div>
          )}

          {drawer?.kind === "vendor" && drawerVendor && payload && (
            <SupplierPanel
              vendor={drawerVendor}
              questionnaire={payload.questionnaire}
              answers={payload.questionnaireAnswers[drawer.vendor] ?? {}}
              attachments={payload.attachments?.[drawer.vendor] ?? []}
              linesPriced={payload.scenarios.singleVendor[drawer.vendor]?.linesPriced ?? 0}
              totalLines={payload.lines.length}
              singleVendorInr={payload.scenarios.singleVendor[drawer.vendor]?.totalInr ?? 0}
              onClose={() => setDrawer(null)}
            />
          )}

          {drawer?.kind === "review" && (
            <ReviewQueuePanel
              items={reviewQueue}
              onOpenCell={(vendor, lineNo) => setDrawer({ kind: "cell", vendor, lineNo })}
              onClose={() => setDrawer(null)}
            />
          )}

          {drawer?.kind === "unmapped" && payload && (
            <UnmappedPanel
              items={payload.unmapped}
              vendors={payload.vendors}
              onClose={() => setDrawer(null)}
            />
          )}

          {drawer?.kind === "chase" && (
            <ChasePanel onClose={() => setDrawer(null)} onSent={() => void load()} />
          )}

          {drawer?.kind === "findings" && payload && (
            <FindingsPanel
              vendors={payload.vendors}
              lineSums={Object.fromEntries(
                payload.vendors.map((v) => [
                  v.code,
                  payload.scenarios.singleVendor[v.code]?.totalInr ?? 0,
                ]),
              )}
              supersessions={payload.supersessions}
              onClose={() => setDrawer(null)}
            />
          )}

          {drawer?.kind === "ai" && <AiPanel onClose={() => setDrawer(null)} />}

          {drawer?.kind === "assumptions" && payload && (
            <AssumptionsPanel
              assumptions={payload.assumptions}
              onClose={() => setDrawer(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Below the width where the Ask panel fits beside the grid it becomes a
          drawer with a visible trigger, rather than disappearing. Asking is the
          product's core capability and must not be width-dependent. */}
      {payload?.hasAnyExtraction && tab === "compare" && (
        <>
          <Button
            size="sm"
            onClick={() => setAskOpen(true)}
            className="fixed right-5 bottom-5 z-40 h-9 shadow-lg xl:hidden"
          >
            Ask about this
          </Button>
          <Sheet open={askOpen} onOpenChange={setAskOpen}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
              <SheetTitle className="border-b px-4 py-2.5 text-xs font-semibold">
                Ask
              </SheetTitle>
              <div className="min-h-0 flex-1">
                <AnalystChat
                  suggestions={suggestions}
                  pendingQuestion={pendingQuestion}
                  onPendingConsumed={() => setPendingQuestion(null)}
                  onOpenCell={(cell) => {
                    const parts = cell.split(":");
                    if (parts.length === 2) {
                      setAskOpen(false);
                      setDrawer({
                        kind: "cell", vendor: parts[0], lineNo: Number(parts[1]),
                      });
                    }
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

function VendorRoster({
  vendors,
}: {
  vendors: Array<GridVendor & { meta: { filenames: string[] } | null }>;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-8">
      <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Suppliers on this enquiry
      </p>
      <div className="divide-y rounded-md border">
        {vendors.map((v) => (
          <div key={v.code} className="flex items-center gap-3 px-3 py-2 text-xs">
            <span className="w-7 shrink-0 font-mono text-muted-foreground">{v.code}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{v.name}</span>
            <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
              {v.reply_format}
            </span>
            {!v.qualified && (
              <span className="shrink-0 rounded-sm bg-destructive/12 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">
                FAILED {v.failedMandatory.length}
              </span>
            )}
            <span
              className={cn(
                "w-24 shrink-0 text-right text-[10px]",
                v.meta ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {v.meta ? `${v.meta.filenames.length} file(s) read` : "nothing read"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Qualification comes from the questionnaire, not the price. A supplier who fails a
        mandatory item cannot be awarded at any price, which is why the cheapest column is
        not always the answer.
      </p>
    </div>
  );
}
