import { GESTURE_END_EVENTS, categorize } from "../../../shared/events";
import type { CallerKind } from "./classify";

/** Where a listener is attached, from a surveillance point of view. */
export type TargetKind = "global" | "element";

export interface DeliveryContext {
  caller: CallerKind;
  type: string;
  isTrusted: boolean;
  /** `global` for window, document, <html> and <body>. */
  targetKind: TargetKind;
  /** The event originates from a text field or contenteditable. */
  editableTarget: boolean;
  /** A pointer button or touch is currently held down. */
  gestureActive: boolean;
}

/**
 * Decides whether a (wrapped) listener should see an event.
 *
 * The balanced default for third-party scripts:
 * - typing into editable fields is never delivered (keylogging, cadence);
 *   key presses elsewhere are, so third-party keyboard shortcuts still work;
 * - pointer streams and clicks on window/document/html/body are delivered
 *   only while a drag gesture is in progress (and its release), which keeps
 *   drag-and-drop working while defeating page-wide mouse recording;
 * - listeners on specific elements (widgets, maps, buttons) keep working.
 *
 * Known trackers receive no trusted input events at all. Synthetic events
 * (`isTrusted === false`) always pass: they carry no user behaviour.
 */
export function shouldDeliver(ctx: DeliveryContext): boolean {
  if (!ctx.isTrusted || ctx.caller === "first-party") return true;
  const category = categorize(ctx.type);
  if (category === undefined) return true;
  if (ctx.caller === "tracker") return false;

  switch (category) {
    case "keyboard":
      return !ctx.editableTarget;
    case "continuous-pointer":
      return ctx.targetKind === "element" || ctx.gestureActive;
    case "discrete-pointer":
      return ctx.targetKind === "element" || (ctx.gestureActive && GESTURE_END_EVENTS.has(ctx.type));
  }
}
