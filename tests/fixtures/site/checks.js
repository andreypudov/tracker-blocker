// Invisibility checks: things a page could inspect to detect the extension.
(() => {
  const results = window.fixture.checks;
  const table = document.getElementById("checks");
  const nativeSource = (name) => `function ${name}() {\n    [native code]\n}`;
  // `known`: a documented detection vector the extension cannot hide (see README).
  const check = (name, fn, known = false) => {
    let ok;
    let detail = "";
    try {
      const value = fn();
      ok = value === true;
      if (!ok) detail = String(value);
    } catch (error) {
      ok = false;
      detail = String(error);
    }
    results[name] = ok || (known ? "known" : false);
    const row = table.insertRow();
    row.insertCell().textContent = name;
    const cell = row.insertCell();
    cell.textContent = ok ? "pass" : known ? `known limitation: ${detail}` : `FAIL ${detail}`;
    cell.className = ok ? "pass" : known ? "known" : "fail";
  };
  const toString = Function.prototype.toString;
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const tsGetter = Object.getOwnPropertyDescriptor(Event.prototype, "timeStamp").get;
  const onmousemove = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onmousemove");

  check("addEventListener.toString() is native", () => toString.call(add) === nativeSource("addEventListener") || toString.call(add));
  check("removeEventListener.toString() is native", () => toString.call(remove) === nativeSource("removeEventListener") || toString.call(remove));
  check("addEventListener name/length", () => add.name === "addEventListener" && add.length === 2 || `${add.name}/${add.length}`);
  check("removeEventListener name/length", () => remove.name === "removeEventListener" && remove.length === 2);
  check("addEventListener own keys", () => JSON.stringify(Reflect.ownKeys(add)) === '["length","name"]' || JSON.stringify(Reflect.ownKeys(add)));
  check(
    "addEventListener not constructible",
    () => { try { new add(); return "constructed"; } catch (e) { return e instanceof TypeError || `${e.name}: ${e.message}`; } },
    true,
  );
  check("addEventListener descriptor", () => {
    const d = Object.getOwnPropertyDescriptor(EventTarget.prototype, "addEventListener");
    return d.writable && d.enumerable && d.configurable || JSON.stringify(d);
  });
  check("EventTarget.prototype key order", () =>
    JSON.stringify(Object.getOwnPropertyNames(EventTarget.prototype)) ===
      '["addEventListener","removeEventListener","dispatchEvent","constructor"]' ||
    JSON.stringify(Object.getOwnPropertyNames(EventTarget.prototype)));
  check("timeStamp getter name/toString", () =>
    tsGetter.name === "get timeStamp" && /^function (get )?timeStamp\(\) \{\n    \[native code\]\n\}$/.test(toString.call(tsGetter)) ||
    `${tsGetter.name} | ${toString.call(tsGetter)}`);
  check("onmousemove setter name/length", () => onmousemove.set.name === "set onmousemove" && onmousemove.set.length === 1 || `${onmousemove.set.name}/${onmousemove.set.length}`);
  check("onmousemove getter returns what was set", () => {
    const el = document.createElement("div");
    const f = () => {};
    el.onmousemove = f;
    return el.onmousemove === f;
  });
  check("illegal invocation throws native TypeError", () => {
    try {
      add.call({}, "click", () => {});
      return "no throw";
    } catch (e) {
      return (e instanceof TypeError && !String(e.stack).includes("moz-extension")) || String(e);
    }
  });
  check("not enough arguments throws", () => {
    try { document.addEventListener("click"); return "no throw"; } catch (e) { return e instanceof TypeError; }
  });
  const thirdParty = window.fixture.registerFromThirdParty;
  check("no extension URL in wrapped listener stacks", () => {
    let stack = "";
    const el = document.createElement("div");
    thirdParty(document, "click", () => { stack = new Error().stack; });
    document.body.append(el);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.remove();
    return (stack !== "" && !stack.includes("moz-extension")) || stack || "listener not called";
  });
  check("wrapped listener exceptions reach window.onerror", () => {
    let reported = false;
    const previous = window.onerror;
    window.onerror = (message, source) => { reported = !String(source).includes("moz-extension"); return true; };
    const el = document.createElement("div");
    thirdParty(el, "mousemove", () => { throw new Error("boom"); });
    el.dispatchEvent(new MouseEvent("mousemove"));
    window.onerror = previous;
    return reported;
  });
  check("removeEventListener works", () => {
    let calls = 0;
    const el = document.createElement("div");
    const f = () => calls++;
    el.addEventListener("click", f);
    el.addEventListener("click", f);
    el.dispatchEvent(new MouseEvent("click"));
    el.removeEventListener("click", f);
    el.dispatchEvent(new MouseEvent("click"));
    return calls === 1 || `calls=${calls}`;
  });
  check("no extra globals", () => {
    const suspicious = Object.getOwnPropertyNames(window).filter((k) => /tracker|blocker|exportFunction|cloneInto|browser|chrome/i.test(k));
    return suspicious.length === 0 || suspicious.join(",");
  });
  check("no extra DOM attributes", () => document.documentElement.attributes.length === 1 || [...document.documentElement.attributes].map((a) => a.name).join(","));
  check("fresh iframe realm is protected too", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const frameAdd = frame.contentWindow.EventTarget.prototype.addEventListener;
    const ok = toString.call(frameAdd) === nativeSource("addEventListener");
    frame.remove();
    return ok;
  });
})();
