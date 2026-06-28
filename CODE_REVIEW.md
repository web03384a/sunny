# Code Review — Sunny

**Scope:** `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` (the `ignore/` folder was excluded as requested).
**Date:** 2026-06-27
**Reviewer:** Claude Code (5-axis review: correctness, readability, architecture, security, performance)

## Overview

Sunny is a client-only PWA: a short, mood-driven wellbeing "reset" built in vanilla JS, CSS, and HTML with no build step and no backend. State lives in `localStorage`; sound is synthesized with the Web Audio API; offline support comes from a service worker.

Overall this is **clean, thoughtful, well-organized code**. Accessibility is taken seriously (skip link, focus management, `aria-pressed`/`aria-live`, reduced-motion and high-contrast media queries). There are **no critical correctness or security defects** — the issues below are mostly robustness, dead code, and small UX/architecture refinements.

> **Addendum (2026-06-27):** A second pass was done at the user's request specifically targeting four phone-install concerns — (1) security/exploits, (2) battery/resource drain, (3) offline & online↔offline transitions, (4) Samsung Galaxy S UX. See the [**Phone-install review**](#phone-install-review-requested-follow-up) section. That pass added two **Important** findings (#3 service-worker cache poisoning, #4 AudioContext never suspended) plus several suggestions.

---

## Findings

### Critical
_None._

### Important

#### 1. `planScreen()` can throw on tampered/legacy stored state — `app.js:130`
```js
function planScreen() {
  const mood = moods[state.mood];          // no fallback
  ...
  style="--mood-bg:${mood.bg};--mood-ink:${mood.ink}"   // throws if mood is undefined
```
State is rehydrated from `localStorage` (`app.js:53-62`) with no schema validation. If `state.mood` holds a value that is no longer a valid key (e.g. a renamed mood after an update, or a manually edited storage entry) and `state.step === 1`, this dereferences `undefined` and the screen crashes to a blank app.

Note the inconsistency: `completionScreen()` (`app.js:327`) already guards this exact case with `moods[state.mood] || moods.overwhelmed`. `journey()` (`app.js:70`) also falls back. `planScreen()` is the one path that does not.

**Fix:** mirror the existing fallback — `const mood = moods[state.mood] || moods.overwhelmed;` — or, better, validate `saved.mood` against `moods` when rehydrating and drop it (reset to step 0) if invalid.

#### 2. Stale UI after returning from a backgrounded tab — `app.js:624-630`
```js
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.playing) {
    stopSound();
    state.playing = false;
    save();
    // no render()
  }
});
```
When the tab is hidden during sound playback, audio stops and `state.playing` is set to `false`, but the DOM is never re-rendered. On return, the UI still shows the **pause icon** and the **`is-playing` equalizer animation** (CSS class set at last render) even though nothing is playing. Tapping the (now mislabeled) "pause" button actually *starts* playback. It self-corrects, but the intermediate state is confusing.

**Fix:** call `render(false, false)` after stopping, or update the affected nodes the way `toggleSound()` does on completion.

#### 3. Service worker caches every response unconditionally → cache poisoning (offline reliability) — `sw.js:21-24`
```js
fetch(event.request).then(response => {
  const copy = response.clone();
  caches.open(CACHE).then(cache => cache.put(event.request, copy));   // no status/type check
  return response;
})
```
On mobile, networks are frequently *flaky or captive* (hotel/airport/coffee-shop Wi‑Fi). In those conditions `fetch` often **resolves successfully** with the wrong payload: a captive-portal login page (`200 OK` HTML) for `./app.js`, or a `404`/`5xx`/redirect. This handler writes whatever came back into the cache. Once poisoned, the bad copy is served from cache on subsequent **offline** loads — persistently breaking the installed app until the cache is manually cleared. This is the single most likely way the app "glitches in offline mode."

**Fix:** only cache good, expected responses. Same-origin assets should require `response.ok`; keep cross-origin font responses (which are *opaque*, so `ok === false`) cached deliberately:
```js
.then(response => {
  const ok = response.ok || response.type === "opaque";
  if (ok) {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
  }
  return response;
})
```

