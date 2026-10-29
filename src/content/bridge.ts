/**
 * Isolated-world bridge: settings and counters travel over
 * `browser.runtime` / `browser.storage`, never through the page (no DOM
 * nodes, attributes, custom events or `postMessage`).
 */
import type { FrameConfig, RuntimeMessage } from "../shared/messages";
import { DISABLED_SITES_KEY, isSiteEnabled, readDisabledSites } from "../shared/settings";
import type { ProtectionState } from "./modules/types";

const FLUSH_DELAY_MS = 750;

function send(message: RuntimeMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message).catch(() => undefined);
}

/** Resolves which host's setting governs this frame: the tab's top-level site. */
async function governingHost(isTop: boolean, ownHost: string): Promise<string> {
  if (isTop) return ownHost;
  const config = (await send({ type: "get-frame-config" })) as FrameConfig | undefined;
  return config?.host ?? ownHost;
}

/**
 * Keeps `state.enabled` in sync with the per-site toggle. Protection is
 * installed synchronously at document_start and starts enabled, because
 * storage is asynchronous; a disabled site is switched to pass-through as
 * soon as its setting arrives.
 */
export function syncSettings(state: ProtectionState, isTop: boolean, ownHost: string): void {
  if (isTop) void send({ type: "page-start", host: ownHost });
  void (async () => {
    const host = await governingHost(isTop, ownHost);
    const apply = (value: unknown): void => {
      state.enabled = isSiteEnabled(readDisabledSites({ [DISABLED_SITES_KEY]: value }), host);
    };
    browser.storage.onChanged.addListener((changes, area) => {
      const change = changes[DISABLED_SITES_KEY];
      if (area === "local" && change !== undefined) apply(change.newValue);
    });
    const stored = await browser.storage.local.get(DISABLED_SITES_KEY);
    apply(stored[DISABLED_SITES_KEY]);
  })().catch(() => undefined);
}

/** Batches blocked-event counts and reports them to the background. */
export function createBlockedCounter(): () => void {
  let pending = 0;
  let scheduled = false;
  const flush = (): void => {
    scheduled = false;
    const count = pending;
    pending = 0;
    if (count > 0) void send({ type: "blocked", count });
  };
  return () => {
    pending += 1;
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, FLUSH_DELAY_MS);
    }
  };
}
