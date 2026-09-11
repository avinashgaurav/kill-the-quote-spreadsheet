/**
 * Provider seam.
 *
 * The two AI loops (reading documents, answering questions) go through here so
 * the model is a configuration choice rather than something welded into the
 * app. Set LLM_PROVIDER=gemini to run on Gemini, otherwise it runs on Claude.
 *
 * WHICH ONE TO RUN, and why the seam is worth having.
 *
 * Gemini 3.1 Pro is what the measured accuracy figures come from: 107 of 107
 * lines returned across five formats, 100% price and unit exactness, nothing
 * invented, and confidence that tracked difficulty unprompted. It is also the
 * cheaper of the two. An earlier version of this comment said "run the real
 * demo on Claude Opus 5" and recommended Flash for Gemini, which was true when
 * the only Gemini key available was a free-tier one that returned limit: 0 on
 * every Pro model. Billing changed that and the comment did not, which is
 * exactly the sort of stale instruction this file should not carry.
 *
 * The one thing Anthropic genuinely does better here is PDF provenance:
 * `supportsCitations()` below is true only for Anthropic, so a citation on a
 * three-page PDF comes from the provider rather than from the model reporting
 * its own locator. `extractDocument` flags the difference as
 * `provenanceWeaker` rather than hiding it. If PDF provenance is the thing
 * being examined, switch; otherwise Gemini is the measured choice.
 *
 * Either way the switch is one environment variable, which is the point of the
 * seam: it is insurance against a provider being down or out of credit at a
 * bad moment, not a preference.
 *
 * This exists for an honest reason and it is worth stating plainly, because the
 * providers are NOT equivalent for this job:
 *
 *   Claude Opus 5 is the default and what the demo should run on. Two of its
 *   features are load-bearing here. Native PDF citations return the vendor's
 *   own sentence plus a page number straight from the API, which is real
 *   provenance rather than a span matched by hand and hoped to be right. And
 *   `strict: true` tool schemas guarantee the extraction arguments validate
 *   exactly, so a malformed read fails loudly instead of arriving half-parsed.
 *
 *   Gemini Flash is here so the pipeline can be exercised end to end without
 *   Anthropic credits. It has no citations feature, so PDF provenance falls
 *   back to a model-reported locator, and it is a small fast model being asked
 *   to read a photograph of a rotated table with handwritten overrides, which
 *   is the hardest thing in this app. Expect its accuracy on that document to
 *   be worse. Use it to prove the plumbing works, not to prove the product does.
 *
 * The accuracy harness scores whichever provider ran, against the same answer
 * key, so the difference is measurable rather than a matter of opinion.
 */

import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "gemini";

export function activeProvider(): Provider {
  return process.env.LLM_PROVIDER === "gemini" ? "gemini" : "anthropic";
}

export const MODEL_IDS = {
  anthropic: {
    main: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    /**
     * Haiku, not Opus.
     *
     * This said `cheap: "claude-opus-5"`, so the entire point of the cheap
     * tier was cancelled on this provider: the crop re-read runs EIGHT TIMES
     * per photograph and would have gone to the frontier model to read four
     * digits out of a 300x120 pixel crop. The Gemini side had this right and
     * the Anthropic side was never revisited after the seam was written.
     *
     * The second read's value is that it is INDEPENDENT, not that it is
     * clever: it is handed one cropped number with no surrounding context, and
     * two reads agreeing is the evidence. A small model is the correct tool.
     */
    cheap: process.env.ANTHROPIC_CHEAP_MODEL || "claude-haiku-4-5-20251001",
  },
  gemini: {
    // 3.1 Pro for the reading and the reasoning. Gemini's lineage is native
    // multimodal document understanding, which is exactly the hard part here:
    // a phone photograph of a printed rate card, taken at an angle, with a
    // handwritten correction over a struck-through price.
    main: process.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
    // The crop re-read only has to say what one number is. It runs eight times
    // per photograph, so it goes to the cheap model deliberately: paying Pro
    // rates to read four digits is waste, and the whole point of the second
    // read is that it is INDEPENDENT, not that it is clever.
    cheap: process.env.GEMINI_CHEAP_MODEL || "gemini-flash-latest",
  },
};

export function activeModel(kind: "main" | "cheap" = "main"): string {
  return MODEL_IDS[activeProvider()][kind];
}

