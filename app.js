(() => {
  "use strict";

  const STORAGE_KEY = "sunny-state-v1";
  const moods = {
    stressed: { label: "Stressed", color: "#45b9a5", bg: "#e3f5f1", ink: "#245a50" },
    overwhelmed: { label: "Overwhelmed", color: "#9b83de", bg: "#eee9fa", ink: "#4c3973" },
    agitated: { label: "Agitated", color: "#f56f47", bg: "#fbe5dc", ink: "#913d22" },
    lowenergy: { label: "Low energy", color: "#ffc44f", bg: "#fff2d5", ink: "#765710" },
    disengaged: { label: "Disengaged", color: "#f17fa5", bg: "#fbe4ec", ink: "#923d5e" },
    good: { label: "Pretty good", color: "#86c765", bg: "#e6f2db", ink: "#46682f" }
  };

  const activities = {
    breathe: { name: "Breathe", short: "Breathe", desc: "Four long, slow exhales", cta: "I feel calmer", theme: "teal" },
    grounding: { name: "Ground", short: "Ground", desc: "Come back to your senses", cta: "I’m back in my body", theme: "blue" },
    movement: { name: "Shake it out", short: "Move", desc: "Move the energy through", cta: "Shaken loose", theme: "sunrise" },
    listenCalm: { name: "Calm sound", short: "Listen", desc: "A soft ambient moment", cta: "I feel settled", theme: "purple" },
    listenUp: { name: "Bright sound", short: "Listen", desc: "An upbeat little lift", cta: "Brighter already", theme: "sunrise" },
    spark: { name: "Spark", short: "Spark", desc: "One small connection", cta: "I’ll do it", theme: "sunrise" },
    pop: { name: "Tiny lift", short: "Play", desc: "Pop what’s on your mind", cta: "All clear", theme: "sunrise" }
  };

  const journeys = {
    stressed: { why: "You’re wound tight. Let’s slow the body, anchor your senses, then quiet the mind.", steps: ["breathe", "grounding", "listenCalm"] },
    overwhelmed: { why: "Too much at once. Let’s anchor to right now, clear some noise, then soften the edges.", steps: ["grounding", "pop", "listenCalm"] },
    agitated: { why: "That restless heat needs somewhere to go. Move it out, cool it down, then settle.", steps: ["movement", "breathe", "listenCalm"] },
    lowenergy: { why: "Running on empty. Let’s wake the body, lift the tempo, then step toward a little light.", steps: ["movement", "listenUp", "spark"] },
    disengaged: { why: "Feeling far away. Let’s reconnect your senses, make contact, then bring some color back.", steps: ["grounding", "spark", "listenUp"] },
    good: { why: "Already glowing. Let’s keep it going with play, a bright sound, and some kindness to pass on.", steps: ["pop", "listenUp", "spark"] }
  };

  const activityColors = {
    breathe: ["#45b9a5", "#e3f5f1"],
    grounding: ["#5f8fe8", "#e7efff"],
    movement: ["#f56f47", "#fbe5dc"],
    listenCalm: ["#9b83de", "#eee9fa"],
    listenUp: ["#e6962e", "#fff0d7"],
    spark: ["#df4f86", "#fbe4ec"],
    pop: ["#f17fa5", "#fbe4ec"]
  };

  const preferredTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const defaults = {
    step: 0,
    mood: null,
    completed: {},
    soundProgress: {},
    playing: false,
    reflection: null,
    completedAt: null,
    theme: preferredTheme
  };

  const saved = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const mood = Object.prototype.hasOwnProperty.call(moods, parsed.mood) ? parsed.mood : null;
      const step = Number.isInteger(parsed.step) && parsed.step >= 0 && parsed.step <= 5 ? parsed.step : 0;
      const normalizedStep = step > 0 && !mood ? 0 : step;

      const uniqueInts = (value, max) => Array.isArray(value)
        ? [...new Set(value.filter(item => Number.isInteger(item) && item >= 0 && item <= max))]
        : [];
      const completed = {};
      if (Number.isFinite(parsed.completed?.breathe)) completed.breathe = Math.max(0, Math.min(4, Number(parsed.completed.breathe)));
      completed.grounding = uniqueInts(parsed.completed?.grounding, 4);
      completed.movement = uniqueInts(parsed.completed?.movement, 2);
      completed.pop = uniqueInts(parsed.completed?.pop, 8);
      if (Number.isInteger(parsed.completed?.spark) && parsed.completed.spark >= 0 && parsed.completed.spark <= 2) {
        completed.spark = parsed.completed.spark;
      }

      const soundProgress = {};
      ["listenCalm", "listenUp"].forEach(type => {
        if (Number.isFinite(parsed.soundProgress?.[type])) {
          soundProgress[type] = Math.max(0, Math.min(100, Number(parsed.soundProgress[type])));
        }
      });

      return {
        step: normalizedStep,
        mood: normalizedStep > 0 ? mood : null,
        completed,
        soundProgress,
        reflection: ["lighter", "steadier", "same"].includes(parsed.reflection) ? parsed.reflection : null,
        completedAt: Number.isFinite(parsed.completedAt) ? parsed.completedAt : null,
        theme: ["light", "dark"].includes(parsed.theme) ? parsed.theme : preferredTheme
      };
    } catch {
      return {};
    }
  })();

  let state = { ...defaults, ...saved, playing: false };
  let soundTimer = null;
  let audio = null;
  let activeSoundCleanup = null;
  let audioSuspendTimer = null;
  let installPrompt = null;
  const app = document.querySelector("#app-screen");
  const toastRegion = document.querySelector("#toast-region");

  const esc = (value) => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  const journey = () => journeys[state.mood] || journeys.overwhelmed;
  const currentType = () => state.step >= 2 ? journey().steps[state.step - 2] : null;
  const currentData = () => state.completed[currentType()] ?? [];
  const isLast = () => state.step === 4;
  const activityIsDone = () => {
    const type = currentType();
    const data = currentData();
    if (type === "breathe") return Number(data) >= 4;
    if (type === "grounding") return data.length >= 5;
    if (type === "movement") return data.length >= 3;
    if (type === "pop") return data.length >= 9;
    if (type === "spark") return Number.isInteger(data);
    return true;
  };

  function save() {
    const stored = { ...state, playing: false };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* private mode can reject storage */ }
  }

  function applyTheme() {
    const root = document.documentElement;
    if (root) root.dataset.theme = state.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute?.(
      "content",
      state.theme === "dark" ? "#171316" : "#fff8f1"
    );
  }

  function setState(patch, options = {}) {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    applyTheme();
    save();
    const shouldFocus = options.focus !== false;
    render(shouldFocus, options.animate ?? shouldFocus);
  }

  function themeToggle() {
    const isDark = state.theme === "dark";
    const nextTheme = isDark ? "light" : "dark";
    return `<button class="theme-toggle" data-action="theme" type="button" aria-pressed="${isDark}"
      aria-label="Switch to ${nextTheme} theme" title="Switch to ${nextTheme} theme">
      <span aria-hidden="true">${isDark ? "☀" : "☾"}</span>
    </button>`;
  }

  function header(label) {
    return `
      <header class="app-header">
        <div class="app-header__row">
          <span class="step-label">Step ${state.step + 1} of 5 · ${esc(label)}</span>
          <div class="app-header__actions">
            ${themeToggle()}
            ${state.step > 0 ? `<button class="reset-button" data-action="reset" type="button" aria-label="Start a new check-in">↻ Start over</button>` : ""}
          </div>
        </div>
        <div class="progress" aria-label="Step ${state.step + 1} of 5">
          ${Array.from({ length: 5 }, (_, i) => `<span class="${i <= state.step ? "is-on" : ""}" aria-hidden="true"></span>`).join("")}
        </div>
      </header>`;
  }

  function moodScreen() {
    return `
      <section class="screen" aria-labelledby="screen-title">
        ${header("Check in")}
        <div class="screen__body">
          <h2 class="screen-title" id="screen-title">How are you feeling right now?</h2>
          <p class="screen-subtitle">Pick the closest fit. Your path changes with your answer.</p>
          <div class="mood-grid">
            ${Object.entries(moods).map(([key, mood]) => `
              <button class="mood-card" type="button" data-action="mood" data-value="${key}" data-mood="${key}"
                style="--mood:${mood.color};--mood-bg:${mood.bg};--mood-ink:${mood.ink}">
                <span class="mood-card__face" aria-hidden="true"></span>
                <span class="mood-card__label">${esc(mood.label)}</span>
              </button>`).join("")}
          </div>
        </div>
      </section>`;
  }

  function planScreen() {
    const mood = moods[state.mood] || moods.overwhelmed;
    return `
      <section class="screen" aria-labelledby="screen-title">
        ${header("Your plan")}
        <div class="screen__body">
          <div class="tailored">Tailored for <span class="mood-chip" style="--mood-bg:${mood.bg};--mood-ink:${mood.ink}">${esc(mood.label)}</span></div>
          <div class="why-card"><span>Why this path</span><p>${esc(journey().why)}</p></div>
          <p class="plan-label">Your three steps</p>
          <ol class="plan-list">
            ${journey().steps.map((type, i) => {
              const item = activities[type];
              const colors = activityColors[type];
              return `<li class="plan-item">
                <span class="plan-item__num" style="--item-color:${colors[0]};--item-bg:${colors[1]}">${i + 1}</span>
                <span><strong>${esc(item.name)}</strong><small>${esc(item.desc)}</small></span>
              </li>`;
            }).join("")}
          </ol>
        </div>
        <footer class="screen__footer">
          <button class="primary-button" type="button" data-action="next">Let’s begin <span aria-hidden="true">→</span></button>
        </footer>
      </section>`;
  }

  function activityFooter(type) {
    const done = activityIsDone();
    const label = isLast() ? "Finish my reset" : done ? activities[type].cta : "Continue when you’re ready";
    const requiresCompletion = ["breathe", "grounding", "movement", "pop", "spark"].includes(type);
    return `
      ${done && requiresCompletion ? `<div class="completion"><span aria-hidden="true">✨</span>${type === "spark" ? "That counts" : "Nicely done"}</div>` : ""}
      <footer class="screen__footer">
        <button class="primary-button ${done ? "is-ready" : ""}" type="button" data-action="next"
          ${requiresCompletion && !done ? "disabled" : ""}>${esc(label)} ${done ? '<span aria-hidden="true">→</span>' : ""}</button>
      </footer>`;
  }

  function popScreen() {
    const popped = currentData();
    const colors = ["#f17fa5", "#45b9a5", "#ffc44f", "#9b83de", "#f56f47", "#86c765", "#5f8fe8", "#ef6798", "#3fb49f"];
    return `
      <section class="screen screen--sunrise" aria-labelledby="screen-title">
        ${header(activities.pop.short)}
        <div class="screen__body screen__body--center">
          <div class="activity-heading">
            <h2 class="screen-title" id="screen-title">Pop the noise</h2>
            <p class="activity-count">Tap one bubble for each thing on your mind · ${popped.length} / 9</p>
            <div class="meter" aria-hidden="true"><div class="meter__fill" style="--progress:${popped.length / 9 * 100}%"></div></div>
          </div>
          <div class="bubble-grid" aria-label="${popped.length} of 9 bubbles popped">
            ${colors.map((color, i) => `<button class="bubble ${popped.includes(i) ? "is-popped" : ""}" type="button"
              data-action="pop" data-value="${i}" style="--bubble:${color};--delay:${i * -.11}s"
              aria-label="${popped.includes(i) ? `Bubble ${i + 1} popped` : `Pop bubble ${i + 1}`}" ${popped.includes(i) ? "disabled" : ""}></button>`).join("")}
          </div>
        </div>
        ${activityFooter("pop")}
      </section>`;
  }

  function groundingScreen() {
    const checked = currentData();
    const senses = [
      [5, "things you can see", "#45b9a5", "#e3f5f1"],
      [4, "things you can feel", "#5f8fe8", "#e7efff"],
      [3, "things you can hear", "#9b83de", "#eee9fa"],
      [2, "things you can smell", "#f17fa5", "#fbe4ec"],
      [1, "thing you can taste", "#e9aa2c", "#fff2d5"]
    ];
    return `
      <section class="screen screen--blue" aria-labelledby="screen-title">
        ${header(activities.grounding.short)}
        <div class="screen__body screen__body--center">
          <div class="activity-heading">
            <h2 class="screen-title" id="screen-title">Come back to right now</h2>
            <p class="activity-count">Notice each sense, then tap it · ${checked.length} / 5</p>
            <div class="meter" aria-hidden="true"><div class="meter__fill" style="--progress:${checked.length / 5 * 100}%"></div></div>
          </div>
          <div class="sense-list">
            ${senses.map(([num, label, color, bg], i) => `<button class="check-card ${checked.includes(i) ? "is-checked" : ""}" type="button"
              data-action="toggle" data-value="${i}" style="--item-color:${color};--item-bg:${bg}" aria-pressed="${checked.includes(i)}">
              <span class="check-card__number">${num}</span>
              <span class="check-card__text">${esc(label)}</span>
              ${checked.includes(i) ? '<span class="check-card__tick" aria-hidden="true">✓</span>' : ""}
            </button>`).join("")}
          </div>
        </div>
        ${activityFooter("grounding")}
      </section>`;
  }

  function movementScreen() {
    const checked = currentData();
    const moves = [
      ["Roll your shoulders back ×5", "#f56f47", "#fbe5dc"],
      ["Shake out both hands, fast", "#e9aa2c", "#fff2d5"],
      ["Reach up tall, then flop down", "#f17fa5", "#fbe4ec"]
    ];
    return `
      <section class="screen screen--sunrise" aria-labelledby="screen-title">
        ${header(activities.movement.short)}
        <div class="screen__body screen__body--center">
          <div class="activity-heading">
            <h2 class="screen-title" id="screen-title">Shake it out</h2>
            <p class="activity-count">Tap each move when you’ve done it · ${checked.length} / 3</p>
            <div class="meter" aria-hidden="true"><div class="meter__fill" style="--progress:${checked.length / 3 * 100}%"></div></div>
          </div>
          <div class="sound-art" aria-hidden="true" style="width:112px;--sound-one:#ffd269;--sound-two:#f8944f;--sound-three:#f17fa5"><span></span></div>
          <div class="move-list">
            ${moves.map(([label, color, bg], i) => `<button class="check-card ${checked.includes(i) ? "is-checked" : ""}" type="button"
              data-action="toggle" data-value="${i}" style="--item-color:${color};--item-bg:${bg}" aria-pressed="${checked.includes(i)}">
              <span class="check-card__number" aria-hidden="true">${i + 1}</span>
              <span class="check-card__text">${esc(label)}</span>
              ${checked.includes(i) ? '<span class="check-card__tick" aria-hidden="true">✓</span>' : ""}
            </button>`).join("")}
          </div>
        </div>
        ${activityFooter("movement")}
      </section>`;
  }

  function breatheScreen() {
    const breaths = Number(currentData()) || 0;
    return `
      <section class="screen screen--teal" aria-labelledby="screen-title">
        ${header(activities.breathe.short)}
        <div class="screen__body screen__body--center">
          <h2 class="screen-title" id="screen-title">Breathe slowly</h2>
          <p class="screen-subtitle">Follow the sun. Tap after each long exhale.</p>
          <div class="breath-wrap">
            <div class="breath-orbit" style="--progress:${breaths / 4 * 100}%">
              <button class="breath-button" type="button" data-action="breathe" ${breaths >= 4 ? "disabled" : ""}>
                ${breaths >= 4 ? "done" : "in… out"}
              </button>
            </div>
          </div>
          <p class="breath-status">${breaths} / 4 breaths</p>
        </div>
        ${activityFooter("breathe")}
      </section>`;
  }

  function soundScreen(type) {
    const calm = type === "listenCalm";
    const progress = state.soundProgress[type] || 0;
    const theme = calm ? "screen--purple" : "screen--sunrise";
    const vars = calm
      ? "--sound-one:#75cdbd;--sound-two:#8d72d5;--sound-three:#5f8fe8;--play-bg:#fff;--play-ink:#4d3c6c;--bar:#86d6c7"
      : "--sound-one:#ffd24d;--sound-two:#f98d58;--sound-three:#f16799;--play-bg:#f56f47;--play-ink:#fff;--bar:#f56f47";
    return `
      <section class="screen ${theme}" aria-labelledby="screen-title">
        ${header(activities[type].short)}
        <div class="screen__body screen__body--center" style="${vars}">
          <div class="sound-art" aria-hidden="true"></div>
          <h2 class="sound-title" id="screen-title">${calm ? "Rain through leaves" : "Morning chimes"}</h2>
          <p class="sound-meta">${calm ? "Warm, filtered rain" : "Soft pentatonic bells"} · 20 second pause</p>
          <p class="sound-hint">Set your device to a comfortable, quiet volume.</p>
          <div class="equalizer ${state.playing ? "is-playing" : ""}" aria-hidden="true">
            ${Array.from({ length: 7 }, (_, i) => `<span style="--delay:${i * -.1}s;--bar:${i % 2 ? (calm ? "#b59de9" : "#f17fa5") : (calm ? "#7fd1c1" : "#f6ad39")}"></span>`).join("")}
          </div>
          <div class="play-row">
            <button class="play-button" type="button" data-action="play" aria-label="${state.playing ? "Pause sound" : "Play sound"}">
              ${state.playing ? '<span class="play-button__pause" aria-hidden="true"></span>' : '<span class="play-button__triangle" aria-hidden="true"></span>'}
            </button>
          </div>
          <div class="sound-progress" aria-label="${progress} percent played"><span style="--progress:${progress}%"></span></div>
        </div>
        ${activityFooter(type)}
      </section>`;
  }

  function sparkScreen() {
    const selected = Number.isInteger(currentData()) ? currentData() : null;
    const options = [
      ["Text someone a little “thinking of you”", "●", "#df4f86", "#fbe4ec"],
      ["Step outside for 60 seconds of sky", "●", "#e9aa2c", "#fff2d5"],
      ["Name one person you’re glad exists", "○", "#45b9a5", "#e3f5f1"]
    ];
    return `
      <section class="screen screen--sunrise" aria-labelledby="screen-title">
        ${header(activities.spark.short)}
        <div class="screen__body">
          <h2 class="screen-title" id="screen-title">Spark a little light</h2>
          <p class="screen-subtitle">Choose one small thing. Tiny still counts.</p>
          <div class="spark-list">
            ${options.map(([label, icon, color, bg], i) => `<button class="spark-card ${selected === i ? "is-selected" : ""}" type="button"
              data-action="spark" data-value="${i}" style="--item-color:${color};--item-bg:${bg}" aria-pressed="${selected === i}">
              ${i ? `<span class="spark-card__icon" aria-hidden="true"><span class="spark-card__dot"></span></span>` : ""}
              <span class="spark-card__copy">${esc(label)}</span>
              ${selected === i ? '<span class="spark-card__tick" aria-hidden="true">✓</span>' : ""}
            </button>`).join("")}
          </div>
        </div>
        ${activityFooter("spark")}
      </section>`;
  }

  function completionScreen() {
    const mood = moods[state.mood] || moods.overwhelmed;
    const finished = journey().steps.map(type => activities[type].name);
    const reflections = {
      lighter: { label: "A little lighter", icon: "↑", message: "Hold onto that little bit of space. You made it." },
      steadier: { label: "More steady", icon: "●", message: "That steadiness is yours. You helped yourself find it." },
      same: { label: "About the same", icon: "≈", message: "Showing up still counts. Not every shift needs to be visible right away." }
    };
    const reflection = reflections[state.reflection];
    return `
      <section class="screen screen--celebration" aria-labelledby="screen-title">
        <div class="completion-theme">${themeToggle()}</div>
        <div class="celebration-particles" aria-hidden="true">
          ${Array.from({ length: 10 }, (_, i) => `<span style="--x:${5 + i * 9.7}%;--delay:${(i * .07).toFixed(2)}s;--turn:${i * 25}deg;--size:${5 + i % 3}px;--hue:${24 + i * 31}"></span>`).join("")}
        </div>
        <div class="screen__body screen__body--center celebration-body">
          <p class="celebration-eyebrow">Your reset is complete</p>
          <div class="celebration-sun" aria-hidden="true">
            <span class="celebration-sun__face"></span>
          </div>
          <h2 class="celebration-title" id="screen-title">You did it!</h2>
          <p class="celebration-copy">You made a few quiet minutes for yourself while feeling <strong>${esc(mood.label.toLowerCase())}</strong>. That deserves credit.</p>
          <div class="journey-recap" aria-label="Completed activities">
            ${finished.map((name, i) => `<span><b aria-hidden="true">✓</b>${esc(name)}</span>${i < finished.length - 1 ? '<i aria-hidden="true"></i>' : ""}`).join("")}
          </div>
          ${reflection ? `
            <div class="reflection-result" role="status">
              <span aria-hidden="true">${esc(reflection.icon)}</span>
              <div><strong>${esc(reflection.label)}</strong><p>${esc(reflection.message)}</p></div>
            </div>` : `
            <div class="reflection">
              <p id="reflection-question">How do you feel now?</p>
              <div class="reflection-options" role="group" aria-labelledby="reflection-question">
                ${Object.entries(reflections).map(([key, item]) => `<button type="button" data-action="reflect" data-value="${key}">
                  <span aria-hidden="true">${esc(item.icon)}</span>${esc(item.label)}
                </button>`).join("")}
              </div>
            </div>`}
        </div>
        <footer class="screen__footer celebration-footer">
          <button class="primary-button celebration-button" type="button" data-action="new-journey">${reflection ? "Start another reset" : "Done for now"} <span aria-hidden="true">→</span></button>
        </footer>
      </section>`;
  }

  function render(focus = false, animate = true) {
    let html;
    if (state.step === 0 || !state.mood) html = moodScreen();
    else if (state.step === 1) html = planScreen();
    else if (state.step === 5) html = completionScreen();
    else {
      const type = currentType();
      html = type === "pop" ? popScreen()
        : type === "grounding" ? groundingScreen()
        : type === "movement" ? movementScreen()
        : type === "breathe" ? breatheScreen()
        : type === "spark" ? sparkScreen()
        : soundScreen(type);
    }
    app.innerHTML = html;
    if (!animate) app.querySelector(".screen")?.classList.add("screen--stable");
    if (focus) {
      requestAnimationFrame(() => {
        const heading = app.querySelector("#screen-title");
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });
        }
      });
    }
  }

  function updateCollection(index) {
    const type = currentType();
    const values = Array.isArray(currentData()) ? currentData() : [];
    const exists = values.includes(index);
    setState({ completed: { ...state.completed, [type]: exists ? values.filter(value => value !== index) : [...values, index] } }, { focus: false });
  }

  function next() {
    stopSound();
    if (isLast()) {
      setState({ step: 5, playing: false, reflection: null, completedAt: Date.now() });
      return;
    }
    setState({ step: Math.min(4, state.step + 1), playing: false });
  }

  function reset() {
    if (state.step > 1 && !window.confirm("Start a new check-in? Your current reset will be cleared.")) return;
    stopSound();
    setState({ ...defaults, theme: state.theme });
  }

  function toast(message) {
    toastRegion.innerHTML = `<div class="toast">${esc(message)}</div>`;
    window.setTimeout(() => { toastRegion.innerHTML = ""; }, 3200);
  }

  function restoreControl(action, value = null) {
    requestAnimationFrame(() => {
      const suffix = value == null ? "" : `[data-value="${value}"]`;
      let control = app.querySelector(`[data-action="${action}"]${suffix}`);
      if (control?.disabled && action === "pop") {
        control = app.querySelector('[data-action="pop"]:not(:disabled)') || app.querySelector('[data-action="next"]');
      } else if (control?.disabled) {
        control = app.querySelector('[data-action="next"]:not(:disabled)');
      }
      control?.focus({ preventScroll: true });
    });
  }

  function startSound() {
    const type = currentType();
    const calm = type === "listenCalm";
    try {
      window.clearTimeout(audioSuspendTimer);
      audioSuspendTimer = null;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audio ||= new AudioContext();
      if (audio.state === "suspended") audio.resume();

      const master = audio.createGain();
      master.gain.setValueAtTime(.0001, audio.currentTime);
      master.gain.exponentialRampToValueAtTime(calm ? .13 : .16, audio.currentTime + 1.8);
      master.connect(audio.destination);

      if (calm) {
        const seconds = 4;
        const buffer = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate);
        const samples = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const white = Math.random() * 2 - 1;
          last = (last + .018 * white) / 1.018;
          samples[i] = last * 3.2;
        }

        const rain = audio.createBufferSource();
        const lowpass = audio.createBiquadFilter();
        const rainGain = audio.createGain();
        const tide = audio.createOscillator();
        const tideDepth = audio.createGain();
        rain.buffer = buffer;
        rain.loop = true;
        lowpass.type = "lowpass";
        lowpass.frequency.value = 720;
        lowpass.Q.value = .35;
        rainGain.gain.value = .29;
        tide.type = "sine";
        tide.frequency.value = .085;
        tideDepth.gain.value = .07;
        tide.connect(tideDepth);
        tideDepth.connect(rainGain.gain);
        rain.connect(lowpass);
        lowpass.connect(rainGain);
        rainGain.connect(master);
        rain.start();
        tide.start();
        activeSoundCleanup = () => {
          const now = audio.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(Math.max(master.gain.value, .0001), now);
          master.gain.exponentialRampToValueAtTime(.0001, now + .28);
          window.setTimeout(() => {
            try { rain.stop(); } catch { /* already stopped */ }
            try { tide.stop(); } catch { /* already stopped */ }
            [rain, lowpass, rainGain, tide, tideDepth, master].forEach(node => { try { node.disconnect(); } catch { /* disconnected */ } });
          }, 320);
        };
      } else {
        const notes = [261.63, 329.63, 392, 440, 523.25, 392, 329.63];
        const active = new Set();
        let note = 0;
        const playChime = () => {
          const now = audio.currentTime;
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          const filter = audio.createBiquadFilter();
          oscillator.type = "sine";
          oscillator.frequency.value = notes[note % notes.length];
          note += 1;
          filter.type = "lowpass";
          filter.frequency.value = 1800;
          gain.gain.setValueAtTime(.0001, now);
          gain.gain.exponentialRampToValueAtTime(.13, now + .035);
          gain.gain.exponentialRampToValueAtTime(.0001, now + 1.9);
          oscillator.connect(filter);
          filter.connect(gain);
          gain.connect(master);
          oscillator.start(now);
          oscillator.stop(now + 2);
          active.add(oscillator);
          oscillator.onended = () => {
            active.delete(oscillator);
            try { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); } catch { /* disconnected */ }
          };
        };
        playChime();
        const chimeTimer = window.setInterval(playChime, 1450);
        activeSoundCleanup = () => {
          window.clearInterval(chimeTimer);
          const now = audio.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(Math.max(master.gain.value, .0001), now);
          master.gain.exponentialRampToValueAtTime(.0001, now + .28);
          window.setTimeout(() => {
            active.forEach(node => { try { node.stop(); } catch { /* already stopped */ } });
            try { master.disconnect(); } catch { /* disconnected */ }
          }, 320);
        };
      }
    } catch { /* sound is an enhancement; the visual timer still works */ }
  }

  function stopSound() {
    window.clearInterval(soundTimer);
    soundTimer = null;
    if (activeSoundCleanup) {
      activeSoundCleanup();
      activeSoundCleanup = null;
    }
    window.clearTimeout(audioSuspendTimer);
    audioSuspendTimer = window.setTimeout(() => {
      if (audio?.state === "running" && !state.playing && !activeSoundCleanup) {
        audio.suspend().catch(() => {});
      }
    }, 400);
    state.playing = false;
  }

  function toggleSound() {
    const type = currentType();
    if (state.playing) {
      stopSound();
      setState({ playing: false }, { focus: false });
      return;
    }
    if ((state.soundProgress[type] || 0) >= 100) {
      state.soundProgress = { ...state.soundProgress, [type]: 0 };
    }
    state.playing = true;
    save();
    startSound();
    render(false, false);
    soundTimer = window.setInterval(() => {
      const progress = Math.min(100, (state.soundProgress[type] || 0) + 5);
      state.soundProgress = { ...state.soundProgress, [type]: progress };
      save();
      const bar = app.querySelector(".sound-progress span");
      if (bar) bar.style.setProperty("--progress", `${progress}%`);
      app.querySelector(".sound-progress")?.setAttribute("aria-label", `${progress} percent played`);
      if (progress >= 100) {
        stopSound();
        state.playing = false;
        save();
        render(false, false);
        toast("A small pause, completed.");
      }
    }, 1000);
  }

  app.addEventListener("click", event => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const value = Number(target.dataset.value);
    if (action === "mood") setState({ step: 1, mood: target.dataset.value, completed: {}, soundProgress: {}, reflection: null, completedAt: null });
    else if (action === "theme") {
      document.documentElement?.classList.add("theme-changing");
      const switchTheme = () => setState(
        { theme: state.theme === "dark" ? "light" : "dark" },
        { focus: false, animate: false }
      );
      if (document.startViewTransition) document.startViewTransition(switchTheme);
      else switchTheme();
      restoreControl(action);
      window.setTimeout(() => document.documentElement?.classList.remove("theme-changing"), 380);
    }
    else if (action === "next") next();
    else if (action === "reset") reset();
    else if (action === "pop" || action === "toggle") {
      updateCollection(value);
      restoreControl(action, value);
    } else if (action === "breathe") {
      setState({ completed: { ...state.completed, breathe: Math.min(4, (Number(currentData()) || 0) + 1) } }, { focus: false });
      restoreControl(action);
    } else if (action === "spark") {
      setState({ completed: { ...state.completed, spark: value } }, { focus: false });
      restoreControl(action, value);
    } else if (action === "play") {
      toggleSound();
      restoreControl(action);
    } else if (action === "reflect") {
      setState({ reflection: target.dataset.value }, { focus: false, animate: false });
      requestAnimationFrame(() => {
        const result = app.querySelector('[role="status"]');
        result?.setAttribute("tabindex", "-1");
        result?.focus({ preventScroll: true });
      });
    }
    else if (action === "new-journey") {
      stopSound();
      setState({ ...defaults, theme: state.theme });
    }
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    document.querySelector("#install-button").hidden = false;
  });

  document.querySelector("#install-button").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    document.querySelector("#install-button").hidden = true;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.playing) {
      stopSound();
      save();
      render(false, false);
    }
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  applyTheme();
  render(false, true);
})();
