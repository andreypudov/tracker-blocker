import { GESTURE_START_EVENTS } from "../../../shared/events";

const RELEASE_EVENTS = ["mouseup", "pointerup", "pointercancel", "touchend", "touchcancel", "dragend", "drop"];

export interface GestureTracker {
  readonly active: boolean;
}

/**
 * Tracks whether a pointer button / touch is held down, using listeners
 * registered through Xray from the isolated world: they are invisible to
 * the page and run before page listeners on `window` (capture phase).
 *
 * Release is applied after the current dispatch so page listeners for the
 * releasing event itself still observe an active gesture.
 */
export function trackGestures(win: Window): GestureTracker {
  const tracker = { active: false };
  const options = { capture: true, passive: true };
  const press = (): void => {
    tracker.active = true;
  };
  const release = (event: Event): void => {
    const touches = (event as TouchEvent).touches as TouchList | undefined;
    if (touches !== undefined && touches.length > 0) return;
    setTimeout(() => {
      tracker.active = false;
    }, 0);
  };
  for (const type of GESTURE_START_EVENTS) win.addEventListener(type, press, options);
  for (const type of RELEASE_EVENTS) win.addEventListener(type, release, options);
  // Bubble phase: element blurs don't bubble, so only the window's own blur ends a gesture.
  win.addEventListener("blur", release, { passive: true });
  return tracker;
}
