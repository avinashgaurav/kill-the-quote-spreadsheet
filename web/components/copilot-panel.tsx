"use client";

/**
 * Drafting: the buyer talks an enquiry into existence.
 *
 * Two halves. On the left the conversation; on the right the draft as it comes
 * into being, in the four parts that will actually go out: scope, line items,
 * questionnaire, terms.
 *
 * The design decision worth defending is where the emphasis sits. The obvious
 * build puts a big "Send" button at the end of a friendly chat. This one puts
 * the clarity issues between the draft and the send, and the send is genuinely
 * blocked while any of them is unresolved. Every mess the reader untangles later
 * was created at this moment, so this is the cheapest place in the whole system
 * to prevent it: minutes now against days after five suppliers have replied.
 *
 * The line items table shows "Units per UoM" as its own column rather than
 * burying it in the description, because that single field is what stops a
 * supplier's per-piece price looking ninety per cent cheaper than it is.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ClarityIssue {
  severity: "blocking" | "should_fix" | "note";
  where: string;
  issue: string;
  suggestion: string;
}

interface Draft {
  title: string;
  scope: {
    background?: string; included?: string[]; excluded?: string[];
    deliveryLocations?: Array<{ site: string; share: string }>;
    timeline?: Array<{ milestone: string; when: string }>;
    awardBasis?: string;
  };
  lines: Array<{
    no: number; sku: string; group: string; description: string;
    spec?: Array<{ key: string; value: string }>;
    uom: string; unitsPerUom: number; qty: number; hsn?: string | null;
    warrantyBasis: string; substitutionAllowed: boolean;
  }>;
  questionnaire: Array<{
    no: string; kind: string; question: string;
    documentRequired: boolean; whyItMatters: string;
  }>;
  terms: Record<string, string>;
  clarityIssues: ClarityIssue[];
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{ name: string }>;
  error?: boolean;
}

type Part = "scope" | "lines" | "questionnaire" | "terms";

/** A blocking problem, its consequence, and a fix the buyer can accept. */
interface SendIssue {
  severity: "blocking" | "should_fix" | "note";
  where: string;
  lineNo?: number;
  issue: string;
  consequence: string;
  fix?: {
    label: string;
    patch: Record<string, unknown>;
    target: "line" | "question" | "enquiry";
    targetId?: string | number;
  };
}

/**
 * The channel the enquiry goes out on.
 *
 * The brief says "over a channel you choose", so it is a choice the buyer makes
 * here rather than a constant in the code. The transport behind each one is
 * stubbed, which the brief permits, and the panel says so on the screen rather
 * than in a comment. What is NOT stubbed is everything the choice affects: the
 * four documents, the envelope, and the fact that some channels cannot carry
 * an attachment, which changes what the supplier can even reply with.
 */
const CHANNELS = [
  {
    id: "email",
    label: "Email",
    detail: "Four documents attached to one message per supplier.",
    carriesAttachments: true,
  },
  {
    id: "portal",
    label: "Supplier portal",
    detail: "A link per supplier. They download the pack and upload a reply.",
    carriesAttachments: true,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    detail:
      "A message with a link to the pack. Small suppliers reply here with a photo " +
      "of a rate card more often than with a spreadsheet, so expect to read one.",
    carriesAttachments: false,
  },
] as const;
type ChannelId = (typeof CHANNELS)[number]["id"];

