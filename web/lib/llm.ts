/**
 * Provider seam.
 *
 * The two AI loops (reading documents, answering questions) go through here so
 * the model is a configuration choice rather than something welded into the
 * app. Set LLM_PROVIDER=gemini to run on Gemini, otherwise it runs on Claude.
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
  anthropic: { main: "claude-opus-5", cheap: "claude-opus-5" },
  // Flash, reluctantly. Every Gemini Pro model returns limit: 0 on a free-tier
  // key, so Flash is the only one that will actually run without billing.
  //
  // Be clear about what that costs: Flash is a small model being asked to read
  // a photograph of a rotated table with handwritten overrides, which is the
  // hardest document in the set. Use this to prove the pipeline works, and run
  // the real demo on Claude Opus 5. Override with GEMINI_MODEL if a Pro model
  // becomes available.
  gemini: {
    main: process.env.GEMINI_MODEL || "gemini-flash-latest",
    cheap: "gemini-flash-latest",
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
  /** JSON Schema. Anthropic takes it as-is; Gemini needs it translated. */
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmResult {
  text: string;
  toolCalls: ToolCall[];
  usage: { input: number; output: number; cacheRead?: number };
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
            input_schema: t.inputSchema,
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
    },
  };

  if (req.tools?.length) {
    body.tools = [{
      functionDeclarations: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.inputSchema),
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

    // A hard quota ceiling (limit: 0) never clears by waiting.
    const hardQuota = res.status === 429 && /limit:\s*0/.test(lastDetail);

    if (!RETRYABLE.has(res.status) || hardQuota || attempt === MAX_ATTEMPTS) {
      throw new Error(
        `Gemini ${res.status}${hardQuota ? " (no free quota for this model)" : ""}: ` +
        `${lastDetail.slice(0, 500)}`,
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

    await new Promise((r) => setTimeout(r, waitMs));
  }

  const json = await res.json() as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[] };
      finishReason?: string;
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
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
      output: json.usageMetadata?.candidatesTokenCount ?? 0,
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
