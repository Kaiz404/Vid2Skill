import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMError } from "./errors.js";
import { streamLLM } from "./llm.js";

function sseResponse(lines: string[]): Response {
  return new Response(lines.map((l) => `${l}\n`).join(""), { status: 200 });
}

function delta(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`;
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const piece of gen) out += piece;
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamLLM", () => {
  it("falls through to the next model when one fails before its first token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "gone" } }), { status: 404 }))
      .mockResolvedValueOnce(sseResponse([": OPENROUTER PROCESSING", "data: {\"choices\":[]}"]))
      .mockResolvedValueOnce(sseResponse([delta("Hel"), delta("lo [1:05]"), "data: [DONE]"]));
    vi.stubGlobal("fetch", fetchMock);

    const text = await collect(streamLLM([{ role: "user", content: "hi" }], "key"));

    expect(text).toBe("Hello [1:05]");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws LLMError listing every model when all fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));

    await expect(collect(streamLLM([{ role: "user", content: "hi" }], "key"))).rejects.toThrow(LLMError);
  });
});