export function CopilotPanel({
  prompts, onSent,
}: {
  prompts: string[];
  onSent: (rfxId: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [issues, setIssues] = useState<SendIssue[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overriding, setOverriding] = useState<string | null>(null);
  const [part, setPart] = useState<Part>("lines");
  const [channel, setChannel] = useState<ChannelId>("email");
  const [sent, setSent] = useState<{
    rfxId: string;
    pack: Array<{ name: string; kind: string; bytes?: number }>;
    outbound?: {
      channel: string; recipients: string[]; subject: string;
      attachments: string[]; sentAt: string; note: string;
    };
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function say(message: string) {
    if (!message.trim() || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const j = await res.json();
      if (!j.ok) {
        setTurns((t) => [...t, { role: "assistant", text: j.error, error: true }]);
        return;
      }
      setHistory(j.history ?? []);
      if (j.draft) {
        setDraft(j.draft);
        setBlockers(j.sendBlockers ?? []);
      }
      const text = j.reply
        || (j.underspecified
              ? `${j.underspecified.askInstead}\n\nStill need: ${(j.underspecified.missing ?? []).join("; ")}`
              : j.draft
                ? "Draft is on the right."
                : "");
      setTurns((t) => [...t, { role: "assistant", text, toolCalls: j.toolCalls }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: String(e), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Apply a suggested fix to the draft in place.
   *
   * Done on the client against the draft the buyer is looking at, rather than
   * by asking the model to redraft, for two reasons: it is instant, and a
   * redraft can quietly change something else. A fix that also moves a price or
   * a quantity is not a fix, it is a new draft.
   */
  function applyFix(issue: SendIssue) {
    if (!issue.fix || !draft) return;
    const { target, targetId, patch } = issue.fix;
    setDraft((d) => {
      if (!d) return d;
      if (target === "line") {
        return {
          ...d,
          lines: d.lines.map((l) =>
            Number(l.no) === Number(targetId) ? { ...l, ...patch } : l),
        };
      }
      if (target === "question") {
        return {
          ...d,
          questionnaire: d.questionnaire.map((q) =>
            String(q.no) === String(targetId) ? { ...q, ...patch } : q),
        };
      }
      return { ...d, ...patch };
    });
    // Clear it optimistically. If it was not really fixed, the next send says so.
    setIssues((list) => list.filter((i) => i !== issue));
    setBlockers((b) => b.filter((x) => !x.startsWith(`${issue.where}:`)));
  }

  // A blocker with a recorded reason is resolved. This is what un-gates the
  // button, and it is deliberately computed rather than tracked as state, so it
  // cannot drift out of step with the overrides map.
  const unresolved = issues.length
    ? issues.filter((i) => i.severity === "blocking" && !overrides[i.where]).length
    : blockers.filter((b) => !overrides[b.split(":")[0]]).length;

  async function send() {
    // No longer gated on there being zero blockers: a blocker with a recorded
    // reason is a decision, and the server is the thing that enforces the rule.
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rfx/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          channel,
          overrides: Object.entries(overrides).map(([where, reason]) => ({ where, reason })),
          recipients: [
            "prakash.iyer@zenithinfotech.co.in", "farida.merchant@cygnustech.in",
            "sameer@orbitsystems.co.in", "karthik@vectordigital.in",
            "vikram.sethi@helios-ent.com",
          ],
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        setBlockers(j.blockers ?? []);
        setIssues((j.issues ?? []) as SendIssue[]);
        setTurns((t) => [...t, { role: "assistant", text: j.error, error: true }]);
        return;
      }
      setSent({ rfxId: j.rfxId, pack: j.pack, outbound: j.outbound });
      onSent(j.rfxId);
    } finally {
      setBusy(false);
    }
  }

  async function download(p: Part) {
    if (!draft) return;
    const res = await fetch(`/api/rfx/pack/${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, rfxId: sent?.rfxId ?? "RFX-DRAFT" }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (p === "scope" || p === "terms") {
      window.open(url, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sent?.rfxId ?? "RFX-DRAFT"}_${p}.xlsx`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const blocking = draft?.clarityIssues.filter((i) => i.severity === "blocking") ?? [];
  const shouldFix = draft?.clarityIssues.filter((i) => i.severity === "should_fix") ?? [];
  const notes = draft?.clarityIssues.filter((i) => i.severity === "note") ?? [];

  return (
    <div className="flex min-h-0 flex-1">
      {/* Conversation */}
      <div className="flex min-h-0 w-[420px] shrink-0 flex-col border-r">
        <div className="shrink-0 border-b px-4 py-3">
          <p className="text-[13px] font-semibold tracking-tight">Draft an enquiry</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Describe what you need. We ask only what we cannot work out, then draft the
            scope, line items, questionnaire and terms.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="space-y-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The job is to make the enquiry unambiguous before it leaves. Most problems
                in comparing quotes start here: a line that does not say a kit holds two
                DIMMs comes back three different ways from three suppliers.
              </p>
              <div className="space-y-1.5">
                {prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => say(p)}
                    className="w-full rounded-md border bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
                  >
                    &ldquo;{p}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={cn(t.role === "user" && "text-right")}>
              {t.role === "user" ? (
                <p className="ml-auto inline-block max-w-[88%] rounded-lg bg-secondary px-3 py-2 text-left text-xs">
                  {t.text}
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p
                    className={cn(
                      "text-xs leading-relaxed whitespace-pre-wrap",
                      t.error && "text-destructive",
                    )}
                  >
                    {t.text}
                  </p>
                  {!!t.toolCalls?.length && (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {t.toolCalls.map((c) => c.name).join(" · ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60" />
              Drafting…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); say(input); }}
          className="flex shrink-0 gap-2 border-t p-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you need to buy?"
            className="h-8 text-xs"
            disabled={busy}
          />
          <Button type="submit" size="sm" className="h-8" disabled={busy || !input.trim()}>
            Send
          </Button>
        </form>
      </div>

      {/* The draft */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!draft ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium">No draft yet</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Your enquiry appears here in the four parts that go out, each downloadable.
                Four documents, because four different people at the supplier answer them.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold tracking-tight">
                  {draft.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="num">{draft.lines.length}</span> lines
                  {" · "}
                  <span className="num">
                    {draft.lines.reduce((a, l) => a + Number(l.qty || 0), 0)}
                  </span>{" "}
                  units
                  {" · "}
                  <span className="num">{draft.questionnaire.length}</span> questions
                  {" · "}
                  <span className="num">
                    {draft.questionnaire.filter((q) => q.kind === "mandatory").length}
                  </span>{" "}
                  mandatory
                </p>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {sent ? (
                  <Badge variant="secondary" className="h-7 gap-1.5 px-2.5">
                    Sent as <span className="font-mono">{sent.rfxId}</span>
                  </Badge>
                ) : (
                  <>
                    {/* The channel is a choice, not a constant. Rendered next
                        to the send so it is obvious it is one. */}
                    <div className="flex items-center gap-1 rounded-md border p-0.5">
                      {CHANNELS.map((c) => (
                        <Tooltip key={c.id}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setChannel(c.id)}
                              aria-pressed={channel === c.id}
                              className={cn(
                                "rounded-[3px] px-2 py-1 text-[10px] transition-colors",
                                channel === c.id
                                  ? "bg-foreground text-background"
                                  : "text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {c.label}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {c.detail}
                            {!c.carriesAttachments && (
                              <span className="mt-1 block text-muted-foreground">
                                No attachment on this channel, so the pack goes as a link.
                              </span>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={busy || unresolved > 0}
                          onClick={send}
                        >
                          {unresolved > 0
                            ? `Held: ${unresolved} to resolve`
                            : Object.keys(overrides).length
                              ? "Send anyway"
                              : "Send to suppliers"}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm text-xs">
                      {unresolved > 0
                        ? "As written, this would come back incomparable. Every item above " +
                          "has a fix, or you can send it anyway with a reason. Minutes now, " +
                          "days once five suppliers have replied."
                        : Object.keys(overrides).length
                          ? "Sending with a known ambiguity. The reason is recorded on the " +
                            "enquiry so it can be traced later."
                          : "Generates and sends the four documents. Sending is stubbed; the " +
                            "documents are real."}
                    </TooltipContent>
                  </Tooltip>
                  </>
                )}
              </div>
            </div>

            {/* The refusal, and the reasons. Above the draft, not below it. */}
            {(issues.length > 0 || blockers.length > 0) && (
              <div className="max-h-72 shrink-0 overflow-y-auto border-b border-[var(--cell-caveat)]/40 bg-[var(--cell-caveat-bg)] px-4 py-3">
                <p className="text-[11px] font-semibold">
                  {issues.length || blockers.length} thing
                  {(issues.length || blockers.length) === 1 ? "" : "s"} would come back
                  wrong
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  Each has a fix. Or send anyway with a reason, which stays on the
                  enquiry.
                </p>

                <ul className="mt-2 space-y-2.5">
                  {issues.map((it, i) => {
                    const done = overrides[it.where];
                    return (
                      <li key={i} className="text-[11px] leading-relaxed">
                        <p className="font-medium">
                          {it.where}: {it.issue}
                        </p>
                        <p className="mt-0.5 border-l-2 border-[var(--cell-caveat)] pl-2 text-muted-foreground">
                          {it.consequence}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {it.fix && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 bg-background text-[10px]"
                              onClick={() => applyFix(it)}
                            >
                              {it.fix.label}
                            </Button>
                          )}
                          {done ? (
                            <span className="text-[10px] text-muted-foreground">
                              sending anyway: &ldquo;{done}&rdquo;
                              <button
                                className="ml-1.5 underline"
                                onClick={() =>
                                  setOverrides((o) => {
                                    const n = { ...o };
                                    delete n[it.where];
                                    return n;
                                  })}
                              >
                                undo
                              </button>
                            </span>
                          ) : overriding === it.where ? (
                            <input
                              autoFocus
                              placeholder="Why send it like this? (recorded)"
                              aria-label={`Reason for sending ${it.where} as written`}
                              className="h-6 flex-1 rounded border bg-background px-2 text-[10px]"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const v = (e.target as HTMLInputElement).value.trim();
                                  if (v.length >= 3) {
                                    setOverrides((o) => ({ ...o, [it.where]: v }));
                                    setOverriding(null);
                                  }
                                }
                                if (e.key === "Escape") setOverriding(null);
                              }}
                            />
                          ) : (
                            <button
                              className="text-[10px] text-muted-foreground underline"
                              onClick={() => setOverriding(it.where)}
                            >
                              send anyway
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}

                  {/* Anything the server named but could not structure. */}
                  {!issues.length && blockers.map((b, i) => (
                    <li key={i} className="text-[11px] leading-relaxed">· {b}</li>
                  ))}
                </ul>
              </div>
            )}

            {(shouldFix.length > 0 || notes.length > 0) && blocking.length === 0 && (
              <div className="shrink-0 border-b bg-muted/25 px-4 py-2">
                <p className="text-[11px] text-muted-foreground">
                  {shouldFix.length > 0 && (
                    <>
                      <span className="font-medium text-foreground">
                        {shouldFix.length} likely to cause a clarification round:
                      </span>{" "}
                      {shouldFix.map((i) => `${i.where} — ${i.issue}`).join("; ")}
                    </>
                  )}
                  {shouldFix.length > 0 && notes.length > 0 && " · "}
                  {notes.length > 0 && `${notes.length} note(s)`}
                </p>
              </div>
            )}

            {sent && (
              <div className="shrink-0 border-b bg-muted/25 px-4 py-2.5">
                {/* The envelope, shown rather than asserted. A "Sent!" badge on
                    its own is a claim; this is the actual thing that would have
                    gone out, with the one faked step named. */}
                {sent.outbound && (
                  <div className="mb-2 rounded-md border bg-background p-2.5 text-[11px] leading-relaxed">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
                        {sent.outbound.channel}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(sent.outbound.sentAt).toLocaleString()}
                      </span>
                    </div>
                    <p>
                      <span className="text-muted-foreground">to </span>
                      {sent.outbound.recipients.join(", ")}
                    </p>
                    <p>
                      <span className="text-muted-foreground">subject </span>
                      {sent.outbound.subject}
                    </p>
                    <p>
                      <span className="text-muted-foreground">
                        {sent.outbound.attachments.length} attachment
                        {sent.outbound.attachments.length === 1 ? "" : "s"}{" "}
                      </span>
                      {sent.outbound.attachments.join(", ")}
                    </p>
                    <p className="mt-1.5 border-l-2 pl-2 text-muted-foreground">
                      {sent.outbound.note}
                    </p>
                  </div>
                )}
                <p className="mb-1.5 text-[11px]">
                  <span className="font-medium">
                    Sent to {sent.outbound?.recipients.length ?? 5} suppliers.
                  </span>{" "}
                  <span className="text-muted-foreground">
                    Download the four documents to check they are real.
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(["scope", "lines", "questionnaire", "terms"] as Part[]).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      onClick={() => download(p)}
                    >
                      {p === "lines" ? "Line items" : p === "questionnaire" ? "Questionnaire"
                        : p === "scope" ? "Scope of work" : "Terms"}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* The four parts */}
            <div className="flex shrink-0 items-center gap-1 border-b px-4 py-2">
              {([
                ["scope", "Scope"],
                ["lines", `Line items (${draft.lines.length})`],
                ["questionnaire", `Questionnaire (${draft.questionnaire.length})`],
                ["terms", "Terms"],
              ] as const).map(([k, label]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={part === k ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setPart(k as Part)}
                >
                  {label}
                </Button>
              ))}
              {!sent && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 text-[11px]"
                  onClick={() => download(part)}
                >
                  Preview this document
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {part === "lines" && <LinesTable draft={draft} />}
              {part === "questionnaire" && <QuestionnaireTable draft={draft} />}
              {part === "scope" && <ScopeView draft={draft} />}
              {part === "terms" && <TermsView draft={draft} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LinesTable({ draft }: { draft: Draft }) {
  return (
    <table className="grid-table w-full">
      <thead>
        <tr>
          <th className="col-sticky min-w-[220px]">Line</th>
          <th className="text-right">Qty</th>
          <th>UoM</th>
          <th className="text-right">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help underline decoration-dotted">Units/UoM</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Billable pieces inside one unit. This column is what stops a per-piece price
                looking 90% cheaper than it is.
              </TooltipContent>
            </Tooltip>
          </th>
          <th>Warranty</th>
          <th>Equivalents</th>
          <th className="min-w-[280px]">Spec</th>
        </tr>
      </thead>
      <tbody>
        {draft.lines.map((l) => {
          const container = /\b(box|pack|kit|set|carton|case)\b/i.test(l.uom);
          const suspicious = container && Number(l.unitsPerUom) === 1;
          return (
            <tr key={l.no}>
              <td className="col-sticky">
                <span className="num mr-2 text-muted-foreground">{l.no}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help font-medium">{l.sku}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md text-xs">{l.description}</TooltipContent>
                </Tooltip>
              </td>
              <td className="num text-right">{l.qty}</td>
              <td className={cn(container && "font-medium")}>{l.uom}</td>
              <td
                className={cn(
                  "num text-right",
                  suspicious && "cell-caveat font-semibold",
                  container && !suspicious && "font-medium",
                )}
              >
                {l.unitsPerUom}
              </td>
              <td className="text-[10px]">
                {l.warrantyBasis === "included_in_unit_price" ? "in unit price"
                  : l.warrantyBasis === "quoted_separately" ? "separate"
                  : "—"}
              </td>
              <td className="text-[10px]">{l.substitutionAllowed ? "permitted" : "barred"}</td>
              <td className="text-[10px] text-muted-foreground">
                {(l.spec ?? []).map((s) => `${s.key}=${s.value}`).join(", ")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function QuestionnaireTable({ draft }: { draft: Draft }) {
  return (
    <table className="grid-table w-full">
      <thead>
        <tr>
          <th className="col-sticky w-14">Q</th>
          <th className="w-20">Kind</th>
          <th className="min-w-[380px]">Question</th>
          <th className="w-24">Evidence</th>
          <th className="min-w-[240px]">Why it matters</th>
        </tr>
      </thead>
      <tbody>
        {draft.questionnaire.map((q) => (
          <tr key={q.no}>
            <td className="col-sticky font-medium">{q.no}</td>
            <td>
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase",
                  q.kind === "mandatory"
                    ? "bg-destructive/12 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {q.kind === "mandatory" ? "must" : "nice"}
              </span>
            </td>
            <td className="whitespace-normal py-1.5">{q.question}</td>
            <td className={cn("text-[10px]", q.documentRequired && "font-medium")}>
              {q.documentRequired ? "document required" : "answer only"}
            </td>
            <td className="whitespace-normal py-1.5 text-[10px] text-muted-foreground">
              {q.whyItMatters}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScopeView({ draft }: { draft: Draft }) {
  const s = draft.scope;
  return (
    <div className="max-w-3xl space-y-5 p-5 text-xs leading-relaxed">
      <Block title="Background">{s.background}</Block>
      <Block title="Included in scope">
        <ul className="space-y-1">
          {(s.included ?? []).map((i, k) => <li key={k}>· {i}</li>)}
        </ul>
      </Block>
      <Block title="Excluded from scope">
        <ul className="space-y-1">
          {(s.excluded ?? []).map((i, k) => <li key={k}>· {i}</li>)}
        </ul>
      </Block>
      <Block title="Delivery">
        <ul className="space-y-1">
          {(s.deliveryLocations ?? []).map((d, k) => (
            <li key={k}>
              · {d.site} — <span className="text-muted-foreground">{d.share}</span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Timeline">
        <ul className="space-y-1">
          {(s.timeline ?? []).map((t, k) => (
            <li key={k}>
              · {t.milestone} — <span className="num text-muted-foreground">{t.when}</span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Award basis">{s.awardBasis}</Block>
    </div>
  );
}

function TermsView({ draft }: { draft: Draft }) {
  const labels: Record<string, string> = {
    currency: "Currency", taxBasis: "Tax basis", deliveryBasis: "Delivery basis",
    payment: "Payment", validity: "Bid validity", priceFirmness: "Price firmness",
    supportSla: "Support SLA", acceptance: "Acceptance", partialAward: "Partial award",
    conditionalDiscounts: "Conditional discounts", compliance: "Compliance",
    governingLaw: "Governing law",
  };
  return (
    <div className="max-w-3xl divide-y p-5 text-xs">
      {Object.entries(labels).map(([k, label]) =>
        draft.terms[k] ? (
          <div key={k} className="flex gap-4 py-2.5">
            <p className="w-40 shrink-0 font-medium">{label}</p>
            <p className="leading-relaxed text-muted-foreground">{draft.terms[k]}</p>
          </div>
        ) : null,
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div>{children}</div>
    </div>
  );
}
