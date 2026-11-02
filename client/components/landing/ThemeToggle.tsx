"use client";

import { applyTheme, type Theme } from "@/lib/theme";

// The app already stores the theme in localStorage under "neoma.theme" and
// ThemeScript applies it before paint. This button flips that same key, so the
// landing page and the signed-in app share one preference. The icon is chosen
// in CSS from <html data-theme>, which keeps server and client markup identical.
export function ThemeToggle() {
  function toggle() {
    const current = document.documentElement.dataset.theme;
    const next: Theme = current === "dark" ? "light" : "dark";
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className="nm-iconbtn nm-lp-theme-toggle"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={toggle}
    >
      <i className="fa-solid fa-moon nm-lp-theme-moon" aria-hidden="true" />
      <i className="fa-solid fa-sun nm-lp-theme-sun" aria-hidden="true" />
    </button>
  );
}
