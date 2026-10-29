import { describe, expect, it } from "vitest";
import {
  KEYBOARD_RESOLUTION_MS,
  POINTER_RESOLUTION_MS,
  coarsenTimestamp,
  timestampResolution,
} from "../src/content/modules/input-tracking/timestamp";

describe("coarsenTimestamp", () => {
  it("floors to the resolution", () => {
    expect(coarsenTimestamp(1234.567, 100)).toBe(1200);
    expect(coarsenTimestamp(1299.999, 100)).toBe(1200);
    expect(coarsenTimestamp(31.9, 16)).toBe(16);
  });

  it("is idempotent and monotonic", () => {
    let previous = -Infinity;
    for (let t = 0; t < 500; t += 3.7) {
      const coarse = coarsenTimestamp(t, 16);
      expect(coarsenTimestamp(coarse, 16)).toBe(coarse);
      expect(coarse).toBeGreaterThanOrEqual(previous);
      expect(coarse).toBeLessThanOrEqual(t);
      previous = coarse;
    }
  });

  it("removes keystroke cadence below the resolution", () => {
    const keyDown = 10_012.4;
    const keyUp = 10_087.9;
    expect(coarsenTimestamp(keyUp, KEYBOARD_RESOLUTION_MS) - coarsenTimestamp(keyDown, KEYBOARD_RESOLUTION_MS)).toBe(0);
  });

  it("leaves values alone for non-positive resolutions and non-finite input", () => {
    expect(coarsenTimestamp(12.34, 0)).toBe(12.34);
    expect(coarsenTimestamp(Number.NaN, 16)).toBeNaN();
  });
});

describe("timestampResolution", () => {
  it("uses coarse clocks for input events only", () => {
    expect(timestampResolution("keydown")).toBe(KEYBOARD_RESOLUTION_MS);
    expect(timestampResolution("input")).toBe(KEYBOARD_RESOLUTION_MS);
    expect(timestampResolution("mousemove")).toBe(POINTER_RESOLUTION_MS);
    expect(timestampResolution("click")).toBe(POINTER_RESOLUTION_MS);
    expect(timestampResolution("animationend")).toBe(0);
    expect(timestampResolution("load")).toBe(0);
  });
});
