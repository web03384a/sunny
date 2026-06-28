# Code Review — Round 2 (Verification)

**Scope:** `index.html`, `app.js`, `styles.css`, `sw.js`, `theme-init.js`, `manifest.webmanifest`, `icons/`, `tests/` (the `ignore/` folder was excluded as requested).
**Date:** 2026-06-28
**Purpose:** Verify that the findings from the first review (see `CODE_REVIEW.md`) were implemented correctly, check for regressions, and surface any new issues.
**Method:** Re-read every source file, ran the new test suite, and swept for orphaned references, stale cache names, missing assets, and CSP incompatibilities.

---

## Summary

**All prior findings are fixed — and most were implemented more thoroughly than recommended.** A full dark-mode theme system was added on top, with a passing test suite. No regressions were found. Only three low-priority new items remain, none blocking a phone install.

---

## Verification of prior findings

| # | Original finding | Status | Evidence |
|---|------------------|--------|----------|
| Important 1 | `planScreen()` crash on tampered/legacy state | ✅ **Exceeded** | `app.js:189` adds the `\|\| moods.overwhelmed` fallback **and** a full input-sanitization layer on load (`app.js:56–95`) validating mood, step (0–5), array membership/ranges, sound progress, reflection, and theme |
| Important 2 | Stale UI after returning from backgrounded tab | ✅ Fixed | `visibilitychange` now calls `render(false, false)` after stopping (`app.js:707–713`) |
| Important 3 | Service-worker cache poisoning | ✅ **Rewritten** | `sw.js` now validates every response via `isSafeResponse()` (checks `ok`, `redirected`, origin, content-type; navigations must contain `id="app-screen"` and `./app.js`). Cache-first shell with stale-while-revalidate + a separate runtime font cache with `trimRuntimeCache()` (max 20 entries) |
| Important 4 | `AudioContext` never suspended → battery drain | ✅ Fixed | `stopSound()` schedules `audio.suspend()` after the fade-out (`app.js:608–613`); the pending suspend is cancelled when playback restarts (`app.js:501–502`) |
| Suggestion 3 | Dead params (`header` `dark`, `stopSound` `update`) | ✅ Removed | `header(label)` (`app.js:153`), `stopSound()` (`app.js:601`) |
| Suggestion 4 | Inconsistent `esc()` | ✅ Fixed | `esc()` now wraps all labels, icons, and messages (grounding/movement/spark/reflection) |
| Suggestion 5 | Network-first service worker | ✅ Fixed | Cache-first shell + stale-while-revalidate (`sw.js:67–83`) |
| Suggestion 6 | Replayed completed sound jumps to "done" | ✅ Fixed | Resets progress to 0 when ≥100 before replay (`app.js:624–626`) |
| Suggestion 7 | SVG-only PWA icons | ✅ Fixed | `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` added and precached |
| Suggestion 8 | Custom property on `AudioContext` | ✅ Fixed | Replaced with module-level `activeSoundCleanup` (`app.js:100`) |
| Security | No Content-Security-Policy | ✅ Added | Strict CSP at `index.html:6` with `script-src 'self'`; verified **no inline scripts or inline event handlers** exist, so the strict policy does not break the app |
| Samsung 1 | Manifest `orientation: "any"` | ✅ Fixed | `manifest.webmanifest:10` → `"portrait"` |
| Samsung 2 | `color-mix()` without fallback | ✅ Fixed | Every `color-mix` is now preceded by a plain `background:`/`box-shadow:` fallback (`styles.css:273/274, 331/332, 367/368, 456/457, 478/479, 486/487`) |
| Samsung 3 | Non-standard font weights not loaded | ✅ Fixed | Variable ranges requested: `Baloo+2:wght@400..800` and `Figtree:wght@400..900` (`index.html:16`) |

---

## New feature added since round 1: Dark mode

A theme system was introduced and is well-built:
- **Flash-free init:** `theme-init.js` runs render-blocking in `<head>` to set `data-theme` before first paint (correct approach to avoid FOUC).
- **State integration:** `theme` is part of persisted state, sanitized on load, and preserved across resets (`{ ...defaults, theme: state.theme }`).
- **Transitions:** uses the View Transitions API (`document.startViewTransition`) with a CSS fallback (`.theme-changing`), and respects `prefers-reduced-motion` (`styles.css:871–872`).
- **Coverage:** dark variants are defined comprehensively (screens, cards, buttons, meters, bubbles, reflection, celebration, toasts).
- **Accessibility:** the toggle exposes `aria-pressed` and a descriptive `aria-label`.

### Tests (new)
Three Node test files were added and **all pass**:
```
node --test tests/*.cjs
# state-validation.test.cjs  ✔
# theme-init.test.cjs        ✔
# theme-coverage.test.cjs    ✔  (3 pass, 0 fail)
```

### Verified: `screen--dark` removal is correct, not a contrast bug
The `screen--dark` class was removed from the breathe/sound markup. This is intentional, not a regression: those screens were redesigned to **light** gradients in light mode (`.screen--teal`/`.screen--purple` at `styles.css:230–231`), with the original dark gradients + white text now scoped under `html[data-theme="dark"]` (`styles.css:234–243`). Light-mode contrast (dark `--ink` text on light backgrounds) and dark-mode contrast (white text on dark gradients) both check out.

---

## Regression sweep — clean
- No orphaned `.screen--dark` rules in `app.js` or `styles.css`.
- No stale cache names (`sunny-v4`) or `sunnyCleanup` references remain.
- All 9 service-worker precached assets exist on disk.
- Theme toggle during active sound playback does not interrupt audio (nodes are independent of re-render; `soundTimer` re-queries the rebuilt DOM).
- Audio suspend timing is correctly ordered after node teardown (320 ms cleanup < 400 ms suspend).

---

## New findings (all low priority — none blocking)

### Suggestion N1 — Maskable icon lacks safe-zone padding — `icons/icon.svg`, `manifest.webmanifest:11-29`
Icons are declared `"purpose": "any maskable"`, but the artwork's 8 decorative sun-ray dots sit ~45 px from the 512-canvas edge — outside the 80% "maskable safe zone." On Samsung/Android adaptive-icon masks (circle/squircle), the ray tips can be **clipped**, and the same artwork is used for the PNGs.
**Fix:** pad the artwork into the central ~80%, or split into two declarations — a full-bleed icon as `"purpose": "maskable"` and the detailed icon as `"purpose": "any"`.

### Suggestion N2 — `<meta>` CSP cannot enforce `frame-ancestors` — `index.html:6`
A CSP delivered via `<meta>` ignores `frame-ancestors`, so there is no clickjacking protection. Low risk for a standalone PWA, but for complete hardening serve the CSP as an **HTTP response header** at the host (which also enables `frame-ancestors 'none'`).

### Suggestion N3 — No test runner script / `package.json`
Tests must be run as `node --test tests/*.cjs`; `node --test tests/` fails on current Node. A minimal `package.json` with a `"test"` script would document the correct invocation. (Developer-experience only.)

### Note N4 — Harmless no-op suspend timer
`stopSound()` schedules a 400 ms `audio.suspend()` timer on every screen advance (`next()`/`reset()` call it) even when no audio ever played. It is guarded by `audio?.state === "running"`, so it is a no-op when `audio` is `null`. Negligible; not worth changing.

---

## Verdict
The four phone-install concerns — **security/exploits, battery/resource use, offline & online↔offline behavior, and Samsung Galaxy S UX** — are all addressed. The remaining items (N1–N3) are cosmetic/hardening/DX polish. The app is in good shape to install on a phone.
