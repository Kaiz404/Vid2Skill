import pytest

from vid2skill.parsing import SkillOutputError, parse_skill_markdown, parse_summary_markdown

VALID_SKILL = """---
name: rate-limiting-patterns
description: "Use this skill when designing rate limiting for an API."
---

# Rate Limiting Patterns

## Overview
Covers token bucket vs sliding window approaches.
"""


def test_parse_skill_markdown_valid():
    frontmatter, body = parse_skill_markdown(VALID_SKILL)
    assert frontmatter["name"] == "rate-limiting-patterns"
    assert frontmatter["description"] == "Use this skill when designing rate limiting for an API."
    assert body.startswith("# Rate Limiting Patterns")


def test_parse_skill_markdown_strips_code_fence():
    fenced = "```markdown\n" + VALID_SKILL + "\n```"
    frontmatter, body = parse_skill_markdown(fenced)
    assert frontmatter["name"] == "rate-limiting-patterns"


def test_parse_skill_markdown_missing_frontmatter_raises():
    with pytest.raises(SkillOutputError):
        parse_skill_markdown("# Just a heading\n\nno frontmatter here")


def test_parse_skill_markdown_empty_description_raises():
    bad = """---
name: some-skill
description:
---

body text
"""
    with pytest.raises(SkillOutputError):
        parse_skill_markdown(bad)


def test_parse_skill_markdown_empty_body_raises():
    bad = """---
name: some-skill
description: "does something"
---
"""
    with pytest.raises(SkillOutputError):
        parse_skill_markdown(bad)


def test_parse_summary_markdown_valid():
    assert parse_summary_markdown("# Title\n\n## Summary\nsome text") == "# Title\n\n## Summary\nsome text"


def test_parse_summary_markdown_empty_raises():
    with pytest.raises(SkillOutputError):
        parse_summary_markdown("   ")
