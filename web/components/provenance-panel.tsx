"use client";

/**
 * Provenance: where a number came from, and every step that made it comparable.
 *
 * This panel is a third of the answer to "would a buyer with Rs 4 crore act on
 * this screen". It shows, in order:
 *
 *   1. what the supplier actually wrote, in their unit and currency
 *   2. the exact place it was written (sheet cell, page, paragraph, or a crop
 *      of the photograph itself)
 *   3. every normalisation step, each labelled with its rule AND the source of
 *      that rule, so no factor appears from nowhere
 *   4. what the number became, and whether it may be used in a total
 *
 * The photograph crop matters most. For a value read off a phone photo, the
 * only honest provenance is the pixels: here is the region, here is what one
 * read said, here is what an independent second read of that same crop said.
 */

import { useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { STATUS_ACTION, displayState, inr, perUnit } from "@/lib/ui";
import type { Cell, CellStatus } from "@/lib/normalise";

export interface ProvenanceInfo {
  locator: string;
  citedText: string;
  method: string;
  page?: number | null;
}

export interface VerificationInfo {
  bbox: [number, number, number, number] | null;
  firstRead: number | null;
  secondRead: number | null;
  agreed: boolean;
  note: string;
}

const METHOD_LABEL: Record<string, string> = {
  test_fixture: "Test harness, not a real document",
  xlsx_cell: "Spreadsheet cell",
  pdf_text: "PDF text, cited by the reader",
  docx_prose: "Word paragraph",
  email_text: "Email body",
  vision_bbox: "Region of the photograph",
};

export function ProvenancePanel({
  cell, line, vendorName, vendorCode, provenance, confidence, verification,
  sourceImageUrl,
}: {
  cell: Cell;
  /** Needed to actually ask them about it, rather than only diagnosing it. */
  vendorCode: string;
  line: { no: number; sku: string; desc: string; uom: string; pack_size: number; qty: number };
  vendorName: string;
  provenance?: ProvenanceInfo;
  confidence?: number;
  verification?: VerificationInfo[];
  /** Present when the source was an image, so the region can be shown. */
  sourceImageUrl?: string;
}) {
  const meta = STATUS_ACTION[cell.status as CellStatus];
  const state = displayState(cell.status);
  const bbox = verification?.find((v) => v.bbox)?.bbox ?? null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-2 border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              {vendorName}
            </p>
            <p className="truncate text-sm font-semibold">
              L{line.no} · {line.sku}
            </p>
          </div>
          <Badge
            variant={state === "trusted" ? "secondary" : "outline"}
            className={cn(
              "shrink-0 text-[10px]",
              state === "review" && "border-[var(--cell-review)] text-[var(--cell-review)]",
              state === "caveat" && "border-[var(--cell-caveat)] text-[var(--cell-caveat)]",
            )}
          >
            {meta?.label ?? cell.status}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{line.desc}</p>
        <p className="text-xs text-muted-foreground">
          Enquiry asked <span className="num font-medium text-foreground">{line.qty}</span>{" "}
          × <span className="font-medium text-foreground">{line.uom}</span>
          {line.pack_size > 1 && (
            <>
              {" "}
              (one {line.uom} = <span className="num">{line.pack_size}</span> units)
            </>
          )}
        </p>
      </div>

      {/* What to do about it, and the means to do it. */}
      <div
        className={cn(
          "space-y-2 border-b px-4 py-3 text-xs",
          state === "review" && "bg-[var(--cell-review-bg)]",
          state === "caveat" && "bg-[var(--cell-caveat-bg)]",
        )}
      >
        <p className="font-medium">{meta?.action}</p>
        <AskAgain cell={cell} line={line} vendorCode={vendorCode} vendorName={vendorName} />
      </div>

      {/* 1. What the supplier wrote. */}
      <Section title="What the supplier wrote">
        {cell.raw?.price != null ? (
          <p className="num text-lg font-semibold">
            {cell.raw.ccy === "USD" ? "$" : "₹"}
            {cell.raw.price.toLocaleString("en-IN")}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {perUnit(cell.raw.uom ?? line.uom)}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No price in the document.</p>
        )}
        {provenance?.citedText && (
          <blockquote className="mt-2 border-l-2 pl-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {provenance.citedText}
          </blockquote>
        )}
      </Section>

      {/* 2. Where it was written. */}
      {provenance && (
        <Section title="Where it came from">
          <dl className="space-y-1.5 text-xs">
            <Row
              k="Read from"
              v={METHOD_LABEL[provenance.method]
                ?? (provenance.method === "test_fixture"
                  ? "Test harness, not a real document"
                  : "Reported by the reader")}
            />
            <Row k="Where" v={<span className="font-mono break-all">{provenance.locator}</span>} />
            {provenance.page != null && <Row k="Page" v={String(provenance.page)} />}
            {confidence !== undefined && (
              <Row k="Reader confidence" v={`${(confidence * 100).toFixed(0)}%`} />
            )}
          </dl>

          {sourceImageUrl && bbox && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                The region it was read from
              </p>
              <CropView url={sourceImageUrl} bbox={bbox} />
            </div>
          )}
        </Section>
      )}

      {/* Second read. */}
      {verification && verification.length > 0 && (
        <Section title="Second read">
          {verification.map((v, i) => (
            <div key={i} className="space-y-1 text-xs">
              <p className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    v.agreed ? "bg-foreground/70" : "bg-[var(--cell-review)]",
                  )}
                />
                {v.agreed ? "Two independent reads agree" : "The reads disagree"}
              </p>
              <p className="text-muted-foreground">{v.note}</p>
              {v.firstRead != null && v.secondRead != null && (
                <p className="num text-muted-foreground">
                  first {v.firstRead.toLocaleString("en-IN")} · second{" "}
                  {v.secondRead.toLocaleString("en-IN")}
                </p>
              )}
            </div>
          ))}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            We cropped this value out and read it again with no context around it. That
            catches the worst failure on a tilted table: a confident read of the wrong row.
          </p>
        </Section>
      )}

      {/* 3. How it became comparable. */}
      {cell.trace.length > 0 && (
        <Section title="How we made it comparable">
          <ol className="space-y-2.5">
            {cell.trace.map((step, i) => (
              <li key={i} className="relative pl-4 text-xs">
                <span className="absolute top-1 left-0 inline-block h-1.5 w-1.5 rounded-full bg-border" />
                <p className="font-medium">{step.rule}</p>
                <p className="text-muted-foreground">{step.basis}</p>
                <p className="num mt-0.5">{step.result}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Every step ran in code, not in the model. The model reads the document; the
            maths is deterministic and repeatable.
          </p>
        </Section>
      )}

      {/* 4. What it became. */}
      <Section title="Landed">
        {cell.unitInr !== null ? (
          <>
            <p className="num text-lg font-semibold">{inr(cell.unitInr)}</p>
            <p className="text-xs text-muted-foreground">
              per {line.uom}, ex-GST
              {cell.extendedInr !== null && (
                <>
                  {" · "}
                  <span className="num">{inr(cell.extendedInr)}</span> for {line.qty}
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No comparable price. Left out of every total.
          </p>
        )}
      </Section>

      {cell.flags.length > 0 && (
        <Section title="Flags" last>
          <ul className="space-y-1.5">
            {cell.flags.map((f, i) => (
              <li key={i} className="border-l-2 pl-2.5 text-xs leading-relaxed">{f}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/**
 * Show the bounding box region, magnified.
 *
 * Implemented by scaling the whole image inside a fixed viewport and offsetting
 * it so the box lands in view. That keeps the original pixels rather than a
 * server-side re-crop, which means what the buyer sees is genuinely what was
 * read, not a second rendering of it.
 */
/**
 * Which cell states are worth going back to the supplier about, and what to
 * say when they are not.
 *
 * The panel used to end at the diagnosis. It would tell a buyer "a price is
 * there and we cannot read it, open the original" and then offer them nothing
 * to do about it, which puts the work back on the person the tool exists to
 * help. The chase step could already ask for exactly this; it just could not
 * be reached from the cell the buyer was looking at.
 *
 * Not every empty cell is chaseable, and saying so is the point:
 *
 *   declined      they answered. Asking again is asking them to change their
 *                 mind about not bidding, which is not a data request.
 *   not_read      the gap is OURS. Nothing to ask them for; read their file.
 *   comparable    nothing outstanding.
 */
const ASKABLE: Partial<Record<CellStatus, { label: string; sub: string }>> = {
  unreadable: {
    label: "Ask them to confirm this figure",
    sub: "They sent a number we cannot read. This asks them to restate it, and " +
         "says we hold their document rather than implying they sent nothing.",
  },
  omitted: {
    label: "Ask them to price this line",
    sub: "Their response does not mention it.",
  },
  non_comparable: {
    label: "Ask them for a firm price",
    sub: "They pointed at another rate instead of quoting one.",
  },
  unresolvable: {
    label: "Ask them for a firm price",
    sub: "They referred to something we do not hold.",
  },
  resolved_from_reference: {
    label: "Ask them to confirm the derived price",
    sub: "We worked this figure out from a prior order. Until they confirm it, " +
         "it stays out of every total.",
  },
  needs_review: {
    label: "Ask them to clarify this line",
    sub: "We hold something we cannot normalise onto the unit you asked for.",
  },
};

function AskAgain({
  cell, line, vendorCode, vendorName,
}: {
  cell: Cell;
  line: { no: number };
  vendorCode: string;
  vendorName: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "refused">("idle");
  const [note, setNote] = useState<string | null>(null);
  const ask = ASKABLE[cell.status as CellStatus];

  if (!ask) {
    // Say why there is no button, rather than leaving a blank where one was.
    const why =
      cell.status === "declined"
        ? "They declined this line. That is an answer, so there is nothing to chase."
        : cell.status === "not_read"
          ? "Nothing has been read from this supplier yet, so this gap is ours " +
            "rather than theirs. Collect their reply or upload it."
          : null;
    return why ? <p className="text-[11px] text-muted-foreground">{why}</p> : null;
  }

  async function send() {
    setState("sending");
    try {
      const r = await fetch("/api/rfx/chase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Scoped to this one line. The endpoint refuses rather than widening
        // if nothing on that line is actually outstanding.
        body: JSON.stringify({ vendorId: vendorCode, lineNos: [line.no] }),
      });
      const j = await r.json();
      if (!j.ok) {
        setState("refused");
        setNote(String(j.error ?? "The request was refused."));
        return;
      }
      setState("sent");
      setNote(
        `Asked ${vendorName} about line ${line.no}` +
        (j.dueAt
          ? `, due ${new Date(String(j.dueAt)).toLocaleDateString("en-IN", {
              day: "numeric", month: "short",
            })}`
          : "") +
        ". Recorded on the enquiry, so the award note can say it was asked.",
      );
    } catch (e) {
      setState("refused");
      setNote(String(e));
    }
  }

  if (state === "sent" || state === "refused") {
    return (
      <p className={cn(
        "text-[11px] leading-relaxed",
        state === "refused" ? "text-[var(--cell-review)]" : "text-muted-foreground",
      )}>
        {note}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={send}
        disabled={state === "sending"}
        className={cn(
          "rounded-md border border-foreground/25 bg-background px-2.5 py-1.5",
          "text-[11px] font-medium transition-colors hover:bg-accent",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          "disabled:opacity-60",
        )}
      >
        {state === "sending" ? "Asking…" : ask.label}
      </button>
      <p className="text-[10px] leading-relaxed text-muted-foreground">{ask.sub}</p>
    </div>
  );
}

function CropView({
  url, bbox,
}: {
  url: string;
  bbox: [number, number, number, number];
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);

  const [x0, y0, x1, y1] = bbox;
  const padX = (x1 - x0) * 0.5;
  const padY = (y1 - y0) * 1.6;
  const left = Math.max(0, x0 - padX);
  const top = Math.max(0, y0 - padY);
  const w = Math.min(1 - left, x1 - x0 + padX * 2);
  const h = Math.min(1 - top, y1 - y0 + padY * 2);

  const VIEW_W = 300;

  /**
   * The bounding box is in FRACTIONS of the image, and the image is not square.
   *
   * The earlier version scaled by width and then used that same scale for the
   * vertical offset, so on a 2280x3040 photograph the crop was displaced
   * vertically by the aspect ratio and showed a different row of the rate card.
   * Pointing confidently at the wrong evidence is worse than showing none: this
   * panel exists to be checkable.
   */
  const aspect = nat ? nat.w / nat.h : 3 / 4;
  const viewH = Math.max(56, Math.round((VIEW_W * h) / (w / aspect)));
  const scaleW = VIEW_W / w;
  const scaleH = viewH / h;

  return (
    <div
      className="relative overflow-hidden rounded border bg-muted"
      style={{ width: VIEW_W, height: viewH }}
    >
      <Image
        src={url}
        alt="The region of the photograph this value was read from"
        width={1}
        height={1}
        unoptimized
        onLoadingComplete={(img) =>
          setNat({ w: img.naturalWidth, h: img.naturalHeight })
        }
        className="absolute origin-top-left"
        style={{
          width: `${scaleW}px`,
          height: `${scaleH}px`,
          left: `${-left * scaleW}px`,
          top: `${-top * scaleH}px`,
          maxWidth: "none",
        }}
      />
    </div>
  );
}

function Section({
  title, children, last,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5 px-4 py-3.5">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        {children}
      </div>
      {!last && <Separator />}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
