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

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Invite } from "./invite";
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

  /**
   * Files kept by name so an unmatched one can be retried once the buyer says
   * whose it is, without asking them to find it on disk again.
   *
   * This is the gap that made "here is my own quotation" a dead end: a file
   * whose name matches no supplier was skipped with a sensible message and no
   * way forward. Refusing to guess is right; refusing to guess and then
   * offering nothing is half a feature.
   */
  const [pending, setPending] = useState<Record<string, File>>({});
  const [roster, setRoster] = useState<Array<{ code: string; name: string }>>([]);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch("/api/rfx/inbox", { cache: "no-store" });
        const j = await r.json();
        if (!ignore && j.ok) {
          setRoster((j.suppliers as Array<{ code: string; name: string }>) ?? []);
        }
      } catch { /* the picker just falls back to a free-text name */ }
    })();
    return () => { ignore = true; };
  }, []);

  const upload = useCallback(async (files: File[], vendor?: string) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    setQueue(files.map((f) => f.name));
    if (!vendor) setResults([]);

    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      if (vendor) form.append("vendor", vendor);
      setPending((p) => {
        const n = { ...p };
        for (const f of files) n[f.name] = f;
        return n;
      });
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Reading failed.");
      } else {
        const fresh = json.results as FileResult[];
        // A retry replaces only the rows for the files it re-sent, so the
        // other results on screen do not vanish underneath the buyer.
        setResults((prev) => {
          if (!vendor) return fresh;
          const names = new Set(files.map((f) => f.name));
          return [...prev.filter((r) => !names.has(String(r.filename))), ...fresh];
        });
        setAssigning(null);
        setNewName("");
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

      {/* Collect replies, or drop files in by hand. Both paths end in the same
          reader, so a demo can use whichever suits and neither is a shortcut. */}
      <div className="mb-5">
        <Invite onDone={onDone} />
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

      {results.length > 0 && (
        <ResultList
          results={results}
          roster={roster}
          pending={pending}
          busy={busy}
          upload={upload}
          assigning={assigning}
          setAssigning={setAssigning}
          newName={newName}
          setNewName={setNewName}
        />
      )}

      {hasData && !busy && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onDone}>Go to the comparison</Button>
        </div>
      )}
    </div>
  );
}

function ResultList({
  results, roster, pending, busy, upload, assigning, setAssigning, newName, setNewName,
}: {
  results: FileResult[];
  roster: Array<{ code: string; name: string }>;
  pending: Record<string, File>;
  busy: boolean;
  upload: (files: File[], vendor?: string) => void;
  assigning: string | null;
  setAssigning: (v: string | null) => void;
  newName: string;
  setNewName: (v: string) => void;
}) {
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

          {/*
            The way forward for a file whose supplier we could not identify.
            Refusing to guess is the right call, because a price in the wrong
            column is a mistake nobody downstream can detect. Refusing to guess
            and then offering nothing was the bug: an interviewer handing over
            their own quotation hit a wall.
          */}
          {r.needsVendor && (
            <div className="mt-2.5 space-y-2 rounded-md border bg-background p-2.5">
              <p className="text-[11px] font-medium">Whose quotation is this?</p>
              <div className="flex flex-wrap gap-1">
                {roster.map((v) => (
                  <Button
                    key={v.code}
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    disabled={busy}
                    onClick={() => {
                      const f = pending[String(r.filename)];
                      if (f) void upload([f], v.code);
                    }}
                  >
                    {v.name.split(" ")[0]}
                  </Button>
                ))}
              </div>
              {assigning === r.filename ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Supplier name"
                    aria-label={`Name the supplier who sent ${r.filename}`}
                    className="h-6 flex-1 rounded border bg-background px-2 text-[10px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newName.trim().length > 1) {
                        const f = pending[String(r.filename)];
                        if (f) void upload([f], newName.trim());
                      }
                      if (e.key === "Escape") setAssigning(null);
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-6 text-[10px]"
                    disabled={busy || newName.trim().length < 2}
                    onClick={() => {
                      const f = pending[String(r.filename)];
                      if (f) void upload([f], newName.trim());
                    }}
                  >
                    Add
                  </Button>
                </div>
              ) : (
                <button
                  className="text-[10px] text-muted-foreground underline"
                  onClick={() => setAssigning(String(r.filename))}
                >
                  none of these, it is a new supplier
                </button>
              )}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                A new supplier gets their own column, marked as not assessed until their
                questionnaire is read.
              </p>
            </div>
          )}

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
