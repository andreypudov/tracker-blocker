/**
 * Content script entry point, injected at document_start into every frame
 * (isolated world). Protection is installed synchronously, before any page
 * script can run.
 */
import { createBlockedCounter, syncSettings } from "./bridge";
import { MODULES } from "./modules";
import type { ProtectionState } from "./modules/types";
import { protectRealm, realmHost } from "./realm";

const state: ProtectionState = { enabled: true };
const win = window;

try {
  protectRealm(win, { state, modules: MODULES, reportBlocked: createBlockedCounter() });
} catch {
  // Never let a failure surface in the page.
}

let isTop = false;
try {
  isTop = win.top === win;
} catch {
  // Cross-origin access to `top` can throw; we're a sub-frame then.
}
syncSettings(state, isTop, realmHost(win));
