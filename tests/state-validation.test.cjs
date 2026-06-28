const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(new URL("../app.js", `file://${__filename}`), "utf8");

function bootWithStoredState(storedState) {
  const appListeners = {};
  const documentListeners = {};
  const app = {
    innerHTML: "",
    addEventListener(type, callback) { appListeners[type] = callback; },
    querySelector() { return null; }
  };
  const inertElement = {
    hidden: true,
    innerHTML: "",
    addEventListener() {},
    setAttribute() {}
  };
  const document = {
    hidden: false,
    documentElement: {
      dataset: {},
      classList: { add() {}, remove() {} }
    },
    addEventListener(type, callback) { documentListeners[type] = callback; },
    querySelector(selector) {
      if (selector === "#app-screen") return app;
      return inertElement;
    }
  };
  const context = {
    console,
    document,
    navigator: {},
    location: { protocol: "file:" },
    localStorage: {
      getItem() { return JSON.stringify(storedState); },
      setItem() {}
    },
    window: {
      addEventListener() {},
      clearInterval,
      clearTimeout,
      confirm() { return true; },
      setInterval,
      setTimeout
    },
    requestAnimationFrame(callback) { callback(); },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, context);
  return { app, appListeners, document, documentListeners };
}

function renderWithStoredState(storedState) {
  return bootWithStoredState(storedState).app.innerHTML;
}

assert.match(
  renderWithStoredState({ step: 1, mood: "removed-mood" }),
  /How are you feeling right now\?/,
  "invalid stored moods should reset to the check-in"
);

assert.match(
  renderWithStoredState({ step: 1, mood: "lowenergy" }),
  /Tailored for/,
  "valid legacy state should still render its plan"
);

assert.match(
  renderWithStoredState({
    step: 2,
    mood: "lowenergy",
    completed: { movement: "not-an-array", breathe: 999, spark: 99 },
    soundProgress: { listenUp: 999 }
  }),
  /Shake it out/,
  "malformed nested progress should be sanitized without crashing"
);

const darkThemeCase = bootWithStoredState({ step: 0, theme: "dark" });
assert.equal(darkThemeCase.document.documentElement.dataset.theme, "dark");
assert.match(darkThemeCase.app.innerHTML, /aria-label="Switch to light theme"/);
darkThemeCase.appListeners.click({
  target: {
    closest() { return { dataset: { action: "theme" } }; }
  }
});
assert.equal(darkThemeCase.document.documentElement.dataset.theme, "light");
assert.match(darkThemeCase.app.innerHTML, /aria-label="Switch to dark theme"/);

const completionThemeCase = bootWithStoredState({
  step: 5,
  mood: "good",
  theme: "dark",
  completed: { pop: [0, 1, 2, 3, 4, 5, 6, 7, 8], spark: 0 },
  reflection: "steadier"
});
assert.match(completionThemeCase.app.innerHTML, /class="completion-theme"/);
assert.match(completionThemeCase.app.innerHTML, /aria-label="Switch to light theme"/);
completionThemeCase.appListeners.click({
  target: {
    closest() { return { dataset: { action: "new-journey" } }; }
  }
});
assert.equal(completionThemeCase.document.documentElement.dataset.theme, "dark");
assert.match(completionThemeCase.app.innerHTML, /How are you feeling right now\?/);

for (let step = 0; step <= 5; step += 1) {
  const screen = bootWithStoredState({
    step,
    mood: step === 0 ? null : "lowenergy",
    theme: "dark",
    completed: { movement: [0, 1, 2], spark: 1 }
  });
  assert.match(screen.app.innerHTML, /data-action="theme"/, `theme control should be available on step ${step}`);
}

const themedActivities = [
  [{ step: 2, mood: "stressed" }, "screen--teal"],
  [{ step: 3, mood: "stressed" }, "screen--blue"],
  [{ step: 4, mood: "stressed" }, "screen--purple"],
  [{ step: 3, mood: "overwhelmed" }, "screen--sunrise"],
  [{ step: 2, mood: "agitated" }, "screen--sunrise"],
  [{ step: 3, mood: "lowenergy" }, "screen--sunrise"],
  [{ step: 4, mood: "lowenergy" }, "screen--sunrise"]
];
for (const [storedState, expectedClass] of themedActivities) {
  const screen = bootWithStoredState({ ...storedState, theme: "light" });
  assert.match(screen.app.innerHTML, new RegExp(expectedClass));
  assert.match(screen.app.innerHTML, /data-action="theme"/);
}
assert.doesNotMatch(source, /screen--dark/, "no activity screen should bypass the global theme");

const backgroundCase = bootWithStoredState({
  step: 3,
  mood: "lowenergy",
  completed: { movement: [0, 1, 2] },
  soundProgress: { listenUp: 10 }
});
backgroundCase.appListeners.click({
  target: {
    closest() { return { dataset: { action: "play" } }; }
  }
});
assert.match(backgroundCase.app.innerHTML, /aria-label="Pause sound"/);
backgroundCase.document.hidden = true;
backgroundCase.documentListeners.visibilitychange();
assert.match(backgroundCase.app.innerHTML, /aria-label="Play sound"/);
assert.doesNotMatch(backgroundCase.app.innerHTML, /equalizer is-playing/);

console.log("state validation tests passed");
