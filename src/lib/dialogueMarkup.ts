// Mirrors the engine's dlg_parse() (scr_dialogue) markup tags: [wave]/[/wave],
// [shake]/[shake=N]/[/shake], [c=<name>]/[/c], [speed=N]/[speed] (reset), [pause=N].
// Tags nest correctly (wave/shake via depth counters, color via a stack so a nested
// color restores the outer one on close).
//
// Color is special: the engine resolves [c=name] via color_lookup()+color_eval_glyph(), which
// picks a color PER LETTER based on that letter's position within its own [c=...]...[/c] span
// (f = i/(total-1)) and, for animated modes, the current time — confirmed by the user's own
// pasted color_eval()/color_eval_glyph() source. So the parser here only records each glyph's
// raw color name plus its (index, total) within that span; the actual CSS color is computed
// later by resolveGlyphColor() against the project's own registered color styles (mirroring
// global.colors), so it can react to a live animation clock.

import type { DialogueColorStyle } from "../types/database";

export interface MarkupGlyph {
  ch: string;
  wave: boolean;
  shake: boolean;
  shakeAmount: number;
  colorName?: string;
  colorRunIndex: number; // position of this glyph within its own [c=...]...[/c] span
  colorRunTotal: number; // total glyphs directly owned by that span (excludes nested inner colors)
  speed: number; // reveal-speed multiplier active at this glyph (from [speed=N])
  pauseAfter: number; // extra reveal-pause "units" after this glyph (from [pause=N])
}

const TAG_RE = /\[(\/?)(\w+)(?:=([^\]]*))?\]/g;

export function parseDialogueMarkup(raw: string): MarkupGlyph[] {
  const glyphs: MarkupGlyph[] = [];
  let waveDepth = 0;
  let shakeDepth = 0;
  let shakeAmount = 3;
  const colorStack: { name: string; startIdx: number }[] = [];
  let speed = 1;
  let pendingPause = 0;

  const push = (ch: string) => {
    glyphs.push({
      ch,
      wave: waveDepth > 0,
      shake: shakeDepth > 0,
      shakeAmount,
      colorName: colorStack[colorStack.length - 1]?.name,
      colorRunIndex: 0,
      colorRunTotal: 1,
      speed,
      pauseAfter: pendingPause,
    });
    pendingPause = 0;
  };

  // Labels every glyph directly owned by the closing color scope (i.e. glyphs whose active
  // color name still matches this scope — nested inner colors already claimed their own
  // glyphs) with its position/total within that scope's own run.
  const closeColor = () => {
    const frame = colorStack.pop();
    if (!frame) return;
    const owned: number[] = [];
    for (let idx = frame.startIdx; idx < glyphs.length; idx++) {
      if (glyphs[idx].colorName === frame.name) owned.push(idx);
    }
    owned.forEach((glyphIdx, i) => {
      glyphs[glyphIdx].colorRunIndex = i;
      glyphs[glyphIdx].colorRunTotal = owned.length;
    });
  };

  TAG_RE.lastIndex = 0;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(raw))) {
    for (const ch of raw.slice(lastIndex, m.index)) push(ch);
    lastIndex = TAG_RE.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const arg = m[3];
    if (tag === "wave") {
      waveDepth = closing ? Math.max(0, waveDepth - 1) : waveDepth + 1;
    } else if (tag === "shake") {
      if (closing) shakeDepth = Math.max(0, shakeDepth - 1);
      else {
        shakeDepth++;
        shakeAmount = arg ? Number(arg) || 3 : 3;
      }
    } else if (tag === "c") {
      if (closing) closeColor();
      else colorStack.push({ name: (arg ?? "").trim(), startIdx: glyphs.length });
    } else if (tag === "speed") {
      speed = arg ? Number(arg) || 1 : 1;
    } else if (tag === "pause") {
      pendingPause += arg ? Number(arg) || 10 : 10;
    }
  }
  for (const ch of raw.slice(lastIndex)) push(ch);
  while (colorStack.length) closeColor(); // unterminated tags still get sensible run numbers

  return glyphs;
}

export function markupLength(text: string): number {
  return parseDialogueMarkup(text).length;
}

// --- color math (mirrors merge_colour / make_colour_hsv closely enough for preview use) ---

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "#ffffff").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : (h + "000000").slice(0, 6);
  const num = parseInt(full, 16) || 0xffffff;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mixHex(hexA: string, hexB: string, k: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB || hexA);
  return rgbToHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
}

