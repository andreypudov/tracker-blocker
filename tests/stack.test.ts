import { describe, expect, it } from "vitest";
import { parseStackUrls } from "../src/content/modules/input-tracking/stack";

describe("parseStackUrls", () => {
  it("parses SpiderMonkey frames, innermost first", () => {
    const stack = [
      "addEventListener@moz-extension://1234/content.js:10:5",
      "track@https://cdn.tracker.example/t.js:1:200",
      "@https://site.example/:12:3",
      "",
    ].join("\n");
    expect(parseStackUrls(stack)).toEqual([
      "moz-extension://1234/content.js",
      "https://cdn.tracker.example/t.js",
      "https://site.example/",
    ]);
  });

  it("attributes eval and Function frames to the script that created them", () => {
    const stack = [
      "@https://a.example/loader.js line 42 > eval:1:7",
      "anonymous@https://b.example/x.js line 3 > Function:2:1",
    ].join("\n");
    expect(parseStackUrls(stack)).toEqual(["https://a.example/loader.js", "https://b.example/x.js"]);
  });

  it("ignores lines without a location", () => {
    expect(parseStackUrls("Error: boom\n    at foo (bar.js:1:1)")).toEqual([]);
  });
});
