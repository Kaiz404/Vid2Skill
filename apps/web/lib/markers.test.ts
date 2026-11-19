import { describe, expect, it } from "vitest";
import { citationMarkers } from "./markers";

const SEGMENTS = [
  { start: 0, dur: 30, text: "a" },
  { start: 30, dur: 30, text: "b" },
  { start: 600, dur: 30, text: "c" },
];

const SUMMARY = `# Talk

## Summary
Intro paragraph with no citations.

## Key Points
- **Caching** cut latency in half [0:45]
- Use [queues](https://example.com) over actors [10:05], see also [0:45]

## Notable Details
1. A 3x speedup on \`reads\` [0:12]
- Hallucinated moment [59:00]
`;

describe("citationMarkers", () => {
  it("turns each cited line into a marker labelled by its text and section", () => {
    expect(citationMarkers(SUMMARY, SEGMENTS)).toEqual([
      { seconds: 12, label: "A 3x speedup on reads", section: "Notable Details" },
      { seconds: 45, label: "Caching cut latency in half", section: "Key Points" },
      { seconds: 605, label: "Use queues over actors, see also", section: "Key Points" },
    ]);
  });

  it("drops citations past the end of the video", () => {
    expect(citationMarkers("- ghost [59:00]", SEGMENTS)).toEqual([]);
  });

  it("returns nothing for a document without citations", () => {
    expect(citationMarkers("---\nname: x\n---\n# Skill\n- step one", SEGMENTS)).toEqual([]);
  });
});
