import { describe, expect, it } from "vitest";
import { acceptRevision } from "./revision";

const SUMMARY = "# Talk\n\n## Summary\nLong text.\n\n## Key Points\n- a [1:00]\n";

describe("acceptRevision", () => {
  it("accepts a full rewrite and strips a wrapping code fence", () => {
    const result = acceptRevision("summary", SUMMARY, "```markdown\n# Talk\n\n## Summary\nShort.\n```");
    expect(result).toEqual({ ok: true, content: "# Talk\n\n## Summary\nShort." });
  });

  it("rejects a reply that is only the edited section", () => {
    const result = acceptRevision("summary", SUMMARY, "Rich Hickey argues simple beats easy.");
    expect(result.ok).toBe(false);
  });

  it("rejects a skill revision without frontmatter", () => {
    const skill = "---\nname: x\ndescription: \"y\"\n---\n\n# X\n";
    expect(acceptRevision("skill", skill, "# X\nbody").ok).toBe(false);
    expect(acceptRevision("skill", skill, `${skill}more`).ok).toBe(true);
  });
});
