import { useState } from "react";
import { X, Plus, Pencil, Trash2, Flag } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import type { DialogueFlagType } from "../../types/database";

function TypeToggle({ type, onChange }: { type: DialogueFlagType; onChange: (t: DialogueFlagType) => void }) {
  return (
    <div className="flex items-center rounded-md bg-[var(--op-6)] p-0.5 shrink-0">
      {(["bool", "number"] as DialogueFlagType[]).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${type === t ? "bg-accent/70 text-[var(--op-95)]" : "text-[var(--op-40)] hover:text-[var(--op-70)]"}`}
        >
          {t === "bool" ? "Bool" : "Число"}
        </button>
      ))}
    </div>
  );
}

export function FlagsManagerModal({ onClose }: { onClose: () => void }) {
  const flags = useProjectStore((s) => s.project.dialogueFlags);
  const dialogueFlagTypes = useProjectStore((s) => s.project.dialogueFlagTypes);
  const addDialogueFlag = useProjectStore((s) => s.addDialogueFlag);
  const setDialogueFlagType = useProjectStore((s) => s.setDialogueFlagType);
  const renameDialogueFlag = useProjectStore((s) => s.renameDialogueFlag);
  const removeDialogueFlag = useProjectStore((s) => s.removeDialogueFlag);
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<DialogueFlagType>("bool");

  const add = () => {
    if (draft.trim()) addDialogueFlag(draft.trim(), draftType);
    setDraft("");
    setDraftType("bool");
  };

  const rename = (name: string) => {
    const next = prompt("Новое имя флага:", name);
    if (next && next.trim() && next.trim() !== name) renameDialogueFlag(name, next.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="popover rounded-xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <Flag size={14} className="text-accent" />
          <span className="text-sm font-medium text-[var(--op-85)]">Флаги диалогов</span>
          <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {flags.length === 0 && <div className="text-xs text-[var(--op-30)] text-center py-4">Пока нет флагов.</div>}
          {flags.map((f) => (
            <div key={f} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--op-5)] text-sm">
              <span className="mono text-[var(--op-80)] flex-1 truncate">{f}</span>
              <TypeToggle type={dialogueFlagTypes[f] ?? "bool"} onChange={(t) => setDialogueFlagType(f, t)} />
              <button onClick={() => rename(f)} className="opacity-40 hover:opacity-100">
                <Pencil size={12} />
              </button>
              <button
                onClick={() => confirm(`Удалить флаг «${f}»? Ссылки на него в условиях/действиях останутся как есть.`) && removeDialogueFlag(f)}
                className="opacity-40 hover:opacity-100 hover:text-red-300"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 p-3 border-t border-[var(--op-10)] shrink-0">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="имя нового флага…"
            className="input flex-1 text-sm py-1.5"
          />
          <TypeToggle type={draftType} onChange={setDraftType} />
          <button onClick={add} className="w-8 h-8 shrink-0 grid place-items-center rounded-md bg-accent/80 hover:bg-accent">
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