/** True when PDF provenance comes from the API rather than from the model. */
export const supportsCitations = () => activeProvider() === "anthropic";

// ---------------------------------------------------------------------------
// A provider-neutral description of what to send
// ---------------------------------------------------------------------------

export type Part =
  | { kind: "text"; text: string; cacheable?: boolean }
  | { kind: "image"; mediaType: string; base64: string }
  | { kind: "pdf"; mediaType: "application/pdf"; base64: string; title?: string;
      citations?: boolean };

export interface ToolSpec {
  name: string;
  description: string;
  /**
   * JSON Schema. Anthropic takes it as-is; Gemini needs it translated.
   *
   * SNAKE CASE, deliberately, because that is Anthropic's own field name and
   * what every tool definition in this codebase actually writes.
   *
   * This interface used to say `inputSchema`, and every call site bridged the
   * gap with `as unknown as ToolSpec`. The result: `t.inputSchema` was
   * undefined for every tool, so both providers were sent a function
   * declaration with NO PARAMETERS. Gemini duly called the tool with `args: {}`
   * and the extractor reported that it had found nothing in a document full of
   * prices.
   *
   * It stayed hidden for the whole build because the loops had no API key to
   * run against, and because `as unknown as` is precisely the cast that turns a
   * compile error into a runtime mystery. The casts are gone now, so the
   * compiler checks this.
   */
  input_schema: Record<string, unknown>;
  /** Anthropic's strict mode. Ignored by Gemini. */
  strict?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmResult {
  text: string;
  toolCalls: ToolCall[];
  usage: {
    input: number;
    /** Includes thinking, because that is how it is billed. */
    output: number;
    /** The thinking share of `output`, so a runaway prompt is visible. */
    thinking?: number;
    cacheRead?: number;
  };
  /** API-provided citations. Anthropic PDFs only; empty elsewhere. */
  citations: unknown[];
  stopReason: string | null;
  model: string;
  /**
   * The assistant turn exactly as the provider produced it, to be pushed back
   * into history verbatim.
   *
   * This is not a convenience. Anthropic requires every `tool_result` to follow
   * the matching `tool_use` block in the preceding assistant message; replaying
   * only the text drops those blocks and the SECOND iteration of any tool loop
   * fails with a 400. Reconstructing the turn from text would break the demo on
   * the provider the demo is meant to run on.
   */
  rawAssistant: unknown;
}

// ---------------------------------------------------------------------------
// Gemini needs its JSON Schema in the OpenAPI dialect
// ---------------------------------------------------------------------------

/**
 * Translate our JSON Schema into what Gemini accepts.
 *
 * The incompatibility that actually bites: we express an optional field as
 * `type: ["string", "null"]`, which is valid JSON Schema and which Gemini
 * rejects. Gemini wants a single `type` plus `nullable: true`. Getting this
 * wrong produces a 400 that reads like a schema-wide failure, so the
 * conversion is done explicitly rather than hoped for.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;

  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    // Gemini does not accept these and errors rather than ignoring them.
    if (key === "additionalProperties" || key === "$schema") continue;

    if (key === "type" && Array.isArray(value)) {
      const types = (value as string[]).filter((t) => t !== "null");
      out.type = (types[0] ?? "string").toUpperCase();
      if ((value as string[]).includes("null")) out.nullable = true;
      continue;
    }

    if (key === "type" && typeof value === "string") {
      out.type = value.toUpperCase();
      continue;
    }

    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => [k, toGeminiSchema(v)]),
      );
      continue;
    }

    if (key === "items") {
      out.items = toGeminiSchema(value);
      continue;
    }

    out[key] = toGeminiSchema(value);
  }

  return out;
}

// ---------------------------------------------------------------------------
// The one call both loops use
// ---------------------------------------------------------------------------

export interface LlmRequest {
  system: string;
  parts: Part[];
  /** Prior turns, for the analyst's multi-step loop. */
  history?: Array<{ role: "user" | "assistant"; parts: Part[]; raw?: unknown }>;
  tools?: ToolSpec[];
  /** Require a call to this tool. Used for single-shot extraction. */
  forceTool?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  kind?: "main" | "cheap";
  /**
   * How long we are willing to spend RETRYING a busy provider, in milliseconds.
   *
   * Not a request timeout. It bounds the waiting between attempts, which is
   * where the time actually goes on a rate-limited key. Defaults to 45s, which
   * suits an interactive question; a document read passes something longer,
   * because a minute of waiting for a page of prices is worth it and a minute
   * of waiting for a sentence is not.
   */
  retryBudgetMs?: number;
}

