(() => {
  "use strict";

  let theme = null;
  try {
    const saved = JSON.parse(localStorage.getItem("sunny-state-v1"));
    if (saved?.theme === "light" || saved?.theme === "dark") theme = saved.theme;
  } catch {
    // Ignore malformed or unavailable storage and use the system preference.
  }

  if (!theme) {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#171316" : "#fff8f1"
  );
})();
