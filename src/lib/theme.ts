import { useEffect, useState } from "react";

export type ThemeName = "dark" | "light";
const STORAGE_KEY = "rpg-studio-theme";

function readInitial(): ThemeName {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function apply(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
}

// Applied once on module load so first paint is already correct (avoids flash).
apply(readInitial());

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(readInitial);

  useEffect(() => {
    apply(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));
  const setTheme = (t: ThemeName) => setThemeState(t);

  return { theme, toggle, setTheme };
}
