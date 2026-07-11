import { useRef, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  X,
  Upload,
  Map as MapIcon,
  User,
  MapPin,
  Flag,
  Swords,
  Shirt,
  Package,
  Box,
  BookOpen,
} from "lucide-react";
import type { Category, Entry } from "../../types/database";
import { CAT_COLOR, CAT_LABEL, isQuest, hasRelationship, canHaveStats } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { resizeImageFile } from "../../lib/image";

const CAT_ICON: Record<Category, React.ComponentType<any>> = {
  character: User,
  location: MapPin,
  main_quest: Flag,
  side_quest: Swords,
  equipment: Shirt,
  item: Package,
  object: Box,
  lore: BookOpen,
};

const REL_LABEL: Record<string, string> = { friend: "Друг", neutral: "Нейтрален", enemy: "Враг" };

export function EntryDetail({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const showGallery = useProjectStore((s) => s.showGallery);
  const deleteEntry = useProjectStore((s) => s.deleteEntry);
  const color = CAT_COLOR[entry.category];
  const Icon = CAT_ICON[entry.category];

  const remove = () => {
    if (confirm(`Удалить «${entry.name}»? Это необратимо.`)) deleteEntry(entry.id);
  };

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <button
        onClick={showGallery}
        className="flex items-center gap-1.5 text-sm text-[var(--op-40)] hover:text-[var(--op-80)] transition-colors"
      >
        <ArrowLeft size={14} /> К галерее
      </button>

      <div className="rounded-lg overflow-hidden glass">
        <div className="relative h-52">
          {entry.image ? (
            <img src={entry.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full grid place-items-center"
              style={{ background: `radial-gradient(120% 120% at 50% 0%, ${color}30, ${color}08 70%, transparent)` }}
            >
              <Icon size={44} color={color} />
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-2" style={{ color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          {CAT_LABEL[entry.category]}
          {entry.chapter && (
            <>
              <span className="text-[var(--op-25)]">·</span>
              <span className="text-[var(--op-40)] normal-case tracking-normal">{entry.chapter}</span>
            </>
          )}
        </div>
        <h1 className="text-3xl font-medium text-[var(--op-90)]">{entry.name}</h1>
      </div>

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((t) => (
            <span key={t} className="text-xs px-2 py-1 rounded-full bg-[var(--op-8)] text-[var(--op-60)]">
              {t}
            </span>
          ))}
        </div>
      )}

      <Block title="Обзор">
        <p className="text-sm text-[var(--op-70)] whitespace-pre-wrap leading-relaxed">{entry.description || "—"}</p>
      </Block>

      {hasRelationship(entry.category) && entry.relationship && (
        <Block title="Отношение">
          <span className="text-sm text-[var(--op-70)]">{REL_LABEL[entry.relationship]}</span>
        </Block>
      )}

      {canHaveStats(entry.category) && entry.stats && Object.keys(entry.stats).length > 0 && (
        <Block title="Статы">
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(entry.stats).map(([k, v]) =>
              v === undefined ? null : (
                <div key={k} className="text-xs">
                  <div className="text-[var(--op-40)]">{k}</div>
                  <div className="text-[var(--op-90)] mono">{v}</div>
                </div>
              )
            )}
          </div>
        </Block>
      )}

      {isQuest(entry.category) && (
        <Block title="Objectives">
          <div className="space-y-1.5">
            {(entry.objectives ?? []).length === 0 && <div className="text-sm text-[var(--op-30)]">Нет objectives.</div>}
            {(entry.objectives ?? []).map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span
                  className={`w-4 h-4 rounded-sm border grid place-items-center text-[10px] shrink-0 ${
                    o.done ? "bg-emerald-500/30 border-emerald-500/40" : "border-[var(--op-20)]"
                  }`}
                >
                  {o.done ? "✓" : ""}
                </span>
                <span className={o.done ? "text-[var(--op-40)] line-through" : "text-[var(--op-80)]"}>{o.text || "—"}</span>
              </div>
            ))}
          </div>
        </Block>
      )}

      {entry.props.length > 0 && (
        <Block title="Свойства">
          <div className="grid grid-cols-2 gap-2">
            {entry.props.map(([k, v], i) => (
              <div key={i} className="text-sm">
                <span className="text-[var(--op-40)]">{k || "—"}: </span>
                <span className="text-[var(--op-80)]">{v || "—"}</span>
              </div>
            ))}
          </div>
        </Block>
      )}

      {entry.category === "location" && <LocationMapBlock entry={entry} />}

      <RelationsBlock entry={entry} />

      <div className="flex justify-between pt-2">
        <button
          onClick={remove}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"
        >
          <Trash2 size={14} /> Удалить
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md bg-accent/80 hover:bg-accent transition-colors"
        >
          <Pencil size={14} /> Редактировать
        </button>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">{title}</div>
      {children}
    </div>
  );
}

