import { Search, Plus, User, MapPin, Flag, Swords, Shirt, Package, Box, BookOpen, LayoutGrid, CheckSquare, Square, ListChecks, Filter, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { MapThumbnail, mapHasContent } from "../mapeditor/MapThumbnail";
import { PortalMenu } from "../common/PortalMenu";
import {
  CAT_COLOR,
  CAT_LABEL,
  CAT_ORDER,
  isQuest,
  hasRelationship,
  type Category,
  type Entry,
} from "../../types/database";

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

function questStatus(e: Entry): "todo" | "active" | "done" {
  const objs = e.objectives ?? [];
  if (objs.length === 0) return "todo";
  if (objs.every((o) => o.done)) return "done";
  if (objs.some((o) => o.done)) return "active";
  return "todo";
}

const STATUS_LABEL: Record<string, string> = { todo: "Не начат", active: "Активен", done: "Выполнен" };
const REL_LABEL: Record<string, string> = { friend: "Друг", neutral: "Нейтрален", enemy: "Враг" };

function Badge({ entry }: { entry: Entry }) {
  if (isQuest(entry.category)) {
    const st = questStatus(entry);
    const cls =
      st === "done"
        ? "bg-emerald-500/20 text-emerald-300"
        : st === "active"
        ? "bg-accent/25 text-[var(--op-90)]"
        : "bg-[var(--op-10)] text-[var(--op-50)]";
    return <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full ${cls}`}>{STATUS_LABEL[st]}</span>;
  }
  if (hasRelationship(entry.category) && entry.relationship && entry.relationship !== "neutral") {
    const cls = entry.relationship === "friend" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300";
    return <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full ${cls}`}>{REL_LABEL[entry.relationship]}</span>;
  }
  if (entry.category === "equipment" && entry.slot) {
    return <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-[var(--op-10)] text-[var(--op-60)]">{entry.slot}</span>;
  }
  return null;
}

function subtitle(entry: Entry): string {
  if (isQuest(entry.category)) {
    const objs = entry.objectives ?? [];
    const done = objs.filter((o) => o.done).length;
    return objs.length ? `${done}/${objs.length} objectives` : "no objectives";
  }
  return entry.description || "—";
}

