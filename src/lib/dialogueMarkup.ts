// Mirrors the engine's dlg_parse() (scr_dialogue) markup tags: [wave]/[/wave],
// [shake]/[shake=N]/[/shake], [c=<name>]/[/c], [speed=N]/[speed] (reset), [pause=N].
// Tags nest correctly (wave/shake via depth counters, color via a stack so a nested
// color restores the outer one on close) — this was a from-scratch implementation,
// built with nesting as a first-class concern rather than an afterthought.

export interface MarkupGlyph {
  ch: string;
  wave: boolean;
  shake: boolean;
  shakeAmount: number;
  color?: string; // resolved CSS color, or the sentinel "rainbow" for the animated style
  speed: number; // reveal-speed multiplier active at this glyph (from [speed=N])
  pauseAfter: number; // extra reveal-pause "units" after this glyph (from [pause=N])
}

// Named styles the engine resolves via color_lookup()/color_eval() for richer/animated
// looks (cursed, fire, rainbow, ...). "rainbow" is handled specially by the renderer;
// everything else maps to a plain CSS color. Unknown names pass through as raw CSS colors
// (so e.g. [c=#ff0000] or [c=orange] also works).
const NAMED_COLORS: Record<string, string> = {
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
  rainbow: "rainbow",
};

export function resolveMarkupColor(name: string): string {
  const key = (name ?? "").trim().toLowerCase();
  return NAMED_COLORS[key] ?? name;
}

const TAG_RE = /\[(\/?)(\w+)(?:=([^\]]*))?\]/g;

export function parseDialogueMarkup(raw: string): MarkupGlyph[] {
  const glyphs: MarkupGlyph[] = [];
  let waveDepth = 0;
  let shakeDepth = 0;
  let shakeAmount = 3;
  const colorStack: string[] = [];
  let speed = 1;
  let pendingPause = 0;

  const push = (ch: string) => {
    glyphs.push({
      ch,
      wave: waveDepth > 0,
      shake: shakeDepth > 0,
      shakeAmount,
      color: colorStack[colorStack.length - 1],
      speed,
      pauseAfter: pendingPause,
    });
    pendingPause = 0;
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
      if (closing) colorStack.pop();
      else colorStack.push(resolveMarkupColor(arg ?? ""));
    } else if (tag === "speed") {
      speed = arg ? Number(arg) || 1 : 1;
    } else if (tag === "pause") {
      pendingPause += arg ? Number(arg) || 10 : 10;
    }
  }
  for (const ch of raw.slice(lastIndex)) push(ch);
  return glyphs;
}

export function markupLength(text: string): number {
  return parseDialogueMarkup(text).length;
}

export interface MarkupTagDef {
  id: string;
  label: string;
  paired: boolean; // wraps the current selection with [tag]...[/tag] when true
  promptForValue?: boolean; // asks for an argument (e.g. color name / N) before applying
  defaultValue?: string;
  promptLabel?: string;
}

export const MARKUP_TAGS: MarkupTagDef[] = [
  { id: "wave", label: "[wave]", paired: true },
  { id: "shake", label: "[shake]", paired: true, promptForValue: true, defaultValue: "3", promptLabel: "Сила тряски (N), пусто — по умолчанию" },
  { id: "c", label: "[c=…]", paired: true, promptForValue: true, defaultValue: "fire", promptLabel: "Имя цвета/стиля (fire, cursed, rainbow, gold, #ff0000…)" },
  { id: "speed", label: "[speed=N]", paired: false, promptForValue: true, defaultValue: "0.5", promptLabel: "Множитель скорости печати (пусто — сброс к обычной)" },
  { id: "pause", label: "[pause=N]", paired: false, promptForValue: true, defaultValue: "10", promptLabel: "Пауза (кол-во кадров)" },
];

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
