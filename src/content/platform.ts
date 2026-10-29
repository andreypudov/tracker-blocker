/**
 * Firefox Xray-vision platform layer.
 *
 * The content script runs in Firefox's isolated world and reaches into the
 * page through `wrappedJSObject` (Xray waivers) and `exportFunction`. This
 * gives us, compared with a `world: "MAIN"` script:
 * - stack frames of our code are hidden from page-visible `Error#stack`;
 * - the extension realm's built-ins cannot be tampered with by the page;
 * - state (counters, settings) never lives in the page realm.
 */
import type { Impl, MaskPlatform, NativeFunction } from "./native-mask";

export interface Platform extends MaskPlatform {
  /** The page realm's view of a value (Xray waived); identity for primitives. */
  waive<T>(value: T): T;
  /** An Xray view of a page object: always sees the native DOM API. */
  xray<T>(value: T): T;
  /** The current call stack as seen from the extension realm (includes page frames). */
  captureStack(): string;
}

const ExtensionError = Error;

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

export function waive<T>(value: T): T {
  return isObjectLike(value) ? XPCNativeWrapper.unwrap(value) : value;
}

export function xray<T>(value: T): T {
  return isObjectLike(value) ? XPCNativeWrapper(value) : value;
}

/** Creates the platform bound to one page realm (window). */
export function firefoxPlatform(pageWindow: Window): Platform {
  return {
    waive,
    xray,
    captureStack: () => new ExtensionError().stack ?? "",
    exportFunction(impl: Impl, atom: string): NativeFunction {
      // `defineAs` on a throw-away page object sets the function's internal
      // name, which is what `toString()` prints.
      const scratch = cloneInto({}, pageWindow);
      return waive(exportFunction<NativeFunction>(impl, scratch, { defineAs: atom }));
    },
  };
}
