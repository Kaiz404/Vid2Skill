import re
from urllib.parse import parse_qs, urlparse

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

_YOUTUBE_HOSTS = {
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
}


class InvalidYouTubeURLError(ValueError):
    """Raised when a URL cannot be parsed as a YouTube video URL."""


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
