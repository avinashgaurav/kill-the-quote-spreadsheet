import { randomUUID } from "node:crypto";

import { callLlm, activeModel, activeProvider, toolResultPart, type Part } from "@/lib/llm";
import { providerErrorResponse } from "@/lib/provider-error";
import { COPILOT_SYSTEM, COPILOT_TOOLS, sendBlockers, type DraftedRfx } from "@/lib/copilot";

/**
 * The drafting conversation.
 *
 * A real model loop: the co-pilot asks what it cannot infer, then calls
 * draft_rfx with the whole enquiry. Nothing here is a template being filled in,
 * and there is no branch that returns a prepared enquiry for a known prompt.
 *
 * The one thing this route does that the model cannot is refuse. Blocking
 * clarity issues, and the independent code checks in sendBlockers, come back
 * with the draft so the UI can show a send button that will not fire until the
 * enquiry is unambiguous. A model can certify its own work; a code check cannot
 * be talked round.
 */

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    // A malformed body is a 400 with a sentence, not a 500 with a SyntaxError.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json(
        { ok: false, error: "The request body was not readable JSON." },
        { status: 400 },
      );
    }
    const message = String(body.message ?? "").trim();
    const history = (body.history ?? []) as Array<{
      role: "user" | "assistant"; parts: Part[]; raw?: unknown;
    }>;

    if (!message) {
      return Response.json({ ok: false, error: "No message." }, { status: 400 });
    }

    const provider = activeProvider();
    const haveKey = provider === "gemini"
      ? Boolean(process.env.GEMINI_API_KEY)
      : Boolean(process.env.ANTHROPIC_API_KEY);
    if (!haveKey) {
      return Response.json({
        ok: false,
        error:
          `No API key for provider '${provider}'. Drafting is a real model call, not a template, ` +
          `so it cannot run without one.`,
      }, { status: 503 });
    }

    const turns = [...history];
    let currentParts: Part[] = [{ kind: "text", text: message }];
    const toolCalls: Array<{ name: string; ms: number }> = [];

    let reply = "";
    let draft: DraftedRfx | null = null;
    let amendment: Record<string, unknown> | null = null;
    let underspecified: Record<string, unknown> | null = null;
    let usage = { input: 0, output: 0 };

    for (let turn = 0; turn < 8; turn++) {
      const response = await callLlm({
        system: COPILOT_SYSTEM,
        history: turns,
        parts: currentParts,
        tools: COPILOT_TOOLS,
        // A drafted enquiry is a big output: thirty line items with
        // descriptions, ten questions, a dozen terms and a scope. Measured at
        // roughly 5000 tokens, so this is double, not a blank cheque. On a
        // thinking model the ceiling covers thinking too, which bills at the
        // output rate, so an over-set number is money the model may spend.
        maxTokens: 10000,
        effort: "high",
        // Drafting is a conversation. Nobody waits four minutes for a reply.
        retryBudgetMs: 25_000,
      });

      usage = {
        input: usage.input + response.usage.input,
        output: usage.output + response.usage.output,
      };
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
         * A draft that ran out of room is a FAILURE, not a draft.
         *
         * The same bug the analyst route had: `stopReason` was ignored, so a
         * reply truncated mid-sentence (or one that spent its whole budget
         * thinking and emitted nothing) came back as a successful turn with an
         * empty or half-finished message. In a drafting conversation that is
         * worse than in the analyst, because the buyer keeps talking to a
         * thread that has silently lost the plot.
         */
        const truncated = /max_tokens|MAX_TOKENS|length/i.test(String(response.stopReason));
        if (truncated || !response.text.trim()) {
          return Response.json({
            ok: false,
            error: truncated
              ? "The draft was cut off before it finished. Try describing fewer " +
                "line items at once, or ask for one section at a time."
              : "The co-pilot returned nothing at all. Nothing has been drafted.",
            detail: `stop reason: ${response.stopReason}`,
          }, { status: 502 });
        }
        reply = response.text;
        break;
      }

      const resultParts: unknown[] = [];
      for (const call of response.toolCalls) {
        const t0 = Date.now();
        let out: unknown = { acknowledged: true };

        if (call.name === "draft_rfx") {
          draft = call.input as unknown as DraftedRfx;
          const blockers = sendBlockers(draft);
          out = {
            accepted: true,
            lines: draft.lines?.length ?? 0,
            questions: draft.questionnaire?.length ?? 0,
            // Told back to the model so it can explain the hold to the buyer in
            // its own words rather than the UI contradicting it.
            sendBlockers: blockers,
            note: blockers.length
              ? "The draft is shown to the buyer but cannot be sent yet. Tell them plainly " +
                "which lines are holding it and what you need."
              : "The draft is shown to the buyer and is clear enough to send.",
          };
        } else if (call.name === "amend_rfx") {
          amendment = call.input;
          out = { accepted: true, summary: call.input.summary };
        } else if (call.name === "flag_underspecified") {
          underspecified = call.input;
          out = { acknowledged: true };
        }

        toolCalls.push({ name: call.name, ms: Date.now() - t0 });
        const part = toolResultPart(call, out, false);
        resultParts.push(...(part.raw as unknown[]));
      }

      currentParts = [];
      turns.push({ role: "user", parts: [], raw: resultParts });
    }

    return Response.json({
      ok: true,
      reply,
      draft,
      draftId: draft ? `draft_${randomUUID().slice(0, 8)}` : null,
      sendBlockers: draft ? sendBlockers(draft) : [],
      amendment,
      underspecified,
      toolCalls,
      usage,
      model: activeModel("main"),
      provider,
      history: turns,
    });
  } catch (e) {
    /**
     * The commonest failure this route will ever have, and it is not a bug.
     *
     * This used to be `error: String(e)` with a 500, so a rate-limited or
     * out-of-credit provider printed its entire JSON payload, billing console
     * URL included, in red, in the drafting box. Which is the FIRST thing
     * anybody does with this product.
     *
     * The analyst route has handled this properly for a while. Nothing carried
     * it here until a QA pass looked.
     */
    return providerErrorResponse(e, {
      action: "The co-pilot could not draft this",
    });
  }
}
