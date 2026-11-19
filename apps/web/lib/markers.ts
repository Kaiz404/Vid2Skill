import { resolveSegment, splitTimestamps } from "./citations";
import type { Segment } from "./session";

/** A moment the document cites, placed on the video's timeline. */
export interface Marker {
  seconds: number;
  /** The cited line's text, without markdown or timestamps. */
  label: string;
  /** The nearest heading above the line, e.g. "Key Points". */
  section?: string;
}

const HEADING_RE = /^#{1,6}\s+(.*)$/;
const MAX_LABEL_CHARS = 120;

function plainText(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[\s,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every `[m:ss]` citation in `markdown`, one marker per distinct second, sorted by time.
 * The first line to cite a moment names it; citations outside the video are dropped.
 */
export function citationMarkers(markdown: string, segments: Segment[]): Marker[] {
  const bySecond = new Map<number, Marker>();
  let section: string | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      section = heading[1]!.trim();
      continue;
    }
    const parts = splitTimestamps(line);
    const times = parts.filter((p) => typeof p !== "string");
    if (times.length === 0) continue;

    const text = plainText(parts.filter((p) => typeof p === "string").join(" "));
    const label = text.length > MAX_LABEL_CHARS ? `${text.slice(0, MAX_LABEL_CHARS - 1)}…` : text;
    for (const { seconds } of times) {
      if (bySecond.has(seconds) || !resolveSegment(segments, seconds)) continue;
      bySecond.set(seconds, { seconds, label, section });
    }
  }
  return [...bySecond.values()].sort((a, b) => a.seconds - b.seconds);
}
