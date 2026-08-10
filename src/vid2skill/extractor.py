import json
import tempfile
from dataclasses import dataclass
from pathlib import Path

import yt_dlp

from vid2skill import urls


class TranscriptUnavailableError(RuntimeError):
    """Raised when a video's transcript/metadata cannot be fetched."""


@dataclass
class VideoContent:
    video_id: str
    url: str
    title: str
    transcript_markdown: str


def _parse_json3_captions(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    lines: list[str] = []
    for event in data.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        text = "".join(seg.get("utf8", "") for seg in segs)
        text = text.replace("\n", " ").strip()
        if text:
            lines.append(text)
    return " ".join(lines)


def extract(url: str, *, cookies_file: Path | None = None) -> VideoContent:
    platform = urls.detect_platform(url)
    if platform == "instagram":
        return _extract_instagram(url, cookies_file=cookies_file)
    return _extract_youtube(url, cookies_file=cookies_file)


def _extract_youtube(url: str, *, cookies_file: Path | None) -> VideoContent:
    video_id = urls.extract_video_id(url)
    normalized = urls.normalize_youtube_url(url)

    with tempfile.TemporaryDirectory() as tmpdir:
        ydl_opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["en"],
            "subtitlesformat": "json3",
            "outtmpl": str(Path(tmpdir) / "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            # YouTube requires solving an in-page JS challenge to resolve any
            # real formats; without a JS runtime only image formats resolve
            # and yt-dlp errors out even with skip_download=True. Deno is
            # yt-dlp's default runtime but isn't installed on this machine -
            # Node.js 22+ is, so use that instead.
            "js_runtimes": {"node": {}},
        }
        if cookies_file is not None:
            ydl_opts["cookiefile"] = str(cookies_file)

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(normalized, download=True)
        except Exception as e:
            hint = (
                ""
                if cookies_file is not None
                else " (YouTube often requires an authenticated session for automated "
                "requests - pass --cookies <file exported from your browser>)"
            )
            raise TranscriptUnavailableError(f"Could not fetch {normalized}: {e}{hint}") from e

        caption_files = sorted(Path(tmpdir).glob(f"{video_id}*.json3"))
        if not caption_files:
            raise TranscriptUnavailableError(f"No captions available for {normalized}")

        transcript_text = _parse_json3_captions(caption_files[0])

    if not transcript_text.strip():
        raise TranscriptUnavailableError(f"No captions available for {normalized}")

    title = (info or {}).get("title") or video_id

    return VideoContent(
        video_id=video_id,
        url=normalized,
        title=title,
        transcript_markdown=f"### Transcript\n{transcript_text}\n",
    )


def _extract_instagram(url: str, *, cookies_file: Path | None) -> VideoContent:
    from vid2skill import transcribe

    shortcode = urls.extract_reel_shortcode(url)
    normalized = urls.normalize_instagram_url(url)

    with tempfile.TemporaryDirectory() as tmpdir:
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(Path(tmpdir) / "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            # Instagram has no caption tracks yt-dlp can pull, so we download
            # audio only and transcribe it locally with faster-whisper instead.
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
        }
        if cookies_file is not None:
            ydl_opts["cookiefile"] = str(cookies_file)

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(normalized, download=True)
        except Exception as e:
            hint = (
                ""
                if cookies_file is not None
                else " (Instagram often requires an authenticated session for automated "
                "requests - pass --cookies <file exported from your browser>)"
            )
            raise TranscriptUnavailableError(f"Could not fetch {normalized}: {e}{hint}") from e

        audio_files = sorted(Path(tmpdir).glob("*.wav"))
        if not audio_files:
            raise TranscriptUnavailableError(f"No audio could be downloaded for {normalized}")

        transcript_text = transcribe.transcribe_audio(audio_files[0])

    if not transcript_text.strip():
        raise TranscriptUnavailableError(f"Could not transcribe audio for {normalized}")

    title = (info or {}).get("title") or shortcode

    return VideoContent(
        video_id=shortcode,
        url=normalized,
        title=title,
        transcript_markdown=f"### Transcript\n{transcript_text}\n",
    )
