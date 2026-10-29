import { describe, expect, it } from "vitest";
import { type MaskPlatform, mimicNative, nativeAtom, replaceAccessor, replaceMethod } from "../src/content/native-mask";
import { testPlatform } from "./helpers/fake-dom";

const platform: MaskPlatform = testPlatform();

describe("nativeAtom", () => {
  it("reads the identifier printed by toString()", () => {
    expect(nativeAtom(Array.prototype.push as never)).toBe("push");
    const getter = Object.getOwnPropertyDescriptor(Map.prototype, "size")?.get;
    expect(getter && nativeAtom(getter as never)).toMatch(/size$/);
  });
});

describe("mimicNative", () => {
  it("copies name and length and exposes only native own keys", () => {
    const original = EventTarget.prototype.addEventListener as never;
    const fn = mimicNative(original, () => undefined, platform);
    expect(fn.name).toBe("addEventListener");
    expect(fn.length).toBe(2);
    expect(Reflect.ownKeys(fn)).toEqual(Reflect.ownKeys(original));
    expect(Object.getOwnPropertyDescriptor(fn, "length")).toEqual(Object.getOwnPropertyDescriptor(original, "length"));
    expect(Object.getOwnPropertyDescriptor(fn, "name")).toEqual(Object.getOwnPropertyDescriptor(original, "name"));
    expect("prototype" in fn).toBe(false);
    expect(() => Reflect.construct(fn, [])).toThrow(TypeError);
  });

  it("never patches Function.prototype.toString", () => {
    const before = Function.prototype.toString;
    mimicNative(Array.prototype.push as never, () => undefined, platform);
    expect(Function.prototype.toString).toBe(before);
    expect(Object.prototype.hasOwnProperty.call(Function.prototype.toString, "call")).toBe(false);
  });
});

describe("replaceMethod", () => {
  it("keeps descriptor flags, key order and forwards this/arguments", () => {
    class Target {
      first(): string {
        return "first";
      }
      method(a: number, b: number): number {
        return a + b;
      }
      last(): string {
        return "last";
      }
    }
    const proto = Target.prototype as unknown as Record<string, unknown>;
    const keysBefore = Reflect.ownKeys(proto);
    const descriptorBefore = Object.getOwnPropertyDescriptor(proto, "method");
    const original = replaceMethod(
      proto,
      "method",
      (orig) =>
        function (this: unknown, ...args: unknown[]) {
          return (Reflect.apply(orig, this, args) as number) * 10;
        },
      platform,
    );
    expect(original).toBe(descriptorBefore?.value);
    expect(Reflect.ownKeys(proto)).toEqual(keysBefore);
    const after = Object.getOwnPropertyDescriptor(proto, "method");
    expect({ ...after, value: undefined }).toEqual({ ...descriptorBefore, value: undefined });
    expect((after?.value as { length: number }).length).toBe(2);
    expect(new Target().method(1, 2)).toBe(30);
  });

  it("returns undefined for missing or non-function properties", () => {
    expect(replaceMethod({ x: 1 }, "x", () => () => 0, platform)).toBeUndefined();
    expect(replaceMethod({}, "missing", () => () => 0, platform)).toBeUndefined();
  });
});

describe("replaceAccessor", () => {
  it("replaces the getter only and keeps the setter and flags", () => {
    let stored = 1;
    const target = {};
    Object.defineProperty(target, "value", {
      get() {
        return stored;
      },
      set(v: number) {
        stored = v;
      },
      enumerable: true,
      configurable: true,
    });
    const before = Object.getOwnPropertyDescriptor(target, "value");
    replaceAccessor(
      target,
      "value",
      { get: (orig) => function (this: unknown) { return (Reflect.apply(orig, this, []) as number) + 100; } },
      platform,
    );
    const after = Object.getOwnPropertyDescriptor(target, "value");
    expect(after?.set).toBe(before?.set);
    expect(after?.get?.name).toBe(before?.get?.name);
    expect(after?.enumerable).toBe(true);
    expect((target as { value: number }).value).toBe(101);
    (target as { value: number }).value = 5;
    expect((target as { value: number }).value).toBe(105);
  });

  it("refuses non-configurable or data properties", () => {
    const target = Object.defineProperty({}, "fixed", { get: () => 1, configurable: false });
    expect(replaceAccessor(target, "fixed", { get: () => () => 2 }, platform)).toBeUndefined();
    expect(replaceAccessor({ data: 1 }, "data", { get: () => () => 2 }, platform)).toBeUndefined();
  });
});
