/**
 * Firefox content-script globals (Xray vision helpers). See
 * https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts
 */

interface ExportFunctionOptions {
  defineAs?: string;
  allowCrossOriginArguments?: boolean;
}

declare function exportFunction<F extends (...args: never[]) => unknown>(
  func: F,
  targetScope: object,
  options?: ExportFunctionOptions,
): F;

declare function cloneInto<T>(obj: T, targetScope: object, options?: { cloneFunctions?: boolean }): T;

declare const XPCNativeWrapper: {
  <T>(obj: T): T;
  unwrap<T>(obj: T): T;
};
