from pathlib import Path

from vid2skill import extractor, llm, parsing, prompts, slugs, writer
from vid2skill.errors import SkillGenerationFailedError


def run(
    url: str,
    mode: str,
    output_dir: Path,
    *,
    timeout: int = 300,
    cookies_file: Path | None = None,
) -> Path:
    video = extractor.extract(url, cookies_file=cookies_file)
    stdin_payload = prompts.build_stdin_payload(video.title, video.url, video.transcript_markdown)
    instruction = (
        prompts.SKILL_MODE_INSTRUCTION if mode == "skill" else prompts.SUMMARY_MODE_INSTRUCTION
    )

    raw = llm.run_claude(instruction, stdin_payload, timeout=timeout).text

    if mode == "skill":
        try:
            frontmatter, body = parsing.parse_skill_markdown(raw)
        except parsing.SkillOutputError as first_err:
            retry_instruction = (
                instruction
                + f"\n\nIMPORTANT: your previous attempt was malformed ({first_err}). "
                "Re-read the instructions above and output ONLY a corrected SKILL.md "
                "with valid YAML frontmatter."
            )
            raw = llm.run_claude(retry_instruction, stdin_payload, timeout=timeout).text
            try:
                frontmatter, body = parsing.parse_skill_markdown(raw)
            except parsing.SkillOutputError as second_err:
                debug_path = output_dir / f"{video.video_id}.raw-failure.txt"
                debug_path.parent.mkdir(parents=True, exist_ok=True)
                debug_path.write_text(raw, encoding="utf-8")
                raise SkillGenerationFailedError(
                    f"claude produced malformed output twice: {second_err}. "
                    f"Raw output saved to {debug_path}"
                ) from second_err

        slug = slugs.resolve_skill_slug(frontmatter.get("name"), video.title, video.video_id)
        return writer.write_skill(output_dir, slug, frontmatter, body, video.url)

    body = parsing.parse_summary_markdown(raw)
    slug = slugs.slugify(video.title) or f"summary-{video.video_id}"
    return writer.write_summary(output_dir, slug, body, video.url)
