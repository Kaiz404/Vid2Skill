from pathlib import Path

import pytest

from vid2skill import extractor, llm, pipeline
from vid2skill.errors import SkillGenerationFailedError

VALID_SKILL = """---
name: test-skill
description: "Use this skill when testing pipeline retry logic."
---

# Test Skill

## Overview
Body text.
"""

FAKE_VIDEO = extractor.VideoContent(
    video_id="abc12345678",
    url="https://www.youtube.com/watch?v=abc12345678",
    title="Some Video",
    transcript_markdown="### Transcript\nsome transcript text",
)


def _fake_extract(url, *, cookies_file=None):
    return FAKE_VIDEO


def test_pipeline_retries_once_on_malformed_output(monkeypatch, tmp_path):
    monkeypatch.setattr(extractor, "extract", _fake_extract)
    monkeypatch.setattr(pipeline, "extractor", extractor)

    calls = {"n": 0}

    def fake_run_claude(instruction, stdin_content, *, timeout=300):
        calls["n"] += 1
        text = "not valid frontmatter at all" if calls["n"] == 1 else VALID_SKILL
        return llm.ClaudeResult(text=text, cost_usd=0.01, session_id="s1")

    monkeypatch.setattr(pipeline.llm, "run_claude", fake_run_claude)

    output_dir = tmp_path / "output"
    path = pipeline.run("https://www.youtube.com/watch?v=abc12345678", "skill", output_dir)

    assert calls["n"] == 2
    assert path == output_dir / "test-skill" / "SKILL.md"
    assert path.exists()
    assert "test-skill" in path.read_text(encoding="utf-8")


def test_pipeline_raises_after_two_malformed_attempts(monkeypatch, tmp_path):
    monkeypatch.setattr(extractor, "extract", _fake_extract)
    monkeypatch.setattr(pipeline, "extractor", extractor)

    def fake_run_claude(instruction, stdin_content, *, timeout=300):
        return llm.ClaudeResult(text="still not valid", cost_usd=0.01, session_id="s1")

    monkeypatch.setattr(pipeline.llm, "run_claude", fake_run_claude)

    output_dir = tmp_path / "output"
    with pytest.raises(SkillGenerationFailedError):
        pipeline.run("https://www.youtube.com/watch?v=abc12345678", "skill", output_dir)

    debug_file = output_dir / "abc12345678.raw-failure.txt"
    assert debug_file.exists()
    assert debug_file.read_text(encoding="utf-8") == "still not valid"


def test_pipeline_summary_mode(monkeypatch, tmp_path):
    monkeypatch.setattr(extractor, "extract", _fake_extract)
    monkeypatch.setattr(pipeline, "extractor", extractor)

    def fake_run_claude(instruction, stdin_content, *, timeout=300):
        return llm.ClaudeResult(text="# Some Video\n\n## Summary\ntext", cost_usd=0.01, session_id="s1")

    monkeypatch.setattr(pipeline.llm, "run_claude", fake_run_claude)

    output_dir = tmp_path / "output"
    path = pipeline.run("https://www.youtube.com/watch?v=abc12345678", "summary", output_dir)

    assert path == output_dir / "some-video.md"
    assert path.exists()
