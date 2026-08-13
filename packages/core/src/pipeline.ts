import { SkillGenerationFailedError } from "./errors.js";
import { runLLM } from "./llm.js";
import { parseSkillMarkdown, parseSummaryMarkdown, SkillOutputError } from "./parsing.js";
import { buildStdinPayload, SKILL_MODE_INSTRUCTION, SUMMARY_MODE_INSTRUCTION } from "./prompts.js";
import { resolveSkillSlug, slugify } from "./slugs.js";
import * as transcript from "./transcript.js";
import { renderSkillMarkdown, renderSummaryMarkdown } from "./writer.js";

export type Mode = "skill" | "summary";
export type OnPhase = ((phase: string) => void) | undefined;

export interface PipelineOptions {
  supadataApiKey: string;
  openrouterApiKey: string;
  timeoutMs?: number;
  onPhase?: OnPhase;
}

export interface PipelineResult {
  mode: Mode;
  slug: string;
  title: string;
  sourceUrl: string;
  /** Rendered final markdown, ready to write to disk or return as-is. */
  content: string;
}

function phase(onPhase: OnPhase, name: string): void {
  onPhase?.(name);
}

export async function run(url: string, mode: Mode, options: PipelineOptions): Promise<PipelineResult> {
  const { supadataApiKey, openrouterApiKey, timeoutMs, onPhase } = options;

  phase(onPhase, "extract");
  const video = await transcript.extract(url, supadataApiKey, onPhase);

  const stdinPayload = buildStdinPayload(video.title, video.url, video.transcriptMarkdown);
  const instruction = mode === "skill" ? SKILL_MODE_INSTRUCTION : SUMMARY_MODE_INSTRUCTION;

  phase(onPhase, "generate");
  let raw = (await runLLM(instruction, stdinPayload, openrouterApiKey, { timeoutMs })).text;

  if (mode === "skill") {
    let parsed: ReturnType<typeof parseSkillMarkdown>;
    try {
      parsed = parseSkillMarkdown(raw);
    } catch (firstErr) {
      if (!(firstErr instanceof SkillOutputError)) throw firstErr;
      const retryInstruction =
        instruction +
        `\n\nIMPORTANT: your previous attempt was malformed (${firstErr.message}). ` +
        "Re-read the instructions above and output ONLY a corrected SKILL.md " +
        "with valid YAML frontmatter.";
      phase(onPhase, "retry");
      raw = (await runLLM(retryInstruction, stdinPayload, openrouterApiKey, { timeoutMs })).text;
      try {
        parsed = parseSkillMarkdown(raw);
      } catch (secondErr) {
        if (!(secondErr instanceof SkillOutputError)) throw secondErr;
        throw new SkillGenerationFailedError(
          `model produced malformed output twice: ${secondErr.message}`,
        );
      }
    }

    const slug = resolveSkillSlug(parsed.frontmatter.name, video.title, video.videoId);
    phase(onPhase, "write");
    return {
      mode,
      slug,
      title: video.title,
      sourceUrl: video.url,
      content: renderSkillMarkdown(slug, parsed.frontmatter, parsed.body, video.url),
    };
  }

  const body = parseSummaryMarkdown(raw);
  const slug = slugify(video.title) || `summary-${video.videoId}`;
  phase(onPhase, "write");
  return {
    mode,
    slug,
    title: video.title,
    sourceUrl: video.url,
    content: renderSummaryMarkdown(body, video.url),
  };
}
