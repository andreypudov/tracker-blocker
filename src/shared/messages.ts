/**
 * Runtime messages exchanged between extension contexts. None of them pass
 * through the page: content scripts use `browser.runtime`, which the page
 * cannot observe.
 */

/** Content script (top frame) → background: a new document started loading. */
export interface PageStartMessage {
  type: "page-start";
  host: string;
}

/** Content script → background: listener invocations were suppressed. */
export interface BlockedMessage {
  type: "blocked";
  count: number;
}

/** Content script (sub-frame) → background: which host governs this tab? */
export interface GetFrameConfigMessage {
  type: "get-frame-config";
}

/** Popup → background: state of a tab. */
export interface GetTabStateMessage {
  type: "get-tab-state";
  tabId: number;
}

export type RuntimeMessage = PageStartMessage | BlockedMessage | GetFrameConfigMessage | GetTabStateMessage;

export interface FrameConfig {
  host: string;
}

export interface TabState {
  host: string | null;
  blocked: number;
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (typeof value !== "object" || value === null) return false;
  const { type } = value as { type?: unknown };
  return type === "page-start" || type === "blocked" || type === "get-frame-config" || type === "get-tab-state";
}
