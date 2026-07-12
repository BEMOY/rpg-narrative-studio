import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Check } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { STAT_ICON_NAMES, statIcon } from "../../lib/statIcons";
import type { StatPreset } from "../../types/database";
import { themedConfirm } from "../../lib/modals";

// A compact grid of every icon in the library — used both when creating a brand new preset
// and (implicitly, via statIcon()) when rendering an existing one. Kept as its own component
// since it's identical for both the "Параметры" and "Сопротивления" libraries.
function IconGrid({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1 max-h-36 overflow-y-auto p-1.5 rounded-md bg-[var(--op-4)] border border-[var(--op-8)]">
      {STAT_ICON_NAMES.map((name) => {
        const Icon = statIcon(name);
        const active = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            title={name}
            className={`w-7 h-7 grid place-items-center rounded-md transition-colors ${
              active ? "bg-accent/80 text-[var(--popover-bg)]" : "bg-[var(--op-6)] text-[var(--op-55)] hover:bg-[var(--op-12)] hover:text-[var(--op-85)]"
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

export function EquipmentPresetsModal({
  kind,
  assignedIds,
  onClose,
  onPick,
}: {
  kind: "stat" | "resist";
  assignedIds: string[];
  onClose: () => void;
  onPick: (preset: StatPreset) => void;
}) {
  const presets = useProjectStore((s) => (kind === "stat" ? s.project.statPresets : s.project.resistPresets));
  const addStatPreset = useProjectStore((s) => s.addStatPreset);
  const removeStatPreset = useProjectStore((s) => s.removeStatPreset);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState(STAT_ICON_NAMES[0]);
  const [draftMax, setDraftMax] = useState(100);

  const assigned = new Set(assignedIds);

  const startCreate = () => {
    setDraftName("");
    setDraftIcon(STAT_ICON_NAMES[0]);
    setDraftMax(100);
    setCreating(true);
  };

  const saveCreate = () => {
    const name = draftName.trim();
    if (!name) return;
    addStatPreset(kind, { name, icon: draftIcon, max: Math.max(1, draftMax || 1) });
    setCreating(false);
  };

  const remove = async (p: StatPreset) => {
    if (!(await themedConfirm(`Удалить пресет «${p.name}» из общей библиотеки? Он пропадёт со всех карточек снаряжения, где был назначен.`))) return;
    removeStatPreset(kind, p.id);
  };

  const title = kind === "stat" ? "Параметры" : "Сопротивления";

  // Rendered through a portal straight to <body> — this component is opened from deep inside
  // a .glass-styled Section, and `.glass` sets `backdrop-filter`, which (per spec) makes that
  // element a new containing block for any `position: fixed` descendant. Without the portal,
  // "fixed inset-0" ends up positioned/sized relative to that Section instead of the viewport,
  // so the overlay only covers part of the page instead of centering over everything — matches
  // PortalMenu/CommandPalette's existing approach for the same reason.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="popover rounded-xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <div className="text-sm font-medium text-[var(--op-85)]">{title}</div>
          <div className="text-[11px] text-[var(--op-35)]">Нажмите, чтобы добавить</div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {presets.length === 0 && !creating && (
            <div className="text-xs text-[var(--op-30)] text-center py-4">Пока нет пресетов — создайте первый.</div>
          )}
          {presets.map((p) => {
            const Icon = statIcon(p.icon);
            const isAssigned = assigned.has(p.id);
            return (
              <div key={p.id} className="flex items-center gap-2.5 rounded-md bg-[var(--op-5)] px-2.5 py-2">
                <button
                  onClick={() => onPick(p)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  title={isAssigned ? "Уже добавлено на эту карточку" : "Добавить на карточку"}
                >
                  <span className="w-7 h-7 shrink-0 rounded-md grid place-items-center bg-[var(--op-8)] text-accent">
                    <Icon size={14} />
                  </span>
                  <span className="text-sm text-[var(--op-80)] truncate flex-1">{p.name}</span>
                  {isAssigned && <Check size={13} className="text-accent shrink-0" />}
                </button>
                <button onClick={() => remove(p)} title="Удалить пресет из библиотеки" className="opacity-40 hover:opacity-100 hover:text-red-300 shrink-0">
                  <X size={14} />
                </button>
              </div>
            );
          })}

          {creating ? (
            <div className="rounded-md border border-[var(--op-10)] bg-[var(--op-4)] p-2.5 space-y-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="название…"
                className="input text-sm py-1.5"
              />
              <IconGrid value={draftIcon} onChange={setDraftIcon} />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--op-40)] shrink-0">макс. значение</span>
                <input
                  type="number"
                  min={1}
                  value={draftMax}
                  onChange={(e) => setDraftMax(Number(e.target.value) || 1)}
                  className="input text-sm py-1 flex-1"
                />
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <button onClick={() => setCreating(false)} className="flex-1 text-xs py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
                  Отмена
                </button>
                <button onClick={saveCreate} disabled={!draftName.trim()} className="flex-1 text-xs py-1.5 rounded-md bg-accent/80 hover:bg-accent disabled:opacity-40">
                  Создать
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startCreate}
              className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-md border border-dashed border-[var(--op-15)] text-[var(--op-40)] hover:text-[var(--op-70)] hover:border-[var(--op-30)]"
            >
              <Plus size={12} /> Создать пресет
            </button>
          )}
        </div>

        <div className="p-3 border-t border-[var(--op-10)] shrink-0 flex justify-end">
          <button onClick={onClose} className="text-sm px-4 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
