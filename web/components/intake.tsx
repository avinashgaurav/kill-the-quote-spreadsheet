"use client";

/**
 * Intake: drop the supplier responses in and watch them get read.
 *
 * This is the demo's opening move, so it shows the work rather than a spinner.
 * Per file it reports the format, whether it was read now or served from cache,
 * how long it took, how many rows came back, how many were priced, how many
 * fell below the confidence floor, and anything the reader said it could not
 * read.
 *
 * The cached/live distinction is on screen on purpose. Caching a real result is
 * ordinary engineering; hiding that you did it is what makes a demo dishonest.
 */

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface FileResult {
  filename: string;
  ok: boolean;
  error?: string;
  needsVendor?: boolean;
  vendorId?: string;
  format?: string;
  cached?: boolean;
  ms?: number;
  model?: string;
  rowsFound?: number;
  priced?: number;
  unmapped?: number;
  cellsStored?: number;
  rejectedForNoProvenance?: number;
  lowConfidence?: number;
  readConfidence?: {
    mean: number; lowest: number; lowestLines: number[];
    belowFloor: number; floor: number;
  };
  unreadableRegions?: string[];
  conditionalDiscounts?: number;
  supersedesRef?: string | null;
  validationIssues?: Array<{ severity: string; reason: string }>;
  verification?: Array<{ agreed: boolean; note: string; firstRead: number | null;
                         secondRead: number | null }> | null;
  usage?: { input: number; output: number; cacheRead?: number };
}

const FORMAT_LABEL: Record<string, string> = {
  xlsx: "Spreadsheet",
  pdf: "PDF",
  docx: "Word letter",
  eml: "Email",
  image: "Photograph",
};

export function Intake({
  onDone, hasData,
}: {
  onDone: () => void;
  hasData: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    setQueue(files.map((f) => f.name));
    setResults([]);

    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Reading failed.");
      } else {
        setResults(json.results as FileResult[]);
        onDone();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setQueue([]);
    }
  }, [onDone]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-6">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">Supplier responses</h2>
        <p className="text-sm text-muted-foreground">
          Drop in whatever they sent. Spreadsheets, PDFs, Word letters, phone photos of a
          rate card, a one-line email. Nothing has to match your template.
        </p>
        <p className="text-sm text-muted-foreground">
          Questionnaire responses go here too, and are read the same way. A supplier is
          not judged on their questionnaire until it has actually been read, so until
          then they show as not assessed rather than as passed.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 transition-colors",
          dragging ? "border-foreground/40 bg-accent" : "border-border hover:bg-accent/40",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".xlsx,.xls,.pdf,.docx,.doc,.eml,.jpg,.jpeg,.png,.webp"
          onChange={(e) => upload(Array.from(e.target.files ?? []))}
        />
        <p className="text-sm font-medium">
          {busy ? "Reading…" : "Drop files here, or click to choose"}
        </p>
        <p className="text-xs text-muted-foreground">
          xlsx · pdf · docx · eml · jpg · png
        </p>
        {!busy && (
          <p className="max-w-md pt-1 text-center text-[11px] text-muted-foreground">
            Matched to a supplier by filename. Anything we cannot match is skipped, not
            guessed, so prices never land in the wrong column.
          </p>
        )}
      </div>

      {busy && queue.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {queue.map((n) => (
            <li key={n} className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60" />
              {n}
            </li>
          ))}
          <li className="pt-1 text-[11px] text-muted-foreground">
            Photos take longest. Each price we find gets cropped and read again on its
            own, so two agreeing reads is real evidence rather than one guess.
          </li>
        </ul>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {results.length > 0 && <ResultList results={results} />}

      {hasData && !busy && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onDone}>Go to the comparison</Button>
        </div>
      )}
    </div>
  );
}

