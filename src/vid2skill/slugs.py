import re

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    slug = _SLUG_RE.sub("-", (text or "").strip().lower()).strip("-")
    return slug


def resolve_skill_slug(frontmatter_name: str | None, fallback_title: str, video_id: str) -> str:
    slug = slugify(frontmatter_name or "") or slugify(fallback_title)
    return slug if slug else f"skill-{video_id}"
