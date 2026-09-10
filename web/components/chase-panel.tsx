"use client";

/**
 * Go back and ask.
 *
 * A supplier sends a spreadsheet and nothing else, and the buyer's next move is
 * to ask them for the rest. The screen has to make three things obvious, and
 * everything here follows from them.
 *
 * WHAT IS OUTSTANDING, AND WHAT IT IS WORTH. Suppliers are ordered by money at
 * risk, not alphabetically, because a supplier holding up Rs 2.9 crore and one
 * holding up a validity date are not the same problem.
 *
 * GAP OR DISPUTE. Something they never sent, versus something they sent that we
 * cannot use as it stands. Split visually, because they are different asks and
 * telling a supplier they "did not provide pricing" when they did is how a
 * chase gets ignored.
 *
 * ASKED OR NOT ASKED. Once a request has gone, the supplier carries a stamp
 * saying when and by when. That stamp is the whole reason this exists: at award
 * time "no price" and "no price, asked on the 10th, nothing back by the 16th"
 * are different facts, and only the second lets a buyer award around them.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const inrShort = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} cr`
  : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L`
  : `₹${n.toLocaleString("en-IN")}`;

interface Item {
  kind: string;
  family: "gap" | "dispute";
  ask: string;
  why: string;
  atRiskInr: number;
  lineNos?: number[];
  questionNo?: string;
}

interface Supplier {
  vendorId: string;
  vendorName: string;
  items: Item[];
  gapCount: number;
  disputeCount: number;
  totalAtRiskInr: number;
  resolvedWithoutAsking: Array<{ what: string; lineNos: number[] }>;
  lastChase?: {
    sentAt: string; dueAt: string | null; itemCount: number;
    answeredAt: string | null; overdue: boolean;
  };
  preview: { subject: string; body: string } | null;
}

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "no date";

export function ChasePanel({
  channel = "email", onClose, onSent,
}: {
  channel?: string;
  onClose?: () => void;
  onSent?: () => void;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [dueDays, setDueDays] = useState(6);

  // Bumped to re-ask the server after a chase is sent, so the panel reflects
  // the record rather than a local guess about it.
  const [reloads, setReloads] = useState(0);

  // The panel asks the server what is outstanding rather than reading the
  // page's payload, because the answer depends on chases already sent and those
  // change under the panel's feet.
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch("/api/rfx/chase", { cache: "no-store" });
        const j = await r.json();
        if (ignore) return;
        if (!j.ok) { setError(String(j.error)); return; }
        setSuppliers(j.suppliers as Supplier[]);
        setError(null);
      } catch (e) {
        if (!ignore) setError(String(e));
      }
    })();
    return () => { ignore = true; };
  }, [reloads]);

  async function send(vendorId: string) {
    setBusy(vendorId);
    try {
      const dueAt = new Date(Date.now() + dueDays * 864e5).toISOString();
      const r = await fetch("/api/rfx/chase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, channel, dueAt }),
      });
      const j = await r.json();
      if (!j.ok) { setError(String(j.error)); return; }
      setSent((s) => ({ ...s, [vendorId]: String(j.outbound?.dueAt ?? "") }));
      setReloads((n) => n + 1);
      onSent?.();
    } finally {
      setBusy(null);
    }
  }

  if (error && !suppliers) {
    return <p className="p-6 text-[11px] text-muted-foreground">{error}</p>;
  }
  if (!suppliers) {
    return <p className="p-6 text-[11px] text-muted-foreground">Working out what is outstanding…</p>;
  }

  const withGaps = [...suppliers]
    .filter((s) => s.items.length)
    .sort((a, b) => b.totalAtRiskInr - a.totalAtRiskInr);
  const complete = suppliers.filter((s) => !s.items.length);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-1.5 border-b p-4">
        <h2 className="text-sm font-semibold">Go back and ask</h2>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          What each supplier still owes you. Anything we could work out ourselves has
          been, and is not in these lists.
        </p>
        <label className="flex items-center gap-2 pt-1 text-[11px]">
          Give them
          <input
            type="number"
            min={1}
            max={30}
            value={dueDays}
            onChange={(e) => setDueDays(Math.max(1, Math.min(30, Number(e.target.value) || 6)))}
            className="num h-6 w-12 rounded border bg-background px-1.5 text-center"
            aria-label="Days to respond"
          />
          days to reply.
          <span className="text-muted-foreground">
            A deadline is what makes silence mean something.
          </span>
        </label>
      </div>

      {error && (
        <p className="border-b border-[var(--cell-caveat)]/40 bg-[var(--cell-caveat-bg)] px-4 py-2 text-[11px]">
          {error}
        </p>
      )}

      {withGaps.map((s) => {
        const isOpen = open === s.vendorId;
        const gaps = s.items.filter((i) => i.family === "gap");
        const disputes = s.items.filter((i) => i.family === "dispute");
        const justSent = sent[s.vendorId];
        return (
          <div key={s.vendorId} className="border-b">
            <button
              onClick={() => setOpen(isOpen ? null : s.vendorId)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[12px] font-medium">
                  {s.vendorName}
                  {s.lastChase && !s.lastChase.answeredAt && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-4 px-1 text-[9px]",
                        s.lastChase.overdue &&
                          "border-[var(--cell-review)] text-[var(--cell-review)]",
                      )}
                    >
                      {s.lastChase.overdue ? "no reply, overdue" : "asked, waiting"}
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {gaps.length > 0 && `${gaps.length} never sent`}
                  {gaps.length > 0 && disputes.length > 0 && " · "}
                  {disputes.length > 0 && `${disputes.length} to confirm`}
                  {s.lastChase && (
                    <>
                      {" · asked "}
                      {day(s.lastChase.sentAt)}, due {day(s.lastChase.dueAt)}
                    </>
                  )}
                </p>
              </div>
              {s.totalAtRiskInr > 0 && (
                <span className="num shrink-0 text-[11px] font-semibold">
                  {inrShort(s.totalAtRiskInr)}
                  <span className="block text-[9px] font-normal text-muted-foreground">
                    at risk
                  </span>
                </span>
              )}
            </button>

            {isOpen && (
              <div className="space-y-3 px-4 pb-3">
                {gaps.length > 0 && (
                  <section>
                    <h3 className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      Never sent &middot; ask them for it
                    </h3>
                    <ul className="space-y-2">
                      {gaps.map((i, n) => (
                        <li key={n} className="text-[11px] leading-relaxed">
                          <p>{i.ask}</p>
                          <p className="mt-0.5 border-l-2 pl-2 text-muted-foreground">
                            {i.why}
                            {i.atRiskInr > 0 && ` (${inrShort(i.atRiskInr)})`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {disputes.length > 0 && (
                  <section>
                    <h3 className="mb-1.5 text-[10px] font-medium tracking-wide text-[var(--cell-review)] uppercase">
                      They sent something &middot; ask them to confirm it
                    </h3>
                    <ul className="space-y-2">
                      {disputes.map((i, n) => (
                        <li key={n} className="text-[11px] leading-relaxed">
                          <p>{i.ask}</p>
                          <p className="mt-0.5 border-l-2 border-[var(--cell-review)] pl-2 text-muted-foreground">
                            {i.why}
                            {i.atRiskInr > 0 && ` (${inrShort(i.atRiskInr)})`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {s.resolvedWithoutAsking.length > 0 && (
                  <section className="rounded-md border bg-muted/25 p-2">
                    <h3 className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      Settled here, not asked about
                    </h3>
                    <ul className="space-y-1">
                      {s.resolvedWithoutAsking.map((r, n) => (
                        <li key={n} className="text-[11px] leading-relaxed">
                          <span className="num font-medium">{r.lineNos.length}</span>{" "}
                          {r.what}{" "}
                          <span className="text-muted-foreground">
                            (line{r.lineNos.length === 1 ? "" : "s"}{" "}
                            {r.lineNos.slice(0, 8).join(", ")}
                            {r.lineNos.length > 8 ? ", …" : ""})
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      A supplier who quotes per piece against a line asked per box has
                      not done anything wrong. The pack size is in our enquiry, so the
                      conversion is ours.
                    </p>
                  </section>
                )}

                {s.preview && (
                  <details className="rounded-md border bg-muted/25 p-2">
                    <summary className="cursor-pointer text-[11px] font-medium">
                      Read what would go out
                    </summary>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {s.preview.subject}
                    </p>
                    <pre className="mt-1 max-h-64 overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap">
                      {s.preview.body}
                    </pre>
                  </details>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy === s.vendorId}
                    onClick={() => send(s.vendorId)}
                  >
                    {busy === s.vendorId
                      ? "Sending…"
                      : s.lastChase ? "Ask again" : `Ask ${s.vendorName.split(" ")[0]}`}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    over {channel}. Sending is stubbed; the record is real.
                  </span>
                </div>

                {justSent && (
                  <p className="rounded-md border bg-background p-2 text-[11px]">
                    Asked, due {day(justSent)}. If nothing comes back the award note will
                    say they were asked and did not reply.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {complete.length > 0 && (
        <div className="px-4 py-3">
          <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Nothing outstanding
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {complete.map((s) => s.vendorName).join(", ")} sent everything the enquiry
            asked for.
          </p>
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
