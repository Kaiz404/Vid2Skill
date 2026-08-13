import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillGenerationFailedError } from "./errors.js";
import * as llmModule from "./llm.js";
import * as pipeline from "./pipeline.js";
import * as transcriptModule from "./transcript.js";

vi.mock("./transcript.js");
vi.mock("./llm.js");

const FAKE_VIDEO: transcriptModule.VideoContent = {
  videoId: "abc12345678",
  url: "https://www.youtube.com/watch?v=abc12345678",
  title: "Some Video",
  transcriptMarkdown: "### Transcript\nsome transcript text",
};

const VALID_SKILL = `---
name: test-skill
description: "Use this skill when testing pipeline retry logic."
---

# Test Skill

## Overview
Body text.
`;

const OPTIONS: pipeline.PipelineOptions = {
  supadataApiKey: "sd-key",
  openrouterApiKey: "or-key",
};

beforeEach(() => {
  vi.mocked(transcriptModule.extract).mockResolvedValue(FAKE_VIDEO);
});

describe("pipeline.run (skill mode)", () => {
  it("retries once on malformed output and succeeds", async () => {
    const runLLM = vi.mocked(llmModule.runLLM);
    runLLM
      .mockResolvedValueOnce({ text: "not valid frontmatter at all" })
      .mockResolvedValueOnce({ text: VALID_SKILL });

    const result = await pipeline.run(
      "https://www.youtube.com/watch?v=abc12345678",
      "skill",
      OPTIONS,
    );

    expect(runLLM).toHaveBeenCalledTimes(2);
    expect(result.slug).toBe("test-skill");
    expect(result.content).toContain("test-skill");
  });

  it("raises after two malformed attempts", async () => {
    vi.mocked(llmModule.runLLM).mockResolvedValue({ text: "still not valid" });

    await expect(
      pipeline.run("https://www.youtube.com/watch?v=abc12345678", "skill", OPTIONS),
    ).rejects.toThrow(SkillGenerationFailedError);
  });
});

describe("pipeline.run (summary mode)", () => {
  it("returns the rendered summary", async () => {
    vi.mocked(llmModule.runLLM).mockResolvedValue({ text: "# Some Video\n\n## Summary\ntext" });

    const result = await pipeline.run(
      "https://www.youtube.com/watch?v=abc12345678",
      "summary",
      OPTIONS,
    );

    expect(result.slug).toBe("some-video");
    expect(result.content).toContain("# Some Video");
  });
});
