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
