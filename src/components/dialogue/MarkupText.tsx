import { useEffect, useRef, useState } from "react";
import { parseDialogueMarkup, resolveGlyphColor, styleIsAnimated } from "../../lib/dialogueMarkup";
import type { DialogueColorStyle } from "../../types/database";

// Renders dialogue text with its [wave]/[shake]/[c=...] markup applied live, matching the
// engine's dlg_parse + color_eval_glyph output. `revealCount` (used by the typewriter effect
// in TestPlayModal) limits how many glyphs are shown so far; omit it to render the full line
// instantly. `styles` is the project's registered color-style list (mirrors global.colors) —
// pass it down so [c=name] resolves to the exact per-letter/animated formula instead of a guess.
export function MarkupText({
  text,
  revealCount,
  className,
  styles = [],
}: {
  text: string;
  revealCount?: number;
  className?: string;
  styles?: DialogueColorStyle[];
}) {
  const glyphs = parseDialogueMarkup(text);
  const visible = revealCount === undefined ? glyphs : glyphs.slice(0, Math.max(0, revealCount));

  const needsClock = visible.some((g) => styleIsAnimated(styles, g.colorName));
  const [t, setT] = useState(0);
  const rafRef = useRef<number>();
  useEffect(() => {
    if (!needsClock) return;
    const start = performance.now();
    const tick = () => {
      setT((performance.now() - start) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [needsClock]);

  return (
    <span className={className}>
      {visible.map((g, i) => {
        if (g.ch === "\n") return <br key={i} />;
        const style: React.CSSProperties & Record<string, any> = { display: "inline-block", whiteSpace: "pre" };
        let cls = "";
        if (g.wave) {
          cls += " dlg-fx-wave";
          style["--dlg-i"] = i % 12;
        }
        if (g.shake) {
          cls += " dlg-fx-shake";
          style["--dlg-shake-amt"] = g.shakeAmount;
        }
        if (g.colorName) {
          style.color = resolveGlyphColor(styles, g.colorName, g.colorRunIndex, g.colorRunTotal, t);
        }
        return (
          <span key={i} className={cls || undefined} style={style}>
            {g.ch}
          </span>
        );
      })}
    </span>
  );
}
