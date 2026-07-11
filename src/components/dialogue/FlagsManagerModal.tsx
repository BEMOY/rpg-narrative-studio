import { useState } from "react";
import { X, Plus, Pencil, Trash2, Flag } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import type { DialogueFlagDef, DialogueFlagType } from "../../types/database";

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

// Bool value editor — a plain on/off switch (no "true/false/number" dropdown; the flag's own
// registered type already settled that question).
function BoolSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-center gap-1.5 shrink-0"
      title="Значение по умолчанию"
    >
      <span className={`relative w-8 h-[18px] rounded-full transition-colors ${on ? "bg-accent/80" : "bg-[var(--op-15)]"}`}>
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
      </span>
      <span className={`text-[11px] mono ${on ? "text-accent" : "text-[var(--op-40)]"}`}>{on ? "true" : "false"}</span>
    </button>
  );
}

// Number value editor — a slider over [0, max] plus an adjacent number field, so both a quick
// visual sense of "where in its range" and exact entry are available at once.
function NumberSlider({
  value,
  max,
  onChangeValue,
  onChangeMax,
}: {
  value: number;
  max: number;
  onChangeValue: (v: number) => void;
  onChangeMax: (m: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <input
        type="range"
        min={0}
        max={Math.max(max, 1)}
        value={Math.min(value, Math.max(max, 1))}
        onChange={(e) => onChangeValue(Number(e.target.value))}
        className="flex-1 min-w-[60px]"
      />
      <input
        type="number"
        className="input w-14 text-xs py-1 shrink-0"
        value={value}
        min={0}
        max={max}
        onChange={(e) => onChangeValue(Number(e.target.value) || 0)}
      />
      <span className="text-[10px] text-[var(--op-30)] shrink-0">/ макс</span>
      <input
        type="number"
        className="input w-14 text-xs py-1 shrink-0"
        value={max}
        onChange={(e) => onChangeMax(Math.max(0, Number(e.target.value) || 0))}
      />
    </div>
  );
}

export function FlagsManagerModal({ onClose }: { onClose: () => void }) {
  const flags = useProjectStore((s) => s.project.dialogueFlags);
  const dialogueFlagDefs = useProjectStore((s) => s.project.dialogueFlagDefs);
  const addDialogueFlag = useProjectStore((s) => s.addDialogueFlag);
  const setDialogueFlagDef = useProjectStore((s) => s.setDialogueFlagDef);
  const renameDialogueFlag = useProjectStore((s) => s.renameDialogueFlag);
  const removeDialogueFlag = useProjectStore((s) => s.removeDialogueFlag);

  const [draft, setDraft] = useState("");
  const [draftDef, setDraftDef] = useState<DialogueFlagDef>({ type: "bool", default: "false", max: 100 });

  const patchDraft = (p: Partial<DialogueFlagDef>) => setDraftDef((d) => ({ ...d, ...p }));

  const add = () => {
    if (!draft.trim()) return;
    addDialogueFlag(draft.trim(), draftDef);
    setDraft("");
    setDraftDef({ type: "bool", default: "false", max: 100 });
  };

  const rename = (name: string) => {
    const next = prompt("Новое имя флага:", name);
    if (next && next.trim() && next.trim() !== name) renameDialogueFlag(name, next.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="popover rounded-xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <Flag size={14} className="text-accent" />
          <span className="text-sm font-medium text-[var(--op-85)]">Флаги диалогов</span>
          <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {flags.length === 0 && <div className="text-xs text-[var(--op-30)] text-center py-4">Пока нет флагов.</div>}
          {flags.map((f) => {
            const def = dialogueFlagDefs[f] ?? { type: "bool" as const, default: "false" };
            return (
              <div key={f} className="rounded-md bg-[var(--op-5)] px-2.5 py-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="mono text-[var(--op-80)] text-sm flex-1 truncate">{f}</span>
                  <TypeToggle
                    type={def.type}
                    onChange={(t) => setDialogueFlagDef(f, { type: t, default: t === "bool" ? "false" : "0", max: t === "number" ? def.max ?? 100 : undefined })}
                  />
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
                <div className="flex items-center gap-2 pl-0.5">
                  <span className="text-[10px] text-[var(--op-35)] shrink-0">по умолчанию:</span>
                  {def.type === "bool" ? (
                    <BoolSwitch on={def.default === "true"} onChange={(v) => setDialogueFlagDef(f, { default: v ? "true" : "false" })} />
                  ) : (
                    <NumberSlider
                      value={Number(def.default) || 0}
                      max={def.max ?? 100}
                      onChangeValue={(v) => setDialogueFlagDef(f, { default: String(v) })}
                      onChangeMax={(m) => setDialogueFlagDef(f, { max: m })}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-[var(--op-10)] shrink-0 space-y-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="имя нового флага…"
            className="input w-full text-sm py-1.5"
          />
          <div className="flex items-center gap-2">
            <TypeToggle type={draftDef.type} onChange={(t) => patchDraft({ type: t, default: t === "bool" ? "false" : "0", max: t === "number" ? 100 : undefined })} />
            {draftDef.type === "bool" ? (
              <BoolSwitch on={draftDef.default === "true"} onChange={(v) => patchDraft({ default: v ? "true" : "false" })} />
            ) : (
              <NumberSlider
                value={Number(draftDef.default) || 0}
                max={draftDef.max ?? 100}
                onChangeValue={(v) => patchDraft({ default: String(v) })}
                onChangeMax={(m) => patchDraft({ max: m })}
              />
            )}
            <button onClick={add} className="w-8 h-8 shrink-0 grid place-items-center rounded-md bg-accent/80 hover:bg-accent">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
