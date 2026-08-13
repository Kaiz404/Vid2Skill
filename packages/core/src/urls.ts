import { InvalidVideoURLError } from "./errors.js";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com"]);

/**
 * Extract the 11-char video ID from any common YouTube URL shape:
 * watch?v=<id>, youtu.be/<id>, /shorts/<id>, /embed/<id>, /live/<id>.
 */
export function extractVideoId(rawUrl: string): string {
  const url = (rawUrl ?? "").trim();
  if (!url) {
    throw new InvalidVideoURLError("empty URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidVideoURLError(`not a valid URL: ${url}`);
  }

  const host = parsed.hostname.toLowerCase();
  let videoId = "";

  if (host === "youtu.be") {
    videoId = parsed.pathname.replace(/^\//, "").split("/")[0] ?? "";
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v") ?? "";
    } else {
      for (const prefix of ["/shorts/", "/embed/", "/live/"]) {
        if (parsed.pathname.startsWith(prefix)) {
          videoId = parsed.pathname.slice(prefix.length).split("/")[0] ?? "";
          break;
        }
      }
    }
  } else {
    throw new InvalidVideoURLError(`not a YouTube URL: ${url}`);
  }

  if (!VIDEO_ID_RE.test(videoId)) {
    throw new InvalidVideoURLError(`could not extract a valid video ID from: ${url}`);
  }

  return videoId;
}

/** Return the canonical 'https://www.youtube.com/watch?v=<id>' form. */
export function normalizeYoutubeUrl(url: string): string {
  return `https://www.youtube.com/watch?v=${extractVideoId(url)}`;
}
