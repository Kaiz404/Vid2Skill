import re
from urllib.parse import parse_qs, urlparse

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

_YOUTUBE_HOSTS = {
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
}

_INSTAGRAM_HOSTS = {
    "www.instagram.com",
    "instagram.com",
}

_INSTAGRAM_SHORTCODE_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_INSTAGRAM_PATH_PREFIXES = ("reel", "reels", "p")


class InvalidVideoURLError(ValueError):
    """Base class for URL validation errors across all supported platforms."""


class InvalidYouTubeURLError(InvalidVideoURLError):
    """Raised when a URL cannot be parsed as a YouTube video URL."""


class InvalidInstagramURLError(InvalidVideoURLError):
    """Raised when a URL cannot be parsed as an Instagram Reel/post URL."""


def extract_video_id(url: str) -> str:
    """Extract the 11-char video ID from any common YouTube URL shape:
    watch?v=<id>, youtu.be/<id>, /shorts/<id>, /embed/<id>, /live/<id>.
    """
    url = (url or "").strip()
    if not url:
        raise InvalidYouTubeURLError("empty URL")

    parsed = urlparse(url)
    host = parsed.netloc.lower()

    if host == "youtu.be":
        video_id = parsed.path.lstrip("/").split("/")[0]
    elif host in _YOUTUBE_HOSTS:
        if parsed.path == "/watch":
            qs = parse_qs(parsed.query)
            values = qs.get("v")
            video_id = values[0] if values else ""
        else:
            for prefix in ("/shorts/", "/embed/", "/live/"):
                if parsed.path.startswith(prefix):
                    video_id = parsed.path[len(prefix):].split("/")[0]
                    break
            else:
                video_id = ""
    else:
        raise InvalidYouTubeURLError(f"not a YouTube URL: {url!r}")

    if not _VIDEO_ID_RE.match(video_id):
        raise InvalidYouTubeURLError(f"could not extract a valid video ID from: {url!r}")

    return video_id


def normalize_youtube_url(url: str) -> str:
    """Return the canonical 'https://www.youtube.com/watch?v=<id>' form.

    markitdown's YouTube converter only activates for URLs that start with
    exactly 'https://www.youtube.com/watch?' - youtu.be/shorts/embed/live
    URLs are silently skipped otherwise, so every URL must be normalized
    before being passed to MarkItDown().convert().
    """
    return f"https://www.youtube.com/watch?v={extract_video_id(url)}"


def extract_reel_shortcode(url: str) -> str:
    """Extract the shortcode from an Instagram Reel/post URL shape:
    /reel/<code>, /reels/<code>, /p/<code>.
    """
    url = (url or "").strip()
    if not url:
        raise InvalidInstagramURLError("empty URL")

    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if host not in _INSTAGRAM_HOSTS:
        raise InvalidInstagramURLError(f"not an Instagram URL: {url!r}")

    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2 or parts[0] not in _INSTAGRAM_PATH_PREFIXES:
        raise InvalidInstagramURLError(f"could not extract a reel/post ID from: {url!r}")
    shortcode = parts[1]

    if not _INSTAGRAM_SHORTCODE_RE.match(shortcode):
        raise InvalidInstagramURLError(f"could not extract a valid shortcode from: {url!r}")

    return shortcode


def normalize_instagram_url(url: str) -> str:
    """Return the canonical 'https://www.instagram.com/reel/<code>/' form."""
    return f"https://www.instagram.com/reel/{extract_reel_shortcode(url)}/"


def detect_platform(url: str) -> str:
    """Return 'youtube' or 'instagram' based on the URL's host, or raise
    InvalidVideoURLError if neither platform is supported.
    """
    host = urlparse((url or "").strip()).netloc.lower()
    if host == "youtu.be" or host in _YOUTUBE_HOSTS:
        return "youtube"
    if host in _INSTAGRAM_HOSTS:
        return "instagram"
    raise InvalidVideoURLError(
        f"unsupported URL (only YouTube and Instagram are supported): {url!r}"
    )
