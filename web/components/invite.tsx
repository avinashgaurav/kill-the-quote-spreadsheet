"use client";

/**
 * Invite suppliers, then collect what they send back.
 *
 * The step that used to be missing. Before this, the flow said "now go and find
 * nine files on your disk and drag them in", which is not what a buyer does and
 * broke the story in the middle: you draft an enquiry, you send it, and replies
 * turn up. Making the buyer play postman for their own suppliers is the part
 * that felt like a demo rather than a product.
 *
 * ONE THING IS SIMULATED AND IT IS ONLY ONE THING. Nothing is emailed and no
 * mailbox is polled: a supplier replies because their document is on file and
 * you invited them. That is the SMTP server the brief says to stub. The READING
 * is real, and the panel says so on screen rather than in a comment, because a
 * viewer cannot tell the difference by looking and is entitled to be told.
 *
 * Ten suppliers, five with a reply on file. That asymmetry is deliberate and
 * it is what actually happens: you invite ten and five answer. A version where
 * everybody replies would teach the wrong lesson, because every interesting
 * state in this product is one where somebody did not.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Supplier {
  code: string;
  name: string;
  city: string;
  email: string;
  reply_on_file: boolean;
  blurb: string;
  documents: number;
}

type Arrival =
  | { code: string; state: "waiting" }
  | { code: string; state: "no_reply"; note: string }
  | {
      code: string; state: "read" | "failed";
      files: Array<{ filename: string; ok: boolean; kind?: string; format?: string;
                     rowsFound?: number; priced?: number; answersRead?: number;
                     ms?: number; error?: string;
                     attachmentsRead?: Array<{ file: string }>;
                     attachmentsBlockedByChannel?: string[] }>;
    };

export function Invite({ onDone }: { onDone: () => void }) {
  const [roster, setRoster] = useState<Supplier[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [arrivals, setArrivals] = useState<Record<string, Arrival>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [channel, setChannel] = useState("email");
  const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState(0);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch("/api/rfx/inbox", { cache: "no-store" });
        const j = await r.json();
        if (ignore) return;
        if (!j.ok) { setError(String(j.error)); return; }
        setRoster(j.suppliers as Supplier[]);
        // Pre-selected so a demo is one click, and every one of them is
        // deselectable, because the choice has to be real to be worth showing.
        setPicked(new Set(
          (j.suppliers as Supplier[]).filter((s) => s.reply_on_file).map((s) => s.code),
        ));
      } catch (e) {
        if (!ignore) setError(String(e));
      }
    })();
    return () => { ignore = true; };
  }, [load]);

  const toggle = (code: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(code)) n.delete(code); else n.add(code);
      return n;
    });

  async function send() {
    if (!picked.size) return;
    setSending(true);
    setSent(true);
    setError(null);
    setArrivals(Object.fromEntries(
      [...picked].map((c) => [c, { code: c, state: "waiting" as const }]),
    ));

    // One supplier at a time, in order, so they arrive the way a mailbox fills
    // rather than all at once, and so one slow or failed read does not take the
    // others with it.
    for (const code of [...picked]) {
      try {
        const r = await fetch("/api/rfx/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplierCode: code, channel }),
        });
        const j = await r.json();
        if (!j.ok) {
          setArrivals((a) => ({
            ...a,
            [code]: { code, state: "failed", files: [{ filename: "-", ok: false, error: String(j.error) }] },
          }));
          continue;
        }
        setArrivals((a) => ({
          ...a,
          [code]: j.replied
            ? { code, state: (j.results ?? []).every((f: { ok: boolean }) => f.ok) ? "read" : "failed",
                files: j.results ?? [] }
            : { code, state: "no_reply", note: String(j.note) },
        }));
        onDone();
      } catch (e) {
        setArrivals((a) => ({
          ...a,
          [code]: { code, state: "failed", files: [{ filename: "-", ok: false, error: String(e) }] },
        }));
      }
    }
    setSending(false);
  }

  if (error && !roster) {
    return <p className="text-[11px] text-muted-foreground">{error}</p>;
  }
  if (!roster) {
    return <p className="text-[11px] text-muted-foreground">Loading the supplier list…</p>;
  }

  const willReply = [...picked].filter((c) => roster.find((s) => s.code === c)?.reply_on_file);

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Send the enquiry, then collect the replies</h3>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Choose who to invite. Delivery is simulated, so nothing is emailed and no
          mailbox is polled. Everything that arrives is then read for real: the same
          model call, the same provenance, the same loud failure on an empty read as a
          file you drag in below.
        </p>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {roster.map((s) => {
          const on = picked.has(s.code);
          const arr = arrivals[s.code];
          return (
            <button
              key={s.code}
              onClick={() => !sent && toggle(s.code)}
              disabled={sent}
              aria-pressed={on}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                on ? "border-foreground/30 bg-accent/60" : "hover:bg-accent/30",
                sent && "cursor-default opacity-90",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 inline-block h-3 w-3 shrink-0 rounded-[3px] border",
                  on && "border-foreground bg-foreground",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate text-[11px] font-medium">{s.name}</span>
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                    {s.code}
                  </span>
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {s.city} · {s.blurb}
                </span>
                {arr && (
                  <span className="mt-1 block text-[10px]">
                    {arr.state === "waiting" && (
                      <span className="text-muted-foreground">waiting for a reply…</span>
                    )}
                    {arr.state === "no_reply" && (
                      <span className="text-muted-foreground">
                        no response. Invited, sent nothing.
                      </span>
                    )}
                    {arr.state === "read" && (
                      <span className="text-foreground">
                        replied ·{" "}
                        {arr.files.map((f) =>
                          f.kind === "questionnaire"
                            ? `questionnaire, ${f.answersRead} answers` +
                              (f.attachmentsRead?.length
                                ? ` + ${f.attachmentsRead.length} attached doc(s) opened`
                                : "")
                            : `${f.format ?? "document"}, ${f.priced ?? 0} priced`,
                        ).join(" · ")}
                        {/* The consequence of the channel, said where the
                            choice was made rather than buried in a panel. */}
                        {arr.files.some((f) => f.attachmentsBlockedByChannel?.length) && (
                          <span className="block text-[var(--cell-review)]">
                            their attached document did not arrive on this channel
                          </span>
                        )}
                      </span>
                    )}
                    {arr.state === "failed" && (
                      <span className="text-[var(--cell-review)]">
                        {arr.files.find((f) => !f.ok)?.error?.slice(0, 90) ?? "read failed"}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {!sent ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {["email", "portal", "whatsapp"].map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                aria-pressed={channel === c}
                className={cn(
                  "rounded-[3px] px-2 py-1 text-[10px] capitalize transition-colors",
                  channel === c ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <Button size="sm" className="h-7 text-xs" disabled={!picked.size} onClick={send}>
            Send to {picked.size} supplier{picked.size === 1 ? "" : "s"}
          </Button>
          <span className="text-[10px] leading-relaxed text-muted-foreground">
            {willReply.length} of the {picked.size} you have chosen have a response on
            file. The rest will not reply, which is the ordinary case.
            {channel === "whatsapp" && (
              <span className="block text-[var(--cell-review)]">
                WhatsApp cannot carry an attachment, so the pack goes as a link and any
                certificate a supplier cites will not arrive. Their questionnaire
                answers will stand alone, with nothing to check them against.
              </span>
            )}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-6 text-[10px]">
            sent over {channel} · transport stubbed
          </Badge>
          {sending ? (
            <span className="text-[11px] text-muted-foreground">
              reading what arrived…
            </span>
          ) : (
            <>
              <span className="text-[11px] text-muted-foreground">
                {Object.values(arrivals).filter((a) => a.state === "read").length} replied
                and read, {Object.values(arrivals).filter((a) => a.state === "no_reply").length}{" "}
                did not respond
              </span>
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => { setSent(false); setArrivals({}); setLoad((n) => n + 1); }}
              >
                Start over
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
