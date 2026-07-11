import { Search, Plus, User, MapPin, Flag, Swords, Shirt, Package, Box, BookOpen, LayoutGrid } from "lucide-react";
import { useMemo } from "react";
import { useProjectStore } from "../../store/useProjectStore";
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
        ? "bg-accent/25 text-white"
        : "bg-white/10 text-white/50";
    return <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full ${cls}`}>{STATUS_LABEL[st]}</span>;
  }
  if (hasRelationship(entry.category) && entry.relationship && entry.relationship !== "neutral") {
    const cls = entry.relationship === "friend" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300";
    return <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full ${cls}`}>{REL_LABEL[entry.relationship]}</span>;
  }
  if (entry.category === "equipment" && entry.slot) {
    return <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">{entry.slot}</span>;
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

function Card({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const color = CAT_COLOR[entry.category];
  const Icon = CAT_ICON[entry.category];
  return (
    <button
      onClick={onOpen}
      className="glass rounded-lg overflow-hidden text-left flex flex-col hover:-translate-y-0.5 hover:border-white/20 transition-transform relative group"
    >
      <div className="relative h-28 shrink-0">
        {entry.image ? (
          <img src={entry.image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full grid place-items-center"
            style={{ background: `radial-gradient(120% 110% at 50% 0%, ${color}38, ${color}0a 70%, transparent)` }}
          >
            <Icon size={26} color={color} />
          </div>
        )}
        <span
          className="absolute top-2 left-2 flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm"
          style={{ color }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          {CAT_LABEL[entry.category]}
        </span>
        <Badge entry={entry} />
      </div>
      <div className="p-3">
        <div className="text-sm font-medium text-white/90 truncate">{entry.name}</div>
        <div className="text-xs text-white/40 truncate mt-0.5">{subtitle(entry)}</div>
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

  const list = useMemo(() => {
    let l = entries;
    if (activeCategory !== "all") l = l.filter((e) => e.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    }
    return l;
  }, [entries, activeCategory, query]);

  const title = activeCategory === "all" ? "Весь Codex" : CAT_LABEL[activeCategory];
  const color = activeCategory === "all" ? "#ece4d2" : CAT_COLOR[activeCategory];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 flex-wrap">
        <div className="flex items-center gap-2 text-lg font-medium" style={{ color }}>
          {activeCategory === "all" ? <LayoutGrid size={18} /> : null}
          {title}
          <span className="text-xs mono text-white/30 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">{list.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="glass rounded-md px-3 py-1.5 flex items-center gap-2 text-sm w-64">
            <Search size={14} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по миру…"
              className="bg-transparent outline-none text-white/80 placeholder:text-white/30 w-full"
            />
          </div>
          {activeCategory !== "all" && (
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
          <div className="h-full flex flex-col items-center justify-center text-white/30 gap-2">
            <LayoutGrid size={28} />
            <div className="text-sm">Ничего не найдено.</div>
          </div>
        ) : (
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
            {list.map((e) => (
              <Card key={e.id} entry={e} onOpen={() => openEntry(e.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
