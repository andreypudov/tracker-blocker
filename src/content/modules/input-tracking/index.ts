/**
 * Mouse & keyboard tracking protection.
 *
 * Hooks `EventTarget.prototype.addEventListener/removeEventListener`, the
 * tracked `on*` handler properties and `Event.prototype.timeStamp`.
 * Listeners registered by third-party (or known tracker) scripts for tracked
 * event types are registered through a wrapper that drops the trusted
 * events the delivery policy forbids; first-party listeners are registered
 * untouched.
 */
import { KEYBOARD_EVENTS, TRACKED_HANDLER_PROPERTIES, isTrackedEvent } from "../../../shared/events";
import { type Impl, type NativeFunction, replaceAccessor, replaceMethod } from "../../native-mask";
import type { ProtectionModule, RealmContext } from "../types";
import { type CallerKind, classifyCaller } from "./classify";
import { innermostTarget, isEditable, targetKind } from "./dom";
import { trackGestures } from "./gesture";
import { shouldDeliver } from "./policy";
import { ListenerRegistry } from "./registry";
import { parseStackUrls } from "./stack";
import { coarsenTimestamp, timestampResolution } from "./timestamp";

const { apply, getOwnPropertyDescriptor } = Reflect;

type PageObject = object;

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/** Prototype of a page interface, looked up through Xray so page shadowing can't interfere. */
function pagePrototype(realm: RealmContext, name: string): PageObject | undefined {
  const ctor: unknown = (realm.window as unknown as Record<string, unknown>)[name];
  if (typeof ctor !== "function") return undefined;
  return realm.platform.waive(ctor).prototype as PageObject;
}

function protect(realm: RealmContext): void {
  const { platform, state, pageWindow } = realm;
  const gesture = trackGestures(realm.window);

  const classifyNow = (): CallerKind | undefined => {
    const kind = classifyCaller(parseStackUrls(platform.captureStack()), realm.pageHost);
    return kind === "first-party" ? undefined : kind;
  };

  const deliver = (eventArg: unknown, caller: CallerKind): boolean => {
    try {
      const event = platform.xray(eventArg) as Event;
      const type = event.type;
      const document = realm.window.document;
      return shouldDeliver({
        caller,
        type,
        isTrusted: event.isTrusted,
        targetKind: targetKind(platform.waive(event.currentTarget), pageWindow, document, platform.waive),
        editableTarget: KEYBOARD_EVENTS.has(type) && isEditable(innermostTarget(event)),
        gestureActive: gesture.active,
      });
    } catch {
      return true;
    }
  };

  const registry = new ListenerRegistry<PageObject, PageObject, CallerKind>((listener, caller) => {
    const impl: Impl = function (this: unknown, ...args: unknown[]) {
      if (state.enabled && !deliver(args[0], caller)) {
        realm.reportBlocked();
        return undefined;
      }
      const receiver = platform.waive(this);
      const forwarded = args.map(platform.waive);
      if (typeof listener === "function") return apply(listener as NativeFunction, receiver, forwarded);
      const handleEvent: unknown = (listener as { handleEvent?: unknown }).handleEvent;
      return typeof handleEvent === "function" ? apply(handleEvent as NativeFunction, listener, forwarded) : undefined;
    };
    return platform.exportFunction(impl, "");
  });

  /** Swaps the listener argument in place; throws only where the native would. */
  const substituteListener = (args: unknown[], pick: (listener: PageObject) => PageObject): void => {
    if (args.length < 2) return;
    let type = args[0];
    if (typeof type === "symbol") return;
    if (typeof type !== "string") {
      // Convert once, like the native does, so page toString() side effects aren't doubled.
      type = String(type);
      args[0] = type;
    }
    const listener = args[1];
    if (!isObjectLike(listener) || !isTrackedEvent(type as string)) return;
    try {
      args[1] = pick(listener);
    } catch {
      // Fall back to the page's own listener.
    }
  };

  const eventTargetProto = pagePrototype(realm, "EventTarget");
  if (eventTargetProto !== undefined) {
    const listenerMethod =
      (pick: (listener: PageObject) => PageObject) =>
      (original: NativeFunction): Impl =>
        function (this: unknown, ...rawArgs: unknown[]) {
          const args = rawArgs.map(platform.waive);
          substituteListener(args, pick);
          return apply(original, platform.waive(this), args);
        };
    replaceMethod(eventTargetProto, "addEventListener", listenerMethod((l) => registry.resolve(l, classifyNow)), platform);
    replaceMethod(eventTargetProto, "removeEventListener", listenerMethod((l) => registry.lookup(l)), platform);
  }

  // `on*` handler properties: own properties of window, prototype accessors elsewhere.
  const handlerHosts = [
    pageWindow,
    ...["Window", "Document", "HTMLElement", "SVGElement", "MathMLElement", "Element"].map((name) =>
      pagePrototype(realm, name),
    ),
  ];
  for (const host of handlerHosts) {
    if (host === undefined) continue;
    for (const property of TRACKED_HANDLER_PROPERTIES) {
      try {
        replaceAccessor(
          host,
          property,
          {
            get: (original) =>
              function (this: unknown, ...args: unknown[]) {
                const value = apply(original, platform.waive(this), args.map(platform.waive));
                return registry.originalOf(value) ?? value;
              },
            set: (original) =>
              function (this: unknown, ...rawArgs: unknown[]) {
                const args = rawArgs.map(platform.waive);
                const handler = args[0];
                if (typeof handler === "function") {
                  try {
                    args[0] = registry.resolve(handler, classifyNow);
                  } catch {
                    // Fall back to the page's own handler.
                  }
                }
                return apply(original, platform.waive(this), args);
              },
          },
          platform,
        );
      } catch {
        // Leave this property native.
      }
    }
  }

  // Coarse `event.timeStamp` for input events.
  const eventProto = pagePrototype(realm, "Event");
  const typeGetter = eventProto && (getOwnPropertyDescriptor(eventProto, "type")?.get as NativeFunction | undefined);
  if (eventProto !== undefined && typeGetter !== undefined) {
    replaceAccessor(
      eventProto,
      "timeStamp",
      {
        get: (original) =>
          function (this: unknown, ...args: unknown[]) {
            const event = platform.waive(this);
            const timestamp = apply(original, event, args) as number;
            if (!state.enabled) return timestamp;
            try {
              return coarsenTimestamp(timestamp, timestampResolution(apply(typeGetter, event, []) as string));
            } catch {
              return timestamp;
            }
          },
      },
      platform,
    );
  }
}

export const inputTracking: ProtectionModule = { id: "input-tracking", protect };
