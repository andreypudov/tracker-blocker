// A "third-party" behavioural tracker, served from 127.0.0.1:8081.
(() => {
  const tp = counters("third-party");
  const keylog = document.getElementById("keylog");
  // Trackers care about real user input only; synthetic events are ignored.
  const log = (type) => (event) => event.isTrusted && tp.bump(type);

  // Page-wide mouse recording (session-replay style).
  for (const type of ["mousemove", "pointermove", "click", "mousedown", "mouseup", "wheel", "scroll", "touchmove"]) {
    document.addEventListener(type, log(`document ${type}`), { capture: true, passive: true });
  }
  window.addEventListener("mousemove", log("window mousemove"));
  document.onmousemove = log("document.onmousemove");

  // Keylogger with typing-cadence capture.
  let last = 0;
  document.addEventListener("keydown", (event) => {
    if (!event.isTrusted) return;
    tp.bump("document keydown");
    if (event.target instanceof HTMLInputElement) {
      window.fixture.keylog += event.key;
      keylog.textContent = `Captured keys: ${window.fixture.keylog} (Δt ${Math.round(event.timeStamp - last)} ms)`;
      last = event.timeStamp;
    }
  }, true);
  document.addEventListener("input", log("document input"), true);
  document.getElementById("password").addEventListener("keyup", log("password keyup"));

  // A legitimate widget on its own element: must keep working.
  document.getElementById("widget-button").addEventListener("click", log("widget button click (should work)"));
  document.getElementById("drag-box").addEventListener("mousemove", log("drag-box mousemove (should work)"));

  // Lets checks.js register listeners with a third-party call stack.
  window.fixture.registerFromThirdParty = (target, type, listener) => target.addEventListener(type, listener);

  // Self-test a tracker might run: synthetic events must still be delivered.
  let selfTest = false;
  const probe = () => { selfTest = true; };
  document.addEventListener("mousemove", probe);
  document.dispatchEvent(new MouseEvent("mousemove"));
  document.removeEventListener("mousemove", probe);
  tp.bump(selfTest ? "synthetic self-test delivered (should work)" : "SYNTHETIC SELF-TEST FAILED");
})();
