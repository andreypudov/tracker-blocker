import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputTracking } from "../src/content/modules/input-tracking";
import type { ProtectionState, RealmContext } from "../src/content/modules/types";
import { createFakeRealm, identityPlatform } from "./helpers/fake-dom";

const FIRST_PARTY = "handler@https://www.site.example/app.js:1:1\n";
const THIRD_PARTY = "track@https://widgets.other.example/widget.js:1:1\n";
const TRACKER = "record@https://static.hotjar.com/c/hotjar.js:1:1\n";

let fake: ReturnType<typeof createFakeRealm>;
let stack: string;
let blocked: number;
let state: ProtectionState;

/** Runs `register` as if called from a script with the given stack. */
function as<T>(caller: string, register: () => T): T {
  const previous = stack;
  stack = `addEventListener@moz-extension://uuid/content.js:1:1\n${caller}`;
  try {
    return register();
  } finally {
    stack = previous;
  }
}

beforeEach(() => {
  fake = createFakeRealm();
  stack = "";
  blocked = 0;
  state = { enabled: true };
  const realm: RealmContext = {
    window: fake.window as unknown as RealmContext["window"],
    pageWindow: fake.window as unknown as RealmContext["window"],
    platform: identityPlatform(() => stack),
    state,
    pageHost: "www.site.example",
    reportBlocked: () => {
      blocked += 1;
    },
  };
  inputTracking.protect(realm);
});

const trusted = (type: string, timeStamp?: number) =>
  new fake.FakeEvent(type, { trusted: true, ...(timeStamp === undefined ? {} : { timeStamp }) });

