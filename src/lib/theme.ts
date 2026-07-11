import { useEffect, useState } from "react";

export interface ThemeSpec {
  id: string;
  name: string;
  bg: string; // hex — page background base
  ink: string; // hex — drives text/surfaces/borders (whole opacity ladder)
  accent: string; // hex — buttons/active states/links
  builtin?: boolean;
}

export const PRESET_THEMES: ThemeSpec[] = [
  { id: "dark", name: "Тёмное стекло", bg: "#11141c", ink: "#ffffff", accent: "#8b7bff", builtin: true },
  { id: "light", name: "Пергамент", bg: "#f4efe2", ink: "#1e180c", accent: "#b8763f", builtin: true },
  { id: "midnight", name: "Полночь", bg: "#0b1220", ink: "#dbe6ff", accent: "#5b8dff", builtin: true },
  { id: "forest", name: "Лес", bg: "#10190f", ink: "#e7f5df", accent: "#6fb35c", builtin: true },
  { id: "crimson", name: "Багрянец", bg: "#1a0e10", ink: "#f5dede", accent: "#d65a6b", builtin: true },
];

const STORAGE_ACTIVE = "rpg-studio-theme-active";
const STORAGE_CUSTOM = "rpg-studio-theme-custom";
const OP_LEVELS = [5, 6, 7, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  const num = parseInt(full, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = target;
  const nr = Math.round(r + (tr - r) * amount);
  const ng = Math.round(g + (tg - g) * amount);
  const nb = Math.round(b + (tb - b) * amount);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

function rgbaHex(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function readCustomThemes(): ThemeSpec[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_CUSTOM);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCustomThemes(themes: ThemeSpec[]) {
  window.localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(themes));
}

export function findTheme(id: string): ThemeSpec {
  return PRESET_THEMES.find((t) => t.id === id) ?? readCustomThemes().find((t) => t.id === id) ?? PRESET_THEMES[0];
}

function readActiveId(): string {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(STORAGE_ACTIVE) ?? "dark";
}

export function applyTheme(theme: ThemeSpec) {
  const root = document.documentElement.style;
  root.setProperty("--bg-grad-a", mix(theme.bg, [255, 255, 255], 0.08));
  root.setProperty("--bg-grad-b", mix(theme.bg, [0, 0, 0], 0.12));
  root.setProperty("--glass-bg", rgbaHex(theme.ink, 0.045));
  root.setProperty("--glass-border", rgbaHex(theme.ink, 0.08));
  root.setProperty("--scrollbar-thumb", rgbaHex(theme.ink, 0.14));
  const [ar, ag, ab] = hexToRgb(theme.accent);
  root.setProperty("--accent-rgb", `${ar} ${ag} ${ab}`);
  for (const lvl of OP_LEVELS) {
    root.setProperty(`--op-${lvl}`, rgbaHex(theme.ink, lvl / 100));
  }
  document.documentElement.setAttribute("data-theme", theme.builtin ? theme.id : "custom");
}

// Applied once on module load so first paint already has the right colors (avoids flash).
applyTheme(findTheme(readActiveId()));

export function useTheme() {
  const [activeId, setActiveId] = useState<string>(readActiveId);
  const [customThemes, setCustomThemes] = useState<ThemeSpec[]>(readCustomThemes);

  useEffect(() => {
    applyTheme(findTheme(activeId));
    window.localStorage.setItem(STORAGE_ACTIVE, activeId);
  }, [activeId]);

  const selectTheme = (id: string) => setActiveId(id);

  const saveCustomTheme = (spec: Omit<ThemeSpec, "id" | "builtin">, existingId?: string) => {
    const id = existingId ?? `custom-${Date.now().toString(36)}`;
    const next: ThemeSpec = { ...spec, id, builtin: false };
    setCustomThemes((prev) => {
      const withoutOld = prev.filter((t) => t.id !== id);
      const updated = [...withoutOld, next];
      writeCustomThemes(updated);
      return updated;
    });
    setActiveId(id);
  };

  const deleteCustomTheme = (id: string) => {
    setCustomThemes((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      writeCustomThemes(updated);
      return updated;
    });
    if (activeId === id) setActiveId("dark");
  };

  const activeTheme = findTheme(activeId);

  return { activeId, activeTheme, presets: PRESET_THEMES, customThemes, selectTheme, saveCustomTheme, deleteCustomTheme };
}
