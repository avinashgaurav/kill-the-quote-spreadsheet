"use client";

/**
 * The analyst conversation.
 *
 * Two things here are deliberate and are worth pointing at during a demo.
 *
 * The tool calls are shown, collapsed, under each answer. Not as decoration:
 * they are what lets the VP see that the number came from the calculator and
 * not from the model's prose. "It called run_award_scenario twice and
 * compare_scenarios once" is checkable in a way that "trust the total" is not.
 *
 * Charts are rendered from values a tool returned, never from values the model
 * wrote. The chart tool passes data through; it cannot compute.
 */

import { useEffect, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell as RCell, ResponsiveContainer, Tooltip as RTooltip,
  XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { inrShort } from "@/lib/ui";

interface ChartSpec {
  kind: string;
  title: string;
  unit?: string;
  series: Array<{ label: string; value: number; group?: string }>;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  charts?: ChartSpec[];
  toolCalls?: Array<{ name: string; ms: number }>;
  citedCells?: string[];
  error?: boolean;
  /** The raw failure, available on demand but never the headline. */
  detail?: string;
}

/**
 * Turn a provider failure into something a buyer can act on.
 *
 * The raw text is kept and shown behind a disclosure, because hiding it
 * entirely makes a real problem undiagnosable. It just should not be the first
 * thing on screen.
 */
function friendlyError(raw: unknown): string {
  const s = String(raw ?? "");
  if (/429|quota|rate limit/i.test(s)) {
    return "The model is rate-limited right now. Wait a moment and ask again. " +
      "Nothing has been changed or stored.";
  }
  if (/401|403|api key|ANTHROPIC_API_KEY|GEMINI_API_KEY/i.test(s)) {
    return "No working API key is configured, so the analyst cannot run. It answers " +
      "from the extracted data rather than a lookup table, so it needs one.";
  }
  if (/503|overloaded|UNAVAILABLE|high demand/i.test(s)) {
    return "The model is busy. Try again in a few seconds; nothing has been lost.";
  }
  if (/timeout|ETIMEDOUT|aborted/i.test(s)) {
    return "That took too long and was stopped. Try a narrower question, or ask again.";
  }
  return "The analyst could not answer that. Nothing on the comparison has changed.";
}

export function AnalystChat({
  suggestions, onCitedCells, disabled, disabledReason, pendingQuestion,
  onPendingConsumed,
}: {
  suggestions: string[];
  onCitedCells?: (cells: string[]) => void;
  disabled?: boolean;
  disabledReason?: string;
  /** A question pushed in from elsewhere in the UI, e.g. the Explain button. */
  pendingQuestion?: string | null;
  onPendingConsumed?: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  /**
   * Server-shaped conversation history.
   *
   * Without this every question was turn one, so "now only qualified suppliers"
   * had nothing to be "now" relative to, and the shipped follow-up questions
   * could not work. The demo script depends on exactly that: ask for cheapest,
   * then narrow it.
   */
  const historyRef = useRef<unknown[]>([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (!pendingQuestion || busy || disabled) return;
    onPendingConsumed?.();
    void ask(pendingQuestion);
    // ask is stable enough for this purpose and re-running on its identity
    // would re-fire the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion, busy, disabled]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: historyRef.current }),
      });
      const json = await res.json();
      if (!json.ok) {
        setTurns((t) => [...t, {
          role: "assistant",
          // A provider's raw JSON in the answer panel tells a category manager
          // nothing and looks like the product falling over. Say what happened
          // and what to do; keep the detail available but out of the way.
          text: friendlyError(json.error),
          detail: String(json.error ?? ""),
          error: true,
        }]);
      } else {
        historyRef.current = json.history ?? historyRef.current;
        setTurns((t) => [...t, {
          role: "assistant",
          text: json.answer,
          charts: json.charts,
          toolCalls: json.toolCalls,
          citedCells: json.citedCells,
        }]);
        if (json.citedCells?.length) onCitedCells?.(json.citedCells);
      }
    } catch (e) {
      setTurns((t) => [...t, {
        role: "assistant",
        text: friendlyError(String(e)),
        detail: String(e),
        error: true,
      }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Ask anything about the comparison. Every answer is computed, cites the cells
              it used, and will tell you when it cannot answer rather than guessing.
            </p>
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={disabled}
                  className="w-full rounded-md border bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={cn("space-y-2", t.role === "user" && "text-right")}>
            {t.role === "user" ? (
              <p className="ml-auto inline-block max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-left text-xs">
                {t.text}
              </p>
            ) : (
              <div className="space-y-2.5">
                <div
                  className={cn(
                    "prose-sm max-w-none text-xs leading-relaxed",
                    t.error && "text-destructive",
                  )}
                >
                  <Markdown text={t.text} />
                </div>

                {t.detail && (
                  <details>
                    <summary className="cursor-pointer list-none text-[10px] text-muted-foreground underline decoration-dotted">
                      Technical detail
                    </summary>
                    <p className="mt-1 font-mono text-[10px] break-all text-muted-foreground">
                      {t.detail.slice(0, 500)}
                    </p>
                  </details>
                )}

                {t.charts?.map((c, j) => <Chart key={j} spec={c} />)}

                {!!t.toolCalls?.length && (
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[10px] text-muted-foreground hover:text-foreground">
                      <span className="underline decoration-dotted">
                        {t.toolCalls.length} calculation{t.toolCalls.length === 1 ? "" : "s"}
                      </span>
                      {t.citedCells?.length ? (
                        <> · {t.citedCells.length} cells cited</>
                      ) : null}
                    </summary>
                    <ul className="mt-1.5 space-y-1 border-l pl-2.5">
                      {t.toolCalls.map((c, j) => (
                        <li key={j} className="font-mono text-[10px] text-muted-foreground">
                          {c.name} <span className="num">({c.ms}ms)</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 pl-2.5 text-[10px] text-muted-foreground">
                      Every number above came from these. No maths happened in the text.
                    </p>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60" />
            Working…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t p-3">
        {disabled ? (
          <p className="text-center text-[11px] text-muted-foreground">{disabledReason}</p>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the comparison…"
              // A placeholder is not a label: it disappears the moment anyone
              // types, and a screen reader gets nothing to announce.
              aria-label="Ask a question about the comparison"
              className="h-8 text-xs"
              disabled={busy}
            />
            <Button type="submit" size="sm" className="h-8" disabled={busy || !input.trim()}>
              Ask
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Five colours, in a fixed order, so a supplier keeps its colour across charts.
 *
 * Reused from the chart tokens rather than invented, and deliberately not
 * red or amber: those two mean "needs a person" everywhere else on this
 * screen, and a bar that happens to be amber must not read as a warning.
 */
const GROUP_FILL = [
  "var(--chart-1)", "var(--chart-3)", "var(--chart-2)",
  "var(--chart-4)", "var(--chart-5)",
];

function Chart({ spec }: { spec: ChartSpec }) {
  const data = spec.series.map((s) => ({ ...s, name: s.label }));
  const money = (spec.unit ?? "INR").toUpperCase() === "INR";

  /**
   * Colour by group when the model gave one.
   *
   * `group` has been in the chart contract from the start and the renderer
   * ignored it, so every bar was the same colour and the most useful chart in
   * this product could not be drawn: thirty lines, each coloured by which
   * supplier wins it, which shows the shape of a split award at a glance in a
   * way a table of thirty rows does not.
   */
  const groups = [...new Set(data.map((d) => d.group).filter(Boolean))] as string[];
  const fillFor = (g?: string) =>
    g && groups.length > 1
      ? GROUP_FILL[groups.indexOf(g) % GROUP_FILL.length]
      : "var(--chart-1)";

  return (
    <div className="rounded-md border bg-card p-3">
      <p className="mb-2 text-[11px] font-medium">{spec.title}</p>
      {groups.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {groups.map((g) => (
            <span key={g} className="flex items-center gap-1 text-[9.5px]">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ background: fillFor(g) }}
              />
              {g}
            </span>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={Math.max(140, data.length * 26)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="var(--grid-line)" />
          <XAxis
            type="number"
            tickFormatter={(v) => (money ? inrShort(Number(v)) : String(v))}
            tick={{ fontSize: 9 }}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={104}
            tick={{ fontSize: 9 }}
            stroke="var(--muted-foreground)"
          />
          <RTooltip
            formatter={(v) => (money ? inrShort(Number(v)) : String(v))}
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
          />
          <Bar dataKey="value" radius={[0, 2, 2, 0]}>
            {data.map((d, i) => (
              <RCell key={i} fill={fillFor(d.group)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[9.5px] text-muted-foreground">
        Plotted from computed values. Nothing here was estimated to make a chart.
      </p>
    </div>
  );
}

/**
 * Minimal markdown: headings, bold, code, bullets and pipe tables.
 *
 * Hand-rolled rather than pulling a renderer, for two reasons: the answer text
 * is model output and a full renderer would be a needless HTML-injection
 * surface, and tables need the same tabular figures as the grid so the two read
 * as one system.
 */
function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");

        if (lines[0]?.startsWith("#")) {
          return (
            <p key={i} className="mt-2 mb-1 text-xs font-semibold">
              {inline(lines[0].replace(/^#+\s*/, ""))}
            </p>
          );
        }

        // Pipe table with a separator row.
        if (lines.length > 1 && lines[0].includes("|") && /^[\s|:-]+$/.test(lines[1])) {
          const head = cells(lines[0]);
          const body = lines.slice(2).filter((l) => l.includes("|")).map(cells);
          return (
            <div key={i} className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {head.map((h, j) => (
                      <th
                        key={j}
                        className={cn(
                          "border-b px-2 py-1 text-left font-semibold",
                          j > 0 && "text-right",
                        )}
                      >
                        {inline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td
                          key={k}
                          className={cn(
                            "border-b px-2 py-1",
                            k > 0 && "num text-right",
                          )}
                        >
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
          return (
            <ul key={i} className="my-1.5 space-y-1 pl-4">
              {lines.map((l, j) => (
                <li key={j} className="list-disc">{inline(l.replace(/^\s*[-*]\s/, ""))}</li>
              ))}
            </ul>
          );
        }

        return <p key={i} className="my-1.5">{inline(block)}</p>;
      })}
    </>
  );
}

const cells = (row: string) =>
  row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** Bold, code and rupee runs. Everything else stays literal text. */
function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|₹[\d,.]+(?:\s*(?:cr|crore|L|lakh))?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) {
      out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    } else if (t.startsWith("`")) {
      out.push(
        <code key={k++} className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
          {t.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<span key={k++} className="num font-medium">{t}</span>);
    }
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
