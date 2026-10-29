// End-to-end check in real Firefox, with no extra dependencies: launches a
// headless Firefox with Marionette, installs dist/ as a temporary add-on,
// sends real (trusted) mouse and keyboard input to the fixture page and
// asserts what first- and third-party scripts observed.
//
//   npm run build && npm run test:e2e        (FIREFOX=/path/to/firefox to override)
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const firefox = process.env.FIREFOX ?? "firefox";
const port = 2829;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Marionette {
  #socket;
  #buffer = "";
  #pending = new Map();
  #nextId = 1;
  #hello;

  static async connect(retries = 100) {
    for (let i = 0; i < retries; i++) {
      try {
        const client = new Marionette();
        await client.#open();
        return client;
      } catch {
        await sleep(200);
      }
    }
    throw new Error("Could not connect to Marionette");
  }

  #open() {
    return new Promise((resolve, reject) => {
      this.#hello = resolve;
      this.#socket = connect(port, "127.0.0.1");
      this.#socket.setEncoding("utf8");
      this.#socket.on("error", reject);
      this.#socket.on("data", (chunk) => this.#onData(chunk));
    });
  }

  #onData(chunk) {
    this.#buffer += chunk;
    for (;;) {
      const colon = this.#buffer.indexOf(":");
      if (colon === -1) return;
      const length = Number(this.#buffer.slice(0, colon));
      if (Buffer.byteLength(this.#buffer.slice(colon + 1)) < length) return;
      const bytes = Buffer.from(this.#buffer.slice(colon + 1));
      const message = JSON.parse(bytes.subarray(0, length).toString());
      this.#buffer = bytes.subarray(length).toString();
      if (!Array.isArray(message)) {
        this.#hello?.(message);
        this.#hello = undefined;
        continue;
      }
      const [, id, error, result] = message;
      const pending = this.#pending.get(id);
      this.#pending.delete(id);
      if (error) pending?.reject(new Error(`${error.error}: ${error.message}`));
      else pending?.resolve(result?.value !== undefined ? result.value : result);
    }
  }

  send(command, params = {}) {
    const id = this.#nextId++;
    const payload = JSON.stringify([0, id, command, params]);
    this.#socket.write(`${Buffer.byteLength(payload)}:${payload}`);
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }

  close() {
    this.#socket.destroy();
  }
}

const profile = await mkdtemp(join(tmpdir(), "tracker-blocker-e2e-"));
await writeFile(
  join(profile, "user.js"),
  [
    `user_pref("marionette.port", ${port});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
  ].join("\n"),
);

const server = spawn(process.execPath, [join(root, "scripts/serve-fixtures.mjs")], { stdio: "ignore" });
const browser = spawn(firefox, ["--headless", "--marionette", "--no-remote", "--profile", profile], {
  stdio: "ignore",
});

const failures = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures.push(name);
};

let client;
try {
  client = await Marionette.connect();
  await client.send("WebDriver:NewSession", { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
  const addon = await client.send("Addon:Install", { path: join(root, "dist"), temporary: true });
  console.log(`Installed ${typeof addon === "string" ? addon : JSON.stringify(addon)}`);
  await client.send("WebDriver:Navigate", { url: "http://localhost:8080/" });
  await sleep(500);

  if (process.env.E2E_EVAL) {
    console.log(JSON.stringify(await client.send("WebDriver:ExecuteScript", { script: process.env.E2E_EVAL }), null, 2));
    throw new Error("E2E_EVAL done");
  }

  const rect = (id) =>
    client.send("WebDriver:ExecuteScript", {
      script: `const r = document.getElementById(arguments[0]).getBoundingClientRect();
               return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };`,
      args: [id],
    });
  const pointer = (actions) =>
    client.send("WebDriver:PerformActions", {
      actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions }],
    });
  const keys = (text) =>
    client.send("WebDriver:PerformActions", {
      actions: [
        {
          type: "key",
          id: "keyboard",
          actions: [...text].flatMap((value) => [
            { type: "keyDown", value },
            { type: "pause", duration: 30 },
            { type: "keyUp", value },
          ]),
        },
      ],
    });
  const click = async (id) => {
    const { x, y } = await rect(id);
    await pointer([
      { type: "pointerMove", x, y, duration: 50 },
      { type: "pointerDown", button: 0 },
      { type: "pointerUp", button: 0 },
    ]);
  };

  // Hover around the page without pressing a button.
  const box = await rect("drag-box");
  await pointer([
    { type: "pointerMove", x: 20, y: 20 },
    { type: "pointerMove", x: 300, y: 200, duration: 200 },
    { type: "pointerMove", x: box.x, y: box.y, duration: 200 },
    { type: "pointerMove", x: box.x + 30, y: box.y + 5, duration: 100 },
  ]);
  await click("widget-button");
  await click("text");
  await keys("secret");
  await click("password");
  await keys("hunter2");
  await client.send("WebDriver:ReleaseActions");
  await sleep(200);

  const before = await client.send("WebDriver:ExecuteScript", { script: "return JSON.parse(JSON.stringify(window.fixture));" });
  const fp = before.counters["first-party"] ?? {};
  const tp = before.counters["third-party"] ?? {};
  const rec = before.counters.recorder ?? {};

  console.log("\nFirst-party listeners keep working:");
  for (const type of ["mousemove", "click", "keydown", "input", "input on field"]) {
    expect(`first-party ${type}`, (fp[type] ?? 0) > 0, JSON.stringify(fp));
  }

  console.log("\nThird-party tracker is starved:");
  for (const type of [
    "document mousemove",
    "document pointermove",
    "window mousemove",
    "document.onmousemove",
    "document click",
    "document keydown",
    "document input",
    "password keyup",
  ]) {
    expect(`third-party ${type} blocked`, (tp[type] ?? 0) === 0, `${tp[type]} events`);
  }
  expect("keylogger captured nothing", before.keylog === "", JSON.stringify(before.keylog));
  expect("third-party widget button works", (tp["widget button click (should work)"] ?? 0) > 0, JSON.stringify(tp));
  expect("third-party element mousemove works", (tp["drag-box mousemove (should work)"] ?? 0) > 0, JSON.stringify(tp));
  expect("synthetic self-test still delivered", (tp["synthetic self-test delivered (should work)"] ?? 0) > 0);

  console.log("\nSelf-hosted recorder is blocked:");
  for (const type of ["mousemove", "click", "keydown", "input"]) {
    expect(`recorder ${type} blocked`, (rec[type] ?? 0) === 0, `${rec[type]} events`);
  }

  console.log("\nInvisibility checks:");
  for (const [name, ok] of Object.entries(before.checks)) {
    if (ok === "known") console.log(`  known ${name} (documented limitation)`);
    else expect(name, ok === true);
  }
  expect("checks ran", Object.keys(before.checks).length > 10, JSON.stringify(before.checks));

  // A drag across the page: document-level moves are delivered during the gesture.
  await pointer([
    { type: "pointerMove", x: box.x, y: box.y },
    { type: "pointerDown", button: 0 },
    { type: "pointerMove", x: box.x + 150, y: box.y + 60, duration: 200 },
    { type: "pointerUp", button: 0 },
  ]);
  await client.send("WebDriver:ReleaseActions");
  await sleep(100);
  const after = await client.send("WebDriver:ExecuteScript", { script: "return JSON.parse(JSON.stringify(window.fixture.counters['third-party']));" });
  console.log("\nDrag and drop keeps working:");
  expect("document mousemove delivered during drag", (after["document mousemove"] ?? 0) > 0, JSON.stringify(after));
  expect("document mouseup delivered at drag end", (after["document mouseup"] ?? 0) > 0, JSON.stringify(after));
  expect("document mousedown still blocked", (after["document mousedown"] ?? 0) === 0, JSON.stringify(after));

  console.log("\nTimestamp coarsening:");
  const stamps = await client.send("WebDriver:ExecuteScript", { script: "return window.fixture.stamps;" });
  expect("keydown timeStamp on a 100 ms grid", stamps.keydown.length > 0 && stamps.keydown.every((t) => t % 100 === 0), JSON.stringify(stamps.keydown));
  expect("mousemove timeStamp on a 16 ms grid", stamps.mousemove.length > 0 && stamps.mousemove.every((t) => t % 16 === 0), JSON.stringify(stamps.mousemove.slice(0, 5)));
  expect("performance.now() untouched", stamps.now % 1 !== 0 || stamps.now % 16 !== 0, String(stamps.now));
} catch (error) {
  console.error(error);
  failures.push(String(error));
} finally {
  client?.close();
  browser.kill();
  server.kill();
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}

console.log(failures.length === 0 ? "\nAll end-to-end checks passed." : `\n${failures.length} end-to-end check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
