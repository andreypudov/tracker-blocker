import type { Platform } from "../platform";

/** Mutable, extension-only state shared by every realm in this frame. */
export interface ProtectionState {
  enabled: boolean;
}

/** Everything a protection module needs to protect one page realm. */
export interface RealmContext {
  /** Xray view of the realm's window. */
  readonly window: Window & typeof globalThis;
  /** Waived (page) view of the same window. */
  readonly pageWindow: Window & typeof globalThis;
  readonly platform: Platform;
  readonly state: ProtectionState;
  /** Host the realm's scripts are compared against (its own origin). */
  readonly pageHost: string;
  /** Records a suppressed listener invocation. Never visible to the page. */
  reportBlocked(): void;
}

/**
 * A self-contained protection. Future modules (network trackers, cookies,
 * fingerprinting) implement the same interface and are listed in
 * `content/modules/index.ts`.
 */
export interface ProtectionModule {
  readonly id: string;
  /** Installs the protection into a realm. Must never throw into the page. */
  protect(realm: RealmContext): void;
}
