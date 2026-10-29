import { describe, expect, it } from "vitest";
import { type DeliveryContext, shouldDeliver } from "../src/content/modules/input-tracking/policy";

const base: DeliveryContext = {
  caller: "third-party",
  type: "mousemove",
  isTrusted: true,
  targetKind: "global",
  editableTarget: false,
  gestureActive: false,
};
const check = (overrides: Partial<DeliveryContext>): boolean => shouldDeliver({ ...base, ...overrides });

describe("shouldDeliver", () => {
  it("always delivers to first-party listeners", () => {
    expect(check({ caller: "first-party" })).toBe(true);
    expect(check({ caller: "first-party", type: "keydown", editableTarget: true })).toBe(true);
  });

  it("always delivers synthetic events", () => {
    expect(check({ isTrusted: false })).toBe(true);
    expect(check({ caller: "tracker", isTrusted: false })).toBe(true);
  });

  it("delivers untracked event types", () => {
    expect(check({ type: "load" })).toBe(true);
    expect(check({ caller: "tracker", type: "resize" })).toBe(true);
  });

  it("blocks every tracked event for known trackers", () => {
    for (const type of ["mousemove", "click", "keydown", "input", "scroll", "touchstart"]) {
      expect(check({ caller: "tracker", type, targetKind: "element" })).toBe(false);
    }
  });

  it("blocks page-wide pointer streams but keeps element listeners working", () => {
    expect(check({ type: "mousemove" })).toBe(false);
    expect(check({ type: "wheel" })).toBe(false);
    expect(check({ type: "mousemove", targetKind: "element" })).toBe(true);
  });

  it("delivers page-wide pointer streams during a drag gesture", () => {
    expect(check({ type: "pointermove", gestureActive: true })).toBe(true);
    expect(check({ type: "mouseup", gestureActive: true })).toBe(true);
    expect(check({ type: "mousedown", gestureActive: true })).toBe(false);
    expect(check({ type: "click", gestureActive: true })).toBe(false);
  });

  it("blocks page-wide clicks, keeps clicks on elements", () => {
    expect(check({ type: "click" })).toBe(false);
    expect(check({ type: "click", targetKind: "element" })).toBe(true);
  });

  it("blocks typing into fields, keeps keyboard shortcuts", () => {
    expect(check({ type: "keydown", editableTarget: true })).toBe(false);
    expect(check({ type: "input", editableTarget: true, targetKind: "element" })).toBe(false);
    expect(check({ type: "keydown", editableTarget: false })).toBe(true);
  });
});