describe("addEventListener wrapping", () => {
  it("leaves first-party listeners untouched", () => {
    const listener = vi.fn();
    as(FIRST_PARTY, () => {
      fake.document.addEventListener("mousemove", listener);
    });
    expect(fake.document.registrations.get("mousemove")?.[0]?.callback).toBe(listener);
    fake.dispatch(trusted("mousemove"), [fake.document]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(blocked).toBe(0);
  });

  it("silently drops trusted page-wide mouse events for third-party listeners", () => {
    const listener = vi.fn();
    as(THIRD_PARTY, () => {
      fake.document.addEventListener("mousemove", listener);
    });
    fake.dispatch(trusted("mousemove"), [fake.document]);
    expect(listener).not.toHaveBeenCalled();
    expect(blocked).toBe(1);
  });

  it("still delivers synthetic events, so self-tests can't spot the blocker", () => {
    const listener = vi.fn();
    as(THIRD_PARTY, () => {
      fake.document.addEventListener("mousemove", listener);
    });
    fake.dispatch(new fake.FakeEvent("mousemove", { trusted: false }), [fake.document]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps third-party element listeners (widgets, maps) working", () => {
    const button = new fake.FakeElement("button");
    const listener = vi.fn();
    as(THIRD_PARTY, () => {
      button.addEventListener("click", listener);
    });
    fake.dispatch(trusted("click"), fake.pathFrom(button));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("passes the event and currentTarget as `this`, and returns the listener's result", () => {
    const button = new fake.FakeElement("button");
    const seen: unknown[] = [];
    as(THIRD_PARTY, () => {
      button.addEventListener("click", function (this: unknown, event: unknown) {
        seen.push(this, event);
      });
    });
    const event = trusted("click");
    fake.dispatch(event, fake.pathFrom(button));
    expect(seen).toEqual([button, event]);
  });

  it("supports EventListener objects with handleEvent", () => {
    const button = new fake.FakeElement("button");
    const listener = { handleEvent: vi.fn() };
    as(THIRD_PARTY, () => {
      button.addEventListener("click", listener);
    });
    fake.dispatch(trusted("click"), fake.pathFrom(button));
    expect(listener.handleEvent).toHaveBeenCalledTimes(1);
  });

  it("blocks known trackers everywhere", () => {
    const input = new fake.FakeElement("input", "text");
    const button = new fake.FakeElement("button");
    const onKey = vi.fn();
    const onClick = vi.fn();
    as(TRACKER, () => {
      input.addEventListener("keydown", onKey);
      button.addEventListener("click", onClick);
    });
    fake.dispatch(trusted("keydown"), fake.pathFrom(input));
    fake.dispatch(trusted("click"), fake.pathFrom(button));
    expect(onKey).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("blocks keylogging of fields but keeps keyboard shortcuts", () => {
    const input = new fake.FakeElement("input", "password");
    const listener = vi.fn();
    as(THIRD_PARTY, () => {
      fake.document.addEventListener("keydown", listener);
    });
    fake.dispatch(trusted("keydown"), fake.pathFrom(input));
    expect(listener).not.toHaveBeenCalled();
    fake.dispatch(trusted("keydown"), [fake.body, fake.html, fake.document]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("delivers page-wide pointer moves during a drag", () => {
    vi.useFakeTimers();
    try {
      const listener = vi.fn();
      as(THIRD_PARTY, () => {
        fake.document.addEventListener("mousemove", listener);
        fake.document.addEventListener("mouseup", listener);
      });
      fake.dispatch(trusted("mousedown"), [fake.window]);
      fake.dispatch(trusted("mousemove"), [fake.document]);
      fake.dispatch(trusted("mouseup"), [fake.document, fake.window]);
      expect(listener).toHaveBeenCalledTimes(2);
      vi.runAllTimers();
      fake.dispatch(trusted("mousemove"), [fake.document]);
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("delivers everything while the site is disabled", () => {
    const listener = vi.fn();
    as(THIRD_PARTY, () => {
      fake.document.addEventListener("mousemove", listener);
    });
    state.enabled = false;
    fake.dispatch(trusted("mousemove"), [fake.document]);
    expect(listener).toHaveBeenCalledTimes(1);
    state.enabled = true;
    fake.dispatch(trusted("mousemove"), [fake.document]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not wrap untracked event types", () => {
    const listener = vi.fn();
    as(THIRD_PARTY, () => {
      fake.window.addEventListener("load", listener);
    });
    expect(fake.window.registrations.get("load")?.[0]?.callback).toBe(listener);
  });

  it("keeps native de-duplication and removal semantics", () => {
    const listener = vi.fn();
    as(THIRD_PARTY, () => {
      fake.document.addEventListener("mousemove", listener);
      fake.document.addEventListener("mousemove", listener);
      fake.document.addEventListener("mousemove", listener, true);
    });
    expect(fake.document.listenerCount("mousemove")).toBe(2);
    as(FIRST_PARTY, () => {
      fake.document.removeEventListener("mousemove", listener);
      fake.document.removeEventListener("mousemove", listener, true);
    });
    expect(fake.document.listenerCount("mousemove")).toBe(0);
  });

  it("converts non-string types exactly once", () => {
    const toString = vi.fn(() => "mousemove");
    const listener = vi.fn();
    as(THIRD_PARTY, () => {
      fake.document.addEventListener({ toString } as unknown as string, listener);
    });
    expect(toString).toHaveBeenCalledTimes(1);
    fake.dispatch(trusted("mousemove"), [fake.document]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("looks native", () => {
    const add = fake.FakeEventTarget.prototype.addEventListener;
    expect(add.name).toBe("addEventListener");
    expect(add.length).toBe(2);
    expect(Object.keys(fake.document)).not.toContain("__trackerBlocker");
  });
});

describe("on* handler properties", () => {
  it("wraps third-party handlers but returns the original from the getter", () => {
    const handler = vi.fn();
    as(THIRD_PARTY, () => {
      fake.body.onmousemove = handler;
    });
    expect(fake.body.onmousemove).toBe(handler);
    expect(fake.body.handlers.get("mousemove")).not.toBe(handler);
    fake.dispatch(trusted("mousemove"), [fake.body]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes non-callable values through", () => {
    as(THIRD_PARTY, () => {
      fake.body.onclick = null;
    });
    expect(fake.body.onclick).toBeNull();
  });
});

describe("event.timeStamp", () => {
  it("coarsens input events and leaves others exact", () => {
    expect(trusted("keydown", 10_087.9).timeStamp).toBe(10_000);
    expect(trusted("mousemove", 1001.3).timeStamp).toBe(992);
    expect(trusted("load", 1001.3).timeStamp).toBe(1001.3);
  });

  it("is exact while the site is disabled", () => {
    state.enabled = false;
    expect(trusted("keydown", 10_087.9).timeStamp).toBe(10_087.9);
  });
});
