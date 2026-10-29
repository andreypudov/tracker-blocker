// Stand-in for a self-hosted session recorder (first-party URL, tracker by name).
(() => {
  const rec = counters("recorder");
  for (const type of ["mousemove", "click", "keydown", "input"]) {
    document.addEventListener(type, (event) => event.isTrusted && rec.bump(type), true);
  }
})();
