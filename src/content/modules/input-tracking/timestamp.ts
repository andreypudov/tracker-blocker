import { categorize } from "../../../shared/events";

/** Typing cadence is the main biometric signal, so keys get a coarse clock. */
export const KEYBOARD_RESOLUTION_MS = 100;
/** About one display frame: hides fine mouse dynamics, keeps animation math sane. */
export const POINTER_RESOLUTION_MS = 16;

/** Returns the timestamp resolution for an event type, or 0 to leave it untouched. */
export function timestampResolution(type: string): number {
  switch (categorize(type)) {
    case "keyboard":
      return KEYBOARD_RESOLUTION_MS;
    case "continuous-pointer":
    case "discrete-pointer":
      return POINTER_RESOLUTION_MS;
    case undefined:
      return 0;
  }
}

/** Floors a timestamp to a multiple of `resolution`; monotonic and idempotent. */
export function coarsenTimestamp(timestamp: number, resolution: number): number {
  if (!(resolution > 0) || !Number.isFinite(timestamp)) return timestamp;
  return Math.floor(timestamp / resolution) * resolution;
}
