/**
 * Toolbar popup: shows the active tab's site, its protection status, an
 * on/off toggle and the tab's blocked-events counter.
 */
import type { RuntimeMessage, TabState } from "../shared/messages";
import { DISABLED_SITES_KEY, isSiteEnabled, normalizeHost, readDisabledSites, withSiteEnabled } from "../shared/settings";

const REFRESH_MS = 1000;

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing #${id}`);
  return found;
}

const root = document.querySelector<HTMLElement>(".popup");
const hostEl = element("host");
const statusEl = element("status");
const toggle = element("toggle") as HTMLInputElement;
const countEl = element("count");

async function tabState(tabId: number): Promise<TabState> {
  const message: RuntimeMessage = { type: "get-tab-state", tabId };
  return (await browser.runtime.sendMessage(message)) as TabState;
}

async function disabledSites(): Promise<string[]> {
  return readDisabledSites(await browser.storage.local.get(DISABLED_SITES_KEY));
}

function render(host: string | null, enabled: boolean, blocked: number): void {
  const status = host === null ? "unavailable" : enabled ? "on" : "off";
  if (root) root.dataset.status = status;
  hostEl.textContent = host === null ? "This page" : normalizeHost(host) || host;
  statusEl.textContent = {
    unavailable: "Protection isn't available on this page.",
    on: "Protected: tracking is blocked on this site.",
    off: "Protection is off for this site.",
  }[status];
  toggle.disabled = host === null;
  toggle.checked = enabled;
  countEl.textContent = blocked.toLocaleString();
}

async function main(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  if (tabId === undefined) {
    render(null, false, 0);
    return;
  }

  const refresh = async (): Promise<void> => {
    const [state, sites] = await Promise.all([tabState(tabId), disabledSites()]);
    const host = state.host === "" ? null : state.host;
    render(host, host !== null && isSiteEnabled(sites, host), state.blocked);
  };

  toggle.addEventListener("change", () => {
    void (async () => {
      const { host } = await tabState(tabId);
      if (!host) return;
      const sites = withSiteEnabled(await disabledSites(), host, toggle.checked);
      await browser.storage.local.set({ [DISABLED_SITES_KEY]: sites });
      await refresh();
    })();
  });

  await refresh();
  setInterval(() => void refresh(), REFRESH_MS);
}

void main().catch(() => {
  render(null, false, 0);
});
