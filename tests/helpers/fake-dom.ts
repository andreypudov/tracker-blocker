/**
 * A tiny DOM stand-in for exercising the input-tracking module in Node.
 * Classes are created per realm so each test patches fresh prototypes.
 */
import type { Impl, MaskPlatform, NativeFunction } from "../../src/content/native-mask";
import type { Platform } from "../../src/content/platform";

/** Mimics Firefox's exportFunction: a non-constructible function named `atom`, length 0. */
export function testPlatform(): MaskPlatform {
  return {
    exportFunction(impl: Impl, atom: string): NativeFunction {
      const holder = {
        [atom](...args: unknown[]): unknown {
          return Reflect.apply(impl, this, args);
        },
      };
      return holder[atom] as NativeFunction;
    },
  };
}

export function identityPlatform(captureStack: () => string): Platform {
  return { ...testPlatform(), waive: (value) => value, xray: (value) => value, captureStack };
}

interface Registration {
  callback: unknown;
  capture: boolean;
}

export const HANDLER_TYPES = ["mousemove", "click", "keydown", "load"] as const;

export function createFakeRealm() {
  class FakeEventTarget {
    readonly registrations = new Map<string, Registration[]>();
    readonly handlers = new Map<string, unknown>();

    addEventListener(type: string, callback: unknown, ...rest: unknown[]): void {
      if (callback === null || callback === undefined) return;
      const options = rest[0];
      const capture = typeof options === "boolean" ? options : Boolean((options as { capture?: boolean } | undefined)?.capture);
      const list = this.registrations.get(type) ?? [];
      if (list.some((entry) => entry.callback === callback && entry.capture === capture)) return;
      list.push({ callback, capture });
      this.registrations.set(type, list);
    }

    removeEventListener(type: string, callback: unknown, ...rest: unknown[]): void {
      const options = rest[0];
      const capture = typeof options === "boolean" ? options : Boolean((options as { capture?: boolean } | undefined)?.capture);
      const list = this.registrations.get(type) ?? [];
      this.registrations.set(
        type,
        list.filter((entry) => !(entry.callback === callback && entry.capture === capture)),
      );
    }

    listenerCount(type: string): number {
      return this.registrations.get(type)?.length ?? 0;
    }
  }

  class FakeEvent {
    declare readonly isTrusted: boolean;
    readonly #type: string;
    readonly #timeStamp: number;
    path: FakeEventTarget[] = [];
    target: FakeEventTarget | null = null;
    currentTarget: FakeEventTarget | null = null;

    constructor(type: string, init: { trusted?: boolean; timeStamp?: number } = {}) {
      this.#type = type;
      this.#timeStamp = init.timeStamp ?? 1234.5678;
      Object.defineProperty(this, "isTrusted", { value: init.trusted ?? true, enumerable: true });
    }

    get type(): string {
      return this.#type;
    }

    get timeStamp(): number {
      return this.#timeStamp;
    }

    composedPath(): FakeEventTarget[] {
      return this.path;
    }
  }

  class FakeElement extends FakeEventTarget {
    declare onmousemove: unknown;
    declare onclick: unknown;
    declare onkeydown: unknown;
    declare onload: unknown;

    constructor(
      readonly localName: string,
      readonly type = "",
      readonly isContentEditable = false,
    ) {
      super();
    }
  }
  for (const type of HANDLER_TYPES) {
    Object.defineProperty(FakeElement.prototype, `on${type}`, {
      get(this: FakeEventTarget) {
        return this.handlers.get(type) ?? null;
      },
      set(this: FakeEventTarget, value: unknown) {
        if (typeof value === "function") this.handlers.set(type, value);
        else this.handlers.delete(type);
      },
      enumerable: true,
      configurable: true,
    });
  }

  const html = new FakeElement("html");
  const body = new FakeElement("body");
  const document = Object.assign(new FakeEventTarget(), { documentElement: html, body });
  const window = Object.assign(new FakeEventTarget(), {
    EventTarget: FakeEventTarget,
    Event: FakeEvent,
    HTMLElement: FakeElement,
    document,
  });

  /** Dispatches like a browser in the bubble phase: target first, then ancestors. */
  function dispatch(event: FakeEvent, path: FakeEventTarget[]): void {
    event.path = path;
    event.target = path[0] ?? null;
    for (const node of path) {
      event.currentTarget = node;
      for (const { callback } of [...(node.registrations.get(event.type) ?? [])]) {
        if (typeof callback === "function") Reflect.apply(callback, node, [event]);
        else (callback as { handleEvent(e: unknown): void }).handleEvent(event);
      }
      const handler = node.handlers.get(event.type);
      if (typeof handler === "function") Reflect.apply(handler, node, [event]);
    }
  }

  /** Path from an element inside <body> up to window. */
  const pathFrom = (element: FakeEventTarget): FakeEventTarget[] => [element, body, html, document, window];

  return { window, document, html, body, FakeEventTarget, FakeEvent, FakeElement, dispatch, pathFrom };
}
