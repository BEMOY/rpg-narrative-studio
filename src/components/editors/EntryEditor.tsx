import { Trash2, Plus, X, Upload, ImageOff } from "lucide-react";
import { useRef, useState } from "react";
import type { Entry, EquipSlot, Relationship } from "../../types/database";
import { canHaveStats, hasRelationship, isEquip, isQuest } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { resizeImageFile } from "../../lib/image";

const SLOTS: EquipSlot[] = ["head", "body", "weapon", "offhand"];
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
        <Section title="Slot & Rarity">
          <Field label="Slot">
            <select className="input" value={entry.slot ?? "weapon"} onChange={(e) => updateEntry(entry.id, { slot: e.target.value as EquipSlot })}>
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rarity">
            <select className="input" value={entry.rarityId ?? "common"} onChange={(e) => updateEntry(entry.id, { rarityId: e.target.value })}>
              {rarities
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </Field>
        </Section>
      )}

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
            <select
              className="input"
              value={entry.relationship ?? "neutral"}
              onChange={(e) => updateEntry(entry.id, { relationship: e.target.value as Relationship })}
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </Section>
      )}

      {canHaveStats(entry.category) && (
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

      {isQuest(entry.category) && <ObjectivesPanel entry={entry} />}

      <PropsPanel entry={entry} />

      <div className="flex justify-between pt-2">
        <button
          onClick={() => {
            if (confirm(`Удалить «${entry.name}»? Это необратимо.`)) deleteEntry(entry.id);
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

function ChapterSection({ entry }: { entry: Entry }) {
  const chapters = useProjectStore((s) => s.project.chapters);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const addChapter = useProjectStore((s) => s.addChapter);

  const addNew = () => {
    const name = prompt("Название главы:");
    if (!name) return;
    addChapter(name.trim());
    updateEntry(entry.id, { chapter: name.trim() });
  };

  return (
    <Section title="Глава">
      <Field label="Глава">
        <div className="flex gap-2">
          <select
            className="input"
            value={entry.chapter ?? ""}
            onChange={(e) => updateEntry(entry.id, { chapter: e.target.value || undefined })}
          >
            <option value="">— без главы —</option>
            {chapters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={addNew}
            title="Новая глава"
            className="w-9 h-9 shrink-0 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]"
          >
            <Plus size={14} />
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
      alert("Не удалось загрузить картинку — попробуйте другой файл.");
    } finally {
      setBusy(false);
    }
  };

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

function ObjectivesPanel({ entry }: { entry: Entry }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const objectives = entry.objectives ?? [];

  const set = (next: typeof objectives) => updateEntry(entry.id, { objectives: next });

  return (
    <Section title="Objectives">
      <div className="space-y-2">
        {objectives.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={o.done}
              onChange={(e) => {
                const next = objectives.slice();
                next[i] = { ...o, done: e.target.checked };
                set(next);
              }}
            />
            <input
              className="input"
              value={o.text}
              onChange={(e) => {
                const next = objectives.slice();
                next[i] = { ...o, text: e.target.value };
                set(next);
              }}
            />
            <button
              onClick={() => set(objectives.filter((_, j) => j !== i))}
              className="opacity-40 hover:opacity-100 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={() => set([...objectives, { text: "", done: false }])}
          className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]"
        >
          <Plus size={12} /> Добавить objective
        </button>
      </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-lg p-5">
      <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-4">{title}</div>
      <div className="space-y-3">{children}</div>
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
