import { useEffect, useMemo, useRef, useState } from "react";
import { X, Play, RotateCcw, Lock } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import type { Dialogue, DialogueCondition, Entry } from "../../types/database";
import { evalCondition, type DialogueTestState } from "../../lib/dialogueEval";
import { parseDialogueMarkup, resolveGmlColor } from "../../lib/dialogueMarkup";
import { MarkupText } from "./MarkupText";

const QUEST_STATUS_LABEL: Record<string, string> = { not_started: "не начат", active: "активен", done: "выполнен" };

// Player-facing (short) description of why a locked choice is locked — shown next to the lock
// icon instead of just hiding the choice outright.
function describeCondition(cond: DialogueCondition | undefined, entries: Entry[]): string {
  if (!cond || !cond.key) return "";
  if (cond.kind === "flag") return `${cond.key} ${cond.op === "neq" ? "≠" : "="} ${cond.value ?? ""}`;
  if (cond.kind === "quest") {
    const e = entries.find((x) => x.id === cond.key);
    const label = QUEST_STATUS_LABEL[cond.value ?? "active"] ?? cond.value ?? "";
    return `${e?.name ?? cond.key}: ${label}`;
  }
  const e = entries.find((x) => x.id === cond.key);
  return `${cond.op === "has" ? "нужен: " : "не должно быть: "}${e?.name ?? cond.key}`;
}

// Collects every distinct entry-kind condition used anywhere in the dialogue so the tester
// can manually flip "has / not_has" toggles for them — there's no real per-playthrough
// inventory system in the Studio, so this stands in for it during testing.
function collectEntryConditions(dialogue: Dialogue): DialogueCondition[] {
  const seen = new Map<string, DialogueCondition>();
  for (const n of dialogue.nodes) {
    for (const l of n.lines) if (l.condition?.kind === "entry" && l.condition.key) seen.set(l.condition.key, l.condition);
    for (const c of n.choices) if (c.condition?.kind === "entry" && c.condition.key) seen.set(c.condition.key, c.condition);
  }
  return Array.from(seen.values());
}

const BASE_MS_PER_CHAR = 26;

