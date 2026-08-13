import { TranscriptUnavailableError } from "./errors.js";
import { extractVideoId, normalizeYoutubeUrl } from "./urls.js";

export type OnPhase = ((phase: string) => void) | undefined;

export interface VideoContent {
  videoId: string;
  url: string;
  title: string;
  transcriptMarkdown: string;
}

const SUPADATA_BASE_URL = "https://api.supadata.ai/v1";

interface SupadataTranscriptResponse {
  content: string;
  lang?: string;
  availableLangs?: string[];
}

interface SupadataVideoResponse {
  title?: string;
}

function phase(onPhase: OnPhase, name: string): void {
  onPhase?.(name);
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
      text: "true",
      mode: "auto",
    });
    videoRes = await supadataGet<SupadataVideoResponse>("/youtube/video", apiKey, { id: videoId });
  } catch (e) {
    if (e instanceof TranscriptUnavailableError) throw e;
    throw new TranscriptUnavailableError(`Could not fetch ${normalized}: ${(e as Error).message}`);
  }

  const transcriptText = (transcriptRes.content ?? "").trim();
  if (!transcriptText) {
    throw new TranscriptUnavailableError(`No captions available for ${normalized}`);
  }

  const title = videoRes.title || videoId;

  return {
    videoId,
    url: normalized,
    title,
    transcriptMarkdown: `### Transcript\n${transcriptText}\n`,
  };
}