export async function callLlm(req: LlmRequest): Promise<LlmResult> {
  return activeProvider() === "gemini" ? callGemini(req) : callAnthropic(req);
}

// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

function toAnthropicBlocks(parts: Part[]): Anthropic.ContentBlockParam[] {
  return parts.map((p) => {
    if (p.kind === "text") {
      return {
        type: "text",
        text: p.text,
        ...(p.cacheable ? { cache_control: { type: "ephemeral" } } : {}),
      } as Anthropic.ContentBlockParam;
    }
    if (p.kind === "image") {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: p.mediaType as "image/jpeg",
          data: p.base64,
        },
      } as Anthropic.ContentBlockParam;
    }
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: p.base64 },
      ...(p.title ? { title: p.title } : {}),
      // Real provenance, straight from the API.
      ...(p.citations !== false ? { citations: { enabled: true } } : {}),
    } as Anthropic.ContentBlockParam;
  });
}

async function callAnthropic(req: LlmRequest): Promise<LlmResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Set it, or set LLM_PROVIDER=gemini with " +
      "GEMINI_API_KEY to run the loops on Gemini instead.",
    );
  }
  anthropicClient ??= new Anthropic();
  const model = MODEL_IDS.anthropic[req.kind ?? "main"];

  const messages: Anthropic.MessageParam[] = [
    ...(req.history ?? []).map((h) =>
      (h.raw
        ? { role: h.role, content: h.raw as Anthropic.ContentBlockParam[] }
        : { role: h.role, content: toAnthropicBlocks(h.parts) }) as Anthropic.MessageParam,
    ),
    { role: "user", content: toAnthropicBlocks(req.parts) },
  ];

  const response = await anthropicClient.messages.create({
    model,
    max_tokens: req.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: req.effort ?? "high" },
    system: req.system,
    ...(req.tools?.length
      ? {
          tools: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            // Guarantees the arguments validate against the schema exactly.
            strict: true,
            input_schema: t.input_schema,
          })) as unknown as Anthropic.ToolUnion[],
          ...(req.forceTool
            ? { tool_choice: { type: "tool" as const, name: req.forceTool } }
            : {}),
        }
      : {}),
    messages,
  });

  return {
    text: response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("\n").trim(),
    toolCalls: response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> })),
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? undefined,
    },
    citations: response.content
      .filter((b) => b.type === "text")
      .flatMap((b) => (b as { citations?: unknown[] }).citations ?? []),
    stopReason: response.stop_reason ?? null,
    model,
    rawAssistant: response.content,
  };
}

// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

function toGeminiParts(parts: Part[]): GeminiPart[] {
  return parts.map((p) => {
    if (p.kind === "text") return { text: p.text };
    return { inlineData: { mimeType: p.mediaType, data: p.base64 } };
  });
}