function Card({
  entry,
  onOpen,
  selectMode,
  selected,
  onToggleSelect,
}: {
  entry: Entry;
  onOpen: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const color = CAT_COLOR[entry.category];
  const Icon = CAT_ICON[entry.category];
  const allEntries = useProjectStore((s) => s.project.entries);
  const showMapThumb = entry.category === "location" && !entry.image && mapHasContent(entry.map);

  return (
    <button
      onClick={selectMode ? onToggleSelect : onOpen}
      className={`glass rounded-lg overflow-hidden text-left flex flex-col hover:-translate-y-0.5 transition-transform relative group ${
        selectMode && selected ? "border-accent ring-1 ring-accent" : "hover:border-[var(--op-20)]"
      }`}
    >
      {selectMode && (
        <span className="absolute top-2 left-2 z-10 w-5 h-5 rounded-md bg-black/60 backdrop-blur-sm grid place-items-center text-[var(--op-70)]">
          {selected ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
        </span>
      )}
      <div className="relative h-28 shrink-0">
        {entry.image ? (
          <img src={entry.image} alt="" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
        ) : showMapThumb ? (
          <MapThumbnail map={entry.map!} entries={allEntries} />
        ) : entry.mapImage ? (
          <img src={entry.mapImage} alt="" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
        ) : (
          <div
            className="w-full h-full grid place-items-center"
            style={{ background: `radial-gradient(120% 110% at 50% 0%, ${color}38, ${color}0a 70%, transparent)` }}
          >
            <Icon size={26} color={color} />
          </div>
        )}
        {!selectMode && (
          <span
            className="absolute top-2 left-2 flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm"
            style={{ color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {CAT_LABEL[entry.category]}
          </span>
        )}
        {!selectMode && <Badge entry={entry} />}
      </div>
      <div className="p-3">
        <div className="text-sm font-medium text-[var(--op-90)] truncate">{entry.name}</div>
        <div className="text-xs text-[var(--op-40)] truncate mt-0.5">{subtitle(entry)}</div>
      </div>
    </button>
  );
}

export function Gallery() {
  const entries = useProjectStore((s) => s.project.entries);
  const activeCategory = useProjectStore((s) => s.activeCategory);
  const query = useProjectStore((s) => s.galleryQuery);
  const setQuery = useProjectStore((s) => s.setGalleryQuery);
  const openEntry = useProjectStore((s) => s.openEntry);
  const createEntry = useProjectStore((s) => s.createEntry);
  const chapters = useProjectStore((s) => s.project.chapters);
  const deleteEntries = useProjectStore((s) => s.deleteEntries);
  const hiddenCategories = useProjectStore((s) => s.hiddenCategories);
  const toggleCategoryVisibility = useProjectStore((s) => s.toggleCategoryVisibility);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const list = useMemo(() => {
    let l = entries;
    if (activeCategory !== "all") l = l.filter((e) => e.category === activeCategory);
    // The category filter only makes sense in "Весь Codex" — a single category already
    // picked via the sidebar shouldn't be silently emptied by a filter state shared with
    // the Graph view.
    else if (hiddenCategories.length) l = l.filter((e) => !hiddenCategories.includes(e.category));
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return l;
  }, [entries, activeCategory, hiddenCategories, query]);

  // Group by chapter (story order), matching the author's own Codex — entries with no chapter
  // (or a chapter that no longer exists in the project) land in one trailing "без главы" group.
  const groups = useMemo(() => {
    const byChapter = new Map<string, Entry[]>();
    for (const e of list) {
      const key = e.chapter && chapters.includes(e.chapter) ? e.chapter : "";
      if (!byChapter.has(key)) byChapter.set(key, []);
      byChapter.get(key)!.push(e);
    }
    const ordered: { label: string; entries: Entry[] }[] = [];
    for (const c of chapters) {
      const items = byChapter.get(c);
      if (items && items.length) ordered.push({ label: c, entries: items });
    }
    const rest = byChapter.get("");
    if (rest && rest.length) ordered.push({ label: "Без главы", entries: rest });
    return ordered;
  }, [list, chapters]);

  const title = activeCategory === "all" ? "Весь Codex" : CAT_LABEL[activeCategory];
  const color = activeCategory === "all" ? "#ece4d2" : CAT_COLOR[activeCategory];

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    if (!confirm(`Удалить выбранные записи (${selected.size})? Это необратимо.`)) return;
    deleteEntries(Array.from(selected));
    exitSelectMode();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--op-10)] flex-wrap">
        <div className="flex items-center gap-2 text-lg font-medium" style={{ color }}>
          {activeCategory === "all" ? <LayoutGrid size={18} /> : null}
          {title}
          <span className="text-xs mono text-[var(--op-30)] bg-[var(--op-5)] border border-[var(--op-10)] rounded-full px-2 py-0.5">{list.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectMode && selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-red-500/80 hover:bg-red-500 transition-colors"
            >
              <Trash2 size={14} /> Удалить ({selected.size})
            </button>
          )}
          <button
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            title="Выбрать несколько"
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
              selectMode ? "bg-accent/25 text-[var(--op-90)]" : "glass hover:bg-[var(--op-10)]"
            }`}
          >
            {selectMode ? <X size={14} /> : <ListChecks size={14} />}
            {selectMode ? "Отмена" : "Выбрать"}
          </button>
          {activeCategory === "all" && (
            <>
              <button
                ref={filterBtnRef}
                onClick={() => setFilterOpen((v) => !v)}
                title="Фильтр категорий"
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
                  hiddenCategories.length ? "bg-accent/25 text-[var(--op-90)]" : "glass hover:bg-[var(--op-10)]"
                }`}
              >
                <Filter size={14} />
                {hiddenCategories.length > 0 && (
                  <span className="text-xs mono">
                    {CAT_ORDER.length - hiddenCategories.length}/{CAT_ORDER.length}
                  </span>
                )}
              </button>
              <PortalMenu anchorRef={filterBtnRef} open={filterOpen} onClose={() => setFilterOpen(false)}>
                <div className="w-56 p-2">
                  <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-[var(--op-10)]">
                    <span className="text-xs uppercase tracking-wider text-[var(--op-35)]">Категории</span>
                    <button
                      onClick={() => CAT_ORDER.forEach((c) => hiddenCategories.includes(c) && toggleCategoryVisibility(c))}
                      className="text-[10px] text-accent hover:underline"
                    >
                      показать все
                    </button>
                  </div>
                  {CAT_ORDER.map((c) => {
                    const Icon = CAT_ICON[c];
                    const visible = !hiddenCategories.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCategoryVisibility(c)}
                        className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-[var(--op-7)] text-left text-sm"
                      >
                        {visible ? (
                          <CheckSquare size={14} className="text-accent shrink-0" />
                        ) : (
                          <Square size={14} className="text-[var(--op-30)] shrink-0" />
                        )}
                        <Icon size={13} style={{ color: CAT_COLOR[c] }} className="shrink-0" />
                        <span className={visible ? "text-[var(--op-80)]" : "text-[var(--op-35)]"}>{CAT_LABEL[c]}</span>
                      </button>
                    );
                  })}
                </div>
              </PortalMenu>
            </>
          )}
          <div className="glass rounded-md px-3 py-1.5 flex items-center gap-2 text-sm w-64">
            <Search size={14} className="text-[var(--op-40)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по миру…"
              className="bg-transparent outline-none text-[var(--op-80)] placeholder:text-[var(--op-30)] w-full"
            />
          </div>
          {activeCategory !== "all" && !selectMode && (
            <button
              onClick={() => createEntry(activeCategory)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/80 hover:bg-accent transition-colors"
            >
              <Plus size={14} /> Создать
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {list.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--op-30)] gap-2">
            <LayoutGrid size={28} />
            <div className="text-sm">Ничего не найдено.</div>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs uppercase tracking-wider font-medium text-accent whitespace-nowrap">{g.label}</span>
                  <span className="flex-1 h-px bg-[var(--op-10)]" />
                </div>
                <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
                  {g.entries.map((e) => (
                    <Card
                      key={e.id}
                      entry={e}
                      onOpen={() => openEntry(e.id)}
                      selectMode={selectMode}
                      selected={selected.has(e.id)}
                      onToggleSelect={() => toggleSelect(e.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
