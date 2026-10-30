import { TranscriptUnavailableError } from "./errors.js";
import { extractVideoId, normalizeYoutubeUrl } from "./urls.js";

export type OnPhase = ((phase: string) => void) | undefined;

/** A transcript chunk; times are in seconds from the start of the video. */
export interface Segment {
  start: number;
  dur: number;
  text: string;
}

export interface VideoContent {
  videoId: string;
  url: string;
  title: string;
  segments: Segment[];
  transcriptMarkdown: string;
}

const SUPADATA_BASE_URL = "https://api.supadata.ai/v1";

interface SupadataSegment {
  text: string;
  offset: number;
  duration: number;
}

interface SupadataTranscriptResponse {
  content: SupadataSegment[];
  lang?: string;
  availableLangs?: string[];
}

interface SupadataVideoResponse {
  title?: string;
}

/** Caption lines are a few seconds each; merging them keeps the LLM prompt
 * compact while still giving citations ~20s resolution. */
const CHUNK_SECONDS = 20;

function phase(onPhase: OnPhase, name: string): void {
  onPhase?.(name);
}

export function chunkSegments(raw: SupadataSegment[], chunkSeconds = CHUNK_SECONDS): Segment[] {
  const chunks: Segment[] = [];
  let current: { start: number; end: number; parts: string[] } | undefined;

  for (const seg of raw) {
    const text = seg.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const start = seg.offset / 1000;
    const end = start + seg.duration / 1000;

    if (current && start - current.start < chunkSeconds) {
      current.parts.push(text);
      current.end = Math.max(current.end, end);
      continue;
    }
    if (current) chunks.push(toSegment(current));
    current = { start, end, parts: [text] };
  }
  if (current) chunks.push(toSegment(current));
  return chunks;
}

function toSegment(c: { start: number; end: number; parts: string[] }): Segment {
  return { start: Math.floor(c.start), dur: Math.round(c.end - c.start), text: c.parts.join(" ") };
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatTranscript(segments: Segment[]): string {
  return segments.map((seg) => `[${formatTimestamp(seg.start)}] ${seg.text}`).join("\n");
}

async function supadataGet<T>(path: string, apiKey: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${SUPADATA_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, { headers: { "x-api-key": apiKey } });

  if (res.status === 206) {
    throw new TranscriptUnavailableError("No transcript is available for this video");
  }
  if (!res.ok) {
    let message = `Supadata request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore unparsable error body
    }
    throw new TranscriptUnavailableError(message);
  }

  return (await res.json()) as T;
}

export async function extract(
  rawUrl: string,
  apiKey: string,
  onPhase: OnPhase = undefined,
): Promise<VideoContent> {
  const videoId = extractVideoId(rawUrl);
  const normalized = normalizeYoutubeUrl(rawUrl);

  phase(onPhase, "fetch_captions");

  // Sequential, not Promise.all: Supadata's free tier caps at 1 request/second,
  // and firing both calls at once trips that limit.
  let transcriptRes: SupadataTranscriptResponse;
  let videoRes: SupadataVideoResponse;
  try {
    transcriptRes = await supadataGet<SupadataTranscriptResponse>("/youtube/transcript", apiKey, {
      videoId,
      text: "false",
      mode: "auto",
    });
    videoRes = await supadataGet<SupadataVideoResponse>("/youtube/video", apiKey, { id: videoId });
  } catch (e) {
    if (e instanceof TranscriptUnavailableError) throw e;
    throw new TranscriptUnavailableError(`Could not fetch ${normalized}: ${(e as Error).message}`);
  }

  const segments = chunkSegments(Array.isArray(transcriptRes.content) ? transcriptRes.content : []);
  if (segments.length === 0) {
    throw new TranscriptUnavailableError(`No captions available for ${normalized}`);
  }

  const title = videoRes.title || videoId;

  return {
    videoId,
    url: normalized,
    title,
    segments,
    transcriptMarkdown: `### Transcript\n${formatTranscript(segments)}\n`,
  };
}