export function hsvToHex(h360: number, s01: number, v01: number): string {
  const h = ((h360 % 360) + 360) % 360;
  const c = v01 * s01;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v01 - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

// Best-effort guesses for names that AREN'T registered as a project color style — either the
// author hasn't set one up yet, or the name is meant to resolve via the engine's separate
// "plain color" path (dlg_color_from) rather than the animated color_lookup/color_eval
// registry. Anything not recognized here is passed straight through as a literal CSS color
// (covers hex codes like [c=#ff0000] and CSS color names).
export const FALLBACK_COLOR_GUESSES: Record<string, string> = {
  fire: "#ff7043",
  cursed: "#8b5cf6",
  poison: "#84cc16",
  ice: "#67e8f9",
  gold: "#facc15",
  blood: "#ef4444",
  white: "#ffffff",
  red: "#ef4444",
  green: "#4ade80",
  blue: "#60a5fa",
  yellow: "#facc15",
  purple: "#a78bfa",
  black: "#111111",
};

// Replicates color_eval_glyph() exactly for registered styles: solid/gradient/pulse/
// gradient_anim all resolve via merge_colour-equivalent blending, rainbow via an HSV cycle
// driven by letter-position + time. Falls back to a guess (or literal passthrough) when the
// name isn't a project-registered style.
export function resolveGlyphColor(
  styles: DialogueColorStyle[],
  name: string | undefined,
  runIndex: number,
  runTotal: number,
  tSeconds: number
): string {
  if (!name) return "";
  const style = styles.find((s) => s.name === name);
  if (!style) return FALLBACK_COLOR_GUESSES[name.toLowerCase()] ?? name;

  const f = runTotal > 1 ? runIndex / (runTotal - 1) : 0;
  const t = tSeconds * (style.speed || 1);
  switch (style.mode) {
    case "solid":
      return style.a || "#ffffff";
    case "gradient":
      return mixHex(style.a, style.b, f);
    case "pulse":
      return mixHex(style.a, style.b, Math.sin(t) * 0.5 + 0.5);
    case "gradient_anim":
      return mixHex(style.a, style.b, Math.sin(t + f * 3) * 0.5 + 0.5);
    case "rainbow":
      return hsvToHex(((t + f) % 1) * 360, 200 / 255, 1);
    default:
      return style.a || "#ffffff";
  }
}

export function styleIsAnimated(styles: DialogueColorStyle[], name: string | undefined): boolean {
  if (!name) return false;
  const s = styles.find((x) => x.name === name);
  return !!s && s.mode !== "solid" && s.mode !== "gradient";
}

// Best-effort mapping from GML's built-in color constants (as typically typed into the
// speaker_define "color" field, e.g. c_white/c_yellow) to CSS, for previewing in the Studio's
// test-play mode. Anything not recognized is passed straight through (covers hex/CSS names).
const GML_COLOR_CONST: Record<string, string> = {
  c_white: "#ffffff",
  c_black: "#000000",
  c_red: "#ff0000",
  c_lime: "#00ff00",
  c_green: "#008000",
  c_blue: "#0000ff",
  c_yellow: "#ffff00",
  c_aqua: "#00ffff",
  c_fuchsia: "#ff00ff",
  c_gray: "#808080",
  c_grey: "#808080",
  c_silver: "#c0c0c0",
  c_maroon: "#800000",
  c_navy: "#000080",
  c_olive: "#808000",
  c_purple: "#800080",
  c_teal: "#008080",
  c_orange: "#ffa500",
};

export function resolveGmlColor(v?: string): string {
  if (!v || !v.trim()) return "#ffffff";
  const key = v.trim().toLowerCase();
  return GML_COLOR_CONST[key] ?? v;
}

export interface MarkupTagDef {
  id: string;
  label: string;
  // "wrap": wraps the current selection with [tag]...[/tag] (open before, close after).
  // "prefix": inserts only [tag] right before the selection, leaving the selected text (and
  // everything else) untouched — matches [pause=N], which is a point-in-time marker in the
  // engine, not a range.
  mode: "wrap" | "prefix";
  promptForValue?: boolean; // asks for an argument (e.g. N) before applying
  defaultValue?: string;
  promptLabel?: string;
}

export const MARKUP_TAGS: MarkupTagDef[] = [
  { id: "wave", label: "[wave]", mode: "wrap" },
  { id: "shake", label: "[shake]", mode: "wrap", promptForValue: true, defaultValue: "3", promptLabel: "Сила тряски (N), пусто — по умолчанию" },
  { id: "c", label: "[c=…]", mode: "wrap" },
  { id: "speed", label: "[speed=N]", mode: "wrap", promptForValue: true, defaultValue: "0.5", promptLabel: "Множитель скорости печати (пусто — сброс к обычной)" },
  { id: "pause", label: "[pause=N]", mode: "prefix", promptForValue: true, defaultValue: "10", promptLabel: "Пауза (кол-во кадров) перед этим текстом" },
];
