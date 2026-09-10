"use client";

/**
 * Two surfaces the comparison was missing.
 *
 * SUPPLIER PANEL. The brief asks for "questionnaire answers and attached docs
 * sitting alongside the numbers", and until now they existed in the data and
 * never on screen. A price column without its qualification is the exact thing
 * that makes a buyer award to a supplier who cannot legally supply them, so the
 * column header is now the way in: click a supplier and you get their
 * mandatory-item verdict, every answer, and every document they attached.
 *
 * The case worth building for is Vector: they answered "Yes, ISO 27001
 * certified" and attached a certificate that expired in November 2025 against
 * the superseded 2013 standard. The answer and its own evidence disagree. So
 * answers whose attachment contradicts them are rendered as a contradiction
 * rather than as a failed row, because "they said yes and the paper says no" is
 * a different fact from "they said no".
 *
 * REVIEW QUEUE. BUILD-PLAN section 5 claims a queue "sorted by rupees, not by
 * confidence", and the trust bar's "12 need you" pill pointed at nothing.
 * Sorting by confidence wastes the only scarce resource, which is the buyer's
 * attention: twelve cells are not equally important, and the one carrying
 * Rs 38 lakh should be first even if the model is fairly sure about it.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { inr, inrShort, STATUS_ACTION, displayState } from "@/lib/ui";
import type { Cell, CellStatus, RfxLine } from "@/lib/normalise";

// ---------------------------------------------------------------------------
// Supplier: qualification, answers, documents
// ---------------------------------------------------------------------------

export interface QuestionnaireQ {
  no: string;
  kind: string;
  q: string;
  doc_required: boolean;
}

export interface AnswerRow {
  answer: string | null;
  doc: string | null;
  ok: boolean;
  note?: string;
}

export function SupplierPanel({
  vendor, questionnaire, answers, linesPriced, totalLines, singleVendorInr, onClose,
}: {
  vendor: {
    code: string; name: string; city?: string; reply_format: string;
    qualified: boolean; failedMandatory: string[];
    /** False when nobody has read their questionnaire. Not the same as failing. */
    assessed?: boolean;
    /** One per question, each carrying the sentence that produced its verdict. */
    assessments?: Array<{
      questionNo: string; mandatory: boolean; status: string; why: string;
      blocksAward: boolean; answer: string | null; attachedDocument: string | null;
    }>;
    /** Where the answers came from: a document we read, or the dataset. */
    answersSource?: string | null;
    meta: { filenames: string[]; unreadableRegions?: string[] } | null;
  };
  questionnaire: QuestionnaireQ[];
  answers: Record<string, AnswerRow>;
  linesPriced: number;
  totalLines: number;
  singleVendorInr: number;
  onClose?: () => void;
}) {
  const mandatory = questionnaire.filter((q) => q.kind === "M");
  const failed = mandatory.filter((q) => answers[q.no] && !answers[q.no].ok);

  // Documents the supplier attached, as named in their own answers.
  const docs = questionnaire
    .map((q) => ({ q: q.no, doc: answers[q.no]?.doc }))
    .filter((d): d is { q: string; doc: string } => Boolean(d.doc));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-2.5 border-b p-4">
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
            {vendor.code}
            {vendor.city ? ` · ${vendor.city}` : ""} · replied by {vendor.reply_format}
          </p>
          <p className="text-sm font-semibold">{vendor.name}</p>
        </div>

        {/*
          Three states, not two. "Nobody has read their questionnaire" used to
          be indistinguishable from "they passed", which is how a row could say
          "nothing read" and "FAILED 6" at the same time.
        */}
        {vendor.assessed === false ? (
          <div className="rounded-md border border-[var(--cell-review)]/50 bg-[var(--cell-review-bg)] px-3 py-2">
            <p className="text-xs font-medium">Questionnaire not read</p>
            <p className="mt-0.5 text-[11px] leading-relaxed">
              Nobody has assessed them, which is not the same as passing. Upload their
              questionnaire response to find out. Until then their prices are included,
              because excluding a real bid for want of a document nobody chased would be
              its own kind of wrong.
            </p>
          </div>
        ) : vendor.qualified ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs font-medium">Passed every mandatory question</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Eligible to win lines. Price now decides.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
            <p className="text-xs font-medium text-destructive">
              Cannot win at any price
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed">
              Failed {vendor.failedMandatory.length} mandatory question
              {vendor.failedMandatory.length === 1 ? "" : "s"}:{" "}
              {vendor.failedMandatory.join(", ")}. Their prices stay visible so you can see
              what you are giving up, but they are excluded from every award.
            </p>
          </div>
        )}

        {/*
          Every failure with the sentence that produced it. This is the whole
          point of deriving the verdict rather than storing one: a red badge
          that cannot say why is unaccountable, and the expired-certificate
          finding only means anything if the buyer can read the reasoning.
        */}
        {(vendor.assessments ?? []).some((a) => a.blocksAward) && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Why, question by question
            </p>
            {(vendor.assessments ?? [])
              .filter((a) => a.blocksAward)
              .map((a) => (
                <div key={a.questionNo} className="text-[11px] leading-relaxed">
                  <p className="font-medium">
                    {a.questionNo}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </p>
                  <p className="mt-0.5 border-l-2 border-destructive/50 pl-2">{a.why}</p>
                </div>
              ))}
          </div>
        )}

        {vendor.answersSource && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {/^seeded/i.test(vendor.answersSource)
              ? "Their answers came from the fabricated dataset, not from reading a " +
                "document. The verdict above is still computed from them, and uploading " +
                "their real questionnaire replaces the answers and recomputes it."
              : `Answers read from ${vendor.answersSource}.`}
          </p>
        )}

        <div className="flex gap-5 text-xs">
          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Priced
            </p>
            <p className="num font-medium">
              {linesPriced} of {totalLines}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Whole bid
            </p>
            <p className="num font-medium">{inrShort(singleVendorInr)}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Files read
            </p>
            <p className="num font-medium">{vendor.meta?.filenames.length ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Contradictions first. An answer its own evidence disproves is the most
          valuable thing on this panel, and burying it in question order would
          hide it. */}
      {failed.length > 0 && (
        <>
          <div className="space-y-2 border-b bg-[var(--cell-caveat-bg)] px-4 py-3">
            <p className="text-[10px] font-medium tracking-wide uppercase">
              Why they failed
            </p>
            {failed.map((q) => {
              const a = answers[q.no];
              const contradicted = Boolean(a.answer && a.doc);
              return (
                <div key={q.no} className="text-[11px] leading-relaxed">
                  <p className="font-medium">
                    {q.no}
                    {contradicted ? " — their answer and their own document disagree" : ""}
                  </p>
                  <p className="text-muted-foreground">{q.q}</p>
                  {a.answer && (
                    <p className="mt-0.5">
                      They said: <span className="font-medium">{a.answer}</span>
                    </p>
                  )}
                  {a.doc && (
                    <p>
                      They attached: <span className="font-medium">{a.doc}</span>
                    </p>
                  )}
                  {!a.answer && !a.doc && (
                    <p className="mt-0.5 text-muted-foreground italic">Left blank.</p>
                  )}
                  {a.note && <p className="mt-0.5">{a.note}</p>}
                </div>
              );
            })}
            <p className="pt-0.5 text-[10px] text-muted-foreground">
              Where an answer and its attachment disagree, the attachment decides.
            </p>
          </div>
        </>
      )}

      {/* Every answer, in question order. */}
      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Questionnaire
        </p>
        <div className="divide-y">
          {questionnaire.map((q) => {
            const a = answers[q.no];
            const isM = q.kind === "M";
            const bad = a && !a.ok;
            return (
              <div key={q.no} className="py-2 text-[11px]">
                <div className="flex items-start gap-2">
                  <span className="w-6 shrink-0 font-mono text-muted-foreground">
                    {q.no}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded-sm px-1 text-[9px] font-semibold tracking-wide uppercase",
                      isM
                        ? bad
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isM ? "must" : "nice"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="leading-relaxed text-muted-foreground">{q.q}</p>
                    <p className={cn("mt-1 leading-relaxed", bad && "text-destructive")}>
                      {a?.answer ?? <span className="italic">no answer given</span>}
                    </p>
                    {a?.doc && (
                      <p className="mt-0.5 text-muted-foreground">
                        Attached: {a.doc}
                      </p>
                    )}
                    {q.doc_required && !a?.doc && (
                      <p className="mt-0.5 text-[10px] text-destructive">
                        A document was required and none was attached.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* What they actually sent. */}
      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          What they sent
        </p>
        {vendor.meta?.filenames.length ? (
          <ul className="space-y-1">
            {vendor.meta.filenames.map((f) => (
              <li key={f} className="font-mono text-[10.5px] break-all text-muted-foreground">
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground">Nothing read yet.</p>
        )}

        {docs.length > 0 && (
          <>
            <p className="mt-3 mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Documents they cited
            </p>
            <ul className="space-y-1">
              {docs.map((d) => (
                <li key={d.q} className="text-[10.5px] text-muted-foreground">
                  <span className="font-mono">{d.q}</span> · {d.doc}
                </li>
              ))}
            </ul>
          </>
        )}

        {vendor.meta?.unreadableRegions?.length ? (
          <>
            <p className="mt-3 mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Could not read
            </p>
            <ul className="space-y-1">
              {vendor.meta.unreadableRegions.map((u, i) => (
                <li
                  key={i}
                  className="border-l-2 border-[var(--cell-review)] pl-2 text-[10.5px] leading-relaxed"
                >
                  {u}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      {onClose && (
        <div className="mt-auto border-t p-3">
          <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export interface ReviewItem {
  vendor: string;
  vendorName: string;
  lineNo: number;
  sku: string;
  desc: string;
  status: CellStatus;
  reason: string;
  /** What this line is worth, using the buyer's own estimate. */
  impactInr: number;
  citedText?: string;
}

/**
 * Build the queue, ordered by money.
 *
 * Sorting by confidence is the intuitive choice and the wrong one. Twelve
 * uncertain cells are not equally important: reviewing one that carries
 * Rs 38 lakh matters more than forty carrying Rs 900 between them, and a
 * confidence-ordered list buries the expensive one behind the cheap ones.
 */
export function buildReviewQueue(
  matrix: Record<string, Record<number, Cell>>,
  lines: RfxLine[],
  vendors: Array<{ code: string; name: string }>,
  provenance: Record<string, { citedText?: string }>,
): ReviewItem[] {
  const NEEDS_A_HUMAN: CellStatus[] = [
    "unreadable", "needs_review", "resolved_from_reference", "comparable_with_caveat",
  ];

  const out: ReviewItem[] = [];
  for (const v of vendors) {
    for (const line of lines) {
      const cell = matrix[v.code]?.[line.no];
      if (!cell || !NEEDS_A_HUMAN.includes(cell.status)) continue;
      out.push({
        vendor: v.code,
        vendorName: v.name,
        lineNo: line.no,
        sku: line.sku,
        desc: line.desc,
        status: cell.status,
        reason: cell.flags[0] ?? STATUS_ACTION[cell.status]?.action ?? cell.status,
        impactInr: line.qty * line.baseline_inr,
        citedText: provenance[`${v.code}:${line.no}`]?.citedText,
      });
    }
  }
  return out.sort((a, b) => b.impactInr - a.impactInr);
}

export function ReviewQueuePanel({
  items, onOpenCell, onClose,
}: {
  items: ReviewItem[];
  onOpenCell: (vendor: string, lineNo: number) => void;
  onClose?: () => void;
}) {
  /**
   * Total over DISTINCT lines, not over items.
   *
   * Twelve items can touch the same line for three different suppliers, and
   * summing per item counted that line three times. It produced "Rs 3.81 cr of
   * the enquiry is sitting behind these" against a Rs 4.27 cr enquiry, which
   * reads as "almost everything is blocked" and is simply false. A tool whose
   * entire argument is that it does not mislead cannot afford a headline number
   * that double-counts.
   */
  const affected = new Map<number, number>();
  for (const it of items) affected.set(it.lineNo, it.impactInr);
  const lineValue = [...affected.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-1.5 border-b p-4">
        <p className="text-sm font-semibold">
          <span className="num">{items.length}</span> price
          {items.length === 1 ? "" : "s"} need a decision
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Ordered by what the line is worth, not by how unsure we are. The one at the top
          sits on a line worth {inrShort(items[0]?.impactInr ?? 0)}; deal with that before
          ten small ones.
        </p>
        <p className="text-[11px] text-muted-foreground">
          They fall across{" "}
          <span className="num font-medium text-foreground">{affected.size}</span> line
          {affected.size === 1 ? "" : "s"} worth{" "}
          <span className="num font-medium text-foreground">{inrShort(lineValue)}</span>{" "}
          in total. Other suppliers have usable prices on most of them, so this is what
          needs a look, not what is blocked.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm font-medium">Nothing waiting on you</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Every price we could read is normalised and ready to rank.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((it) => {
            const state = displayState(it.status);
            return (
              <li key={`${it.vendor}:${it.lineNo}`}>
                <button
                  onClick={() => onOpenCell(it.vendor, it.lineNo)}
                  className="w-full px-4 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-xs font-medium">
                      <span className="num mr-1.5 text-muted-foreground">L{it.lineNo}</span>
                      {it.sku}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {it.vendorName.split(" ")[0]}
                      </span>
                    </p>
                    <p className="num shrink-0 text-xs font-semibold">
                      {inrShort(it.impactInr)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "mt-1 border-l-2 pl-2 text-[11px] leading-relaxed",
                      state === "review"
                        ? "border-[var(--cell-review)]"
                        : "border-[var(--cell-caveat)]",
                    )}
                  >
                    {STATUS_ACTION[it.status]?.label}: {it.reason}
                  </p>
                  {it.citedText && (
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {it.citedText}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {onClose && (
        <div className="mt-auto border-t p-3">
          <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Items a supplier quoted that match nothing the buyer asked for.
 *
 * Cygnus invented a line 30A carrying the warranty years 1 to 3 that their
 * laptop prices leave out. It is not an RFx line, so it is never force-fitted
 * onto one, but it is worth Rs 13.8 lakh and it silently changes how lines 1 to
 * 3 compare. Counting it at intake and then never showing it again is how a
 * material number disappears.
 */
export function UnmappedPanel({
  items, vendors, onClose,
}: {
  items: Array<Record<string, unknown>>;
  vendors: Array<{ code: string; name: string }>;
  onClose?: () => void;
}) {
  const nameOf = (code: unknown) =>
    vendors.find((v) => v.code === String(code))?.name ?? String(code ?? "?");

  const total = items.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-1.5 border-b p-4">
        <p className="text-sm font-semibold">
          <span className="num">{items.length}</span> item
          {items.length === 1 ? "" : "s"} matching no line you asked for
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          A supplier added something your enquiry did not list. It is kept here rather than
          forced onto the nearest line, because forcing it is how a warranty uplift quietly
          becomes a warranty.
        </p>
        {total > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Worth <span className="num font-medium text-foreground">{inrShort(total)}</span>{" "}
            in total.
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="p-6 text-center text-[11px] text-muted-foreground">
          Every item every supplier quoted matched a line you asked for.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((it, i) => (
            <li key={String(it.id ?? i)} className="px-4 py-3 text-[11px]">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{nameOf(it.v ?? it.vendor_id)}</p>
                {it.price != null && (
                  <p className="num shrink-0 font-semibold">
                    {inr(Number(it.price))}
                    {it.uom ? (
                      <span className="font-normal text-muted-foreground"> / {String(it.uom)}</span>
                    ) : null}
                  </p>
                )}
              </div>
              {it.vendor_ref ? (
                <p className="font-mono text-[10px] text-muted-foreground">
                  their line {String(it.vendor_ref)}
                </p>
              ) : null}
              <p className="mt-1 leading-relaxed">{String(it.description ?? "")}</p>
              {it.note ? (
                <p className="mt-1 border-l-2 pl-2 leading-relaxed text-muted-foreground">
                  {String(it.note)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {onClose && (
        <div className="mt-auto border-t p-3">
          <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Findings: the things a supplier did that change what their price means.
 *
 * Three of them were extracted, stored, and then shown to nobody:
 *
 *   the conditional discounts, which are real money the buyer is deliberately
 *   not being offered yet, and which were counted nowhere and displayed nowhere;
 *
 *   a supplier's own stated grand total disagreeing with the sum of their own
 *   lines, which is a finding rather than an error to reconcile silently;
 *
 *   the commercial terms, where "taxes as applicable" and a handwritten "+GST"
 *   with no rate are the difference between a comparable price and a guess.
 *
 * A caveat that exists only in the data has not been shown to anyone.
 */
export function FindingsPanel({
  vendors, lineSums, supersessions = [], onClose,
}: {
  vendors: Array<{
    code: string; name: string; qualified: boolean;
    meta: {
      terms?: Record<string, unknown>;
      conditionalDiscounts?: Array<Record<string, unknown>>;
      statedTotal?: Record<string, unknown>;
    } | null;
  }>;
  /** Sum of each supplier's own lines, for the reconciliation. */
  lineSums: Record<string, number>;
  supersessions?: Array<{
    vendorId: string; revision: number; supersedesRef: string | null;
    supersededFilenames: string[]; winningFilenames: string[];
    changedLines: Array<{ lineNo: number; from: number | null; to: number | null }>;
    carriedForwardLines: number[];
  }>;
  onClose?: () => void;
}) {
  const nameOf = (code: string) =>
    vendors.find((v) => v.code === code)?.name ?? code;
  const discounts: Array<{
    vendorName: string; percent: number | null; amountInr: number | null;
    scope: string | null; condition: string | null;
  }> = vendors.flatMap((v) =>
    (v.meta?.conditionalDiscounts ?? []).map((d) => ({
      vendorName: v.name,
      percent: (d.percent as number) ?? null,
      amountInr: (d.amountInr as number) ?? null,
      scope: (d.scope as string) ?? null,
      condition: (d.condition as string) ?? null,
    })),
  );

  const termGaps = vendors.flatMap((v) => {
    const t = (v.meta?.terms ?? {}) as Record<string, unknown>;
    const out: Array<{ vendor: string; field: string; said: string; why: string }> = [];
    const gst = String(t.gst ?? "");
    if (gst && !/\d\s*%/.test(gst)) {
      out.push({
        vendor: v.name, field: "Tax", said: gst,
        why: "no rate stated, so whether this price includes tax is an assumption we made, not something they told us",
      });
    }
    const freight = String(t.freight ?? "");
    if (/ex.?works|at actuals|not stated/i.test(freight)) {
      out.push({
        vendor: v.name, field: "Delivery", said: freight,
        why: "costs that fall on you and are not in the price",
      });
    }
    const validity = String(t.validity ?? "");
    const days = validity.match(/(\d+)\s*day/i);
    if (days && Number(days[1]) <= 30) {
      out.push({
        vendor: v.name, field: "Validity", said: validity,
        why: "likely to expire before an approval cycle closes",
      });
    }
    return out;
  });

  const mismatches = vendors.flatMap((v) => {
    const st = v.meta?.statedTotal as { amount?: number; currency?: string } | undefined;
    const stated = Number(st?.amount ?? 0);
    const summed = lineSums[v.code] ?? 0;
    if (!stated || !summed) return [];
    const diff = stated - summed;
    if (Math.abs(diff) < Math.max(1, summed * 0.001)) return [];
    return [{ vendor: v.name, stated, summed, diff }];
  });

  const empty = !discounts.length && !termGaps.length && !mismatches.length
    && !supersessions.length;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-1.5 border-b p-4">
        <p className="text-sm font-semibold">What changes what these prices mean</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Money on offer that we deliberately did not count, totals that disagree with
          their own lines, and terms vague enough that a price is not quite a price.
        </p>
      </div>

      {empty && (
        <p className="p-6 text-center text-[11px] text-muted-foreground">
          Nothing found. Every price is stated plainly, on stated terms.
        </p>
      )}

      {supersessions.map((s) => (
        <div key={s.vendorId} className="border-b px-4 py-3">
          <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            A quote replaced by a later one
          </p>
          <p className="text-[11px] leading-relaxed">
            <span className="font-medium">{nameOf(s.vendorId)}</span> sent a revised
            quotation
            {s.supersedesRef ? ` saying it replaces ${s.supersedesRef}` : ""}. The grid
            shows revision {s.revision}. Both documents are kept and both stay openable.
          </p>
          {s.supersededFilenames.length > 0 && (
            <p className="mt-1 text-[10px] break-all text-muted-foreground">
              superseded: {s.supersededFilenames.join(", ")}
            </p>
          )}
          {s.changedLines.length > 0 ? (
            <div className="mt-2">
              <p className="text-[10px] text-muted-foreground">
                {s.changedLines.length} line
                {s.changedLines.length === 1 ? "" : "s"} moved:
              </p>
              <div className="num mt-1 space-y-0.5 text-[11px]">
                {s.changedLines.slice(0, 8).map((c) => (
                  <p key={c.lineNo}>
                    L{c.lineNo}: {c.from === null ? "no price" : inr(c.from)} &rarr;{" "}
                    {c.to === null ? "no price" : inr(c.to)}
                    {c.from !== null && c.to !== null && (
                      <span className="text-muted-foreground">
                        {" "}({c.to > c.from ? "+" : ""}
                        {(((c.to - c.from) / c.from) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </p>
                ))}
                {s.changedLines.length > 8 && (
                  <p className="text-muted-foreground">
                    and {s.changedLines.length - 8} more
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              No line price differs between the two. The revision restated the same
              numbers.
            </p>
          )}
          {s.carriedForwardLines.length > 0 && (
            <p className="mt-2 border-l-2 border-[var(--cell-review)] pl-2 text-[11px] leading-relaxed">
              Lines {s.carriedForwardLines.join(", ")} appear in the earlier quote and are
              not mentioned in the revision. They are carried forward and marked, because
              an unmentioned line is more likely an unchanged one than a withdrawn one,
              and a blank cell would read as &ldquo;did not quote&rdquo;. Worth confirming
              with them before award.
            </p>
          )}
        </div>
      ))}

      {discounts.length > 0 && (
        <div className="border-b px-4 py-3">
          <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Money not counted
          </p>
          <div className="space-y-2.5">
            {discounts.map((d, i) => (
              <div key={i} className="text-[11px] leading-relaxed">
                <p className="font-medium">
                  {d.vendorName}
                  {d.percent ? ` · ${d.percent}% off` : ""}
                  {d.amountInr ? ` · ${inrShort(d.amountInr)}` : ""}
                </p>
                {d.scope ? <p className="text-muted-foreground">on {d.scope}</p> : null}
                <p className="mt-0.5 border-l-2 border-[var(--cell-review)] pl-2">
                  Only if: {d.condition ?? "unstated"}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Recorded and shown, never used in ranking. Each depends on something outside
            the supplier&rsquo;s own price, so counting it would quote you a number nobody
            has committed to.
          </p>
        </div>
      )}

      {mismatches.length > 0 && (
        <div className="border-b px-4 py-3">
          <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Totals that disagree with their own lines
          </p>
          {mismatches.map((m, i) => (
            <div key={i} className="text-[11px] leading-relaxed">
              <p className="font-medium">{m.vendor}</p>
              <p className="num text-muted-foreground">
                they stated {inr(m.stated)} · their lines sum to {inr(m.summed)} ·
                difference {inr(Math.abs(m.diff))}
              </p>
              <p className="mt-0.5">
                We rank on the line rates, not the stated total, because a total cannot be
                split across an award. Worth asking them which is right.
              </p>
            </div>
          ))}
        </div>
      )}

      {termGaps.length > 0 && (
        <div className="px-4 py-3">
          <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Terms that leave a price ambiguous
          </p>
          <div className="space-y-2.5">
            {termGaps.map((t, i) => (
              <div key={i} className="text-[11px] leading-relaxed">
                <p className="font-medium">
                  {t.vendor} &middot; {t.field}
                </p>
                <p className="text-muted-foreground">&ldquo;{t.said}&rdquo;</p>
                <p className="mt-0.5 border-l-2 pl-2">{t.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {onClose && (
        <div className="mt-auto border-t p-3">
          <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

/** Assumptions, editable-looking and honest about which are judgements. */
export function AssumptionsPanel({
  assumptions, onClose,
}: {
  assumptions: Record<string, {
    value: unknown; source: string; alternative?: string; note: string;
    confidence?: string;
  }>;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-1.5 border-b p-4">
        <p className="text-sm font-semibold">Assumptions behind every total</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Each of these is a judgement we made, not a fact we found. Every total on the
          comparison depends on them.
        </p>
      </div>
      <div className="divide-y">
        {Object.entries(assumptions).map(([key, a]) => (
          <div key={key} className="px-4 py-3 text-[11px]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">{key.replace(/_/g, " ")}</p>
              {a.confidence && (
                <Badge variant="outline" className="h-4 shrink-0 text-[9px] font-normal">
                  {a.confidence}
                </Badge>
              )}
            </div>
            <p className="num mt-0.5">{String(a.value)}</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Because:</span> {a.source}
            </p>
            {a.alternative && (
              <p className="mt-0.5 leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">We could instead:</span>{" "}
                {a.alternative}
              </p>
            )}
            <p className="mt-0.5 leading-relaxed text-muted-foreground">{a.note}</p>
          </div>
        ))}
      </div>
      {onClose && (
        <div className="mt-auto border-t p-3">
          <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

export { inr };