function LocationMapBlock({ entry }: { entry: Entry }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      updateEntry(entry.id, { mapImage: dataUrl });
    } catch {
      alert("Не удалось загрузить карту — попробуйте другой файл.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block title="Карта локации">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {entry.mapImage ? (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden border border-[var(--op-10)]">
            <img src={entry.mapImage} alt="Карта" className="w-full max-h-[360px] object-contain bg-[var(--op-5)]" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)] disabled:opacity-50"
            >
              <Upload size={12} /> {busy ? "Загрузка…" : "Заменить карту"}
            </button>
            <button
              onClick={() => updateEntry(entry.id, { mapImage: undefined })}
              className="text-xs text-[var(--op-40)] hover:text-[var(--op-70)]"
            >
              Убрать
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full rounded-lg border border-dashed border-[var(--op-15)] py-10 flex flex-col items-center justify-center gap-2 text-[var(--op-30)] hover:text-[var(--op-60)] hover:border-[var(--op-30)] transition-colors"
        >
          <MapIcon size={24} />
          <span className="text-sm">{busy ? "Загрузка…" : "Карта пока пустая — создать карту"}</span>
        </button>
      )}
    </Block>
  );
}

function RelationsBlock({ entry }: { entry: Entry }) {
  const allEntries = useProjectStore((s) => s.project.entries);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const [picking, setPicking] = useState(false);

  const linked = entry.references
    .map((id) => allEntries.find((e) => e.id === id))
    .filter((e): e is Entry => Boolean(e));

  const candidates = allEntries.filter((e) => e.id !== entry.id && !entry.references.includes(e.id));

  const addRef = (id: string) => {
    if (!id) return;
    updateEntry(entry.id, { references: [...entry.references, id] });
    setPicking(false);
  };

  const removeRef = (id: string) => {
    updateEntry(entry.id, { references: entry.references.filter((r) => r !== id) });
  };

  return (
    <Block title="Связи">
      <div className="space-y-1.5">
        {linked.length === 0 && !picking && <div className="text-sm text-[var(--op-30)]">Пока нет связей.</div>}
        {linked.map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-sm bg-[var(--op-5)] rounded-md px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CAT_COLOR[e.category] }} />
            <span className="text-[var(--op-80)] truncate">{e.name}</span>
            <span className="text-[var(--op-30)] text-xs">{CAT_LABEL[e.category]}</span>
            <button onClick={() => removeRef(e.id)} className="ml-auto opacity-40 hover:opacity-100 shrink-0">
              <X size={13} />
            </button>
          </div>
        ))}

        {picking ? (
          <select
            autoFocus
            className="input"
            defaultValue=""
            onChange={(e) => addRef(e.target.value)}
            onBlur={() => setPicking(false)}
          >
            <option value="" disabled>
              Выбрать запись…
            </option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {CAT_LABEL[e.category]} — {e.name}
              </option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]"
          >
            <Plus size={12} /> Добавить связь
          </button>
        )}
      </div>
    </Block>
  );
}
