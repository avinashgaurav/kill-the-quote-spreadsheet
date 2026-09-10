import { randomUUID } from "node:crypto";

import {
  callLlm, activeModel, activeProvider, toolResultPart,
  type Part, type ToolSpec,
} from "@/lib/llm";
import {
  ANALYST_SYSTEM, analystTools, runTool, type ToolContext,
} from "@/lib/analyst";
import { buildComparisonPayload, RFX_ID } from "@/lib/store";
import { getQuery } from "@/lib/db/client";
import { providerErrorResponse } from "@/lib/provider-error";

/**
 * The analyst turn.
 *
 * A manual tool loop rather than the SDK's runner, for one reason: every tool
 * call, the cells it touched and the assumption versions in force are recorded
 * as the loop runs, so "why did it say that in the demo" is answerable
 * afterwards from the analyst_turns table. That audit trail is the point, and
 * wrapping the loop would put it out of reach.
 */

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = String(body.question ?? "").trim();
    const history = (body.history ?? []) as Array<{
      role: "user" | "assistant"; parts: Part[]; raw?: unknown;
    }>;
    if (!question) {
      return Response.json({ ok: false, error: "No question given." }, { status: 400 });
    }
    const provider = activeProvider();
    const haveKey = provider === "gemini"
      ? Boolean(process.env.GEMINI_API_KEY)
      : Boolean(process.env.ANTHROPIC_API_KEY);
    if (!haveKey) {
      return Response.json({
        ok: false,
        error:
          `No API key for provider '${provider}'. The analyst is a real model call and ` +
          `will not answer from a lookup table, so it cannot run without one.`,
      }, { status: 503 });
    }

    const payload = await buildComparisonPayload();
    if (!payload.hasAnyExtraction) {
      return Response.json({
        ok: true,
        answer:
          "Nothing has been read yet, so there is no data to analyse. Upload the supplier " +
          "responses first and I will answer from what was actually extracted rather than " +
          "from anything pre-loaded.",
        refused: true,
        refusalReason: "no extracted data",
        toolCalls: [], charts: [],
      });
    }

    const ctx: ToolContext = { payload, charts: [], citedCells: new Set() };
    const turns: Array<{ role: "user" | "assistant"; parts: Part[]; raw?: unknown }> = [
      ...history,
    ];
    const toolCalls: Array<{ name: string; input: unknown; ms: number }> = [];

    let answer = "";
    let usage = { input: 0, output: 0 };
    let currentParts: Part[] = [{ kind: "text", text: question }];

    // Bounded so a runaway loop cannot spend without limit.
    for (let turn = 0; turn < 12; turn++) {
      const response = await callLlm({
        system: ANALYST_SYSTEM,
        history: turns,
        parts: currentParts,
        tools: analystTools(payload) as ToolSpec[],
        // Sized to the actual output. On a thinking model maxOutputTokens
        // covers thinking too, and thinking bills at the output rate, so 16000
        // was not a safety margin, it was a budget the model could spend. A
        // final answer here is a short paragraph and a small table.
        maxTokens: 4000,
        effort: "high",
        // Someone is watching a cursor blink. Twelve turns each waiting on a
        // busy provider is how a question takes four minutes, so each turn
        // gives up quickly and the route reports the provider as busy.
        retryBudgetMs: 25_000,
      });

      usage = {
        input: usage.input + response.usage.input,
        output: usage.output + response.usage.output,
      };

      // What we just sent becomes history, then the model's reply.
      turns.push({ role: "user", parts: currentParts });
      // Push the provider's own assistant turn back verbatim. Replaying only
      // the text would drop the tool_use blocks, and Anthropic rejects a
      // tool_result whose tool_use is missing, so the second iteration of this
      // loop would fail with a 400 on the provider this is meant to run on.
      turns.push({
        role: "assistant",
        parts: [{ kind: "text", text: response.text }],
        raw: response.rawAssistant,
      });

      if (!response.toolCalls.length) {
        /**
         * A reply that ran out of room is a FAILURE, not an answer.
         *
         * `stopReason` was ignored here, so a response truncated mid-sentence
         * (or one that spent its whole budget thinking and emitted nothing)
         * returned `ok: true` with an empty string, and the buyer got a blank
         * panel after a paid call. Blank is the one answer this product must
         * never give silently, because the screen's entire claim is that it
         * tells you what it does not know.
         */
        const truncated = /max_tokens|MAX_TOKENS|length/i.test(String(response.stopReason));
        if (truncated || !response.text.trim()) {
          return Response.json({
            ok: false,
            error: truncated
              ? "The answer was cut off before it finished. Ask for less at once, " +
                "or split the question."
              : "The model returned nothing at all. Nothing has been stored.",
            detail: `stop reason: ${response.stopReason}`,
            toolCalls, charts: ctx.charts,
          }, { status: 502 });
        }
        answer = response.text;
        break;
      }

      // Every result goes back in ONE user turn. Splitting them teaches the
      // model to stop making parallel calls.
      const resultParts: unknown[] = [];
      for (const call of response.toolCalls) {
        const t0 = Date.now();
        let out: unknown;
        try {
          out = await runTool(call.name, call.input, ctx);
        } catch (e) {
          out = { error: String(e) };
        }
        toolCalls.push({ name: call.name, input: call.input, ms: Date.now() - t0 });
        const isError = Boolean((out as { error?: unknown })?.error);
        const part = toolResultPart(call, out, isError);
        resultParts.push(...(part.raw as unknown[]));
      }

      currentParts = [];
      turns.push({ role: "user", parts: [], raw: resultParts });
    }

    // Store the turn so the answer is reproducible after the demo.
    try {
      const query = await getQuery();
      await query(
        `insert into analyst_turns
           (id, rfx_id, question, answer, refused, tool_calls, cited_cell_ids,
            assumption_versions, model_id, usage)
         values ($1,$2,$3,$4,false,$5,$6,$7,$8,$9)`,
        [
          `t_${randomUUID().slice(0, 12)}`, RFX_ID, question, answer,
          JSON.stringify(toolCalls), JSON.stringify([...ctx.citedCells]),
          JSON.stringify(Object.keys(payload.assumptions as object)),
          activeModel("main"), JSON.stringify(usage),
        ],
      );
    } catch {
      // An audit-write failure must not lose the buyer's answer.
    }

    return Response.json({
      ok: true,
      answer,
      charts: ctx.charts,
      toolCalls,
      citedCells: [...ctx.citedCells],
      usage,
      model: activeModel("main"),
      provider,
      // Returned so the next question continues the same conversation. Without
      // it every question is turn one and "now only qualified suppliers" has
      // nothing to be "now" relative to.
      history: turns,
    });
  } catch (e) {
    // A provider that is rate limited, out of quota or down is the commonest
    // failure this route will ever have, and it is NOT a bug in the app. It
    // used to fall through to a 500 carrying a raw provider payload, which
    // tells a buyer nothing and looks like the tool is broken.
    //
    // Found by the end-to-end suite, running against a key whose daily quota
    // was exhausted: exactly the state a live demo can land in. The logic now
    // lives in lib/provider-error.ts, because the copilot and both ingest
    // routes had the old behaviour and one fix between them was no use.
    // No tool calls or charts here: this catch sits outside the loop's scope,
    // and an answer that failed has nothing partial worth reporting anyway.
    return providerErrorResponse(e, {
      action: "This question was not answered",
    });
  }
}