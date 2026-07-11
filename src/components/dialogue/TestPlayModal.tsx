import { useMemo, useState } from "react";
import { X, Play, RotateCcw } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import type { Dialogue, DialogueCondition } from "../../types/database";
import { evalCondition, type DialogueTestState } from "../../lib/dialogueEval";

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

export function TestPlayModal({ dialogue, onClose }: { dialogue: Dialogue; onClose: () => void }) {
  const entries = useProjectStore((s) => s.project.entries);
  const [nodeId, setNodeId] = useState(dialogue.startNodeId);
  const [lineIdx, setLineIdx] = useState(0);
  const [state, setState] = useState<DialogueTestState>({ flags: {}, entryFlags: {} });
  const [ended, setEnded] = useState(false);

  const entryConds = useMemo(() => collectEntryConditions(dialogue), [dialogue]);
  const node = dialogue.nodes.find((n) => n.id === nodeId);
  const visibleLines = (node?.lines ?? []).filter((l) => evalCondition(l.condition, state, entries));
  const currentLine = visibleLines[lineIdx];
  const visibleChoices = (node?.choices ?? []).filter((c) => evalCondition(c.condition, state, entries));

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
    // else: stay put — the choices/continue block below takes over.
  };

  const pickChoice = (choiceId: string) => {
    const choice = node?.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    if (choice.flagSets.length) {
      setState((s) => {
        const flags = { ...s.flags };
        for (const fs of choice.flagSets) flags[fs.key] = fs.value;
        return { ...s, flags };
      });
    }
    goToNode(choice.targetNodeId);
  };

  const atLastLine = lineIdx >= visibleLines.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="popover rounded-xl w-full max-w-2xl h-[520px] flex overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
            <Play size={14} className="text-accent" />
            <span className="text-sm font-medium text-[var(--op-85)]">Тест — {dialogue.name}</span>
            <button onClick={restart} title="Начать заново" className="ml-auto opacity-50 hover:opacity-100">
              <RotateCcw size={14} />
            </button>
            <button onClick={onClose} className="opacity-50 hover:opacity-100">
              <X size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col justify-end">
            {ended || !node ? (
              <div className="text-center text-sm text-[var(--op-40)]">Диалог закончен.</div>
            ) : currentLine ? (
              <div className="space-y-1">
                <div className="text-xs font-medium text-accent">{currentLine.speaker || "…"}</div>
                <div className="text-sm text-[var(--op-85)] leading-relaxed whitespace-pre-wrap">{currentLine.text}</div>
              </div>
            ) : (
              <div className="text-xs text-[var(--op-30)]">В этой ноде нет видимых реплик — переходим дальше.</div>
            )}
          </div>

          <div className="border-t border-[var(--op-10)] p-3 shrink-0 space-y-1.5">
            {!ended && node && !atLastLine && currentLine && (
              <button onClick={advanceLine} className="w-full text-sm py-2 rounded-md bg-accent/80 hover:bg-accent">
                Далее
              </button>
            )}
            {!ended && node && atLastLine && visibleChoices.length > 0 && (
              <div className="space-y-1.5">
                {visibleChoices.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pickChoice(c.id)}
                    className="w-full text-left text-sm px-3 py-2 rounded-md bg-[var(--op-6)] hover:bg-[var(--op-10)] text-[var(--op-80)]"
                  >
                    {c.text || "…"}
                  </button>
                ))}
              </div>
            )}
            {!ended && node && atLastLine && visibleChoices.length === 0 && (
              <button
                onClick={() => goToNode(node.continueTo)}
                disabled={!node.continueTo}
                className="w-full text-sm py-2 rounded-md bg-accent/80 hover:bg-accent disabled:opacity-40"
              >
                {node.continueTo ? "Далее" : "Конец диалога"}
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
