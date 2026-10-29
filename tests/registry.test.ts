import { describe, expect, it, vi } from "vitest";
import { ListenerRegistry } from "../src/content/modules/input-tracking/registry";

const makeRegistry = () => new ListenerRegistry<object, object, string>((listener, tag) => ({ listener, tag }));

describe("ListenerRegistry", () => {
  it("decides once per listener and reuses the wrapper", () => {
    const registry = makeRegistry();
    const listener = (): void => undefined;
    const classify = vi.fn(() => "third-party");
    const first = registry.resolve(listener, classify);
    const second = registry.resolve(listener, classify);
    expect(first).not.toBe(listener);
    expect(second).toBe(first);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(registry.lookup(listener)).toBe(first);
    expect(registry.originalOf(first)).toBe(listener);
  });

  it("registers first-party listeners as-is", () => {
    const registry = makeRegistry();
    const listener = (): void => undefined;
    expect(registry.resolve(listener, () => undefined)).toBe(listener);
    expect(registry.resolve(listener, () => "third-party")).toBe(listener);
    expect(registry.originalOf(listener)).toBeUndefined();
  });

  it("looks up unknown listeners as themselves", () => {
    const registry = makeRegistry();
    const listener = { handleEvent: (): undefined => undefined };
    expect(registry.lookup(listener)).toBe(listener);
    expect(registry.originalOf(null)).toBeUndefined();
    expect(registry.originalOf(42)).toBeUndefined();
  });
});
