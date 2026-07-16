// v77 — exact-resolution (320x180) dialogue preview math, shared by:
//  - the Test-Play modal's virtual game screen (DialoguePlayArea, variant "modal"), which
//    renders the dialogue box at REAL game pixels inside a scaled 320x180 stage;
//  - the Problems scan (lib/problems.ts), which statically flags every line that won't fit in
//    the configured box, without the writer having to play through the dialogue at all.
//
// The game renders at 320x180 with a fixed-advance pixel font, so "does this line fit" is a
// deterministic word-wrap computation, not a fuzzy DOM measurement: chars-per-line and
// max-lines both derive from Project.previewSettings (see DialoguePreviewSettings in
// types/database.ts). CHAR_ADVANCE_RATIO approximates a typical pixel font's horizontal
// advance relative to its point size (a 8px pixel font advances ~6px per glyph, incl. 1px
// letter gap) — if the real font differs, the writer tunes boxWidth/fontSize in Settings until
// the preview matches their GMS2 box, and the Problems check follows automatically.

import type { DialoguePreviewSettings } from "../types/database";
import { parseDialogueMarkup } from "./dialogueMarkup";

export const GAME_W = 320;
export const GAME_H = 180;

export interface ResolvedPreviewSettings {
  boxWidthPx: number;
  boxHeightPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  paddingPx: number;
  portraitSizePx: number;
}

export const PREVIEW_DEFAULTS: ResolvedPreviewSettings = {
  boxWidthPx: 300,
  boxHeightPx: 46,
  fontSizePx: 8,
  lineHeightPx: 10,
  paddingPx: 6,
  portraitSizePx: 32,
};

const CHAR_ADVANCE_RATIO = 0.75;

export function resolvePreviewSettings(s: DialoguePreviewSettings | undefined): ResolvedPreviewSettings {
  return {
    boxWidthPx: s?.boxWidthPx ?? PREVIEW_DEFAULTS.boxWidthPx,
    boxHeightPx: s?.boxHeightPx ?? PREVIEW_DEFAULTS.boxHeightPx,
    fontSizePx: s?.fontSizePx ?? PREVIEW_DEFAULTS.fontSizePx,
    lineHeightPx: s?.lineHeightPx ?? PREVIEW_DEFAULTS.lineHeightPx,
    paddingPx: s?.paddingPx ?? PREVIEW_DEFAULTS.paddingPx,
    portraitSizePx: s?.portraitSizePx ?? PREVIEW_DEFAULTS.portraitSizePx,
  };
}

export function previewCharsPerLine(s: ResolvedPreviewSettings): number {
  const usable = s.boxWidthPx - s.paddingPx * 2;
  return Math.max(4, Math.floor(usable / (s.fontSizePx * CHAR_ADVANCE_RATIO)));
}

export function previewMaxLines(s: ResolvedPreviewSettings): number {
  return Math.max(1, Math.floor((s.boxHeightPx - s.paddingPx * 2) / s.lineHeightPx));
}

// Strips markup tags down to the visible glyph string — parseDialogueMarkup already yields one
// entry per VISIBLE character (tags consumed), so this is exact, not a regex approximation.
export function visibleText(markup: string): string {
  return parseDialogueMarkup(markup)
    .map((g) => g.ch)
    .join("");
}

export interface OverflowResult {
  fits: boolean;
  lineCount: number; // wrapped display lines this text needs
  maxLines: number;
  charsPerLine: number;
}

// Greedy word-wrap, mirroring how a fixed-advance game textbox breaks lines: words longer than
// a whole line hard-break mid-word (same as the engine would be forced to).
export function estimateDialogueOverflow(markupText: string, s: ResolvedPreviewSettings): OverflowResult {
  const charsPerLine = previewCharsPerLine(s);
  const maxLines = previewMaxLines(s);
  const text = visibleText(markupText).trim();
  if (text === "") return { fits: true, lineCount: 0, maxLines, charsPerLine };
  let lines = 1;
  let cur = 0;
  for (const word of text.split(/\s+/)) {
    let w = word.length;
    if (cur > 0 && cur + 1 + w <= charsPerLine) {
      cur += 1 + w;
      continue;
    }
    if (cur > 0) lines += 1;
    // hard-break overlong words across full lines
    while (w > charsPerLine) {
      w -= charsPerLine;
      lines += 1;
    }
    cur = w;
  }
  return { fits: lines <= maxLines, lineCount: lines, maxLines, charsPerLine };
}
