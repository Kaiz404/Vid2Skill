from vid2skill.slugs import resolve_skill_slug, slugify


def test_slugify_basic():
    assert slugify("Rate Limiting Patterns") == "rate-limiting-patterns"


def test_slugify_strips_punctuation():
    assert slugify("Design & Architecture: Part 1!") == "design-architecture-part-1"


def test_slugify_already_kebab():
    assert slugify("already-kebab-case") == "already-kebab-case"


def test_slugify_empty_returns_empty():
    assert slugify("") == ""
    assert slugify("   ") == ""


def test_resolve_skill_slug_prefers_frontmatter_name():
    assert resolve_skill_slug("Custom Name", "Video Title", "abc123") == "custom-name"


def test_resolve_skill_slug_falls_back_to_title():
    assert resolve_skill_slug(None, "Video Title", "abc123") == "video-title"
    assert resolve_skill_slug("", "Video Title", "abc123") == "video-title"


def test_resolve_skill_slug_falls_back_to_video_id():
    assert resolve_skill_slug(None, "", "abc123") == "skill-abc123"
    assert resolve_skill_slug("!!!", "###", "abc123") == "skill-abc123"
