// Shared fixture helper: a counter table. Results are also exposed on
// window.fixture for automated runs (scripts/e2e.mjs).
window.fixture = window.fixture || { counters: {}, checks: {}, keylog: "" };

function counters(tableId) {
  const table = document.getElementById(tableId);
  const state = (window.fixture.counters[tableId] = {});
  return {
    bump(name) {
      state[name] = (state[name] || 0) + 1;
      let row = table.querySelector(`[data-name="${name}"]`);
      if (!row) {
        row = table.insertRow();
        row.dataset.name = name;
        row.insertCell().textContent = name;
        row.insertCell();
      }
      row.cells[1].textContent = String(state[name]);
    },
  };
}
