import { LLMError } from "./errors.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export interface LLMResult {
  text: string;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
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

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: stdinContent },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new LLMError(`OpenRouter call timed out after ${timeoutMs / 1000}s`);
    }
    throw new LLMError(`Failed to reach OpenRouter: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `OpenRouter returned status ${res.status}`;
    try {
      const body = (await res.json()) as OpenRouterResponse;
      if (body.error?.message) message = body.error.message;
    } catch {
      // ignore unparsable error body
    }
    throw new LLMError(message);
  }

  const payload = (await res.json()) as OpenRouterResponse;
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new LLMError("OpenRouter returned an empty result");
  }

  return { text };
}
