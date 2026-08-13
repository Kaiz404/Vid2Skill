const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com"]);

/** Best-effort client-side video ID extraction for preview purposes (thumbnail/embed). */
export function tryExtractVideoId(rawUrl: string): string | null {
  const url = (rawUrl ?? "").trim();
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
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
    return null;
  }

  return VIDEO_ID_RE.test(videoId) ? videoId : null;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
