import argparse
from pathlib import Path

from rich_argparse import RichHelpFormatter

from vid2skill import extractor, llm, pipeline, ui, urls
from vid2skill.errors import SkillGenerationFailedError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="vid2skill",
        description="Turn a YouTube video or Instagram Reel into a Claude Agent Skill or a markdown summary.",
        formatter_class=RichHelpFormatter,
    )
    parser.add_argument(
        "url",
        help="YouTube video URL (watch, youtu.be, shorts, embed, or live) or "
        "Instagram Reel/post URL (reel, reels, or p)",
    )
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
        with ui.Spinner(mode=args.mode) as spinner:
            path = pipeline.run(
                args.url,
                args.mode,
                args.output_dir,
                timeout=args.timeout,
                cookies_file=args.cookies,
                on_phase=spinner.update_phase,
            )
            elapsed = spinner.elapsed
    except urls.InvalidVideoURLError as e:
        ui.error(f"not a valid YouTube or Instagram URL: {e}")
        return 2
    except extractor.TranscriptUnavailableError as e:
        ui.error(str(e))
        return 3
    except llm.ClaudeCLINotFoundError as e:
        ui.error(str(e))
        return 4
    except llm.ClaudeCLIError as e:
        ui.error(f"claude CLI call failed: {e}")
        return 5
    except SkillGenerationFailedError as e:
        ui.error(str(e))
        return 6

    ui.success(f"Wrote {args.mode} output to {path} ({elapsed:.1f}s)")
    return 0
