import pytest

from vid2skill.urls import (
    InvalidInstagramURLError,
    InvalidVideoURLError,
    InvalidYouTubeURLError,
    detect_platform,
    extract_reel_shortcode,
    extract_video_id,
    normalize_instagram_url,
    normalize_youtube_url,
)

VIDEO_ID = "dQw4w9WgXcQ"
CANONICAL = f"https://www.youtube.com/watch?v={VIDEO_ID}"
SHORTCODE = "Cxyz1234AbC"
CANONICAL_REEL = f"https://www.instagram.com/reel/{SHORTCODE}/"


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


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.instagram.com/reel/{SHORTCODE}/",
        f"https://instagram.com/reel/{SHORTCODE}/",
        f"https://www.instagram.com/reel/{SHORTCODE}",
        f"https://www.instagram.com/reel/{SHORTCODE}/?igsh=abc123",
        f"https://www.instagram.com/reels/{SHORTCODE}/",
        f"https://www.instagram.com/p/{SHORTCODE}/",
    ],
)
def test_extract_reel_shortcode_across_url_shapes(url):
    assert extract_reel_shortcode(url) == SHORTCODE


def test_normalize_instagram_url_returns_canonical_form():
    assert normalize_instagram_url(f"https://instagram.com/reel/{SHORTCODE}") == CANONICAL_REEL


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/reel/abc123",
        "https://www.instagram.com/",
        "https://www.instagram.com/notareel/abc123",
        "not a url at all",
        "",
    ],
)
def test_invalid_instagram_urls_raise(url):
    with pytest.raises(InvalidInstagramURLError):
        extract_reel_shortcode(url)


@pytest.mark.parametrize(
    "url,platform",
    [
        (CANONICAL, "youtube"),
        (f"https://youtu.be/{VIDEO_ID}", "youtube"),
        (CANONICAL_REEL, "instagram"),
        (f"https://instagram.com/p/{SHORTCODE}/", "instagram"),
    ],
)
def test_detect_platform(url, platform):
    assert detect_platform(url) == platform


def test_detect_platform_raises_for_unsupported_host():
    with pytest.raises(InvalidVideoURLError):
        detect_platform("https://example.com/watch?v=abc")


def test_instagram_and_youtube_errors_are_video_url_errors():
    assert issubclass(InvalidYouTubeURLError, InvalidVideoURLError)
    assert issubclass(InvalidInstagramURLError, InvalidVideoURLError)
