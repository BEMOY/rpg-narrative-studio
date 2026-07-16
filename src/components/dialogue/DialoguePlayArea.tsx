import { Lock } from "lucide-react";
import type { DialogueColorStyle } from "../../types/database";
import type { DialoguePlayer } from "../../lib/useDialoguePlayer";
import { describeCondition } from "../../lib/useDialoguePlayer";
import { MarkupText } from "./MarkupText";

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

  const box = (
    <div className={variant === "modal" ? "w-full max-w-xl select-none" : "w-full max-w-xl select-none mx-auto"}>
      {showPortrait && (
        <div className={`flex items-end gap-3 ${currentLine?.side === "right" ? "flex-row-reverse" : ""}`}>
          <div
            key={speakerEntry?.id ?? currentLine?.speaker}
            className={`dlg-portrait-enter w-16 h-16 rounded-lg shrink-0 grid place-items-center text-2xl font-bold shadow-lg overflow-hidden ${
              phase === "typing" ? "dlg-fx-wave" : ""
            }`}
            style={{
              background: `linear-gradient(160deg, ${nameColor}40, ${nameColor}10)`,
              border: `2px solid ${nameColor}90`,
              color: nameColor,
            }}
          >
            {speakerEntry?.image ? (
              <img src={speakerEntry.image} alt="" className="w-full h-full object-cover" />
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
        <div
          className="flex-1 relative overflow-hidden flex items-end justify-center p-6"
          style={{ background: "radial-gradient(120% 100% at 50% 0%, #23203a 0%, #14121e 55%, #0b0a11 100%)" }}
        >
          {ended || !node ? <div className="text-center text-sm text-[var(--op-40)] mb-16">Диалог закончен.</div> : box}
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
