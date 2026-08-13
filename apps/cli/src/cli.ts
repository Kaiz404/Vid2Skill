import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  InvalidVideoURLError,
  LLMError,
  SkillGenerationFailedError,
  TranscriptUnavailableError,
  pipeline,
  type Mode,
} from "@vid2skill/core";
import { Command } from "commander";
import * as ui from "./ui.js";

interface CliOptions {
  mode: Mode;
  outputDir: string;
  timeout: number;
}

function buildProgram(): Command {
  return new Command()
    .name("vid2skill")
    .description("Turn a YouTube video into a Claude Agent Skill or a markdown summary.")
    .argument("<url>", "YouTube video URL (watch, youtu.be, shorts, embed, or live)")
    .option("--mode <mode>", "skill or summary", "skill")
    .option("--output-dir <dir>", "directory to write output into", "./output")
    .option("--timeout <seconds>", "seconds to wait for the LLM call", (v) => parseInt(v, 10), 300);
}

export async function main(argv: string[] = process.argv): Promise<number> {
  const program = buildProgram();
  program.parse(argv);
  const url = program.args[0]!;
  const opts = program.opts<{ mode: string; outputDir: string; timeout: number }>();

  if (opts.mode !== "skill" && opts.mode !== "summary") {
    ui.error(`--mode must be "skill" or "summary", got: ${opts.mode}`);
    return 2;
  }
  const options: CliOptions = { mode: opts.mode, outputDir: opts.outputDir, timeout: opts.timeout };

  const supadataApiKey = process.env.SUPADATA_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!supadataApiKey || !openrouterApiKey) {
    ui.error(
      "missing SUPADATA_API_KEY and/or OPENROUTER_API_KEY. Set them as environment variables " +
        "(or in a .env file in the current directory).",
    );
    return 4;
  }

  const spinner = new ui.Spinner(options.mode).begin();
  try {
    const result = await pipeline.run(url, options.mode, {
      supadataApiKey,
      openrouterApiKey,
      timeoutMs: options.timeout * 1000,
      onPhase: spinner.updatePhase,
    });

    const outPath =
      options.mode === "skill"
        ? path.join(options.outputDir, result.slug, "SKILL.md")
        : path.join(options.outputDir, `${result.slug}.md`);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, result.content, "utf-8");

    const elapsed = spinner.elapsedSeconds;
    spinner.stop();
    ui.success(`Wrote ${options.mode} output to ${outPath} (${elapsed.toFixed(1)}s)`);
    return 0;
  } catch (e) {
    spinner.stop();
    if (e instanceof InvalidVideoURLError) {
      ui.error(`not a valid YouTube URL: ${e.message}`);
      return 2;
    }
    if (e instanceof TranscriptUnavailableError) {
      ui.error(e.message);
      return 3;
    }
    if (e instanceof LLMError) {
      ui.error(`LLM call failed: ${e.message}`);
      return 5;
    }
    if (e instanceof SkillGenerationFailedError) {
      ui.error(e.message);
      return 6;
    }
    throw e;
  }
}
