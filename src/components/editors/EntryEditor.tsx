import { Trash2, Plus, X, Upload, ImageOff, ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { DialogueSide, DialogueSpeakerData, Entry, EquipSlot, Objective, QuestDependency, QuestDependencyKind, QuestRewards, Relationship } from "../../types/database";
import { canHaveStats, hasRelationship, isEquip, isQuest } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { resizeImageFile } from "../../lib/image";
import { usePasteImage } from "../../lib/usePasteImage";
import { SearchSelect } from "../dialogue/SearchSelect";
import { nextId } from "../../lib/mapDefaults";
import { statIcon } from "../../lib/statIcons";
import { EquipmentPresetsModal } from "./EquipmentPresetsModal";
import type { StatPreset } from "../../types/database";
import { SLOTS, SLOT_LABEL, SLOT_ICON } from "../../lib/equipSlot";
import { objectiveDisplayMode, questAncestorIds } from "../../lib/questCompile";
import { ThemedSelect } from "../common/ThemedSelect";
import { themedAlert, themedConfirm, themedPrompt } from "../../lib/modals";


const RELATIONSHIPS: Relationship[] = ["friend", "neutral", "enemy"];
const SUGGESTED_STATS = ["attack", "defense", "magic", "speed", "luck", "crit", "dodge", "capacity", "level", "xp", "xp_max"];

export function EntryEditor({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const rarities = useProjectStore((s) => s.project.rarities);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const updateStat = useProjectStore((s) => s.updateStat);
  const deleteEntry = useProjectStore((s) => s.deleteEntry);

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <Section title="General">
        <Field label="Readable ID">
          <input className="input mono" value={entry.id} disabled />
        </Field>
        <Field label="Name">
          <input className="input" value={entry.name} onChange={(e) => updateEntry(entry.id, { name: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea
            className="input min-h-[90px]"
            value={entry.description}
            onChange={(e) => updateEntry(entry.id, { description: e.target.value })}
          />
        </Field>
      </Section>

      <ChapterSection entry={entry} />
      <VisualSection entry={entry} />
      <TagsSection entry={entry} />

      {isEquip(entry.category) && (
        <Section title="Слот экипировки">
          <div className="flex gap-2">
            {SLOTS.map((s) => {
              const Icon = SLOT_ICON[s];
              const active = (entry.slot ?? "weapon") === s;
              return (
                <button
                  key={s}
                  onClick={() => updateEntry(entry.id, { slot: s })}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-md border transition-colors ${
                    active ? "border-accent bg-accent/10 text-accent" : "border-[var(--op-10)] text-[var(--op-45)] hover:text-[var(--op-75)] hover:border-[var(--op-20)]"
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-[11px]">{SLOT_LABEL[s]}</span>
                </button>
              );
            })}
          </div>
          <Field label="Редкость">
            <ThemedSelect
              className="input"
              value={entry.rarityId ?? "common"}
              onChange={(v) => updateEntry(entry.id, { rarityId: v })}
              options={rarities
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((r) => ({ value: r.id, label: r.name }))}
            />
          </Field>
        </Section>
      )}

      {(isEquip(entry.category) || entry.category === "character") && <EquipStatsSection entry={entry} />}

      {(entry.category === "item" || entry.category === "equipment") && (
        <Section title="Economy">
          <Field label="Value">
            <input type="number" className="input" value={entry.value ?? 0} onChange={(e) => updateEntry(entry.id, { value: Number(e.target.value) })} />
          </Field>
          <Field label="Stack Size">
            <input type="number" className="input" value={entry.stack ?? 1} onChange={(e) => updateEntry(entry.id, { stack: Number(e.target.value) })} />
          </Field>
          <Field label="Quest Item">
            <input type="checkbox" checked={entry.quest ?? false} onChange={(e) => updateEntry(entry.id, { quest: e.target.checked })} />
          </Field>
        </Section>
      )}

      {hasRelationship(entry.category) && (
        <Section title="Relationship">
          <Field label="Attitude">
            <ThemedSelect
              className="input"
              value={entry.relationship ?? "neutral"}
              onChange={(v) => updateEntry(entry.id, { relationship: v as Relationship })}
              options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
            />
          </Field>
        </Section>
      )}

      {canHaveStats(entry.category) && !isEquip(entry.category) && entry.category !== "character" && (
        <Section title="Stats">
          <div className="grid grid-cols-2 gap-3">
            {SUGGESTED_STATS.map((key) => (
              <Field key={key} label={key}>
                <input
                  type="number"
                  className="input"
                  value={entry.stats?.[key] ?? ""}
                  placeholder="—"
                  onChange={(e) => updateStat(entry.id, key, e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </Field>
            ))}
          </div>
        </Section>
      )}

      {isQuest(entry.category) && <QuestPanel entry={entry} />}

      {entry.category === "character" && <DialogueSpeakerSection entry={entry} />}

      <PropsPanel entry={entry} />

      <div className="flex justify-between pt-2">
        <button
          onClick={async () => {
            if (await themedConfirm(`Удалить «${entry.name}»? Это необратимо.`)) deleteEntry(entry.id);
          }}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"
        >
          <Trash2 size={14} /> Удалить
        </button>
        <div className="flex gap-2">
          <button onClick={onDone} className="text-sm px-4 py-1.5 rounded-md glass hover:bg-[var(--op-10)] transition-colors">
            Отмена
          </button>
          <button onClick={onDone} className="text-sm px-4 py-1.5 rounded-md bg-accent/80 hover:bg-accent transition-colors">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

// One "Параметры" or "Сопротивления" row group — same shape for both, just a different
// preset library and value bag on the entry (statValues vs resistValues).
function EquipStatGroup({
  entry,
  kind,
  title,
}: {
  entry: Entry;
  kind: "stat" | "resist";
  title: string;
}) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const presets = useProjectStore((s) => (kind === "stat" ? s.project.statPresets : s.project.resistPresets));
  const [pickerOpen, setPickerOpen] = useState(false);

  const values = (kind === "stat" ? entry.statValues : entry.resistValues) ?? {};
  const valuesKey = kind === "stat" ? "statValues" : "resistValues";
  const assignedIds = Object.keys(values);
  const assignedPresets = assignedIds.map((id) => presets.find((p) => p.id === id)).filter((p): p is StatPreset => Boolean(p));

  const setValue = (id: string, v: number) => updateEntry(entry.id, { [valuesKey]: { ...values, [id]: v } });
  const removeValue = (id: string) => {
    const next = { ...values };
    delete next[id];
    updateEntry(entry.id, { [valuesKey]: next });
  };
  const pick = (p: StatPreset) => {
    if (Object.prototype.hasOwnProperty.call(values, p.id)) return;
    updateEntry(entry.id, { [valuesKey]: { ...values, [p.id]: Math.round(p.max / 2) } });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs uppercase tracking-wider text-[var(--op-35)]">{title}</span>
      </div>
      <div className="space-y-1.5">
        {assignedPresets.map((p) => {
          const Icon = statIcon(p.icon);
          const value = values[p.id] ?? 0;
          return (
            <div key={p.id} className="flex items-center gap-2 rounded-md bg-[var(--op-4)] px-2.5 py-1.5">
              <span className="w-6 h-6 shrink-0 rounded-md grid place-items-center bg-[var(--op-8)] text-accent">
                <Icon size={12} />
              </span>
              <span className="text-xs text-[var(--op-70)] w-20 shrink-0 truncate">{p.name}</span>
              <input
                type="range"
                min={0}
                max={p.max}
                value={value}
                onChange={(e) => setValue(p.id, Number(e.target.value))}
                className="flex-1 min-w-[50px]"
              />
              <input
                type="number"
                min={0}
                max={p.max}
                value={value}
                onChange={(e) => setValue(p.id, Math.max(0, Math.min(p.max, Number(e.target.value) || 0)))}
                className="input w-14 text-xs py-1 shrink-0"
              />
              <button onClick={() => removeValue(p.id)} className="opacity-40 hover:opacity-100 hover:text-red-300 shrink-0">
                <X size={13} />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md border border-dashed border-[var(--op-15)] text-[var(--op-40)] hover:text-[var(--op-70)] hover:border-[var(--op-30)]"
        >
          <Plus size={11} /> Добавить
        </button>
      </div>
      {pickerOpen && (
        <EquipmentPresetsModal kind={kind} assignedIds={assignedIds} onPick={pick} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

function EquipStatsSection({ entry }: { entry: Entry }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const enabled = entry.statsEnabled ?? false;

  return (
    <Section title="Характеристики">
      <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
        <button
          type="button"
          onClick={() => updateEntry(entry.id, { statsEnabled: !enabled })}
          className="relative w-9 h-[18px] rounded-full transition-colors shrink-0"
          style={{ background: enabled ? "#cda559" : "var(--op-15)" }}
        >
          <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${enabled ? "left-[17px]" : "left-[2px]"}`} />
        </button>
        <span className="text-sm text-[var(--op-70)]">Включить характеристики</span>
      </label>

      {enabled && (
        <div className="space-y-4 pt-1">
          <EquipStatGroup entry={entry} kind="stat" title="Параметры" />
          <EquipStatGroup entry={entry} kind="resist" title="Сопротивления (%)" />
        </div>
      )}
    </Section>
  );
}

function ChapterSection({ entry }: { entry: Entry }) {
  const chapters = useProjectStore((s) => s.project.chapters);
  const entries = useProjectStore((s) => s.project.entries);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const addChapter = useProjectStore((s) => s.addChapter);
  const removeChapter = useProjectStore((s) => s.removeChapter);

  const addNew = async () => {
    const name = await themedPrompt("Название главы:");
    if (!name) return;
    addChapter(name.trim());
    updateEntry(entry.id, { chapter: name.trim() });
  };

  const removeCurrent = async () => {
    const name = entry.chapter;
    if (!name) return;
    const count = entries.filter((e) => e.chapter === name).length;
    const warn = count > 1 ? ` Записей с этой главой: ${count} — у всех она будет снята.` : "";
    if (!(await themedConfirm(`Удалить главу «${name}» из проекта?${warn}`))) return;
    removeChapter(name);
  };

  return (
    <Section title="Глава">
      <Field label="Глава">
        <div className="flex gap-2">
          <ThemedSelect
            className="input"
            value={entry.chapter ?? ""}
            onChange={(v) => updateEntry(entry.id, { chapter: v || undefined })}
            options={[{ value: "", label: "— без главы —" }, ...chapters.map((c) => ({ value: c, label: c }))]}
          />
          <button
            onClick={addNew}
            title="Новая глава"
            className="w-9 h-9 shrink-0 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={removeCurrent}
            disabled={!entry.chapter}
            title={entry.chapter ? `Удалить главу «${entry.chapter}» из проекта` : "Сначала выберите главу"}
            className="w-9 h-9 shrink-0 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </Field>
    </Section>
  );
}

function VisualSection({ entry }: { entry: Entry }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      updateEntry(entry.id, { image: dataUrl });
    } catch {
      themedAlert("Не удалось загрузить картинку — попробуйте другой файл.");
    } finally {
      setBusy(false);
    }
  };

  usePasteImage((file) => onFile(file));

  return (
    <Section title="Visual">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-md overflow-hidden bg-[var(--op-5)] border border-[var(--op-10)] shrink-0 grid place-items-center">
          {entry.image ? (
            <img src={entry.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageOff size={18} className="text-[var(--op-20)]" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)] disabled:opacity-50"
          >
            <Upload size={12} /> {busy ? "Загрузка…" : "Загрузить картинку"}
          </button>
          <div className="text-[10px] text-[var(--op-30)]">или Ctrl/⌘+V, чтобы вставить из буфера обмена</div>
          {entry.image && (
            <button
              onClick={() => updateEntry(entry.id, { image: undefined })}
              className="text-xs text-[var(--op-40)] hover:text-[var(--op-70)] text-left"
            >
              Убрать — показывать иконку категории
            </button>
          )}
        </div>
      </div>
      {isEquip(entry.category) && (
        <Field label="Overlay (engine symbol)">
          <input
            className="input mono"
            value={entry.overlay ?? ""}
            placeholder="none"
            onChange={(e) => updateEntry(entry.id, { overlay: e.target.value || undefined })}
          />
        </Field>
      )}
    </Section>
  );
}

function TagsSection({ entry }: { entry: Entry }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const [draft, setDraft] = useState("");
  const tags = entry.tags ?? [];

  const addTag = () => {
    const t = draft.trim();
    if (!t || tags.includes(t)) {
      setDraft("");
      return;
    }
    updateEntry(entry.id, { tags: [...tags, t] });
    setDraft("");
  };

  const removeTag = (t: string) => updateEntry(entry.id, { tags: tags.filter((x) => x !== t) });

  return (
    <Section title="Tags">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--op-8)] border border-[var(--op-10)] text-[var(--op-70)]">
            {t}
            <button onClick={() => removeTag(t)} className="opacity-50 hover:opacity-100">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="добавить тег…"
          className="bg-transparent outline-none text-xs text-[var(--op-70)] placeholder:text-[var(--op-25)] px-1 py-1 min-w-[100px]"
        />
      </div>
    </Section>
  );
}

// Matches the real quest_define() shape exactly: type (main/side/story), objectives (each
// with numeric current/max — a plain checkbox objective is just max:1) or none at all (a
// "simple" quest completed via quest_mark_done), and an optional rewards struct.
function QuestPanel({ entry }: { entry: Entry }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const allEntries = useProjectStore((s) => s.project.entries);
  const dialogueFlags = useProjectStore((s) => s.project.dialogueFlags);
  const dialogueFlagDefs = useProjectStore((s) => s.project.dialogueFlagDefs);
  const objectives = entry.objectives ?? [];
  const rewards = entry.rewards ?? {};
  const itemOptions = allEntries.filter((e) => e.category === "item" || e.category === "equipment");

  const setObjectives = (next: Objective[]) => updateEntry(entry.id, { objectives: next });
  const patchObjective = (i: number, p: Partial<Objective>) => setObjectives(objectives.map((o, idx) => (idx === i ? { ...o, ...p } : o)));
  const removeObjective = (i: number) => setObjectives(objectives.filter((_, idx) => idx !== i));
  const addObjective = () => setObjectives([...objectives, { text: "", done: false, current: 0, max: 1 }]);

  const setRewards = (next: QuestRewards) => updateEntry(entry.id, { rewards: next });
  const patchRewards = (p: Partial<QuestRewards>) => setRewards({ ...rewards, ...p });
  const items = rewards.items ?? [];
  const patchItem = (i: number, p: Partial<{ id: string; count: number }>) =>
    patchRewards({ items: items.map((it, idx) => (idx === i ? { ...it, ...p } : it)) });
  const removeItem = (i: number) => patchRewards({ items: items.filter((_, idx) => idx !== i) });
  const addItem = () => patchRewards({ items: [...items, { id: itemOptions[0]?.id ?? "", count: 1 }] });

  const defaultType = entry.category === "main_quest" ? "main" : "side";
  const questType = entry.questType ?? defaultType;

  const dependencies = entry.questDependencies ?? [];
  const otherQuests = allEntries.filter((e) => isQuest(e.category) && e.id !== entry.id);
  // Every quest that already (directly or transitively) gates THIS quest's own availability —
  // picking one of these as a dependency TARGET would create a contradiction/cycle (e.g. a
  // child quest trying to block or unlock the very parent that unlocks it), so they're greyed
  // out with a lock icon in the picker below instead of silently allowing an invalid graph.
  const ancestorIds = useMemo(() => questAncestorIds(entry.id, allEntries), [entry.id, allEntries]);
  const dependencyOptions = otherQuests.map((e) => ({
    id: e.id,
    label: e.name,
    sublabel: ancestorIds.has(e.id) ? "родитель" : undefined,
    disabled: ancestorIds.has(e.id),
  }));
  const setDependencies = (next: QuestDependency[]) => updateEntry(entry.id, { questDependencies: next });
  const addDependency = () =>
    setDependencies([...dependencies, { id: nextId("qdep"), questId: otherQuests.find((e) => !ancestorIds.has(e.id))?.id ?? "", kind: "unlocks" }]);
  const patchDependency = (i: number, p: Partial<QuestDependency>) =>
    setDependencies(dependencies.map((d, idx) => (idx === i ? { ...d, ...p } : d)));
  const removeDependency = (i: number) => setDependencies(dependencies.filter((_, idx) => idx !== i));

  // The type dropdown IS the entry's category here — main/side quest type and
  // main_quest/side_quest category would otherwise drift apart (e.g. an entry filed under
  // "Побочные квесты" but labeled type:"main" in the exported quest_define()), which is
  // confusing with no upside. Switching the type now moves the entry between the two Codex
  // categories too. ("story" removed — there's no matching Category, so it could never be
  // synced the same way; only main/side actually exist as real Codex categories.)
  const displayType = questType === "story" ? "main" : questType;

  return (
    <Section title="Квест (quest_define)">
      <Field label="Тип (type)">
        <ThemedSelect
          className="input"
          value={displayType}
          onChange={(v) => {
            const next = v as "main" | "side";
            updateEntry(entry.id, { questType: next, category: next === "side" ? "side_quest" : "main_quest" });
          }}
          options={[{ value: "main", label: "main" }, { value: "side", label: "side" }]}
        />
      </Field>

      <div>
        <div className="text-sm text-[var(--op-50)] mb-2 flex items-center gap-2">
          Подцели
          {objectives.length === 0 && (
            <span className="text-xs text-[var(--op-30)]">— нет, простой квест (quest_mark_done)</span>
          )}
        </div>
        <div className="space-y-1.5">
          {objectives.map((o, i) => {
            const mode = o.valueMode ?? "checkbox";
            const display = objectiveDisplayMode(o, dialogueFlagDefs);
            return (
              <div key={i} className="rounded-md border border-[var(--op-7)] p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    className="input flex-1 min-w-0"
                    value={o.text}
                    placeholder="текст подцели"
                    onChange={(e) => patchObjective(i, { text: e.target.value })}
                  />
                  <button onClick={() => removeObjective(i)} className="opacity-40 hover:opacity-100 shrink-0">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ThemedSelect
                    className="input w-auto text-xs py-1 shrink-0"
                    value={mode}
                    onChange={(v) => {
                      const nextMode = v as Objective["valueMode"];
                      if (nextMode === "checkbox") patchObjective(i, { valueMode: nextMode, max: 1, current: Math.min(o.current ?? 0, 1) });
                      else if (nextMode === "flag") {
                        const firstFlag = dialogueFlags[0];
                        patchObjective(i, { valueMode: nextMode, boundFlagName: o.boundFlagName ?? firstFlag });
                      } else patchObjective(i, { valueMode: nextMode, customType: o.customType ?? "bool", max: o.max ?? 100, customDefault: o.customDefault ?? 0 });
                    }}
                    options={[
                      { value: "checkbox", label: "чекбокс" },
                      { value: "flag", label: "флаг" },
                      { value: "custom", label: "своё значение" },
                    ]}
                    panelClassName="min-w-[150px]"
                  />

                  {mode === "flag" && (
                    <>
                      <ThemedSelect
                        className="input w-auto text-xs py-1 shrink-0 min-w-[140px]"
                        value={o.boundFlagName ?? ""}
                        onChange={(v) => patchObjective(i, { boundFlagName: v || undefined })}
                        options={[
                          { value: "", label: "— выберите флаг —" },
                          ...dialogueFlags.map((f) => ({ value: f, label: `${f} (${dialogueFlagDefs[f]?.type === "number" ? "число" : "bool"})` })),
                        ]}
                        panelClassName="min-w-[200px]"
                      />
                      {o.boundFlagName && !dialogueFlagDefs[o.boundFlagName] && (
                        <span className="text-[10px] text-amber-400/80">флаг не найден</span>
                      )}
                    </>
                  )}

                  {mode === "custom" && (
                    <>
                      <ThemedSelect
                        className="input w-auto text-xs py-1 shrink-0"
                        value={o.customType ?? "bool"}
                        onChange={(v) => patchObjective(i, { customType: v as "bool" | "number" })}
                        options={[{ value: "bool", label: "bool" }, { value: "number", label: "число" }]}
                      />
                      {o.customType === "number" && (
                        <>
                          <span className="text-[10px] text-[var(--op-35)] shrink-0">макс.</span>
                          <input
                            type="number"
                            className="input w-16 text-xs py-1 shrink-0"
                            value={o.max ?? 100}
                            onChange={(e) => patchObjective(i, { max: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <span className="text-[10px] text-[var(--op-35)] shrink-0">по умолч.</span>
                          <input
                            type="number"
                            className="input w-16 text-xs py-1 shrink-0"
                            value={o.customDefault ?? 0}
                            onChange={(e) => patchObjective(i, { customDefault: Number(e.target.value) || 0 })}
                          />
                        </>
                      )}
                    </>
                  )}

                  {display.kind === "slider" && (
                    <>
                      <span className="text-[10px] text-[var(--op-35)] shrink-0 ml-auto">текущее</span>
                      <input
                        type="number"
                        min={0}
                        max={display.max}
                        className="input w-16 text-xs py-1 shrink-0"
                        value={o.current ?? 0}
                        onChange={(e) => patchObjective(i, { current: Math.max(0, Math.min(display.max, Number(e.target.value) || 0)) })}
                      />
                    </>
                  )}

                  <input
                    className="input w-28 shrink-0 mono text-xs py-1"
                    value={o.objId ?? ""}
                    placeholder="objId (флаг obj_...)"
                    onChange={(e) => patchObjective(i, { objId: e.target.value || undefined })}
                  />
                </div>
              </div>
            );
          })}
          <button onClick={addObjective} className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]">
            <Plus size={12} /> Добавить подцель
          </button>
        </div>
      </div>

      <div>
        <div className="text-sm text-[var(--op-50)] mb-2">Награды (rewards)</div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <div className="text-xs text-[var(--op-45)] mb-1">Монеты</div>
            <input
              type="number"
              className="input w-full"
              value={rewards.coins ?? ""}
              placeholder="—"
              onChange={(e) => patchRewards({ coins: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
          <div>
            <div className="text-xs text-[var(--op-45)] mb-1">XP</div>
            <input
              type="number"
              className="input w-full"
              value={rewards.xp ?? ""}
              placeholder="—"
              onChange={(e) => patchRewards({ xp: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
          <div>
            <div className="text-xs text-[var(--op-45)] mb-1">Симпатия</div>
            <input
              type="number"
              className="input w-full"
              value={rewards.affinity ?? ""}
              placeholder="—"
              onChange={(e) => patchRewards({ affinity: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <SearchSelect
                  value={it.id || undefined}
                  onChange={(id) => patchItem(i, { id: id ?? "" })}
                  options={itemOptions.map((e) => ({ id: e.id, label: e.name }))}
                  placeholder="выбрать предмет…"
                  searchPlaceholder="Поиск предмета…"
                  clearLabel="— не выбрано —"
                />
              </div>
              <input
                type="number"
                className="input w-16 shrink-0"
                value={it.count}
                onChange={(e) => patchItem(i, { count: Number(e.target.value) || 1 })}
              />
              <button onClick={() => removeItem(i)} className="opacity-40 hover:opacity-100 shrink-0">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={addItem} className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]">
            <Plus size={12} /> Добавить предмет-награду
          </button>
        </div>
      </div>

      <div>
        <div className="text-sm text-[var(--op-50)] mb-2 flex items-center gap-2">
          Зависимости
          {dependencies.length === 0 && (
            <span className="text-xs text-[var(--op-30)]">— нет (необязательно; только для карты «Квесты», не влияет на quests_init())</span>
          )}
        </div>
        <div className="space-y-1.5">
          {dependencies.map((d, i) => (
            <div key={d.id} className="flex items-center gap-1.5 rounded-md border border-[var(--op-7)] p-2">
              <span className="text-xs text-[var(--op-45)] shrink-0">При завершении этого квеста —</span>
              <ThemedSelect
                className="input w-32 shrink-0"
                value={d.kind}
                onChange={(v) => patchDependency(i, { kind: v as QuestDependencyKind })}
                options={[{ value: "unlocks", label: "открывается" }, { value: "blocks", label: "блокируется" }]}
              />
              <div className="flex-1 min-w-0">
                <SearchSelect
                  value={d.questId || undefined}
                  onChange={(id) => patchDependency(i, { questId: id ?? "" })}
                  options={dependencyOptions}
                  placeholder="выбрать квест…"
                  searchPlaceholder="Поиск квеста…"
                  clearLabel="— не выбрано —"
                />
              </div>
              <button onClick={() => removeDependency(i)} className="opacity-40 hover:opacity-100 shrink-0">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={addDependency} className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]">
            <Plus size={12} /> Добавить зависимость
          </button>
        </div>
      </div>
    </Section>
  );
}

const SIDE_OPTIONS: DialogueSide[] = ["left", "default", "right", "none"];
const SUGGESTED_EMOTIONS = ["neutral", "happy", "angry"];

// Mirrors speaker_define(key, {...}) from the user's own scr_dialogue_data / speakers_init —
// everything here is optional, the GML exporter fills in the same placeholders shown below
// (display_name -> entry name, color -> c_white, blip -> -1, side -> left, text_speed -> 0.3,
// box -> spr_dlg_box) for anything left blank, so this section never blocks dialogue export.
function DialogueSpeakerSection({ entry }: { entry: Entry }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const data: DialogueSpeakerData = entry.dialogueSpeaker ?? { portraits: [] };

  const patch = (p: Partial<DialogueSpeakerData>) => updateEntry(entry.id, { dialogueSpeaker: { ...data, ...p } });

  const addPortrait = (emotion = "") => patch({ portraits: [...data.portraits, { emotion, sprite: "" }] });
  const updatePortrait = (i: number, p: Partial<{ emotion: string; sprite: string }>) =>
    patch({ portraits: data.portraits.map((row, idx) => (idx === i ? { ...row, ...p } : row)) });
  const removePortrait = (i: number) => patch({ portraits: data.portraits.filter((_, idx) => idx !== i) });

  const missingSuggested = SUGGESTED_EMOTIONS.filter((e) => !data.portraits.some((p) => p.emotion === e));

  return (
    <Section title="Диалог (speaker_define)" defaultOpen={false}>
      <Field label="Отображаемое имя">
        <input
          className="input"
          value={data.displayName ?? ""}
          onChange={(e) => patch({ displayName: e.target.value })}
          placeholder={entry.name || "display_name"}
        />
      </Field>

      <div>
        <div className="grid grid-cols-[160px_1fr] gap-3">
          <label className="text-sm text-[var(--op-50)] pt-1.5">Портреты (эмоции)</label>
          <div className="space-y-1.5">
            {data.portraits.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  className="input flex-1"
                  value={p.emotion}
                  onChange={(e) => updatePortrait(i, { emotion: e.target.value })}
                  placeholder="эмоция (neutral, happy…)"
                />
                <input
                  className="input flex-1"
                  value={p.sprite}
                  onChange={(e) => updatePortrait(i, { sprite: e.target.value })}
                  placeholder="спрайт (spr_port_x_neutral)"
                />
                <button onClick={() => removePortrait(i)} className="opacity-40 hover:opacity-100 shrink-0">
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              {missingSuggested.map((e) => (
                <button
                  key={e}
                  onClick={() => addPortrait(e)}
                  className="text-xs px-2 py-1 rounded-md bg-[var(--op-6)] text-[var(--op-45)] hover:text-[var(--op-80)] hover:bg-[var(--op-10)]"
                >
                  + {e}
                </button>
              ))}
              <button
                onClick={() => addPortrait()}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-[var(--op-6)] text-[var(--op-45)] hover:text-[var(--op-80)] hover:bg-[var(--op-10)]"
              >
                <Plus size={11} /> своя эмоция
              </button>
            </div>
            {data.portraits.length === 0 && (
              <div className="text-[10px] text-[var(--op-30)]">
                Ничего не указано — при экспорте портреты просто не попадут в speaker_define (без плейсхолдеров, их нельзя
                угадать).
              </div>
            )}
          </div>
        </div>
      </div>

      <Field label="Цвет текста">
        <input className="input mono" value={data.color ?? ""} onChange={(e) => patch({ color: e.target.value })} placeholder="c_white" />
      </Field>
      <Field label="Звук (blip)">
        <input className="input mono" value={data.blip ?? ""} onChange={(e) => patch({ blip: e.target.value })} placeholder="-1 (без звука)" />
      </Field>
      <Field label="Сторона по умолчанию">
        <ThemedSelect
          className="input"
          value={data.side ?? ""}
          onChange={(v) => patch({ side: (v || undefined) as DialogueSide | undefined })}
          options={[{ value: "", label: "— как в диалоге (по умолчанию left) —" }, ...SIDE_OPTIONS.map((s) => ({ value: s, label: s }))]}
          panelClassName="min-w-[220px]"
        />
      </Field>
      <Field label="Скорость текста">
        <input
          type="number"
          step={0.05}
          className="input"
          value={data.textSpeed ?? ""}
          onChange={(e) => patch({ textSpeed: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="0.3"
        />
      </Field>
      <Field label="Скин окна (box)">
        <input className="input mono" value={data.box ?? ""} onChange={(e) => patch({ box: e.target.value })} placeholder="spr_dlg_box" />
      </Field>
    </Section>
  );
}

function PropsPanel({ entry }: { entry: Entry }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const props = entry.props ?? [];
  const set = (next: typeof props) => updateEntry(entry.id, { props: next });

  return (
    <Section title="Custom Properties">
      <div className="space-y-2">
        {props.map(([k, v], i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="input w-1/3"
              value={k}
              placeholder="key"
              onChange={(e) => {
                const next = props.slice() as [string, string][];
                next[i] = [e.target.value, v];
                set(next);
              }}
            />
            <input
              className="input flex-1"
              value={v}
              placeholder="value"
              onChange={(e) => {
                const next = props.slice() as [string, string][];
                next[i] = [k, e.target.value];
                set(next);
              }}
            />
            <button onClick={() => set(props.filter((_, j) => j !== i))} className="opacity-40 hover:opacity-100 shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
        <button onClick={() => set([...props, ["", ""]])} className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]">
          <Plus size={12} /> Добавить поле
        </button>
      </div>
    </Section>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass rounded-lg p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-[var(--op-35)] hover:text-[var(--op-60)] transition-colors"
      >
        {title}
        <ChevronDown size={13} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="space-y-3 mt-4">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-3">
      <label className="text-sm text-[var(--op-50)]">{label}</label>
      {children}
    </div>
  );
}
