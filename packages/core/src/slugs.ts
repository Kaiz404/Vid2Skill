const SLUG_RE = /[^a-z0-9]+/g;

export function slugify(text: string | undefined | null): string {
  return (text ?? "")
    .trim()
    .toLowerCase()
    .replace(SLUG_RE, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveSkillSlug(
  frontmatterName: string | undefined,
  fallbackTitle: string,
  videoId: string,
): string {
  const slug = slugify(frontmatterName ?? "") || slugify(fallbackTitle);
  return slug || `skill-${videoId}`;
}
