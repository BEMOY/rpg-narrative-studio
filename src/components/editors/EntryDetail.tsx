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
  Search,
  Check,
} from "lucide-react";
import { CAT_ICON } from "../../lib/categoryIcons";
import type { Category, Entry, StatPreset } from "../../types/database";
import { CAT_COLOR, CAT_LABEL, CAT_ORDER, isQuest, hasRelationship, canHaveStats, isEquip } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { resizeImageFile } from "../../lib/image";
import { usePasteImage } from "../../lib/usePasteImage";
import { MapEditorModal } from "../mapeditor/MapEditorModal";
import { MapThumbnail, mapHasContent } from "../mapeditor/MapThumbnail";
import { RarityBadge } from "../common/RarityBadge";
import { statIcon } from "../../lib/statIcons";
import { SLOT_LABEL, SLOT_ICON } from "../../lib/equipSlot";
import { themedAlert, themedConfirm } from "../../lib/modals";

const REL_LABEL: Record<string, string> = { friend: "Друг", neutral: "Нейтрален", enemy: "Враг" };

export function EntryDetail({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const showGallery = useProjectStore((s) => s.showGallery);
  const deleteEntry = useProjectStore((s) => s.deleteEntry);
  const rarities = useProjectStore((s) => s.project.rarities);
  const statPresets = useProjectStore((s) => s.project.statPresets);
  const resistPresets = useProjectStore((s) => s.project.resistPresets);
  const color = CAT_COLOR[entry.category];
  const Icon = CAT_ICON[entry.category];
  const rarity = isEquip(entry.category) ? rarities.find((r) => r.id === entry.rarityId) : undefined;

  const remove = async () => {
    if (await themedConfirm(`Удалить «${entry.name}»? Это необратимо.`)) deleteEntry(entry.id);
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
          {rarity && (
            <>
              <span className="text-[var(--op-25)]">·</span>
              <RarityBadge rarity={rarity} showParticles />
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

      {isEquip(entry.category) && entry.slot && (
        <Block title="Слот экипировки">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 shrink-0 rounded-lg grid place-items-center bg-[var(--op-8)] text-accent">
              {(() => {
                const SlotIcon = SLOT_ICON[entry.slot];
                return <SlotIcon size={22} />;
              })()}
            </span>
            <span className="text-sm text-[var(--op-80)]">{SLOT_LABEL[entry.slot]}</span>
          </div>
        </Block>
      )}

      {(entry.category === "item" || entry.category === "equipment") && (
        <Block title="Экономика">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-xs text-[var(--op-40)] mb-1">Цена</div>
              <div className="text-sm text-[var(--op-90)] mono">{entry.value ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--op-40)] mb-1">Размер стака</div>
              <div className="text-sm text-[var(--op-90)] mono">{entry.stack ?? 1}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-[var(--op-70)]">
            <span
              className="w-3.5 h-3.5 rounded-[4px] border grid place-items-center shrink-0"
              style={{
                background: entry.quest ? "rgb(var(--accent-rgb) / 0.8)" : "var(--op-5)",
                borderColor: entry.quest ? "rgb(var(--accent-rgb))" : "var(--op-20)",
              }}
            >
              {entry.quest && <Check size={10} className="text-[var(--popover-bg)]" strokeWidth={3} />}
            </span>
            Квестовый предмет
          </div>
        </Block>
      )}

      {hasRelationship(entry.category) && entry.relationship && (
        <Block title="Отношение">
          <span className="text-sm text-[var(--op-70)]">{REL_LABEL[entry.relationship]}</span>
        </Block>
      )}

      {canHaveStats(entry.category) && !isEquip(entry.category) && entry.stats && Object.keys(entry.stats).length > 0 && (
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

      {isEquip(entry.category) && entry.statsEnabled && (
        <EquipStatDisplayGroup title="Параметры" values={entry.statValues} presets={statPresets} />
      )}
      {isEquip(entry.category) && entry.statsEnabled && (
        <EquipStatDisplayGroup title="Сопротивления (%)" values={entry.resistValues} presets={resistPresets} suffix="%" />
      )}

      {isQuest(entry.category) && (
        <Block title={`Квест (${entry.questType ?? (entry.category === "main_quest" ? "main" : "side")})`}>
          <div className="space-y-1.5">
            {(entry.objectives ?? []).length === 0 && (
              <div className="text-sm text-[var(--op-30)]">Простой квест — без подцелей (quest_mark_done).</div>
            )}
            {(entry.objectives ?? []).map((o, i) => {
              const current = o.current ?? (o.done ? 1 : 0);
              const max = o.max ?? 1;
              const done = current >= max;
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span
                    className={`w-4 h-4 rounded-sm border grid place-items-center text-[10px] shrink-0 ${
                      done ? "bg-emerald-500/30 border-emerald-500/40" : "border-[var(--op-20)]"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span className={done ? "text-[var(--op-40)] line-through" : "text-[var(--op-80)]"}>{o.text || "—"}</span>
                  <span className="text-xs mono text-[var(--op-30)]">
                    {current}/{max}
                  </span>
                </div>
              );
            })}
          </div>
          {entry.rewards && (entry.rewards.coins || entry.rewards.xp || entry.rewards.affinity || entry.rewards.items?.length) ? (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[var(--op-7)]">
              {entry.rewards.coins ? (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-300">🪙 {entry.rewards.coins}</span>
              ) : null}
              {entry.rewards.xp ? (
                <span className="text-xs px-2 py-1 rounded-full bg-sky-500/15 text-sky-300">✦ {entry.rewards.xp} XP</span>
              ) : null}
              {entry.rewards.affinity ? (
                <span className="text-xs px-2 py-1 rounded-full bg-pink-500/15 text-pink-300">♥ {entry.rewards.affinity}</span>
              ) : null}
              {(entry.rewards.items ?? []).map((it, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full bg-[var(--op-8)] text-[var(--op-60)]">
                  {it.count}× {it.id}
                </span>
              ))}
            </div>
          ) : null}
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

      {entry.category === "character" && entry.dialogueSpeaker && (
        <Block title="Диалог (speaker_define)">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[var(--op-40)] text-xs">Имя в диалоге</div>
              <div className="text-[var(--op-85)]">{entry.dialogueSpeaker.displayName || entry.name}</div>
            </div>
            <div>
              <div className="text-[var(--op-40)] text-xs">Сторона</div>
              <div className="text-[var(--op-85)]">{entry.dialogueSpeaker.side ?? "left"}</div>
            </div>
            {entry.dialogueSpeaker.portraits.length > 0 && (
              <div className="col-span-2">
                <div className="text-[var(--op-40)] text-xs mb-1">Портреты</div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.dialogueSpeaker.portraits.map((p, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-full bg-[var(--op-8)] text-[var(--op-60)] mono">
                      {p.emotion || "?"}: {p.sprite || "—"}
                    </span>
                  ))}
                </div>
              </div>
            )}
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

// Read-only rendering of the equipment stat/resist presets assigned to this entry — icon +
// name + a filled progress bar (value/max) instead of the editable slider used in the editor,
// since nothing here is interactive. Presets no longer present in the project's library (e.g.
// deleted since being assigned) are silently skipped rather than showing a broken row.
function EquipStatDisplayGroup({
  title,
  values,
  presets,
  suffix = "",
}: {
  title: string;
  values: Record<string, number> | undefined;
  presets: StatPreset[];
  suffix?: string;
}) {
  const rows = Object.entries(values ?? {})
    .map(([id, v]) => {
      const preset = presets.find((p) => p.id === id);
      return preset ? { preset, value: v } : null;
    })
    .filter((r): r is { preset: StatPreset; value: number } => r !== null);

  if (rows.length === 0) return null;

  return (
    <Block title={title}>
      <div className="space-y-2">
        {rows.map(({ preset, value }) => {
          const Icon = statIcon(preset.icon);
          const pct = preset.max > 0 ? Math.max(0, Math.min(100, (value / preset.max) * 100)) : 0;
          return (
            <div key={preset.id} className="flex items-center gap-2.5">
              <span className="w-6 h-6 shrink-0 rounded-md grid place-items-center bg-[var(--op-8)] text-accent">
                <Icon size={12} />
              </span>
              <span className="text-xs text-[var(--op-70)] w-24 shrink-0 truncate">{preset.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--op-8)] overflow-hidden">
                <div className="h-full rounded-full bg-accent/80" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs mono text-[var(--op-80)] w-14 text-right shrink-0">
                {value}
                {suffix} / {preset.max}
                {suffix}
              </span>
            </div>
          );
        })}
      </div>
    </Block>
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
  const allEntries = useProjectStore((s) => s.project.entries);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      updateEntry(entry.id, { mapImage: dataUrl });
    } catch {
      themedAlert("Не удалось загрузить карту — попробуйте другой файл.");
    } finally {
      setBusy(false);
    }
  };

  usePasteImage((file) => onFile(file), !editorOpen);

  const layerCounts = entry.map
    ? {
        tiles: entry.map.layers.filter((l) => l.kind === "tile").reduce((n, l) => n + (l.kind === "tile" ? Object.keys(l.cells).length : 0), 0),
        objects: entry.map.layers.find((l) => l.kind === "object")?.kind === "object" ? (entry.map.layers.find((l) => l.kind === "object") as any).objects.length : 0,
        zones: entry.map.layers.find((l) => l.kind === "zone")?.kind === "zone" ? (entry.map.layers.find((l) => l.kind === "zone") as any).zones.length : 0,
      }
    : null;

  return (
    <Block title="Карта локации">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-xs text-[var(--op-40)]">
          {layerCounts
            ? `Тайлов: ${layerCounts.tiles} · объектов: ${layerCounts.objects} · зон: ${layerCounts.zones}`
            : "Карта ещё не создана в редакторе."}
        </div>
        <button
          onClick={() => setEditorOpen(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent/80 hover:bg-accent transition-colors"
        >
          <MapIcon size={12} /> {entry.map ? "Открыть редактор карты" : "Создать карту в редакторе"}
        </button>
      </div>
      {editorOpen && <MapEditorModal entry={entry} onClose={() => setEditorOpen(false)} />}

      <div className="text-[10px] uppercase tracking-wider text-[var(--op-30)] mb-2 pt-1 border-t border-[var(--op-7)]">
        Обложка — картинка из редактора карты, или своя, если загрузите вручную
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {entry.mapImage ? (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden border border-[var(--op-10)]">
            <img src={entry.mapImage} alt="Обложка" className="w-full max-h-[360px] object-contain bg-[var(--op-5)]" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)] disabled:opacity-50"
            >
              <Upload size={12} /> {busy ? "Загрузка…" : "Заменить обложку"}
            </button>
            <button
              onClick={() => updateEntry(entry.id, { mapImage: undefined })}
              className="text-xs text-[var(--op-40)] hover:text-[var(--op-70)]"
            >
              Убрать, показывать карту из редактора
            </button>
          </div>
        </div>
      ) : mapHasContent(entry.map) ? (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden border border-[var(--op-10)] h-40">
            <MapThumbnail map={entry.map!} entries={allEntries} />
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)] disabled:opacity-50"
          >
            <Upload size={12} /> {busy ? "Загрузка…" : "Или загрузить свою обложку"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full rounded-lg border border-dashed border-[var(--op-15)] py-4 flex items-center justify-center gap-2 text-[var(--op-30)] hover:text-[var(--op-60)] hover:border-[var(--op-30)] transition-colors"
        >
          <Upload size={14} />
          <span className="text-xs">{busy ? "Загрузка…" : "Обложка не задана — загрузить картинку"}</span>
        </button>
      )}
    </Block>
  );
}

function RelationsBlock({ entry }: { entry: Entry }) {
  const allEntries = useProjectStore((s) => s.project.entries);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [pickCats, setPickCats] = useState<Set<Category>>(new Set());

  const linked = entry.references
    .map((id) => allEntries.find((e) => e.id === id))
    .filter((e): e is Entry => Boolean(e));

  // Quest dependencies are declared over on the quest's own editor (QuestPanel's "Зависимости"
  // section), not through the generic reference-picker below — but they ARE a real connection
  // between two Codex entries, so they belong in this list too. Surfaced from both directions:
  // dependencies THIS quest declares (outgoing), and dependencies OTHER quests declare that
  // point back at this one (incoming) — otherwise a quest with dependencies looked like it had
  // "no connections" at all.
  type DepRow = { key: string; other: Entry; label: string };
  const dependencyRows: DepRow[] = isQuest(entry.category)
    ? [
        ...(entry.questDependencies ?? [])
          .map((dep) => {
            const target = allEntries.find((e) => e.id === dep.questId);
            if (!target) return null;
            return { key: `out-${dep.id}`, other: target, label: dep.kind === "unlocks" ? "открывает" : "блокирует" };
          })
          .filter((r): r is DepRow => r !== null),
        ...allEntries
          .filter((e) => isQuest(e.category) && e.id !== entry.id)
          .flatMap((src) =>
            (src.questDependencies ?? [])
              .filter((dep) => dep.questId === entry.id)
              .map((dep) => ({
                key: `in-${dep.id}`,
                other: src,
                label: dep.kind === "unlocks" ? "открывается благодаря" : "блокируется, если завершён",
              }))
          ),
      ]
    : [];

  const candidates = allEntries.filter((e) => e.id !== entry.id && !entry.references.includes(e.id));
  const filteredCandidates = candidates.filter((e) => {
    if (pickCats.size > 0 && !pickCats.has(e.category)) return false;
    const q = pickQuery.trim().toLowerCase();
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || (e.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });

  const startPicking = () => {
    setPickQuery("");
    setPickCats(new Set());
    setPicking(true);
  };

  const togglePickCat = (c: Category) => {
    setPickCats((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const addRef = (id: string) => {
    if (!id) return;
    updateEntry(entry.id, { references: [...entry.references, id] });
    setPicking(false);
  };

  const removeRef = (id: string) => {
    updateEntry(entry.id, {
      references: entry.references.filter((r) => r !== id),
      referenceNotes: entry.referenceNotes ? Object.fromEntries(Object.entries(entry.referenceNotes).filter(([k]) => k !== id)) : undefined,
    });
  };

  const setNote = (id: string, note: string) => {
    const next = { ...(entry.referenceNotes ?? {}) };
    if (note.trim()) next[id] = note;
    else delete next[id];
    updateEntry(entry.id, { referenceNotes: next });
  };

  return (
    <Block title="Связи">
      <div className="space-y-1.5">
        {linked.length === 0 && dependencyRows.length === 0 && !picking && (
          <div className="text-sm text-[var(--op-30)]">Пока нет связей.</div>
        )}
        {dependencyRows.map((r) => (
          <div key={r.key} className="bg-[var(--op-5)] rounded-md px-3 py-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CAT_COLOR[r.other.category] }} />
              <span className="text-[var(--op-80)] truncate">{r.other.name}</span>
              <span className="text-[var(--op-30)] text-xs">{CAT_LABEL[r.other.category]}</span>
              <span className="text-[10px] text-[var(--op-40)] mono shrink-0 ml-auto">{r.label}</span>
            </div>
          </div>
        ))}
        {linked.map((e) => (
          <div key={e.id} className="bg-[var(--op-5)] rounded-md px-3 py-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CAT_COLOR[e.category] }} />
              <span className="text-[var(--op-80)] truncate">{e.name}</span>
              <span className="text-[var(--op-30)] text-xs">{CAT_LABEL[e.category]}</span>
              <button onClick={() => removeRef(e.id)} className="ml-auto opacity-40 hover:opacity-100 shrink-0">
                <X size={13} />
              </button>
            </div>
            <input
              value={entry.referenceNotes?.[e.id] ?? ""}
              onChange={(ev) => setNote(e.id, ev.target.value)}
              placeholder="описание связи (необязательно)…"
              className="mt-1 w-full bg-transparent outline-none text-xs text-[var(--op-60)] placeholder:text-[var(--op-25)] border-t border-[var(--op-7)] pt-1"
            />
          </div>
        ))}

        {picking ? (
          <div className="border border-[var(--op-10)] rounded-md p-2 space-y-2 bg-[var(--op-5)]">
            <div className="flex items-center gap-2">
              <Search size={13} className="text-[var(--op-40)] shrink-0" />
              <input
                autoFocus
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Поиск записи…"
                className="flex-1 bg-transparent outline-none text-sm text-[var(--op-80)] placeholder:text-[var(--op-30)]"
              />
              <button onClick={() => setPicking(false)} className="opacity-40 hover:opacity-100 shrink-0">
                <X size={13} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {CAT_ORDER.map((c) => {
                const active = pickCats.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => togglePickCat(c)}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                      active ? "border-accent text-accent bg-accent/10" : "border-[var(--op-10)] text-[var(--op-40)] hover:text-[var(--op-70)]"
                    }`}
                  >
                    {CAT_LABEL[c]}
                  </button>
                );
              })}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredCandidates.length === 0 ? (
                <div className="text-xs text-[var(--op-30)] px-1 py-2">Ничего не найдено.</div>
              ) : (
                filteredCandidates.map((e) => {
                  const Icon = CAT_ICON[e.category];
                  return (
                    <button
                      key={e.id}
                      onClick={() => addRef(e.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--op-7)] text-left text-sm"
                    >
                      <Icon size={13} style={{ color: CAT_COLOR[e.category] }} className="shrink-0" />
                      <span className="text-[var(--op-80)] truncate flex-1">{e.name}</span>
                      <span className="text-[10px] text-[var(--op-30)] shrink-0">{CAT_LABEL[e.category]}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={startPicking}
            className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]"
          >
            <Plus size={12} /> Добавить связь
          </button>
        )}
      </div>
    </Block>
  );
}
