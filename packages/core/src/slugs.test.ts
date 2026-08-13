import { describe, expect, it } from "vitest";
import { resolveSkillSlug, slugify } from "./slugs.js";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Rate Limiting Patterns")).toBe("rate-limiting-patterns");
  });

  it("strips punctuation", () => {
    expect(slugify("Design & Architecture: Part 1!")).toBe("design-architecture-part-1");
  });

  it("leaves already-kebab text alone", () => {
    expect(slugify("already-kebab-case")).toBe("already-kebab-case");
  });

  it("returns empty for empty/blank input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

describe("resolveSkillSlug", () => {
  it("prefers the frontmatter name", () => {
    expect(resolveSkillSlug("Custom Name", "Video Title", "abc123")).toBe("custom-name");
  });

  it("falls back to the title", () => {
    expect(resolveSkillSlug(undefined, "Video Title", "abc123")).toBe("video-title");
    expect(resolveSkillSlug("", "Video Title", "abc123")).toBe("video-title");
  });

  it("falls back to the video id", () => {
    expect(resolveSkillSlug(undefined, "", "abc123")).toBe("skill-abc123");
    expect(resolveSkillSlug("!!!", "###", "abc123")).toBe("skill-abc123");
  });
});
