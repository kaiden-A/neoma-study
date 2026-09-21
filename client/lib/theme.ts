export type Theme = "light" | "dark";

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("neoma.theme", theme);
  } catch {
    // private mode: the theme simply resets next visit
  }
}
