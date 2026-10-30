import type { Mode } from "./session";

const FENCE_RE = /^```[a-z]*\r?\n([\s\S]*?)\r?\n```\s*$/;
const TITLE_RE = /^# \S/m;

export type RevisionResult = { ok: true; content: string } | { ok: false; reason: string };

/**
 * Turns a model's edit reply into a document version, or explains why it was rejected.
 * Free models sometimes fence the document, and sometimes reply with only the section
 * they changed; accepting that would silently drop the rest of the document.
 */
export function acceptRevision(mode: Mode, current: string, raw: string): RevisionResult {
  const trimmed = raw.trim();
  const content = FENCE_RE.exec(trimmed)?.[1]?.trim() ?? trimmed;

  if (mode === "skill" && !content.startsWith("---")) {
    return { ok: false, reason: "The revision came back without skill frontmatter, so I kept the current version." };
  }
  if (TITLE_RE.test(current) && !TITLE_RE.test(content)) {
    return {
      ok: false,
      reason: "The model returned only part of the document, so I kept the current version. Try asking again.",
    };
  }
  return { ok: true, content };
}
