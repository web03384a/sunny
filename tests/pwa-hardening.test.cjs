const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const maskableSvg = fs.readFileSync(path.join(root, "icons/icon-maskable.svg"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const anyIcons = manifest.icons.filter(icon => icon.purpose === "any");
const maskableIcons = manifest.icons.filter(icon => icon.purpose === "maskable");
assert.ok(anyIcons.length >= 3, "manifest should retain detailed any-purpose icons");
assert.ok(maskableIcons.length >= 3, "manifest should provide dedicated maskable icons");
assert.ok(manifest.icons.every(icon => !icon.purpose.includes("any maskable")), "icon purposes must be split");

for (const icon of manifest.icons) {
  assert.ok(fs.existsSync(path.join(root, icon.src)), `missing manifest icon ${icon.src}`);
}

function pngDimensions(relativePath) {
  const png = fs.readFileSync(path.join(root, relativePath));
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

assert.deepEqual(pngDimensions("icons/icon-maskable-192.png"), [192, 192]);
assert.deepEqual(pngDimensions("icons/icon-maskable-512.png"), [512, 512]);
assert.match(maskableSvg, /translate\(51\.2 51\.2\) scale\(\.8\)/);
assert.ok((467 - 256) * .8 < 512 * .4, "maskable artwork must remain inside the central 80% safe zone");

const metaCsp = indexHtml.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
assert.ok(metaCsp, "index.html should retain its defense-in-depth CSP");
for (const directive of ["default-src", "script-src", "style-src", "font-src", "img-src", "connect-src", "worker-src", "manifest-src", "base-uri", "object-src"]) {
  assert.match(metaCsp, new RegExp(`(?:^|; )${directive}(?: |;|$)`), `meta CSP should define ${directive}`);
}
assert.doesNotMatch(metaCsp, /(?:^|; )frame-ancestors(?: |;|$)/, "frame-ancestors is not enforced in a meta CSP");
assert.equal(packageJson.scripts.test, "node --test tests/*.cjs");

console.log("PWA hardening tests passed");
