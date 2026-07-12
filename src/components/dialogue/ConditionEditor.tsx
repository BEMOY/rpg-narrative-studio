import { useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { PortalMenu } from "../common/PortalMenu";
import { SearchSelect } from "./SearchSelect";
import { FlagValueInput } from "./FlagValueInput";
import { ThemedSelect } from "../common/ThemedSelect";
import { CAT_COLOR, isQuest, type DialogueCondition } from "../../types/database";

const QUEST_STATUS_LABEL: Record<string, string> = { not_started: "не начат", active: "активен", done: "выполнен" };

function summarize(c: DialogueCondition | undefined): string {
  if (!c) return "нет условия";
  if (c.kind === "flag") return `флаг ${c.key} ${c.op === "eq" ? "=" : "≠"} ${c.value ?? ""}`;
  if (c.kind === "quest") return `квест ${c.key}: ${QUEST_STATUS_LABEL[c.value ?? ""] ?? c.value ?? "?"}`;
  return `${c.op === "has" ? "есть" : "нет"} объект ${c.key}`;
}

export function ConditionEditor({
  value,
  onChange,
  label = "условие",
}: {
  value: DialogueCondition | undefined;
  onChange: (c: DialogueCondition | undefined) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const entries = useProjectStore((s) => s.project.entries);
  const dialogueFlagDefs = useProjectStore((s) => s.project.dialogueFlagDefs);

  const draft: DialogueCondition = value ?? { kind: "flag", key: "", op: "eq", value: "" };

  const set = (patch: Partial<DialogueCondition>) => onChange({ ...draft, ...patch });

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors ${
          value ? "border-accent/60 text-accent bg-accent/10" : "border-[var(--op-10)] text-[var(--op-35)] hover:text-[var(--op-60)]"
        }`}
        title={label}
      >
        <Filter size={10} />
        <span className="max-w-[140px] truncate">{summarize(value)}</span>
      </button>
      <PortalMenu anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
        <div className="w-64 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[var(--op-35)]">{label}</span>
            {value && (
              <button
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className="text-[10px] text-red-300 hover:underline flex items-center gap-0.5"
              >
                <X size={10} /> убрать
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {(["flag", "quest", "entry"] as const).map((k) => (
              <button
                key={k}
                onClick={() => set({ kind: k, key: "", op: k === "entry" ? "has" : "eq", value: "" })}
                className={`flex-1 text-[10px] py-1 rounded-md ${draft.kind === k ? "bg-accent/25 text-[var(--op-90)]" : "bg-[var(--op-6)] text-[var(--op-45)]"}`}
              >
                {k === "flag" ? "Флаг" : k === "quest" ? "Квест" : "Объект"}
              </button>
            ))}
          </div>

          {draft.kind === "flag" && (
            <>
              <input
                list="dialogue-flags-list"
                value={draft.key}
                onChange={(e) => set({ key: e.target.value })}
                placeholder="имя флага"
                className="input text-xs py-1 w-full"
              />
              <div className="flex gap-1.5">
                <ThemedSelect
                  value={draft.op}
                  onChange={(v) => set({ op: v as "eq" | "neq" })}
                  options={[{ value: "eq", label: "=" }, { value: "neq", label: "≠" }]}
                  className="input text-xs py-1 w-20"
                  panelClassName="min-w-[60px]"
                />
                <FlagValueInput value={draft.value ?? ""} onChange={(v) => set({ value: v })} className="flex-1" flagType={dialogueFlagDefs[draft.key]?.type} />
              </div>
            </>
          )}

          {draft.kind === "quest" && (
            <>
              <SearchSelect
                value={draft.key || undefined}
                onChange={(id) => set({ key: id ?? "" })}
                options={entries.filter((e) => isQuest(e.category)).map((e) => ({ id: e.id, label: e.name, color: CAT_COLOR[e.category] }))}
                placeholder="выбрать квест…"
                searchPlaceholder="Поиск квеста…"
                clearLabel="— не выбрано —"
              />
              <ThemedSelect
                value={draft.value ?? "active"}
                onChange={(v) => set({ value: v })}
                options={[
                  { value: "not_started", label: "не начат" },
                  { value: "active", label: "активен" },
                  { value: "done", label: "выполнен" },
                ]}
                className="input text-xs py-1 w-full"
              />
            </>
          )}

          {draft.kind === "entry" && (
            <>
              <SearchSelect
                value={draft.key || undefined}
                onChange={(id) => set({ key: id ?? "" })}
                options={entries.map((e) => ({ id: e.id, label: e.name }))}
                placeholder="выбрать объект…"
                searchPlaceholder="Поиск объекта…"
                clearLabel="— не выбрано —"
              />
              <ThemedSelect
                value={draft.op}
                onChange={(v) => set({ op: v as "has" | "not_has" })}
                options={[
                  { value: "has", label: "есть у игрока / выполнено" },
                  { value: "not_has", label: "нет у игрока / не выполнено" },
                ]}
                className="input text-xs py-1 w-full"
                panelClassName="min-w-[220px]"
              />
            </>
          )}

          {!value && (
            <button
              onClick={() => {
                if (draft.key.trim()) onChange(draft);
              }}
              className="w-full text-xs py-1.5 rounded-md bg-accent/80 hover:bg-accent"
            >
              Применить
            </button>
          )}
        </div>
      </PortalMenu>
    </>
  );
}
