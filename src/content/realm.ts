/**
 * Applies protection modules to a page realm and to the same-origin child
 * realms (iframes) the page reaches through `contentWindow` /
 * `contentDocument`, so a fresh iframe can't be used to grab pristine
 * built-ins before the content script is injected into it.
 */
import { hostOf } from "../shared/site";
import { type NativeFunction, replaceAccessor } from "./native-mask";
import type { ProtectionModule, ProtectionState, RealmContext } from "./modules/types";
import { firefoxPlatform, waive, xray } from "./platform";

const { apply } = Reflect;

export interface RealmDeps {
  state: ProtectionState;
  modules: readonly ProtectionModule[];
  reportBlocked(): void;
}

type XrayWindow = Window & typeof globalThis;

/** Realms already protected by this content script, keyed by their EventTarget prototype. */
const protectedRealms = new WeakSet<object>();

function realmKey(win: XrayWindow): object {
  const proto: object = waive(win.EventTarget).prototype;
  return proto;
}

/** The host a realm's scripts are compared against; about:blank inherits its creator's. */
export function realmHost(win: XrayWindow): string {
  const host = win.location.hostname;
  if (host !== "") return host;
  return hostOf(win.origin) ?? "";
}

export function protectRealm(win: XrayWindow, deps: RealmDeps): void {
  const key = realmKey(win);
  if (protectedRealms.has(key)) return;
  protectedRealms.add(key);

  const pageWindow = waive(win);
  const realm: RealmContext = {
    window: win,
    pageWindow,
    platform: firefoxPlatform(pageWindow),
    state: deps.state,
    pageHost: realmHost(win),
    reportBlocked: deps.reportBlocked,
  };
  for (const module of deps.modules) {
    try {
      module.protect(realm);
    } catch {
      // A failing module must never surface in the page.
    }
  }
  try {
    guardChildRealms(realm, deps);
  } catch {
    // Child realms stay unguarded.
  }
}

function adoptChild(value: unknown, deps: RealmDeps): void {
  if (value === null || typeof value !== "object") return;
  const view = xray(value) as Partial<Document> & Partial<Window>;
  const child = (view.defaultView ?? view) as XrayWindow | null;
  if (child === null) return;
  try {
    // Throws for cross-origin frames, which get their own content script.
    if (typeof child.EventTarget.prototype !== "object") return;
  } catch {
    return;
  }
  protectRealm(child, deps);
}

function guardChildRealms(realm: RealmContext, deps: RealmDeps): void {
  for (const name of ["HTMLIFrameElement", "HTMLFrameElement", "HTMLObjectElement"]) {
    const ctor: unknown = (realm.window as unknown as Record<string, unknown>)[name];
    if (typeof ctor !== "function") continue;
    const proto = realm.platform.waive(ctor).prototype as object;
    for (const property of ["contentWindow", "contentDocument"]) {
      replaceAccessor(
        proto,
        property,
        {
          get: (original: NativeFunction) =>
            function (this: unknown, ...args: unknown[]) {
              const value = apply(original, waive(this), args.map(waive));
              try {
                adoptChild(value, deps);
              } catch {
                // ignore
              }
              return value;
            },
        },
        realm.platform,
      );
    }
  }
}
