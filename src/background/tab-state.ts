/**
 * Per-tab state (top-level host and blocked-event count), kept in
 * `browser.storage.session` so it survives the event page being suspended
 * but is never written to disk.
 */
import type { TabState } from "../shared/messages";

export const EMPTY_TAB_STATE: TabState = { host: null, blocked: 0 };

export function tabKey(tabId: number): string {
  return `tab:${tabId}`;
}

export function withBlocked(state: TabState, count: number): TabState {
  return { ...state, blocked: state.blocked + Math.max(0, Math.trunc(count)) };
}

export function isTabState(value: unknown): value is TabState {
  if (typeof value !== "object" || value === null) return false;
  const { host, blocked } = value as Partial<TabState>;
  return (host === null || typeof host === "string") && typeof blocked === "number";
}

/** Compact badge text: "", "42", "1.2k", "12k", "3M". */
export function formatBadge(count: number): string {
  if (count <= 0) return "";
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(Math.floor(count / 100) / 10).toString()}k`;
  if (count < 1_000_000) return `${Math.floor(count / 1000)}k`;
  return `${Math.floor(count / 1_000_000)}M`;
}

export interface KeyValueArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Serialises read-modify-write updates per tab to avoid lost increments. */
export class TabStateStore {
  readonly #area: KeyValueArea;
  readonly #queues = new Map<number, Promise<TabState>>();

  constructor(area: KeyValueArea) {
    this.#area = area;
  }

  async get(tabId: number): Promise<TabState> {
    await this.#queues.get(tabId);
    const value = (await this.#area.get(tabKey(tabId)))[tabKey(tabId)];
    return isTabState(value) ? value : EMPTY_TAB_STATE;
  }

  update(tabId: number, change: (state: TabState) => TabState): Promise<TabState> {
    const previous = this.#queues.get(tabId) ?? Promise.resolve(EMPTY_TAB_STATE);
    const next = previous
      .catch(() => EMPTY_TAB_STATE)
      .then(async () => {
        const value = (await this.#area.get(tabKey(tabId)))[tabKey(tabId)];
        const updated = change(isTabState(value) ? value : EMPTY_TAB_STATE);
        await this.#area.set({ [tabKey(tabId)]: updated });
        return updated;
      });
    this.#queues.set(tabId, next);
    void next.finally(() => {
      if (this.#queues.get(tabId) === next) this.#queues.delete(tabId);
    });
    return next;
  }

  async remove(tabId: number): Promise<void> {
    this.#queues.delete(tabId);
    await this.#area.remove(tabKey(tabId));
  }
}
