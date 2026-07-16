import { useLayoutEffect, useRef, useState } from "react";
import { Lock, AlertTriangle } from "lucide-react";
import type { DialogueColorStyle } from "../../types/database";
import type { DialoguePlayer } from "../../lib/useDialoguePlayer";
import { describeCondition } from "../../lib/useDialoguePlayer";
import { MarkupText } from "./MarkupText";
import { useProjectStore } from "../../store/useProjectStore";
import { GAME_W, GAME_H, resolvePreviewSettings, estimateDialogueOverflow } from "../../lib/dialoguePreview";

// Measures the wrapper and returns the largest scale that fits a whole 320x180 stage inside it
// — integer-snapped above 1x so the pixel-art preview stays crisp (2x/3x/4x…), fractional only
// below 1x where there's no room for a full integer step.
function useFitScale(ref: React.RefObject<HTMLDivElement>): number {
  const [scale, setScale] = useState(2);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      const raw = Math.min(r.width / GAME_W, r.height / GAME_H);
      setScale(raw >= 1 ? Math.max(1, Math.floor(raw)) : Math.max(0.25, raw));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

// Shared presentational rendering of a live dialogue conversation, driven entirely by a
// `useDialoguePlayer()` result — used by BOTH the standalone Test-Play modal (Dialogue editor,
// `variant="modal"`) and the embedded dialogue box shown directly on the Cutscene preview stage
// while a cutscene is paused on a blocking dialogue clip (`variant="embedded"`). This is the
// piece that makes the two genuinely IDENTICAL in conversation logic/visuals for the portrait +
// text-box + choices themselves, while letting each host decide how the box sits in its
// surroundings: the modal wraps it in a fixed dark backdrop + popover chrome (it has no live
// scene behind it, so it needs to fabricate an atmosphere), while the embedded cutscene variant
// renders ONLY the box itself with a transparent background, positioned by its caller directly
// over the live scene — no backdrop, no header, no restart button — the way it would actually
// look in-game.
export function DialoguePlayArea({
  player,
  colorStyles,
  variant,
}: {
  player: DialoguePlayer;
  colorStyles: DialogueColorStyle[];
  variant: "modal" | "embedded";
}) {
  const {
    entries,
    node,
    ended,
    currentLine,
    phase,
    revealCount,
    showPortrait,
    speakerEntry,
    portraitImage,
    displayName,
    nameColor,
    atLastLine,
    redirectTarget,
    choosing,
    allChoices,
    choiceMet,
    focusedChoice,
    setFocusedChoice,
    goToNode,
    advanceLine,
    pickChoice,
    handleBoxClick,
  } = player;

  // v77 — the modal variant renders a faithful, scalable 320x180 virtual game screen (see
  // GameScreen below); these hooks run for the embedded variant too (rules of hooks) but only
  // the modal branch reads them.
  const previewSettings = useProjectStore((s) => s.project.previewSettings);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(stageWrapRef);
  const resolved = resolvePreviewSettings(previewSettings);
  const overflow = currentLine ? estimateDialogueOverflow(currentLine.text, resolved) : undefined;

  const box = (
    <div className={variant === "modal" ? "w-full max-w-xl select-none" : "w-full max-w-xl select-none mx-auto"}>
      {showPortrait && (
        <div className={`flex items-end gap-3 ${currentLine?.side === "right" ? "flex-row-reverse" : ""}`}>
          <div
            key={(speakerEntry?.id ?? currentLine?.speaker ?? "") + ":" + (currentLine?.emotion ?? "")}
            className={`dlg-portrait-enter w-16 h-16 rounded-lg shrink-0 grid place-items-center text-2xl font-bold shadow-lg overflow-hidden ${
              phase === "typing" ? "dlg-fx-wave" : ""
            }`}
            style={{
              background: `linear-gradient(160deg, ${nameColor}40, ${nameColor}10)`,
              border: `2px solid ${nameColor}90`,
              color: nameColor,
            }}
          >
            {portraitImage ? (
              <img src={portraitImage} alt="" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
            ) : (
              (displayName || "?").slice(0, 1).toUpperCase()
            )}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-[var(--op-15)] bg-[#0d0c14]/95 shadow-2xl overflow-hidden -mt-px">
        {showPortrait && displayName && (
          <div className="px-4 pt-3">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-md inline-block"
              style={{ color: nameColor, background: nameColor + "1a", border: `1px solid ${nameColor}40` }}
            >
              {displayName}
            </span>
          </div>
        )}
        <div
          onClick={handleBoxClick}
          className={`px-4 py-3 min-h-[76px] text-sm leading-relaxed text-[var(--op-90)] ${currentLine ? "cursor-pointer" : ""}`}
        >
          {currentLine ? (
            <>
              <MarkupText text={currentLine.text} revealCount={revealCount} styles={colorStyles} />
              {phase === "done" && <span className="dlg-caret ml-1 inline-block text-[var(--op-40)]">▾</span>}
            </>
          ) : (
            <span className="text-[var(--op-30)] text-xs">В этой ноде нет видимых реплик — переходим дальше.</span>
          )}
        </div>
      </div>
    </div>
  );

  const controls = (
    <>
      {!ended && node && !atLastLine && currentLine && (
        <button onClick={advanceLine} disabled={phase === "typing"} className="w-full text-sm py-2 rounded-md bg-accent/80 hover:bg-accent disabled:opacity-40">
          {phase === "typing" ? "Печатает…" : "Далее"}
        </button>
      )}
      {!ended && node && atLastLine && choosing && (
        <div className="space-y-1.5">
          {allChoices.map((c, i) => {
            const met = choiceMet.get(c.id) ?? true;
            return (
              <button
                key={c.id}
                onClick={() => met && pickChoice(c.id)}
                onMouseEnter={() => setFocusedChoice(i)}
                disabled={!met}
                title={!met ? describeCondition(c.condition, entries) : undefined}
                className={`dlg-choice-enter w-full text-left text-sm px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
                  !met
                    ? "bg-[var(--op-3)] text-[var(--op-30)] cursor-not-allowed"
                    : i === focusedChoice
                    ? "bg-accent/25 text-[var(--op-95)]"
                    : "bg-[var(--op-6)] hover:bg-[var(--op-10)] text-[var(--op-80)]"
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className={`text-accent shrink-0 ${i === focusedChoice && met ? "opacity-100" : "opacity-0"}`}>▶</span>
                <span className="flex-1 truncate">{c.text || "…"}</span>
                {!met && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--op-40)] shrink-0">
                    <Lock size={11} /> {describeCondition(c.condition, entries)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {!ended && node && atLastLine && !choosing && (
        <button
          onClick={() => goToNode(redirectTarget ?? node.continueTo)}
          disabled={(!redirectTarget && !node.continueTo) || phase === "typing"}
          className="w-full text-sm py-2 rounded-md bg-accent/80 hover:bg-accent disabled:opacity-40"
        >
          {phase === "typing" ? "Печатает…" : redirectTarget || node.continueTo ? "Далее" : "Конец диалога"}
        </button>
      )}
    </>
  );

  if (variant === "modal") {
    return (
      <>
        <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center gap-2 p-4 bg-black/40 min-h-0">
          <div ref={stageWrapRef} className="flex-1 w-full min-h-0 grid place-items-center">
            <GameScreen
              scale={scale}
              player={player}
              colorStyles={colorStyles}
              overflow={overflow}
            />
          </div>
          <div className="shrink-0 flex items-center gap-3 text-[10px] text-[var(--op-35)]">
            <span className="mono">{GAME_W}×{GAME_H} · x{scale % 1 === 0 ? scale : scale.toFixed(2)}</span>
            {overflow && !overflow.fits && (
              <span className="flex items-center gap-1 text-red-300">
                <AlertTriangle size={11} />
                Текст не помещается: {overflow.lineCount} строк из {overflow.maxLines} — разбейте реплику на две ноды.
              </span>
            )}
          </div>
        </div>
        <div className="border-t border-[var(--op-10)] p-3 shrink-0 space-y-1.5">
          {controls}
          {ended && (
            <button onClick={player.restart} className="w-full text-sm py-2 rounded-md bg-accent/80 hover:bg-accent">
              Начать заново
            </button>
          )}
        </div>
      </>
    );
  }

  // embedded: no dark backdrop, no header/restart — the caller (CutscenePreview) positions this
  // absolutely at the bottom of the live scene. Once the conversation truly ends there is
  // nothing left to show here; the caller watches `player.ended` itself and resumes cutscene
  // playback at that point (exactly like a real game: the dialogue box disappears and gameplay
  // continues, there is no "close" button to click).
  if (ended || !node) return null;
  return (
    <div className="w-full flex flex-col gap-1.5 px-3 pb-3 pointer-events-auto">
      {box}
      <div className="w-full max-w-xl mx-auto space-y-1.5">{controls}</div>
    </div>
  );
}

// v77 — the faithful 320x180 virtual game screen. Everything inside the stage is laid out in
// REAL game pixels (box width, font size, portrait size all come from Project.previewSettings)
// and the whole stage is scaled up integer-crisp to fit the modal, so what the writer reads
// here is exactly what fits (or doesn't) on the real GMS2 screen. A line that overflows the
// configured box gets a red border here + a warning below the stage + a Problems entry.
function GameScreen({
  scale,
  player,
  colorStyles,
  overflow,
}: {
  scale: number;
  player: DialoguePlayer;
  colorStyles: DialogueColorStyle[];
  overflow: ReturnType<typeof estimateDialogueOverflow> | undefined;
}) {
  const previewSettings = useProjectStore((s) => s.project.previewSettings);
  const s = resolvePreviewSettings(previewSettings);
  const { node, ended, currentLine, phase, revealCount, showPortrait, portraitImage, displayName, nameColor, handleBoxClick } =
    player;

  const boxLeft = Math.round((GAME_W - s.boxWidthPx) / 2);
  const boxTotalH = s.boxHeightPx + s.paddingPx * 2;
  const boxTop = GAME_H - 4 - boxTotalH;

  return (
    <div
      style={{
        width: GAME_W * scale,
        height: GAME_H * scale,
        position: "relative",
        overflow: "hidden",
        borderRadius: 4,
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: GAME_W,
          height: GAME_H,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          position: "absolute",
          left: 0,
          top: 0,
          background: "radial-gradient(120% 100% at 50% 0%, #23203a 0%, #14121e 55%, #0b0a11 100%)",
          fontFamily: '"Courier New", ui-monospace, monospace',
          imageRendering: "pixelated",
        }}
      >
        {ended || !node ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "rgba(255,255,255,0.35)",
              fontSize: 9,
            }}
          >
            Диалог закончен.
          </div>
        ) : (
          currentLine && (
            <>
              {/* portrait — sits on top of the box, left or right by line side */}
              {showPortrait && portraitImage && (
                <img
                  src={portraitImage}
                  alt=""
                  style={{
                    position: "absolute",
                    width: s.portraitSizePx,
                    height: s.portraitSizePx,
                    objectFit: "cover",
                    imageRendering: "pixelated",
                    top: boxTop - s.portraitSizePx - 1,
                    ...(currentLine.side === "right"
                      ? { right: boxLeft }
                      : { left: boxLeft }),
                    border: `1px solid ${nameColor}90`,
                    borderRadius: 2,
                    background: "#0d0c14",
                  }}
                />
              )}
              {/* speaker nameplate */}
              {showPortrait && displayName && (
                <div
                  style={{
                    position: "absolute",
                    top: boxTop - (portraitImage ? 0 : s.lineHeightPx + 4),
                    transform: "translateY(-100%)",
                    ...(currentLine.side === "right"
                      ? { right: boxLeft + (portraitImage ? s.portraitSizePx + 3 : 0) }
                      : { left: boxLeft + (portraitImage ? s.portraitSizePx + 3 : 0) }),
                    fontSize: s.fontSizePx,
                    lineHeight: `${s.lineHeightPx}px`,
                    color: nameColor,
                    background: "#0d0c14e6",
                    border: `1px solid ${nameColor}60`,
                    borderRadius: 2,
                    padding: `0 ${Math.max(2, Math.round(s.paddingPx / 2))}px`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName}
                </div>
              )}
              {/* the dialogue box itself, at real game pixels */}
              <div
                onClick={handleBoxClick}
                style={{
                  position: "absolute",
                  left: boxLeft,
                  top: boxTop,
                  width: s.boxWidthPx,
                  height: boxTotalH,
                  boxSizing: "border-box",
                  padding: s.paddingPx,
                  background: "#0d0c14f2",
                  border: overflow && !overflow.fits ? "1px solid #f87171" : "1px solid rgba(255,255,255,0.35)",
                  borderRadius: 2,
                  cursor: "pointer",
                  overflow: "hidden",
                }}
                title={overflow && !overflow.fits ? "Текст не помещается в рамку диалога!" : undefined}
              >
                <div
                  style={{
                    fontSize: s.fontSizePx,
                    lineHeight: `${s.lineHeightPx}px`,
                    color: "rgba(255,255,255,0.92)",
                    wordBreak: "break-word",
                  }}
                >
                  <MarkupText text={currentLine.text} revealCount={revealCount} styles={colorStyles} />
                  {phase === "done" && <span className="dlg-caret" style={{ marginLeft: 2, color: "rgba(255,255,255,0.4)" }}>▾</span>}
                </div>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
