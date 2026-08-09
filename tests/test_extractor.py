import json
from pathlib import Path

import pytest

from vid2skill import extractor
from vid2skill.extractor import TranscriptUnavailableError


def _write_json3(path: Path, texts: list[str]) -> None:
    events = [{"segs": [{"utf8": text}]} for text in texts]
    path.write_text(json.dumps({"events": events}), encoding="utf-8")


class _FakeYoutubeDL:
    """Stands in for yt_dlp.YoutubeDL; records opts and fakes the subtitle write."""

    last_opts: dict | None = None

    def __init__(self, opts):
        self.opts = opts
        _FakeYoutubeDL.last_opts = opts

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, url, download=True):
        outtmpl = self.opts["outtmpl"]
        caption_path = Path(outtmpl.replace("%(id)s", "abc12345678").replace("%(ext)s", "en.json3"))
        _write_json3(caption_path, ["Hello world.", "Second line."])
        return {"title": "A Test Video"}


class _FakeYoutubeDLNoCaptions(_FakeYoutubeDL):
    def extract_info(self, url, download=True):
        return {"title": "A Test Video"}


class _FakeYoutubeDLRaises(_FakeYoutubeDL):
    def extract_info(self, url, download=True):
        raise RuntimeError("boom")


def test_parse_json3_captions_joins_segments(tmp_path):
    path = tmp_path / "captions.json3"
    _write_json3(path, ["Hello\nworld.", "  Second line.  "])

    text = extractor._parse_json3_captions(path)

    assert text == "Hello world. Second line."


def test_extract_returns_transcript_and_title(monkeypatch):
    monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", _FakeYoutubeDL)

    content = extractor.extract("https://www.youtube.com/watch?v=abc12345678")

    assert content.video_id == "abc12345678"
    assert content.title == "A Test Video"
    assert "Hello world. Second line." in content.transcript_markdown


def test_extract_passes_node_js_runtime(monkeypatch):
    monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", _FakeYoutubeDL)

    extractor.extract("https://www.youtube.com/watch?v=abc12345678")

    assert _FakeYoutubeDL.last_opts["js_runtimes"] == {"node": {}}


def test_extract_passes_cookiefile_when_given(monkeypatch, tmp_path):
    monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", _FakeYoutubeDL)
    cookies = tmp_path / "cookies.txt"

    extractor.extract("https://www.youtube.com/watch?v=abc12345678", cookies_file=cookies)

    assert _FakeYoutubeDL.last_opts["cookiefile"] == str(cookies)


def test_extract_raises_when_no_captions_written(monkeypatch):
    monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", _FakeYoutubeDLNoCaptions)

    with pytest.raises(TranscriptUnavailableError, match="No captions available"):
        extractor.extract("https://www.youtube.com/watch?v=abc12345678")


def test_extract_wraps_ytdlp_exceptions(monkeypatch):
    monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", _FakeYoutubeDLRaises)

    with pytest.raises(TranscriptUnavailableError, match="boom"):
        extractor.extract("https://www.youtube.com/watch?v=abc12345678")


def test_extract_hints_at_cookies_flag_when_none_given(monkeypatch):
    monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", _FakeYoutubeDLRaises)

    with pytest.raises(TranscriptUnavailableError, match="--cookies"):
        extractor.extract("https://www.youtube.com/watch?v=abc12345678")


def test_extract_omits_cookies_hint_when_cookies_given(monkeypatch, tmp_path):
    monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", _FakeYoutubeDLRaises)
    cookies = tmp_path / "cookies.txt"

    with pytest.raises(TranscriptUnavailableError) as excinfo:
        extractor.extract("https://www.youtube.com/watch?v=abc12345678", cookies_file=cookies)

    assert "--cookies" not in str(excinfo.value)
