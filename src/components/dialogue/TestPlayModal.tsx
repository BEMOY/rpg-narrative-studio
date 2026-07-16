import { X, Play, RotateCcw } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import type { Dialogue } from "../../types/database";
import { useDialoguePlayer } from "../../lib/useDialoguePlayer";
import { DialoguePlayArea } from "./DialoguePlayArea";

// The Dialogue editor's own "Test Play" window. As of this version the actual conversation
// state machine lives in useDialoguePlayer() and the portrait/box/choices rendering lives in
// <DialoguePlayArea variant="modal">, both shared verbatim with the embedded dialogue box shown
// on the Cutscene preview stage (see CutscenePreview.tsx) — this file is now just the modal
// chrome (dark backdrop, header bar, restart/close buttons, test-conditions side panel) wrapped
// around that shared core.
export function TestPlayModal({ dialogue, onClose }: { dialogue: Dialogue; onClose: () => void }) {
  const entries = useProjectStore((s) => s.project.entries);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);
  const player = useDialoguePlayer(dialogue);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div className="popover rounded-xl w-full max-w-3xl h-[600px] flex overflow-hidden shadow-2xl dlg-box-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--op-10)] shrink-0">
            <Play size={14} className="text-accent" />
            <span className="text-sm font-medium text-[var(--op-85)]">Тест — {dialogue.name}</span>
            <button onClick={player.restart} title="Начать заново" className="ml-auto opacity-50 hover:opacity-100">
              <RotateCcw size={14} />
            </button>
            <button onClick={onClose} className="opacity-50 hover:opacity-100">
              <X size={15} />
            </button>
          </div>

          <DialoguePlayArea player={player} colorStyles={colorStyles} variant="modal" />
        </div>

        {player.entryConds.length > 0 && (
          <div className="w-56 border-l border-[var(--op-10)] p-3 overflow-y-auto shrink-0">
            <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Тестовые условия</div>
            <div className="text-[10px] text-[var(--op-30)] mb-2 leading-relaxed">
              В Студии нет реального инвентаря игрока — переключите вручную для проверки веток.
            </div>
            {player.entryConds.map((c) => {
              const entry = entries.find((e) => e.id === c.key);
              const on = player.state.entryFlags[c.key] ?? false;
              return (
                <label key={c.key} className="flex items-center gap-2 text-xs text-[var(--op-70)] py-1">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => player.setState((s) => ({ ...s, entryFlags: { ...s.entryFlags, [c.key]: e.target.checked } }))}
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
