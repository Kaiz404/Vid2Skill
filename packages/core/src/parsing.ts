const FENCE_RE = /^```(?:\w+)?\s*\n([\s\S]*?)\n```\s*$/;
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

export class SkillOutputError extends Error {}

export function stripCodeFence(text: string): string {
  const match = FENCE_RE.exec(text.trim());
  return match ? match[1]! : text;
}

function parseFlatYaml(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let line of block.split("\n")) {
    line = line.trim();
    if (!line || !line.includes(":")) continue;
    const idx = line.indexOf(":");
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === "'" || value[0] === '"')) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

export function parseSkillMarkdown(raw: string): { frontmatter: Record<string, string>; body: string } {
  const text = stripCodeFence(raw.trim());
  const match = FRONTMATTER_RE.exec(text);
  if (!match) {
    throw new SkillOutputError("missing YAML frontmatter block (no leading '---' ... '---')");
  }

  const frontmatter = parseFlatYaml(match[1]!);
  if (!frontmatter.name?.trim()) {
    throw new SkillOutputError("frontmatter missing non-empty 'name'");
  }
  if (!frontmatter.description?.trim()) {
    throw new SkillOutputError("frontmatter missing non-empty 'description'");
  }

  const body = match[2]!.trim();
  if (!body) {
    throw new SkillOutputError("skill body is empty");
  }

  return { frontmatter, body };
}

export function parseSummaryMarkdown(raw: string): string {
  const text = stripCodeFence(raw.trim());
  if (!text) {
    throw new SkillOutputError("summary output is empty");
  }
  return text;
}
