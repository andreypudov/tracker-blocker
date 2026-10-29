// Serves the manual test page on two different "sites":
//   http://localhost:8080/  - the first-party page (tests/fixtures/site)
//   http://127.0.0.1:8081/  - the third-party tracker (tests/fixtures/third-party)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = fileURLToPath(new URL("../tests/fixtures/", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

function serve(dir, port, host) {
  const root = join(fixtures, dir);
  return new Promise((resolve) => {
    createServer(async (req, res) => {
      const path = normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^(\.\.[/\\])+/, "");
      const file = join(root, path.endsWith("/") ? `${path}index.html` : path);
      try {
        if (!file.startsWith(root)) throw new Error("outside root");
        const body = await readFile(file);
        res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
        res.end(body);
      } catch {
        res.writeHead(404).end("Not found");
      }
    }).listen(port, host, () => resolve(`http://${host === "127.0.0.1" ? "127.0.0.1" : "localhost"}:${port}/`));
  });
}

const urls = await Promise.all([serve("site", 8080, "localhost"), serve("third-party", 8081, "127.0.0.1")]);
console.log(`First-party page: ${urls[0]}\nThird-party host: ${urls[1]}`);
