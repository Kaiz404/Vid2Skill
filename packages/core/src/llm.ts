import { LLMError } from "./errors.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Tried in order until one succeeds. These are the free models with Zero Data Retention
 *  endpoints, so they keep working if ZDR is switched on for the account again (every
 *  other `:free` model then 404s as a guardrail violation). They sit on shared upstream
 *  pools that 429 at busy moments; `openrouter/free` routes across whatever free models
 *  the account's privacy settings allow, so it is the widest net and goes last. */
const MODEL_CASCADE = [
  "inclusionai/ling-3.2-flash:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openrouter/free",
] as const;

/** When every model was rate-limited, wait this long and run the cascade once more. */
const RATE_LIMIT_RETRY_MS = 2_500;
const PASSES = 2;

/** One model's failure; a 429 means "busy right now", which is worth one more pass. */
class ModelError extends LLMError {
  constructor(
    message: string,
    readonly rateLimited: boolean,
  ) {
    super(message);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** OpenRouter wraps upstream failures as "Provider returned error"; the cause is in `metadata.raw`. */
function failure(model: string, status: number, payload: OpenRouterResponse): ModelError {
  const detail = payload.error?.metadata?.raw ?? payload.error?.message ?? `status ${status}`;
  return new ModelError(`${model}: ${detail}`, status === 429);
}

/**
 * Runs `attempt` against each model in the cascade until one succeeds. If every model
 * failed only because it was rate-limited, waits and makes one more pass.
 */
async function withCascade<T>(attempt: (model: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const errors: string[] = [];
  for (let pass = 0; pass < PASSES; pass++) {
    if (pass > 0) await sleep(RATE_LIMIT_RETRY_MS, signal);
    let allRateLimited = true;
    for (const model of MODEL_CASCADE) {
      try {
        return await attempt(model);
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        if (!(e instanceof ModelError && e.rateLimited)) allRateLimited = false;
        errors.push((e as Error).message);
      }
    }
    if (!allRateLimited) break;
  }
  throw new LLMError(errors.join(" | ") || "All OpenRouter models failed");
}

export interface LLMResult {
  text: string;
}

interface OpenRouterMessage {
  content?: string | null;
  reasoning?: string | null;
}

interface OpenRouterResponse {
  choices?: { message?: OpenRouterMessage }[];
  error?: { message?: string; metadata?: { raw?: string } };
}

function extractAssistantText(message: OpenRouterMessage | undefined): string {
  const content = message?.content?.trim() ?? "";
  if (content) return content;
  // Some reasoning-first models return null `content` when reasoning tokens consume the budget.
  const reasoning = message?.reasoning?.trim() ?? "";
  return reasoning;
}

async function callModel(
  model: string,
  instruction: string,
  stdinContent: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: stdinContent },
      ],
      max_tokens: 16_384,
      // Some free models emit chain-of-thought in `reasoning` and leave `content` empty otherwise.
      reasoning: { effort: "none" },
    }),
    signal,
  });

  const payload = (await res.json()) as OpenRouterResponse;

  if (!res.ok) throw failure(model, res.status, payload);

  const text = extractAssistantText(payload.choices?.[0]?.message);
  if (!text) {
    throw new LLMError(`${model}: OpenRouter returned an empty result`);
  }

  return text;
}

/**
 * Call OpenRouter's chat completions endpoint. Replaces the old `claude` CLI
 * shell-out - same role in the pipeline (instruction + transcript in, raw
 * markdown text out).
 */
export async function runLLM(
  instruction: string,
  stdinContent: string,
  apiKey: string,
  { timeoutMs = 300_000 }: { timeoutMs?: number } = {},
): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const text = await withCascade(
      (model) => callModel(model, instruction, stdinContent, apiKey, controller.signal),
      controller.signal,
    );
    return { text };
  } catch (e) {
    if (controller.signal.aborted) throw new LLMError(`OpenRouter call timed out after ${timeoutMs / 1000}s`);
    if (e instanceof LLMError) throw e;
    throw new LLMError(`Failed to reach OpenRouter: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterStreamChunk {
  choices?: { delta?: { content?: string | null } }[];
  error?: { message?: string };
}

async function* readModelStream(res: Response, model: string): AsyncGenerator<string> {
  if (!res.body) throw new LLMError(`${model}: OpenRouter returned no response body`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;

    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      // Lines starting with ":" are OpenRouter keep-alive comments.
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;

      const chunk = JSON.parse(data) as OpenRouterStreamChunk;
      if (chunk.error) throw new LLMError(`${model}: ${chunk.error.message ?? "stream error"}`);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

/**
 * Streaming counterpart to `runLLM` for interactive chat. Falls through the
 * same model cascade, but only until a model produces its first token: once
 * text has reached the caller, a mid-stream failure is surfaced, not retried.
 */
export async function* streamLLM(
  messages: ChatMessage[],
  apiKey: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const { first, stream } = await withCascade(async (model) => {
    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true, max_tokens: 16_384, reasoning: { effort: "none" } }),
        signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ModelError(`${model}: ${(e as Error).message}`, false);
    }

    if (!res.ok) {
      throw failure(model, res.status, (await res.json().catch(() => ({}))) as OpenRouterResponse);
    }

    const stream = readModelStream(res, model);
    const first = await stream.next();
    if (first.done) throw new ModelError(`${model}: OpenRouter returned an empty result`, false);
    return { first: first.value, stream };
  }, signal);

  yield first;
  yield* stream;
}
