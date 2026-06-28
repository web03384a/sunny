const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(new URL("../theme-init.js", `file://${__filename}`), "utf8");

function initializeTheme(storedValue, systemDark) {
  const root = { dataset: {} };
  const meta = {
    content: null,
    setAttribute(name, value) {
      if (name === "content") this.content = value;
    }
  };
  vm.runInNewContext(source, {
    document: {
      documentElement: root,
      querySelector() { return meta; }
    },
    localStorage: { getItem() { return storedValue; } },
    window: { matchMedia() { return { matches: systemDark }; } },
    JSON
  });
  return { theme: root.dataset.theme, themeColor: meta.content };
}

assert.deepEqual(
  initializeTheme(JSON.stringify({ theme: "dark" }), false),
  { theme: "dark", themeColor: "#171316" }
);
assert.deepEqual(
  initializeTheme("{malformed", true),
  { theme: "dark", themeColor: "#171316" }
);
assert.deepEqual(
  initializeTheme(null, false),
  { theme: "light", themeColor: "#fff8f1" }
);

console.log("theme initialization tests passed");
