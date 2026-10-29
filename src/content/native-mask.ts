/**
 * Replaces built-ins on page objects with functions that are
 * indistinguishable from the originals: same `name`, `length`,
 * `Function.prototype.toString()` output, property descriptor flags,
 * property order, no `prototype`, not constructible.
 *
 * The platform's `exportFunction` must create a *native* function in the
 * page realm (Firefox's `exportFunction` does: its forwarder prints as
 * `[native code]`). We never touch `Function.prototype.toString` itself.
 */

// Captured from the extension realm, which page scripts cannot modify.
const functionToString = Function.prototype.toString;
const { apply, defineProperty, getOwnPropertyDescriptor } = Reflect;

export type Impl = (this: unknown, ...args: unknown[]) => unknown;
export type NativeFunction = (...args: unknown[]) => unknown;

export interface MaskPlatform {
  /** Creates a native function named `atom` in the page realm forwarding to `impl`. */
  exportFunction(impl: Impl, atom: string): NativeFunction;
}

/**
 * The identifier a native function's `toString()` prints, which can differ
 * from its `name` property (accessors: `name` is "get foo").
 */
export function nativeAtom(fn: NativeFunction): string {
  const source: string = apply(functionToString, fn, []);
  const match = /^function\s*([^(]*)\(/.exec(source);
  return match?.[1]?.trim() ?? fn.name;
}

function redefineReadonly(fn: object, key: "name" | "length", value: unknown): void {
  defineProperty(fn, key, { value, writable: false, enumerable: false, configurable: true });
}

/** Exports `impl` as a function shaped exactly like `original`. */
export function mimicNative(original: NativeFunction, impl: Impl, platform: MaskPlatform): NativeFunction {
  const fn = platform.exportFunction(impl, nativeAtom(original));
  // Resolve lazy properties in their native order before redefining them.
  getOwnPropertyDescriptor(fn, "length");
  getOwnPropertyDescriptor(fn, "name");
  if (fn.length !== original.length) redefineReadonly(fn, "length", original.length);
  if (fn.name !== original.name) redefineReadonly(fn, "name", original.name);
  return fn;
}

/**
 * Replaces the method `key` on `target`. `makeImpl` receives the original
 * and returns the replacement body. Returns the original, or `undefined`
 * when `target` has no such own method.
 */
export function replaceMethod(
  target: object,
  key: string,
  makeImpl: (original: NativeFunction) => Impl,
  platform: MaskPlatform,
): NativeFunction | undefined {
  const descriptor = getOwnPropertyDescriptor(target, key);
  const original: unknown = descriptor?.value;
  if (descriptor === undefined || typeof original !== "function") return undefined;
  const fn = original as NativeFunction;
  defineProperty(target, key, {
    value: mimicNative(fn, makeImpl(fn), platform),
    writable: descriptor.writable ?? false,
    enumerable: descriptor.enumerable ?? false,
    configurable: descriptor.configurable ?? false,
  });
  return fn;
}

export interface AccessorFactories {
  get?: (originalGet: NativeFunction) => Impl;
  set?: (originalSet: NativeFunction) => Impl;
}

export interface OriginalAccessor {
  get: NativeFunction | undefined;
  set: NativeFunction | undefined;
}

/** Replaces the getter and/or setter of the accessor `key` on `target`. */
export function replaceAccessor(
  target: object,
  key: string,
  factories: AccessorFactories,
  platform: MaskPlatform,
): OriginalAccessor | undefined {
  const descriptor = getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined || !("get" in descriptor) || descriptor.configurable !== true) return undefined;
  const get = descriptor.get as NativeFunction | undefined;
  const set = descriptor.set as NativeFunction | undefined;
  // An absent getter/setter is `undefined` in native descriptors too.
  defineProperty(target, key, {
    get: get !== undefined && factories.get ? mimicNative(get, factories.get(get), platform) : get,
    set: set !== undefined && factories.set ? mimicNative(set, factories.set(set), platform) : set,
    enumerable: descriptor.enumerable ?? false,
    configurable: true,
  } as PropertyDescriptor);
  return { get, set };
}
