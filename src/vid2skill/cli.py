import argparse
import sys
from pathlib import Path

from vid2skill import extractor, llm, pipeline, urls
from vid2skill.errors import SkillGenerationFailedError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="vid2skill",
        description="Turn a YouTube video into a Claude Agent Skill or a markdown summary.",
    )
    parser.add_argument("url", help="YouTube video URL (watch, youtu.be, shorts, embed, or live)")
    parser.add_argument("--mode", choices=["skill", "summary"], default="skill")
    parser.add_argument("--output-dir", type=Path, default=Path("./output"))
    parser.add_argument("--timeout", type=int, default=300, help="seconds to wait for the claude CLI")
    parser.add_argument(
        "--cookies",
        type=Path,
        default=None,
        help="Path to a cookies.txt file exported from your browser (e.g. via the "
        "'Get cookies.txt LOCALLY' extension). YouTube often blocks anonymous "
        "automated requests without this.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        path = pipeline.run(
            args.url,
            args.mode,
            args.output_dir,
            timeout=args.timeout,
            cookies_file=args.cookies,
        )
    except urls.InvalidYouTubeURLError as e:
        print(f"error: not a valid YouTube URL: {e}", file=sys.stderr)
        return 2
    except extractor.TranscriptUnavailableError as e:
        print(f"error: {e}", file=sys.stderr)
        return 3
    except llm.ClaudeCLINotFoundError as e:
        print(f"error: {e}", file=sys.stderr)
        return 4
    except llm.ClaudeCLIError as e:
        print(f"error: claude CLI call failed: {e}", file=sys.stderr)
        return 5
    except SkillGenerationFailedError as e:
        print(f"error: {e}", file=sys.stderr)
        return 6

    print(f"Wrote {args.mode} output to {path}")
    return 0
