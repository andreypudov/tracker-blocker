import { describe, expect, it } from "vitest";
import { EMPTY_TAB_STATE, TabStateStore, formatBadge, withBlocked } from "../src/background/tab-state";
import { TRACKED_HANDLER_PROPERTIES, categorize } from "../src/shared/events";
import { isRuntimeMessage } from "../src/shared/messages";
import { isSiteEnabled, normalizeHost, readDisabledSites, withSiteEnabled } from "../src/shared/settings";
import { hostOf, siteOf } from "../src/shared/site";

describe("settings", () => {
  it("normalises hosts", () => {
    expect(normalizeHost(" WWW.Example.COM. ")).toBe("example.com");
  });

  it("toggles sites", () => {
    let sites = withSiteEnabled([], "www.a.example", false);
    expect(sites).toEqual(["a.example"]);
    expect(isSiteEnabled(sites, "a.example")).toBe(false);
    expect(isSiteEnabled(sites, "b.example")).toBe(true);
    sites = withSiteEnabled(sites, "a.example", true);
    expect(sites).toEqual([]);
  });

  it("reads untrusted storage defensively", () => {
    expect(readDisabledSites({ disabledSites: ["a", 1, null] })).toEqual(["a"]);
    expect(readDisabledSites({ disabledSites: "a" })).toEqual([]);
    expect(readDisabledSites({})).toEqual([]);
  });
});

describe("site", () => {
  it("computes registrable domains", () => {
    expect(siteOf("a.b.example.com")).toBe("example.com");
    expect(siteOf("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(siteOf("localhost")).toBe("localhost");
    expect(siteOf("127.0.0.1")).toBe("127.0.0.1");
  });

  it("extracts hosts", () => {
    expect(hostOf("https://a.example:8080/x.js")).toBe("a.example");
    expect(hostOf("blob:https://a.example/uuid")).toBe("a.example");
    expect(hostOf("data:text/javascript,1")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("events", () => {
  it("categorises event types", () => {
    expect(categorize("keydown")).toBe("keyboard");
    expect(categorize("pointermove")).toBe("continuous-pointer");
    expect(categorize("click")).toBe("discrete-pointer");
    expect(categorize("load")).toBeUndefined();
  });

  it("derives handler properties", () => {
    expect(TRACKED_HANDLER_PROPERTIES).toContain("onmousemove");
    expect(TRACKED_HANDLER_PROPERTIES).toContain("onkeydown");
    expect(TRACKED_HANDLER_PROPERTIES).not.toContain("onDOMMouseScroll");
  });
});

describe("messages", () => {
  it("validates message shapes", () => {
    expect(isRuntimeMessage({ type: "blocked", count: 1 })).toBe(true);
    expect(isRuntimeMessage({ type: "evil" })).toBe(false);
    expect(isRuntimeMessage(null)).toBe(false);
  });
});

describe("tab state", () => {
  it("formats badges", () => {
    expect(formatBadge(0)).toBe("");
    expect(formatBadge(999)).toBe("999");
    expect(formatBadge(1250)).toBe("1.2k");
    expect(formatBadge(45_000)).toBe("45k");
    expect(formatBadge(3_200_000)).toBe("3M");
  });

  it("accumulates counts without losing concurrent updates", async () => {
    const data = new Map<string, unknown>();
    const store = new TabStateStore({
      get: async (key) => {
        await Promise.resolve();
        return data.has(key) ? { [key]: data.get(key) } : {};
      },
      set: async (items) => {
        await Promise.resolve();
        for (const [key, value] of Object.entries(items)) data.set(key, value);
      },
      remove: async (key) => {
        await Promise.resolve();
        data.delete(key);
      },
    });
    await Promise.all(Array.from({ length: 20 }, () => store.update(7, (s) => withBlocked(s, 1))));
    expect((await store.get(7)).blocked).toBe(20);
    await store.remove(7);
    expect(await store.get(7)).toEqual(EMPTY_TAB_STATE);
  });
});
