import type { Segment } from "./session";

const TIMESTAMP_RE = /\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g;

/** Citations past the transcript's end by more than this are treated as hallucinated. */
const END_TOLERANCE_SECONDS = 5;

export type TextPart = string | { seconds: number; label: string };

export function splitTimestamps(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(TIMESTAMP_RE)) {
    const [whole, h, m, s] = match;
    const seconds = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ seconds, label: whole.slice(1, -1) });
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The transcript chunk a citation points into, or undefined if the time is outside the video. */
export function resolveSegment(segments: Segment[], seconds: number): Segment | undefined {
  const lastSeg = segments.at(-1);
  if (!lastSeg || seconds > lastSeg.start + lastSeg.dur + END_TOLERANCE_SECONDS) return undefined;
  let found: Segment | undefined;
  for (const seg of segments) {
    if (seg.start > seconds) break;
    found = seg;
  }
  return found ?? segments[0];
}

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const SKIP_TYPES = new Set(["code", "inlineCode", "link", "linkReference"]);

function transform(node: MdNode): void {
  if (!node.children || SKIP_TYPES.has(node.type)) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type !== "text" || !child.value) {
      transform(child);
      next.push(child);
      continue;
    }
    for (const part of splitTimestamps(child.value)) {
      next.push(
        typeof part === "string"
          ? { type: "text", value: part }
          : {
              type: "timestamp",
              children: [{ type: "text", value: part.label }],
              data: { hName: "cite", hProperties: { dataSeconds: part.seconds } },
            },
      );
    }
  }
  node.children = next;
}

/** Remark plugin: turns `[m:ss]` / `[h:mm:ss]` in prose into `<cite data-seconds>` elements. */
export function remarkTimestamps() {
  return (tree: MdNode) => transform(tree);
}
