import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptUnavailableError } from "./errors.js";
import { extract } from "./transcript.js";

const URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transcript.extract", () => {
  it("returns transcript + title on success", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/youtube/transcript")) {
        return jsonResponse(200, { content: "hello world", lang: "en" });
      }
      return jsonResponse(200, { title: "A Great Video" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const video = await extract(URL, "sd-key");

    expect(video.title).toBe("A Great Video");
    expect(video.transcriptMarkdown).toContain("hello world");
    expect(video.videoId).toBe("dQw4w9WgXcQ");
  });

  it("throws TranscriptUnavailableError on a 206 (no captions)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(206, { error: "transcript-unavailable" })),
    );

    await expect(extract(URL, "sd-key")).rejects.toThrow(TranscriptUnavailableError);
  });

  it("throws TranscriptUnavailableError when transcript content is blank", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/youtube/transcript")) {
        return jsonResponse(200, { content: "   " });
      }
      return jsonResponse(200, { title: "A Great Video" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(extract(URL, "sd-key")).rejects.toThrow(TranscriptUnavailableError);
  });
});