function ResultList({ results }: { results: FileResult[] }) {
  return (
    <div className="space-y-2">
      {results.map((r) => (
        <div
          key={r.filename}
          className={cn(
            "rounded-md border p-3 text-xs",
            r.ok ? "bg-card" : "border-destructive/40 bg-destructive/5",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{r.filename}</span>
            {r.format && (
              <Badge variant="secondary" className="h-5 text-[10px]">
                {FORMAT_LABEL[r.format] ?? r.format}
              </Badge>
            )}
            {r.ok && (
              <Badge
                variant={r.cached ? "outline" : "default"}
                className="h-5 text-[10px]"
              >
                {r.cached ? "cached" : "read live"}
              </Badge>
            )}
            {r.ms !== undefined && (
              <span className="text-muted-foreground">{(r.ms / 1000).toFixed(1)}s</span>
            )}
            {r.vendorId && (
              <span className="ml-auto text-muted-foreground">{r.vendorId}</span>
            )}
          </div>

          {!r.ok && <p className="mt-2 leading-relaxed">{r.error}</p>}

          {r.ok && (
            <div className="mt-2 space-y-1.5 text-muted-foreground">
              <p>
                <span className="num font-medium text-foreground">{r.rowsFound}</span> items
                found, <span className="num font-medium text-foreground">{r.priced}</span>{" "}
                with a price
                {r.unmapped ? (
                  <>
                    , <span className="num font-medium text-foreground">{r.unmapped}</span>{" "}
                    matching no RFx line
                  </>
                ) : null}
                {r.lowConfidence ? (
                  <>
                    , <span className="num font-medium text-foreground">{r.lowConfidence}</span>{" "}
                    below the confidence floor
                  </>
                ) : null}
              </p>

              {/* How sure the reader is about THIS document, whatever its
                  format. An average alone would hide the one weak cell that
                  decides an award, so the weakest is named next to it. */}
              {r.readConfidence && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-background px-2 py-1.5">
                  <span className="text-[10px] tracking-wide uppercase">
                    Read confidence
                  </span>
                  <span className="num text-foreground">
                    {(r.readConfidence.mean * 100).toFixed(0)}% average
                  </span>
                  <span
                    className={
                      r.readConfidence.lowest < r.readConfidence.floor
                        ? "num text-[var(--cell-review)]"
                        : "num"
                    }
                  >
                    {(r.readConfidence.lowest * 100).toFixed(0)}% weakest
                    {r.readConfidence.lowestLines.length
                      ? ` (line${r.readConfidence.lowestLines.length === 1 ? "" : "s"} ${
                          r.readConfidence.lowestLines.join(", ")})`
                      : ""}
                  </span>
                  <span className="text-[10px]">
                    {r.readConfidence.belowFloor
                      ? `${r.readConfidence.belowFloor} cell(s) routed to you`
                      : "nothing routed to you"}
                  </span>
                </div>
              )}

              {r.supersedesRef && (
                <p className="text-foreground">
                  Says it replaces {r.supersedesRef}. This revision now governs the grid
                  and the earlier quote is kept and still openable. Any line the revision
                  does not mention keeps its old price and is marked as unconfirmed.
                </p>
              )}

              {!!r.conditionalDiscounts && (
                <p>
                  <span className="num font-medium text-foreground">
                    {r.conditionalDiscounts}
                  </span>{" "}
                  conditional discount(s). Shown, but not used in ranking.
                </p>
              )}

              {r.unreadableRegions?.map((u, i) => (
                <p key={i} className="border-l-2 border-[var(--cell-review)] pl-2">
                  Could not read: {u}
                </p>
              ))}

              {r.verification?.filter((v) => !v.agreed).map((v, i) => (
                <p key={i} className="border-l-2 border-[var(--cell-review)] pl-2">
                  Second read disagreed: {v.note}. Sent for review.
                </p>
              ))}

              {r.validationIssues?.map((v, i) => (
                <p key={i} className="border-l-2 border-[var(--cell-caveat)] pl-2">
                  {v.reason}
                </p>
              ))}

              {!!r.rejectedForNoProvenance && (
                <p className="border-l-2 border-destructive pl-2">
                  <span className="num">{r.rejectedForNoProvenance}</span> value(s) rejected:
                  no source.
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
