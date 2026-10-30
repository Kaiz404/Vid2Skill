import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptUnavailableError } from "./errors.js";
import { chunkSegments, extract, formatTimestamp } from "./transcript.js";

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
  it("returns timestamped transcript + title on success", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/youtube/transcript")) {
        expect(url).toContain("text=false");
        return jsonResponse(200, {
          content: [
            { text: "hello", offset: 0, duration: 2000 },
            { text: "world", offset: 754_000, duration: 3000 },
          ],
          lang: "en",
        });
      }
      return jsonResponse(200, { title: "A Great Video" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const video = await extract(URL, "sd-key");

    expect(video.title).toBe("A Great Video");
    expect(video.videoId).toBe("dQw4w9WgXcQ");
    expect(video.segments).toEqual([
      { start: 0, dur: 2, text: "hello" },
      { start: 754, dur: 3, text: "world" },
    ]);
    expect(video.transcriptMarkdown).toContain("[0:00] hello\n[12:34] world");
  });

  it("throws TranscriptUnavailableError on a 206 (no captions)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(206, { error: "transcript-unavailable" })),
    );

    await expect(extract(URL, "sd-key")).rejects.toThrow(TranscriptUnavailableError);
  });

  it("throws TranscriptUnavailableError when every segment is blank", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("/youtube/transcript")) {
        return jsonResponse(200, { content: [{ text: "   ", offset: 0, duration: 1000 }] });
      }
      return jsonResponse(200, { title: "A Great Video" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(extract(URL, "sd-key")).rejects.toThrow(TranscriptUnavailableError);
  });
});

describe("chunkSegments", () => {
  it("merges caption lines into ~20s chunks starting at the first line of each chunk", () => {
    const chunks = chunkSegments([
      { text: "a", offset: 1_000, duration: 4_000 },
      { text: "b\nc", offset: 6_000, duration: 4_000 },
      { text: "d", offset: 21_500, duration: 4_000 },
      { text: "", offset: 30_000, duration: 1_000 },
      { text: "e", offset: 45_000, duration: 2_000 },
    ]);

    expect(chunks).toEqual([
      { start: 1, dur: 9, text: "a b c" },
      { start: 21, dur: 4, text: "d" },
      { start: 45, dur: 2, text: "e" },
    ]);
  });
});

describe("formatTimestamp", () => {
  it("uses m:ss under an hour and h:mm:ss above", () => {
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3_725)).toBe("1:02:05");
  });
});
