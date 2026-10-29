// `npm start`: builds the extension, serves the test fixtures and launches
// Firefox through web-ext with the extension temporarily installed.
// Set WEB_EXT_FIREFOX (or FIREFOX) to pick a specific Firefox binary.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = (command, args, options = {}) => spawn(command, args, { cwd: root, stdio: "inherit", ...options });

await new Promise((resolve, reject) => {
  run(process.execPath, ["scripts/build.mjs"]).on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
});

const server = run(process.execPath, ["scripts/serve-fixtures.mjs"]);
const firefox = process.env.WEB_EXT_FIREFOX ?? process.env.FIREFOX;
const webExt = run("npx", ["web-ext", "run", ...(firefox ? ["--firefox", firefox] : [])]);

const stop = () => {
  server.kill();
  webExt.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
webExt.on("exit", (code) => {
  server.kill();
  process.exit(code ?? 0);
});
