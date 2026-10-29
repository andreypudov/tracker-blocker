// Bundles the extension into dist/. Every entry point is a single
// self-contained IIFE so content scripts never need module loading.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const dist = new URL("dist/", root);

await rm(dist, { recursive: true, force: true });
await mkdir(new URL("popup/", dist), { recursive: true });

await build({
  absWorkingDir: root.pathname,
  entryPoints: {
    content: "src/content/index.ts",
    background: "src/background/index.ts",
    "popup/popup": "src/popup/popup.ts",
  },
  outdir: dist.pathname,
  bundle: true,
  format: "iife",
  target: "firefox142",
  legalComments: "none",
  minify: false,
  sourcemap: false,
  logLevel: "warning",
});

await Promise.all([
  cp(new URL("manifest.json", root), new URL("manifest.json", dist)),
  cp(new URL("icons/", root), new URL("icons/", dist), { recursive: true }),
  cp(new URL("src/popup/popup.html", root), new URL("popup/popup.html", dist)),
  cp(new URL("src/popup/popup.css", root), new URL("popup/popup.css", dist)),
]);

console.log("Built extension into dist/");
