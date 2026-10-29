import type { TargetKind } from "./policy";

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

/** Whether an (Xray) event target accepts typed text. */
export function isEditable(target: EventTarget | null | undefined): boolean {
  if (target === null || target === undefined) return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  switch (element.localName) {
    case "textarea":
      return true;
    case "input":
      return !NON_TEXT_INPUT_TYPES.has((element as HTMLInputElement).type);
    default:
      return false;
  }
}

/** The innermost target, looking through open shadow roots. */
export function innermostTarget(event: Event): EventTarget | null {
  return event.composedPath()[0] ?? event.target;
}

/**
 * Classifies a listener's current target. `currentTarget` must be the page
 * (waived) object; the document is read through Xray so overridden page
 * getters never run.
 */
export function targetKind(
  currentTarget: unknown,
  pageWindow: Window,
  xrayDocument: Document,
  waive: <T>(value: T) => T,
): TargetKind {
  if (currentTarget === pageWindow || currentTarget === waive(xrayDocument)) return "global";
  if (currentTarget === waive(xrayDocument.documentElement) || currentTarget === waive(xrayDocument.body)) {
    return "global";
  }
  return "element";
}
