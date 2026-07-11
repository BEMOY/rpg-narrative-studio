import { parseDialogueMarkup } from "../../lib/dialogueMarkup";

// Renders dialogue text with its [wave]/[shake]/[c=...] markup applied live, matching the
// engine's dlg_parse output. `revealCount` (used by the typewriter effect in TestPlayModal)
// limits how many glyphs are shown so far; omit it to render the full line instantly.
export function MarkupText({
  text,
  revealCount,
  className,
}: {
  text: string;
  revealCount?: number;
  className?: string;
}) {
  const glyphs = parseDialogueMarkup(text);
  const visible = revealCount === undefined ? glyphs : glyphs.slice(0, Math.max(0, revealCount));

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
        if (g.color === "rainbow") cls += " dlg-fx-rainbow";
        else if (g.color) style.color = g.color;
        return (
          <span key={i} className={cls || undefined} style={style}>
            {g.ch}
          </span>
        );
      })}
    </span>
  );
}
