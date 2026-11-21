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
  it("falls through to the next model on a non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "gone" } }), { status: 404 }))
      .mockResolvedValueOnce(sseResponse([delta("Hel"), delta("lo [1:05]"), "data: [DONE]"]));
    vi.stubGlobal("fetch", fetchMock);

    const text = await collect(streamLLM([{ role: "user", content: "hi" }], "key"));

    expect(text).toBe("Hello [1:05]");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls through to the next model when a stream ends before its first token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse([": OPENROUTER PROCESSING", "data: {\"choices\":[]}"]))
      .mockResolvedValueOnce(sseResponse([delta("Hel"), delta("lo [1:05]"), "data: [DONE]"]));
    vi.stubGlobal("fetch", fetchMock);

    const text = await collect(streamLLM([{ role: "user", content: "hi" }], "key"));

    expect(text).toBe("Hello [1:05]");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws LLMError listing every model when all fail", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(collect(streamLLM([{ role: "user", content: "hi" }], "key"))).rejects.toThrow(LLMError);
    // A hard failure isn't "busy right now", so there's no second pass.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retries the cascade once when every model was rate-limited", async () => {
    vi.useFakeTimers();
    try {
      const busy = () =>
        new Response(
          JSON.stringify({ error: { message: "Provider returned error", metadata: { raw: "rate-limited upstream" } } }),
          { status: 429 },
        );
      const fetchMock = vi.fn(async () => busy());
      for (let i = 0; i < 4; i++) fetchMock.mockResolvedValueOnce(busy());
      fetchMock.mockResolvedValueOnce(sseResponse([delta("ok"), "data: [DONE]"]));
      vi.stubGlobal("fetch", fetchMock);

      const result = collect(streamLLM([{ role: "user", content: "hi" }], "key"));
      await vi.advanceTimersByTimeAsync(3_000);

      expect(await result).toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("names the upstream cause when the retry pass is still rate-limited", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ error: { message: "Provider returned error", metadata: { raw: "rpm_limit_exceeded" } } }), {
              status: 429,
            }),
        ),
      );
      const result = collect(streamLLM([{ role: "user", content: "hi" }], "key"));
      const assertion = expect(result).rejects.toThrow(/rpm_limit_exceeded/);
      await vi.advanceTimersByTimeAsync(3_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
