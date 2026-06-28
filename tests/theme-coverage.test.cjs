const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync(new URL("../styles.css", `file://${__filename}`), "utf8");

assert.match(
  css,
  /\.screen--teal\s*\{[^}]*#e8f8f4[^}]*#c9ebe4/s,
  "breathing needs a light teal palette"
);
assert.match(
  css,
  /html\[data-theme="dark"\]\s+\.screen--teal\s*\{[^}]*#2ca995[^}]*#16766c/s,
  "breathing needs a dark teal palette"
);
assert.match(
  css,
  /\.screen--purple\s*\{[^}]*#f4f0fc[^}]*#e3daf7/s,
  "calm sound needs a light purple palette"
);
assert.match(
  css,
  /html\[data-theme="dark"\]\s+\.screen--purple\s*\{[^}]*#382c51[^}]*#554276/s,
  "calm sound needs a dark purple palette"
);

console.log("theme coverage tests passed");
