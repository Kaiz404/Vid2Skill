import pytest

from vid2skill.urls import InvalidYouTubeURLError, extract_video_id, normalize_youtube_url

VIDEO_ID = "dQw4w9WgXcQ"
CANONICAL = f"https://www.youtube.com/watch?v={VIDEO_ID}"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VIDEO_ID}",
        f"https://www.youtube.com/watch?v={VIDEO_ID}&t=10s",
        f"https://youtube.com/watch?v={VIDEO_ID}",
        f"https://m.youtube.com/watch?v={VIDEO_ID}",
        f"https://youtu.be/{VIDEO_ID}",
        f"https://youtu.be/{VIDEO_ID}?si=abc123",
        f"https://www.youtube.com/shorts/{VIDEO_ID}",
        f"https://www.youtube.com/embed/{VIDEO_ID}",
        f"https://www.youtube.com/live/{VIDEO_ID}",
    ],
)
def test_extract_video_id_across_url_shapes(url):
    assert extract_video_id(url) == VIDEO_ID


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VIDEO_ID}",
        f"https://youtu.be/{VIDEO_ID}",
        f"https://www.youtube.com/shorts/{VIDEO_ID}",
        f"https://www.youtube.com/embed/{VIDEO_ID}",
        f"https://www.youtube.com/live/{VIDEO_ID}",
    ],
)
def test_normalize_youtube_url_returns_canonical_form(url):
    assert normalize_youtube_url(url) == CANONICAL


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/not-youtube",
        "not a url at all",
        "",
        "https://www.youtube.com/watch?v=short",
        "https://www.youtube.com/",
    ],
)
def test_invalid_urls_raise(url):
    with pytest.raises(InvalidYouTubeURLError):
        extract_video_id(url)
