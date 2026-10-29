import { describe, expect, it } from "vitest";
import { classifyCaller, isTrackerUrl } from "../src/content/modules/input-tracking/classify";

const page = "www.shop.example";

describe("classifyCaller", () => {
  it("treats same-site scripts as first-party", () => {
    expect(classifyCaller(["https://static.shop.example/app.js"], page)).toBe("first-party");
    expect(classifyCaller(["https://www.shop.example/"], page)).toBe("first-party");
  });

  it("treats other sites as third-party", () => {
    expect(classifyCaller(["https://widgets.other.example/w.js"], page)).toBe("third-party");
  });

  it("skips extension frames", () => {
    expect(
      classifyCaller(["moz-extension://abc/content.js", "https://ads.other.example/a.js"], page),
    ).toBe("third-party");
  });

  it("skips library CDN frames and attributes the call to the caller", () => {
    const urls = ["https://code.jquery.com/jquery.min.js", "https://www.shop.example/main.js"];
    expect(classifyCaller(urls, page)).toBe("first-party");
  });

  it("gives the page the benefit of the doubt when nothing is attributable", () => {
    expect(classifyCaller([], page)).toBe("first-party");
    expect(classifyCaller(["https://cdn.jsdelivr.net/npm/lib.js"], page)).toBe("first-party");
  });

  it("flags known trackers anywhere in the stack", () => {
    const urls = ["https://www.shop.example/main.js", "https://static.hotjar.com/c/hotjar-1.js"];
    expect(classifyCaller(urls, page)).toBe("tracker");
  });

  it("flags self-hosted session recorders by file name", () => {
    expect(classifyCaller(["https://www.shop.example/vendor/rrweb.min.js"], page)).toBe("tracker");
    expect(classifyCaller(["https://cdn.jsdelivr.net/npm/rrweb@2/dist/rrweb.umd.cjs.js"], page)).toBe(
      "tracker",
    );
  });

  it("treats opaque script URLs as third-party", () => {
    expect(classifyCaller(["data:text/javascript,foo"], page)).toBe("third-party");
  });

  it("resolves blob: URLs to their creator's origin", () => {
    expect(classifyCaller(["blob:https://www.shop.example/0d1e"], page)).toBe("first-party");
  });

  it("handles multi-label public suffixes", () => {
    expect(classifyCaller(["https://cdn.shop.co.uk/a.js"], "www.shop.co.uk")).toBe("first-party");
    expect(classifyCaller(["https://other.co.uk/a.js"], "www.shop.co.uk")).toBe("third-party");
  });
});

describe("isTrackerUrl", () => {
  it("matches vendor hosts and sub-domains only", () => {
    expect(isTrackerUrl("https://www.clarity.ms/tag/x")).toBe(true);
    expect(isTrackerUrl("https://notclarity.ms/tag/x")).toBe(false);
  });
});
