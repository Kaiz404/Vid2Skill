import { describe, expect, it } from "vitest";
import { remarkTimestamps, resolveSegment, splitTimestamps } from "./citations";

const SEGMENTS = [
  { start: 0, dur: 18, text: "intro" },
  { start: 20, dur: 19, text: "queues" },
  { start: 3_700, dur: 10, text: "outro" },
];

describe("splitTimestamps", () => {
  it("splits m:ss and h:mm:ss citations out of prose", () => {
    expect(splitTimestamps("Queues win [55:09], [1:01:15].")).toEqual([
      "Queues win ",
      { seconds: 3_309, label: "55:09" },
      ", ",
      { seconds: 3_675, label: "1:01:15" },
      ".",
    ]);
  });

  it("leaves bracketed text that isn't a timestamp alone", () => {
    expect(splitTimestamps("see [note] and [1:2]")).toEqual(["see [note] and [1:2]"]);
  });
});

describe("resolveSegment", () => {
  it("snaps to the chunk that contains the cited time", () => {
    expect(resolveSegment(SEGMENTS, 25)?.text).toBe("queues");
    expect(resolveSegment(SEGMENTS, 20)?.text).toBe("queues");
  });

  it("rejects times past the end of the video", () => {
    expect(resolveSegment(SEGMENTS, 3_716)).toBeUndefined();
    expect(resolveSegment([], 10)).toBeUndefined();
  });
});

describe("remarkTimestamps", () => {
  it("rewrites prose timestamps into cite elements but not ones inside code", () => {
    const tree = {
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "Point [1:05]" }] },
        { type: "paragraph", children: [{ type: "inlineCode", value: "[1:05]" }] },
      ],
    };

    remarkTimestamps()(tree);

    expect(tree.children[0]!.children).toEqual([
      { type: "text", value: "Point " },
      {
        type: "timestamp",
        children: [{ type: "text", value: "1:05" }],
        data: { hName: "cite", hProperties: { dataSeconds: 65 } },
      },
    ]);
    expect(tree.children[1]!.children).toEqual([{ type: "inlineCode", value: "[1:05]" }]);
  });
});
