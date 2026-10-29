/**
 * Per-site settings, persisted in `browser.storage.local`.
 *
 * Protection is on by default; the store only records the sites where the
 * user switched it off. Everything stays on the device.
 */

export const DISABLED_SITES_KEY = "disabledSites";

export interface StoredSettings {
  [DISABLED_SITES_KEY]?: unknown;
}

/** Normalises a hostname so `WWW.Example.com.` and `example.com` share a key. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

export function readDisabledSites(stored: StoredSettings): string[] {
  const value = stored[DISABLED_SITES_KEY];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function isSiteEnabled(disabledSites: readonly string[], host: string): boolean {
  if (host === "") return true;
  return !disabledSites.includes(normalizeHost(host));
}

export function withSiteEnabled(disabledSites: readonly string[], host: string, enabled: boolean): string[] {
  const key = normalizeHost(host);
  const rest = disabledSites.filter((site) => site !== key);
  return enabled || key === "" ? rest : [...rest, key].sort();
}
