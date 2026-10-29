/**
 * Approximate "site" (registrable domain) computation used to tell
 * first-party scripts from third-party ones without shipping the full Public
 * Suffix List.
 */

/** Common multi-label public suffixes; good enough for a first iteration. */
const MULTI_LABEL_SUFFIXES: ReadonlySet<string> = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "org.nz", "co.jp", "ne.jp", "or.jp", "ac.jp",
  "co.kr", "or.kr", "com.br", "net.br", "org.br", "com.cn", "net.cn", "org.cn",
  "com.tw", "com.hk", "com.sg", "com.my", "co.in", "net.in", "org.in",
  "co.za", "com.mx", "com.ar", "com.tr", "com.ua", "com.ru", "co.il", "co.id",
  "github.io", "gitlab.io", "netlify.app", "vercel.app", "pages.dev",
  "herokuapp.com", "blogspot.com", "appspot.com", "web.app", "firebaseapp.com",
]);

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
}

/** Returns the registrable domain of `host` (best effort, lower-cased). */
export function siteOf(host: string): string {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  if (normalized === "" || isIpAddress(normalized)) return normalized;
  const labels = normalized.split(".");
  if (labels.length <= 2) return normalized;
  const lastTwo = labels.slice(-2).join(".");
  const take = MULTI_LABEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** Extracts the host of a script URL, including `blob:` URLs; `null` if opaque. */
export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "blob:") return hostOf(parsed.pathname);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:") {
      return parsed.hostname;
    }
    return null;
  } catch {
    return null;
  }
}

export function isSameSite(hostA: string, hostB: string): boolean {
  return siteOf(hostA) === siteOf(hostB);
}
