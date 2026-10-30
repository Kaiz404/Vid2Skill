import { LLMError } from "./errors.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Tried in order until one succeeds. The old default (`nemotron-3-super`) has been
 *  intermittently 404 from NVIDIA's OpenRouter provider since early 2026. */
const MODEL_CASCADE = [
  "nvidia/nemotron-3-ultra-550b-a55b:free", 
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3.5-lightning:free",
  "openrouter/free",
] as const;

export interface LLMResult {
  text: string;
}

interface OpenRouterMessage {
  content?: string | null;
  reasoning?: string | null;
}

interface OpenRouterResponse {
  choices?: { message?: OpenRouterMessage }[];
  error?: { message?: string };
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
      // Nemotron free models often emit chain-of-thought in `reasoning` and leave `content` empty.
      reasoning: { effort: "none" },
    }),
    signal,
  });

  const payload = (await res.json()) as OpenRouterResponse;

  if (!res.ok) {
    const message = payload.error?.message ?? `OpenRouter returned status ${res.status}`;
    throw new LLMError(`${model}: ${message}`);
  }

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

  const errors: string[] = [];

  try {
    for (const model of MODEL_CASCADE) {
      try {
        const text = await callModel(model, instruction, stdinContent, apiKey, controller.signal);
        return { text };
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          throw new LLMError(`OpenRouter call timed out after ${timeoutMs / 1000}s`);
        }
        errors.push((e as Error).message);
      }
    }
  } catch (e) {
    if (e instanceof LLMError) throw e;
    throw new LLMError(`Failed to reach OpenRouter: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  throw new LLMError(errors.join(" | ") || "All OpenRouter models failed");
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
  const errors: string[] = [];

  for (const model of MODEL_CASCADE) {
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
      errors.push(`${model}: ${(e as Error).message}`);
      continue;
    }

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as OpenRouterResponse;
      errors.push(`${model}: ${payload.error?.message ?? `status ${res.status}`}`);
      continue;
    }

    const stream = readModelStream(res, model);
    let first: IteratorResult<string>;
    try {
      first = await stream.next();
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      errors.push((e as Error).message);
      continue;
    }
    if (first.done) {
      errors.push(`${model}: OpenRouter returned an empty result`);
      continue;
    }

    yield first.value;
    yield* stream;
    return;
  }

  throw new LLMError(errors.join(" | ") || "All OpenRouter models failed");
}
