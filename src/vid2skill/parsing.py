import re

_FENCE_RE = re.compile(r"\A```(?:\w+)?\s*\n(.*?)\n```\s*\Z", re.DOTALL)
_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?(.*)\Z", re.DOTALL)


class SkillOutputError(ValueError):
    """Raised when the LLM's raw output does not parse into a usable artifact."""


def strip_code_fence(text: str) -> str:
    match = _FENCE_RE.match(text.strip())
    return match.group(1) if match else text


def _parse_flat_yaml(block: str) -> dict:
    fields: dict[str, str] = {}
    for line in block.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        fields[key] = value
    return fields


def parse_skill_markdown(raw: str) -> tuple[dict, str]:
    text = strip_code_fence(raw.strip())
    match = _FRONTMATTER_RE.match(text)
    if not match:
        raise SkillOutputError("missing YAML frontmatter block (no leading '---' ... '---')")

    frontmatter = _parse_flat_yaml(match.group(1))
    if not frontmatter.get("name", "").strip():
        raise SkillOutputError("frontmatter missing non-empty 'name'")
    if not frontmatter.get("description", "").strip():
        raise SkillOutputError("frontmatter missing non-empty 'description'")

    body = match.group(2).strip()
    if not body:
        raise SkillOutputError("skill body is empty")

    return frontmatter, body


def parse_summary_markdown(raw: str) -> str:
    text = strip_code_fence(raw.strip())
    if not text:
        raise SkillOutputError("summary output is empty")
    return text
