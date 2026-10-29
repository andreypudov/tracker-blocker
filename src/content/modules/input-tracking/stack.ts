/**
 * Extracts script URLs from a SpiderMonkey `Error#stack` string.
 *
 * Frame formats handled:
 *   name@https://a.example/x.js:10:5
 *   @https://a.example/x.js:10:5
 *   name@https://a.example/x.js line 4 > eval:1:1
 *   name@https://a.example/x.js line 4 > Function:1:1
 */
export function parseStackUrls(stack: string): string[] {
  const urls: string[] = [];
  for (const rawLine of stack.split("\n")) {
    const line = rawLine.trim();
    const at = line.indexOf("@");
    if (at === -1) continue;
    let location = line.slice(at + 1);
    const evalMarker = location.indexOf(" line ");
    if (evalMarker !== -1) {
      location = location.slice(0, evalMarker);
    } else {
      location = location.replace(/:\d+:\d+$/, "").replace(/:\d+$/, "");
    }
    if (location !== "") urls.push(location);
  }
  return urls;
}
