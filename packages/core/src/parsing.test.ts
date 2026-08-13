import { describe, expect, it } from "vitest";
import { parseSkillMarkdown, parseSummaryMarkdown, SkillOutputError } from "./parsing.js";

const VALID_SKILL = `---
name: rate-limiting-patterns
description: "Use this skill when designing rate limiting for an API."
---

# Rate Limiting Patterns

## Overview
Covers token bucket vs sliding window approaches.
`;

describe("parseSkillMarkdown", () => {
  it("parses valid frontmatter and body", () => {
    const { frontmatter, body } = parseSkillMarkdown(VALID_SKILL);
    expect(frontmatter.name).toBe("rate-limiting-patterns");
    expect(frontmatter.description).toBe("Use this skill when designing rate limiting for an API.");
    expect(body.startsWith("# Rate Limiting Patterns")).toBe(true);
  });

  it("strips a wrapping code fence", () => {
    const fenced = "```markdown\n" + VALID_SKILL + "\n```";
    const { frontmatter } = parseSkillMarkdown(fenced);
    expect(frontmatter.name).toBe("rate-limiting-patterns");
  });

  it("raises when frontmatter is missing", () => {
    expect(() => parseSkillMarkdown("# Just a heading\n\nno frontmatter here")).toThrow(
      SkillOutputError,
    );
  });

  it("raises when description is empty", () => {
    const bad = `---\nname: some-skill\ndescription:\n---\n\nbody text\n`;
    expect(() => parseSkillMarkdown(bad)).toThrow(SkillOutputError);
  });

  it("raises when body is empty", () => {
    const bad = `---\nname: some-skill\ndescription: "does something"\n---\n`;
    expect(() => parseSkillMarkdown(bad)).toThrow(SkillOutputError);
  });
});

describe("parseSummaryMarkdown", () => {
  it("returns trimmed markdown", () => {
    expect(parseSummaryMarkdown("# Title\n\n## Summary\nsome text")).toBe(
      "# Title\n\n## Summary\nsome text",
    );
  });

  it("raises when empty", () => {
    expect(() => parseSummaryMarkdown("   ")).toThrow(SkillOutputError);
  });
});
