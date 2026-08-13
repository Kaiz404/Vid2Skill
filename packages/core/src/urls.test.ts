import { describe, expect, it } from "vitest";
import { InvalidVideoURLError } from "./errors.js";
import { extractVideoId, normalizeYoutubeUrl } from "./urls.js";

const VIDEO_ID = "dQw4w9WgXcQ";
const CANONICAL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

describe("extractVideoId", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://www.youtube.com/watch?v=${VIDEO_ID}&t=10s`,
    `https://youtube.com/watch?v=${VIDEO_ID}`,
    `https://m.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}?si=abc123`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/live/${VIDEO_ID}`,
  ])("extracts the video id from %s", (url) => {
    expect(extractVideoId(url)).toBe(VIDEO_ID);
  });

  it.each([
    "https://example.com/not-youtube",
    "not a url at all",
    "",
    `https://www.youtube.com/watch?v=short`,
    "https://www.youtube.com/",
  ])("rejects invalid url %s", (url) => {
    expect(() => extractVideoId(url)).toThrow(InvalidVideoURLError);
  });
});

describe("normalizeYoutubeUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/live/${VIDEO_ID}`,
  ])("normalizes %s to the canonical form", (url) => {
    expect(normalizeYoutubeUrl(url)).toBe(CANONICAL);
  });
});
