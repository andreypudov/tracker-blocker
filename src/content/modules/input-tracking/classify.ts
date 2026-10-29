import { hostOf, isSameSite } from "../../../shared/site";

/**
 * Who registered a listener:
 * - `first-party`: the page's own code (or nothing attributable);
 * - `third-party`: a script served from another site;
 * - `tracker`: a known session-replay / behavioural-analytics script.
 */
export type CallerKind = "first-party" | "third-party" | "tracker";

/** URL schemes of browser/extension code that never counts as the caller. */
const PRIVILEGED_SCHEMES = ["moz-extension:", "chrome-extension:", "resource:", "chrome:", "about:"];

/**
 * Public library CDNs. Frames from these are skipped so that e.g. jQuery
 * loaded from a CDN but called by first-party code is attributed to the page.
 */
const LIBRARY_HOSTS: readonly string[] = [
  "ajax.googleapis.com",
  "ajax.aspnetcdn.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "code.jquery.com",
  "esm.sh",
  "ga.jspm.io",
  "stackpath.bootstrapcdn.com",
  "unpkg.com",
];

/** Session replay, heatmap and behavioural-biometrics vendors. */
const TRACKER_HOSTS: readonly string[] = [
  "biocatch.com",
  "clarity.ms",
  "clicktale.net",
  "contentsquare.net",
  "crazyegg.com",
  "decibelinsight.net",
  "fullstory.com",
  "glassboxdigital.io",
  "heapanalytics.com",
  "hotjar.com",
  "hotjar.io",
  "inspectlet.com",
  "logrocket.com",
  "logrocket.io",
  "lr-ingest.com",
  "lr-ingest.io",
  "luckyorange.com",
  "luckyorange.net",
  "mc.yandex.ru",
  "mouseflow.com",
  "quantummetric.com",
  "sessioncam.com",
  "smartlook.cloud",
  "smartlook.com",
  "uxcam.com",
];

/** Script file names of self-hostable recorders. */
const TRACKER_PATH_PATTERN = /\b(?:rrweb|hotjar|fullstory|clarity|logrocket|mouseflow|smartlook|openreplay)\b[^/]*\.m?js/i;

function matchesHost(host: string, list: readonly string[]): boolean {
  return list.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function isPrivileged(url: string): boolean {
  return PRIVILEGED_SCHEMES.some((scheme) => url.startsWith(scheme));
}

export function isTrackerUrl(url: string): boolean {
  const host = hostOf(url);
  if (host !== null && matchesHost(host, TRACKER_HOSTS)) return true;
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // keep the raw string
  }
  return TRACKER_PATH_PATTERN.test(path);
}

/**
 * Classifies the caller from the stack's script URLs (innermost first).
 *
 * Any known tracker frame taints the call. Otherwise the innermost frame
 * that is not a library CDN decides; with no attributable frame the page
 * gets the benefit of the doubt.
 */
export function classifyCaller(stackUrls: readonly string[], pageHost: string): CallerKind {
  const pageUrls = stackUrls.filter((url) => !isPrivileged(url));
  if (pageUrls.some(isTrackerUrl)) return "tracker";
  for (const url of pageUrls) {
    const host = hostOf(url);
    if (host !== null && matchesHost(host, LIBRARY_HOSTS)) continue;
    if (host === null) return "third-party";
    return isSameSite(host, pageHost) ? "first-party" : "third-party";
  }
  return "first-party";
}
