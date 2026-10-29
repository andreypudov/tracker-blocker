/**
 * Event taxonomy used by the input-tracking protection.
 *
 * Events are grouped by how much behavioural signal they leak and how much
 * legitimate functionality depends on them; the delivery policy treats each
 * group differently.
 */

/** Keystroke and text-entry events: keylogging and typing-cadence biometrics. */
export const KEYBOARD_EVENTS: ReadonlySet<string> = new Set([
  "keydown",
  "keyup",
  "keypress",
  "input",
  "beforeinput",
  "textInput",
  "compositionstart",
  "compositionupdate",
  "compositionend",
]);

/** High-frequency pointer streams: heatmaps, session replay, mouse dynamics. */
export const CONTINUOUS_POINTER_EVENTS: ReadonlySet<string> = new Set([
  "mousemove",
  "mouseover",
  "mouseout",
  "mouseenter",
  "mouseleave",
  "pointermove",
  "pointerrawupdate",
  "pointerover",
  "pointerout",
  "pointerenter",
  "pointerleave",
  "touchmove",
  "wheel",
  "mousewheel",
  "DOMMouseScroll",
  "scroll",
  "scrollend",
]);

/** Events that start a pointer gesture (press). */
export const GESTURE_START_EVENTS: ReadonlySet<string> = new Set(["mousedown", "pointerdown", "touchstart"]);

/** Events that end a pointer gesture (release or cancellation). */
export const GESTURE_END_EVENTS: ReadonlySet<string> = new Set([
  "mouseup",
  "pointerup",
  "pointercancel",
  "touchend",
  "touchcancel",
]);

/** Discrete pointer events: clicks and presses. */
export const DISCRETE_POINTER_EVENTS: ReadonlySet<string> = new Set([
  ...GESTURE_START_EVENTS,
  ...GESTURE_END_EVENTS,
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
]);

export type EventCategory = "keyboard" | "continuous-pointer" | "discrete-pointer";

export function categorize(type: string): EventCategory | undefined {
  if (KEYBOARD_EVENTS.has(type)) return "keyboard";
  if (CONTINUOUS_POINTER_EVENTS.has(type)) return "continuous-pointer";
  if (DISCRETE_POINTER_EVENTS.has(type)) return "discrete-pointer";
  return undefined;
}

export function isTrackedEvent(type: string): boolean {
  return categorize(type) !== undefined;
}

/** `on*` handler properties corresponding to tracked events. */
export const TRACKED_HANDLER_PROPERTIES: readonly string[] = [
  ...KEYBOARD_EVENTS,
  ...CONTINUOUS_POINTER_EVENTS,
  ...DISCRETE_POINTER_EVENTS,
]
  .filter((type) => type === type.toLowerCase())
  .map((type) => `on${type}`);