#### 4. `AudioContext` is never suspended or closed → ongoing battery drain (resource use) — `app.js:443-444`, `app.js:539-547`
```js
audio ||= new AudioContext();
if (audio.state === "suspended") audio.resume();
// ...stopSound() disconnects nodes but never suspends/closes the context
```
The context is created once and **resumed**, but `stopSound()` only tears down the audio *nodes* — it never `suspend()`s the context. After the first sound plays, the `AudioContext` stays in the `"running"` state for the entire app lifetime, which keeps the device's audio hardware/clock awake and draws power even in silence. This is exactly the kind of "battery drain because of bad code" to avoid on a phone.

**Fix:** after teardown, suspend the context:
```js
function stopSound(update = true) {
  window.clearInterval(soundTimer);
  soundTimer = null;
  if (audio?.sunnyCleanup) { audio.sunnyCleanup(); audio.sunnyCleanup = null; }
  if (audio && audio.state === "running") {
    // small delay so the 320ms fade-out in cleanup can finish first
    window.setTimeout(() => { audio?.suspend?.(); }, 400);
  }
  if (update) state.playing = false;
}
```
The existing `audio.resume()` on the next play already covers waking it back up. (The `visibilitychange` handler at `app.js:624` should suspend too, for the same reason.)

### Suggestions

#### 3. Dead parameters / unused code paths (readability)
- `header(label, dark = false)` — `app.js:97`: the `dark` argument is passed (`breatheScreen` line 254, `soundScreen` line 280) but **never read** in the function body; dark styling is handled entirely by the `.screen--dark` CSS class. Remove the parameter and its call-site arguments.
- `stopSound(update = true)` — `app.js:539`: every caller uses the default; the `update === false` branch is never exercised. Drop the parameter unless a caller is planned.

#### 4. `esc()` applied inconsistently (defensive consistency) — e.g. `app.js:211, 241, 317`
Grounding/movement/spark labels are interpolated raw (`${label}`) while most other dynamic-looking values go through `esc()`. This is **safe today** because every interpolated value originates from the hard-coded `moods`/`activities`/`senses`/`moves`/`options` constants — there is no user-supplied free text anywhere, so there is no live XSS vector. But the heavy `innerHTML` rendering pattern is a footgun: the day any user-entered string (a journal note, a custom mood label) is added, an unescaped sink becomes a real injection. Either escape uniformly, or add a comment noting these inputs are trusted constants.

#### 5. Service worker is network-first for everything — `sw.js:17-32`
```js
fetch(event.request).then(...cache...).catch(async () => caches.match(...))
```
Every navigation and asset request waits on the network first and only falls back to cache on failure. For an offline-first PWA whose assets are content-stable, this gives slower repeat loads and no benefit on flaky (not fully offline) connections. Consider **cache-first / stale-while-revalidate** for the static app shell (`index.html`, `app.js`, `styles.css`, icons) while keeping network-first only where freshness matters. Also note the runtime cache stores *all* successful GET responses including cross-origin Google Fonts requests — fine functionally, but the cache grows unbounded with no trimming.

#### 6. Replaying a completed sound jumps straight to "done" — `app.js:559-573`
`soundProgress[type]` persists at 100. Re-entering and pressing play starts the interval at `min(100, 100 + 5) = 100`, so it immediately stops and fires the "A small pause, completed." toast with no actual listening time. Consider resetting progress to 0 when (re)starting a finished sound.

#### 7. PWA icon set is SVG-only — `manifest.webmanifest:11-18`
A single SVG marked `"any maskable"` works on modern Chrome/Android, but some install surfaces and OS launchers still expect rasterized PNGs at `192x192` and `512x512`. Adding those improves installability and home-screen icon fidelity across platforms.

