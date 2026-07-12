// Resolves a RarityObject's ColorStyle (kind/c1/c2/speed) into an actual CSS color at a given
// moment in time — separate from resolveGlyphColor() in dialogueMarkup.ts because that one is
// built around DialogueColorStyle (mode/a/b, looked up by name from a project-wide registry)
// and per-GLYPH position blending for [c=...] markup spans. A rarity badge is a single run of
// text with no glyph-position gradient to speak of, so this is the same blend math
// (mixHex/hsvToHex) applied to just the style object directly, time-driven only.
import type { ColorStyle, ColorStyleKind } from "../types/database";
import { mixHex, hsvToHex } from "./dialogueMarkup";

export function rarityColorAt(style: ColorStyle, tSeconds: number): string {
  const b = style.c2 ?? style.c1;
  const t = tSeconds * (style.speed || 1);
  switch (style.kind) {
    case "solid":
      return style.c1;
    case "gradient":
      return mixHex(style.c1, b, 0.5);
    case "pulse":
      return mixHex(style.c1, b, Math.sin(t) * 0.5 + 0.5);
    case "gradient_anim":
      return mixHex(style.c1, b, Math.sin(t * 1.6) * 0.5 + 0.5);
    case "rainbow":
      return hsvToHex((t % 1) * 360, 200 / 255, 1);
    default:
      return style.c1;
  }
}

// "Cool" / top-tier rarities are the ones whose color actually moves — a plain "solid" or
// static "gradient" rarity is visually calm by design (common/uncommon/rare-ish), so reserving
// the extra flourish (badge glow animation, particles) for animated kinds naturally scales to
// whatever custom rarities a project defines, without hardcoding specific rarity ids/names.
export function rarityIsAnimated(kind: ColorStyleKind): boolean {
  return kind === "pulse" || kind === "gradient_anim" || kind === "rainbow";
}
