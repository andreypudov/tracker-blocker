/**
 * Background event page: per-tab state and the toolbar badge. Nothing here
 * leaves the browser.
 */
import { type FrameConfig, type TabState, isRuntimeMessage } from "../shared/messages";
import { hostOf } from "../shared/site";
import { EMPTY_TAB_STATE, TabStateStore, formatBadge, withBlocked } from "./tab-state";

const store = new TabStateStore(browser.storage.session);

function showCount(tabId: number, state: TabState): void {
  browser.action.setBadgeText({ tabId, text: formatBadge(state.blocked) }).catch(() => undefined);
}

void browser.action.setBadgeBackgroundColor({ color: "#2563eb" });
void browser.action.setBadgeTextColor({ color: "#ffffff" });

browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!isRuntimeMessage(message)) return undefined;
  const tabId = sender.tab?.id;

  switch (message.type) {
    case "page-start":
      if (tabId === undefined || sender.frameId !== 0) return undefined;
      return store.update(tabId, () => ({ host: message.host, blocked: 0 })).then((state) => {
        showCount(tabId, state);
      });
    case "blocked":
      if (tabId === undefined) return undefined;
      return store.update(tabId, (state) => withBlocked(state, message.count)).then((state) => {
        showCount(tabId, state);
      });
    case "get-frame-config":
      if (tabId === undefined) return Promise.resolve<FrameConfig>({ host: "" });
      return store.get(tabId).then(
        (state): FrameConfig => ({ host: state.host ?? hostOf(sender.tab?.url ?? "") ?? "" }),
      );
    case "get-tab-state":
      // Only extension pages (the popup) may ask; content scripts have a tab.
      if (sender.tab !== undefined) return Promise.resolve(EMPTY_TAB_STATE);
      return store.get(message.tabId);
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  void store.remove(tabId);
});