async function callGemini(req: LlmRequest): Promise<LlmResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "LLM_PROVIDER=gemini but GEMINI_API_KEY is not set. Put it in .env.local.",
    );
  }
  const model = MODEL_IDS.gemini[req.kind ?? "main"];

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [
      ...(req.history ?? []).map((h) => ({
        // Gemini calls the assistant role "model".
        role: h.role === "assistant" ? "model" : "user",
        parts: (h.raw as GeminiPart[]) ?? toGeminiParts(h.parts),
      })),
      { role: "user", parts: toGeminiParts(req.parts) },
    ],
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 16000,
      temperature: 0,
      /**
       * Bound the thinking, because nothing else did.
       *
       * `effort` has been in LlmRequest since the seam was written, and the
       * Anthropic path honours it. This path built its body with
       * maxOutputTokens and temperature and nothing else, so the flag was
       * accepted and silently discarded on the provider that is actually
       * configured. Every call ran at the model's default thinking level,
       * including the one-number crop re-read that asks for at most six
       * tokens back and passes effort "low".
       *
       * Thinking bills as OUTPUT, which is six times the input rate on this
       * model, and it was invisible: the usage below read promptTokenCount and
       * candidatesTokenCount and never thoughtsTokenCount, so the figure shown
       * in the UI and written to analyst_turns understated the real bill by the
       * entire thinking component. That is most of where the money went, and
       * why it went without a trace.
       *
       * Mapped rather than passed through, because "how hard should you think"
       * is a budget here and a level on Anthropic.
       */
      thinkingConfig: {
        /**
         * NEVER ZERO. The Pro model refuses it outright:
         *
         *   Gemini 400: "Budget 0 is invalid. This model only works in
         *   thinking mode."
         *
         * "low" meant 0 when this was written, which was fine on Flash and
         * broke Pro for every caller that asked for low effort. Caught by
         * api-check the moment credit was restored, which is exactly what that
         * script exists for: it was the first call made on a working key and
         * it failed on the main tier while the cheap tier answered.
         *
         * Had the crop re-read ever been pointed at the main model, eight
         * calls per photograph would have failed mid-demo with a 400 that
         * reads like a bug in the request rather than a budget.
         *
         * 128 is the floor rather than a guess at what it needs: low effort
         * means "do not deliberate", not "cannot think at all".
         */
        thinkingBudget: (() => {
          /**
           * CLAMPED AGAINST maxOutputTokens, which is the whole point.
           *
           * On this model maxOutputTokens covers thinking AND the answer out
           * of one pool. An unclamped 8192 against the analyst's 8000 meant
           * the model could spend the entire budget deliberating and return
           * no text at all, and the route could only say "the model returned
           * nothing". It is not deterministic, which is why it survived: the
           * same question answers fine most of the time and dies on the turn
           * that thinks hardest. That is the worst possible failure mode for
           * a live demo, and it is how the ask failed during one.
           *
           * The reserve is what the answer needs, not what is left over: a
           * paragraph, a small table and a tool call with a chart series.
           */
          const wanted =
            req.effort === "low" ? 128
            : req.effort === "medium" ? 2048
            : 8192;
          const ceiling = req.maxTokens ?? 16000;
          const ANSWER_RESERVE = 2000;
          // Never below 128: this model refuses a budget of 0 outright.
          return Math.max(128, Math.min(wanted, ceiling - ANSWER_RESERVE));
        })(),
        // Thought summaries are not needed and would be billed.
        includeThoughts: false,
      },
    },
  };

  if (req.tools?.length) {
    body.tools = [{
      functionDeclarations: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.input_schema),
      })),
    }];
    body.toolConfig = {
      functionCallingConfig: req.forceTool
        ? { mode: "ANY", allowedFunctionNames: [req.forceTool] }
        : { mode: "AUTO" },
    };
  }

  // Retry transient failures with backoff.
  //
  // The Anthropic SDK does this itself (429, 5xx and connection errors, twice
  // by default). The raw Gemini fetch does not, and a 503 "high demand" or a
  // per-minute 429 landing mid-demo would read as the product being broken
  // when it is the provider being busy. Genuine quota exhaustion and 4xx
  // schema errors are NOT retried: they will not fix themselves and retrying
  // just delays a clear error message.
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 5;

  /**
   * A wall-clock ceiling on retrying, separate from the attempt count.
   *
   * Five attempts honouring a provider hint of up to 70 seconds each is over
   * four minutes of waiting. On a rate-limited key the analyst route sat there
   * spending the whole serverless budget and the buyer watched a spinner, which
   * is a worse failure than the rate limit: they cannot tell a busy provider
   * from a broken product.
   *
   * Found by the end-to-end suite timing out on a quota-exhausted key, which is
   * exactly the state a live demo can be in.
   *
   * Reading a document can legitimately take a minute and is worth waiting for,
   * so the budget is a parameter. An interactive question is not.
   */
  const budgetMs = req.retryBudgetMs ?? 45_000;
  const started = Date.now();

  let res!: Response;
  let lastDetail = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": key },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) break;

    lastDetail = await res.text();

    /**
     * Two 429s that mean completely different things.
     *
     *   rate limited     you are going too fast. Waiting fixes it, and the
     *                    provider usually tells you how long to wait.
     *   out of money     the project's prepaid credit is spent, or the model
     *                    has no free quota at all. Waiting fixes nothing.
     *
     * Only `limit: 0` was recognised, which covers a model with no free tier
     * and NOT the commonest case in practice: a paid key whose balance has run
     * out. That returns a plain 429 saying "Your prepayment credits are
     * depleted", so it was retried five times, honouring hints of up to
     * seventy seconds each. Every call in a demo would hang for the full
     * retry budget before failing, and the message a buyer saw said the
     * provider was busy when in truth somebody needed to top up an account.
     *
     * Both are terminal, and the error says which one it is, because only one
     * of the two remedies is yours to apply.
     */
    const noQuota = res.status === 429 && /limit:\s*0/.test(lastDetail);
    const noCredit = res.status === 429
      && /credits? are depleted|prepayment|billing|exceeded your current quota/i
        .test(lastDetail);
    const terminal = noQuota || noCredit;

    if (!RETRYABLE.has(res.status) || terminal || attempt === MAX_ATTEMPTS) {
      throw new Error(
        `Gemini ${res.status}` +
        (noCredit
          ? " (OUT OF CREDIT: the key is valid and the project's balance is spent. " +
            "Retrying will not help; top up the project)"
          : noQuota
            ? " (no free quota for this model)"
            : "") +
        `: ${lastDetail.slice(0, 500)}`,
      );
    }

    // Honour the provider's own retry hint when it gives one.
    //
    // Gemini's free tier is rate-limited per minute and its 429 says "Please
    // retry in 43.3s". Exponential backoff from 1s gives up long before that
    // and reports a quota error as if it were permanent, which reads as the
    // product being broken. The hint is the provider telling us exactly how
    // long to wait, so use it.
    const hinted = lastDetail.match(/retry in ([\d.]+)s/i);
    const waitMs = hinted
      ? Math.min(Number(hinted[1]) * 1000 + 1500, 70_000)
      : 1000 * 2 ** (attempt - 1) + Math.random() * 400;

    // Give up rather than keep someone waiting past the budget. Reported as a
    // wait we chose to stop, not as a mystery, so the message a buyer sees can
    // say the provider is busy instead of implying the tool is broken.
    const elapsed = Date.now() - started;
    if (elapsed + waitMs > budgetMs) {
      throw new Error(
        `Gemini ${res.status}: gave up after ${Math.round(elapsed / 1000)}s rather ` +
        `than wait a further ${Math.round(waitMs / 1000)}s. The provider asked us to ` +
        `retry later, which means it is rate limiting or out of quota, not that the ` +
        `request was wrong. ${lastDetail.slice(0, 300)}`,
      );
    }

    await new Promise((r) => setTimeout(r, waitMs));
  }

  const json = await res.json() as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[] };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      /** Thinking. Billed at the output rate, and previously not read. */
      thoughtsTokenCount?: number;
      cachedContentTokenCount?: number;
    };
  };

  const cand = json.candidates?.[0];
  const parts = cand?.content?.parts ?? [];

  return {
    text: parts.filter((p) => p.text).map((p) => p.text).join("\n").trim(),
    toolCalls: parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: `gemini_${i}`,
        name: p.functionCall!.name,
        input: p.functionCall!.args ?? {},
      })),
    usage: {
      input: json.usageMetadata?.promptTokenCount ?? 0,
      // Thinking is billed at the output rate and was not being counted, so
      // every figure this seam reported was an understatement. Reported inside
      // `output` because that is where it lands on the invoice, and separately
      // as `thinking` so a prompt that starts thinking too hard is visible.
      output:
        (json.usageMetadata?.candidatesTokenCount ?? 0) +
        (json.usageMetadata?.thoughtsTokenCount ?? 0),
      thinking: json.usageMetadata?.thoughtsTokenCount ?? 0,
      cacheRead: json.usageMetadata?.cachedContentTokenCount ?? 0,
    },
    // No citations feature. PDF provenance falls back to a model-reported
    // locator, which is weaker and is flagged as such in the UI.
    citations: [],
    stopReason: cand?.finishReason ?? null,
    model,
    rawAssistant: parts,
  };
}

/** For the analyst loop: a tool result, in whichever shape the provider wants. */
export function toolResultPart(
  call: ToolCall,
  result: unknown,
  isError = false,
): { role: "user"; parts: Part[]; raw: unknown } {
  if (activeProvider() === "gemini") {
    return {
      role: "user",
      parts: [],
      raw: [{
        functionResponse: {
          name: call.name,
          response: isError
            ? { error: String((result as { error?: unknown })?.error ?? result) }
            : (result as Record<string, unknown>),
        },
      }],
    };
  }
  return {
    role: "user",
    parts: [],
    raw: [{
      type: "tool_result",
      tool_use_id: call.id,
      content: JSON.stringify(result),
      is_error: isError,
    }],
  };
}