export function TestPlayModal({ dialogue, onClose }: { dialogue: Dialogue; onClose: () => void }) {
  const entries = useProjectStore((s) => s.project.entries);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);
  const [nodeId, setNodeId] = useState(dialogue.startNodeId);
  const [lineIdx, setLineIdx] = useState(0);
  const [state, setState] = useState<DialogueTestState>({ flags: {}, entryFlags: {} });
  const [ended, setEnded] = useState(false);
  const [revealCount, setRevealCount] = useState(0);
  const [phase, setPhase] = useState<"typing" | "done">("done");
  const [focusedChoice, setFocusedChoice] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const entryConds = useMemo(() => collectEntryConditions(dialogue), [dialogue]);
  const node = dialogue.nodes.find((n) => n.id === nodeId);
  const visibleLines = (node?.lines ?? []).filter((l) => evalCondition(l.condition, state, entries));
  const currentLine = visibleLines[lineIdx];
  // Choices are never hidden by their condition anymore — they render disabled/locked instead
  // (see the render block below), so the player can see what's gating them.
  const allChoices = node?.choices ?? [];
  const choiceMet = useMemo(
    () => new Map(allChoices.map((c) => [c.id, evalCondition(c.condition, state, entries)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allChoices, state, entries]
  );
  const atLastLine = lineIdx >= visibleLines.length - 1;

  // A line whose own condition fails but which has an explicit fallback node set redirects the
  // whole conversation there instead of being silently skipped — first match wins, in the
  // node's own line order.
  const redirectLine = (node?.lines ?? []).find((l) => l.condition && l.elseNodeId && !evalCondition(l.condition, state, entries));
  const redirectTarget = redirectLine?.elseNodeId;

  const speakerEntry = currentLine?.speakerEntryId ? entries.find((e) => e.id === currentLine.speakerEntryId) : undefined;
  const speakerData = speakerEntry?.dialogueSpeaker;
  const displayName = speakerData?.displayName || speakerEntry?.name || currentLine?.speaker || "";
  const nameColor = resolveGmlColor(speakerData?.color);
  const showPortrait = !!currentLine && currentLine.side !== "none" && (!!displayName || !!currentLine.speaker);

  const restart = () => {
    setNodeId(dialogue.startNodeId);
    setLineIdx(0);
    setState({ flags: {}, entryFlags: {} });
    setEnded(false);
  };

  const goToNode = (id: string | undefined) => {
    if (!id) {
      setEnded(true);
      return;
    }
    setNodeId(id);
    setLineIdx(0);
  };

  const advanceLine = () => {
    if (lineIdx + 1 < visibleLines.length) setLineIdx(lineIdx + 1);
  };

  const pickChoice = (choiceId: string) => {
    const choice = node?.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    if (!(choiceMet.get(choiceId) ?? true)) return; // locked — ignore
    if (choice.flagSets.length) {
      setState((s) => {
        const flags = { ...s.flags };
        for (const fs of choice.flagSets) flags[fs.key] = fs.value;
        return { ...s, flags };
      });
    }
    goToNode(choice.targetNodeId);
  };

  // Typewriter reveal, mirroring obj_dialogue's "typing" state: per-glyph speed multipliers
  // from [speed=N] and extra pauses from [pause=N] both apply; a speaker's own text_speed
  // (from the "Диалог" tab on their Character entry, if linked) scales the overall pace.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!currentLine) {
      setRevealCount(0);
      setPhase("done");
      return;
    }
    const glyphs = parseDialogueMarkup(currentLine.text);
    setRevealCount(0);
    setPhase(glyphs.length > 0 ? "typing" : "done");
    const speedFactor = speakerData?.textSpeed ? speakerData.textSpeed / 0.3 : 1;
    let i = 0;
    const step = () => {
      i++;
      setRevealCount(i);
      if (i >= glyphs.length) {
        setPhase("done");
        return;
      }
      const g = glyphs[i - 1];
      const delay = Math.max(4, (BASE_MS_PER_CHAR * speedFactor) / (g.speed || 1)) + g.pauseAfter * 16;
      timerRef.current = setTimeout(step, delay);
    };
    if (glyphs.length > 0) timerRef.current = setTimeout(step, Math.max(4, BASE_MS_PER_CHAR * speedFactor));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, lineIdx, currentLine?.text]);

  useEffect(() => setFocusedChoice(0), [nodeId, lineIdx]);

  // Choices only ever show once at least one line actually displayed (an all-conditions-failed
  // node just falls through to continueTo/redirect silently, per the "don't show choices for
  // content that never appeared" rule), and never alongside an active line-level redirect.
  const choosing = !ended && !!node && atLastLine && phase === "done" && !redirectTarget && visibleLines.length > 0 && allChoices.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (choosing) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedChoice((f) => (f + 1) % allChoices.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedChoice((f) => (f - 1 + allChoices.length) % allChoices.length);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const c = allChoices[focusedChoice];
          if (c && (choiceMet.get(c.id) ?? true)) pickChoice(c.id);
        }
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleBoxClick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const handleBoxClick = () => {
    if (ended || !node) return;
    if (currentLine && phase === "typing") {
      if (currentLine.noSkip) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setRevealCount(parseDialogueMarkup(currentLine.text).length);
      setPhase("done");
      return;
    }
    if (!atLastLine) {
      advanceLine();
      return;
    }
    if (redirectTarget) {
      goToNode(redirectTarget);
      return;
    }
    if (allChoices.length === 0 || visibleLines.length === 0) {
      goToNode(node.continueTo);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div className="popover rounded-xl w-full max-w-3xl h-[600px] flex overflow-hidden shadow-2xl dlg-box-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--op-10)] shrink-0">
            <Play size={14} className="text-accent" />
            <span className="text-sm font-medium text-[var(--op-85)]">Тест — {dialogue.name}</span>
            <button onClick={restart} title="Начать заново" className="ml-auto opacity-50 hover:opacity-100">
              <RotateCcw size={14} />
            </button>
            <button onClick={onClose} className="opacity-50 hover:opacity-100">
              <X size={15} />
            </button>
          </div>

          <div
            className="flex-1 relative overflow-hidden flex items-end justify-center p-6"
            style={{ background: "radial-gradient(120% 100% at 50% 0%, #23203a 0%, #14121e 55%, #0b0a11 100%)" }}
          >
            {ended || !node ? (
              <div className="text-center text-sm text-[var(--op-40)] mb-16">Диалог закончен.</div>
            ) : (
              <div className="w-full max-w-xl select-none">
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
                    className={`px-4 py-3 min-h-[76px] text-sm leading-relaxed text-[var(--op-90)] ${
                      currentLine ? "cursor-pointer" : ""
                    }`}
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
            )}
          </div>

          <div className="border-t border-[var(--op-10)] p-3 shrink-0 space-y-1.5">
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
            {ended && (
              <button onClick={restart} className="w-full text-sm py-2 rounded-md bg-accent/80 hover:bg-accent">
                Начать заново
              </button>
            )}
          </div>
        </div>

        {entryConds.length > 0 && (
          <div className="w-56 border-l border-[var(--op-10)] p-3 overflow-y-auto shrink-0">
            <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Тестовые условия</div>
            <div className="text-[10px] text-[var(--op-30)] mb-2 leading-relaxed">
              В Студии нет реального инвентаря игрока — переключите вручную для проверки веток.
            </div>
            {entryConds.map((c) => {
              const entry = entries.find((e) => e.id === c.key);
              const on = state.entryFlags[c.key] ?? false;
              return (
                <label key={c.key} className="flex items-center gap-2 text-xs text-[var(--op-70)] py-1">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setState((s) => ({ ...s, entryFlags: { ...s.entryFlags, [c.key]: e.target.checked } }))}
                  />
                  {entry?.name ?? c.key}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