#### 8. Minor architecture note: custom property on `AudioContext` — `app.js:483, 524`
Cleanup is stashed as `audio.sunnyCleanup = () => {...}` (a non-standard property bolted onto the `AudioContext`). It works, but a module-scoped `let activeSoundCleanup = null;` would be clearer and keeps the audio teardown contract explicit rather than hidden on a host object.

---

## Phone-install review (requested follow-up)

Targeted pass against the four stated requirements. Each is graded **PASS** (no action needed), **PASS with fix** (works but a finding above/below should be addressed), or **RISK**.

### 1. Security issues / possible exploits — **PASS with fixes (hardening only)**
No live exploit vector was found. The app has **no backend, no user free‑text input, no `eval`/`new Function`, no dynamic script injection**, and only stores its own state in `localStorage`. The heavy `innerHTML` usage interpolates only hard-coded constants plus `esc()`-guarded values, so there is no reachable XSS sink today (see finding #4 in Suggestions for the latent risk). Tampered `localStorage` causes a crash (Important #1), not code execution.

Recommended hardening for an installed app:
- **Add a Content-Security-Policy** (`<meta http-equiv="Content-Security-Policy">` in `index.html:3-17`). Because all scripts are external (`app.js`, no inline `<script>`), a strict `script-src 'self'` is achievable and would neutralize any future injected-script class of bug. Suggested starting point:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'`
  (`'unsafe-inline'` is required for `style-src` only, because the markup uses inline `style="..."` attributes extensively — `script-src` can stay strict.)
- **Third-party font dependency** (`index.html:14`): the app pulls CSS+fonts from `fonts.googleapis.com`/`fonts.gstatic.com`. That's a supply-chain surface (a compromised font CSS could restyle the UI) and a privacy/offline consideration. **Self-hosting the two fonts** removes the third party entirely, lets you precache them in the service worker, and tightens the CSP above to `'self'`. See offline item #3 below for the related benefit.
- Service-worker cache poisoning (**Important #3**) is also partly a security/integrity concern: without the `response.ok` guard, a hostile captive portal can plant content into the app's cache.

### 2. Resource intensive / battery drain — **PASS with fix**
- **Main issue: the `AudioContext` is never suspended (Important #4).** Fix as described — this is the one real battery offender.
- **CSS animations are well-contained.** The continuously-running background animations (`.orb` drift ×4, `.brand__sun` soft-pulse) live in `.ambient`/`.intro`, which are **`display:none` on phones** (`styles.css:676`) — so they never run on the target device. 
- The remaining on-device infinite animations are screen-scoped and cheap: `.breath-button` (one GPU `transform: scale`, only while the breathe screen is visible) and `.completion` sparkle (one small element). The `.equalizer` is `animation-play-state: paused` unless actively playing (`styles.css:419-420`). All are disabled under `prefers-reduced-motion` (`styles.css:715`). **Good.**
- **No `requestAnimationFrame` render loops, no polling.** Timers (`soundTimer` 1 s, chime interval 1.45 s) are created only during playback and cleared on stop/next/reset/visibility-hidden. Event listeners are attached once via delegation, not per render — **no listener leak across resets**. **Good.**
- Full-screen `innerHTML` rebuild on every tap (e.g. each of 9 bubble pops) is trivial CPU at this size and is not a battery concern.

### 3. Offline glitches / online↔offline transitions — **PASS with fixes**
- **In-session transitions are robust.** After the initial load, the SPA makes **zero network requests** — navigation between screens is pure JS, and sound is **synthesized locally via Web Audio** (no streaming). So dropping from online to offline mid-session has no effect on the running app. **Good, and directly relevant to the concern.**
- **Cache poisoning on flaky/captive networks (Important #3)** is the most likely offline glitch — fix the SW guard.
- **Cold start is network-first (`sw.js:17-32`), which is the wrong default for mobile.** Every cold launch waits for the network (or its timeout) before falling back to cache, so on flaky connections the app feels slow/frozen to start even though a perfectly good cached copy exists. **Recommend cache-first / stale-while-revalidate for the static shell** (`index.html`, `app.js`, `styles.css`, icons), keeping network-first only where freshness matters. This makes offline/flaky launches instant. (Same point as Suggestion #5.)
- **Fonts aren't precached** (`sw.js:2` `ASSETS` lists only local files). On a first run that is already offline, headings fall back from *Baloo 2* to generic `sans-serif` — **degraded, not broken** (the `font-family` stacks include fallbacks). Self-hosting the fonts (security item #1) and adding them to `ASSETS` makes offline typography consistent.
- Minor: the SW caches **non-200 responses** too (covered by the #3 fix), so a transient `404`/`5xx` won't be persisted as a "good" offline copy.

### 4. Broken UX on Samsung Galaxy S — **PASS with fixes**
Tested mentally against Samsung Internet (the Galaxy default browser, Chromium-based but often a few versions behind) and Galaxy S hardware traits (punch-hole/curved displays, gesture nav, auto-rotate).
- **Good baseline:** `viewport-fit=cover` + `env(safe-area-inset-top/bottom)` (`index.html:5`, `styles.css:230,682-683`) handle the gesture bar and status area; `100dvh` with `100vh` fallback handles the dynamic toolbar; `-webkit-tap-highlight-color: transparent` and `overscroll-behavior: contain` remove Samsung's tap-flash and pull-to-refresh interference; tap targets are comfortably ≥44 px.
- **`color-mix()` has no fallback (`styles.css:206,382`) — RISK on older Samsung Internet.** `color-mix()` shipped in Chromium 111; Galaxy S phones on an older Samsung Internet build won't support it. Where unsupported, the whole declaration is dropped, so:
  - `.breath-orbit::before` (`styles.css:382`) loses its teal inner disc → the breathe screen's center looks half-rendered.
  - `.reset-button` (`styles.css:206`) loses its pill background.
  **Fix:** add a solid fallback *before* each `color-mix` line, e.g. `.breath-orbit::before { background: #218b7c; background: color-mix(in srgb, #218b7c 94%, transparent); }` (the 94%/transparent mix is visually almost identical to solid here). The `.mood-card:hover` mix (`styles.css:259`) is hover-only and irrelevant on touch.
- **Manifest `orientation: "any"` (`manifest.webmanifest:10`) — RISK of broken landscape.** This is a portrait-shaped app, but `"any"` lets the installed PWA rotate. In landscape, `.phone { min-height: 560px }` (`styles.css:679`) exceeds the viewport height, forcing the layout to overflow/scroll and pushing the footer button off-screen. **Recommend `"orientation": "portrait"`** to lock it (matches the design intent and avoids the issue entirely).
- **Non-standard font weights silently rounded — visual fidelity (all devices, incl. Galaxy).** The CSS requests `550/650/750/850` (`styles.css:118,139,176,234,…`), but the Google Fonts request only loads static instances `400;500;600;700;800` (Figtree) and `600;700;800` (Baloo 2) (`index.html:14`). The missing weights round to the nearest loaded face, so the intended weights never render. **Fix:** request variable ranges, e.g. `Baloo+2:wght@400..800&family=Figtree:wght@400..800`.
- Low risk: heavy reliance on `aspect-ratio` (bubbles, `.sound-art`) — fine on current Samsung Internet (auto-updates via Play Store); would only collapse on very old builds.

---

## What's done well
- **Accessibility:** skip link, programmatic focus to headings on screen change (`app.js:386-394`), `aria-pressed`/`aria-live`/`role="status"`, `prefers-reduced-motion` and `prefers-contrast` handling.
- **Resilience:** `try/catch` around `localStorage` read *and* write (private-mode safe), graceful Web Audio degradation ("sound is an enhancement"), and audio teardown that tolerates already-stopped nodes.
- **State model:** small, centralized `setState` → `save` → `render` loop is easy to follow; sound progress updates the DOM directly to avoid re-render churn during playback.
- **No secrets, no backend, no untrusted input** — the security surface is genuinely small.
