import { LayoutGrid, User, MapPin, Flag, Swords, Shirt, Package, Box, BookOpen } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { CAT_COLOR, CAT_LABEL, CAT_ORDER, type Category } from "../../types/database";

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

export function Sidebar() {
  const entries = useProjectStore((s) => s.project.entries);
  const activeCategory = useProjectStore((s) => s.activeCategory);
  const activeTabIndex = useProjectStore((s) => s.activeTabIndex);
  const setCategory = useProjectStore((s) => s.setCategory);

  const countFor = (c: Category | "all") => (c === "all" ? entries.length : entries.filter((e) => e.category === c).length);

  const isActive = (c: Category | "all") => activeTabIndex === -1 && activeCategory === c;

  return (
    <div className="w-[280px] glass shrink-0 flex flex-col overflow-hidden">
      <div className="px-3 py-3 text-xs uppercase tracking-wider text-[var(--op-35)]">Database</div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        <button
          onClick={() => setCategory("all")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
            isActive("all") ? "bg-accent/20 text-[var(--op-90)]" : "text-[var(--op-60)] hover:bg-[var(--op-5)] hover:text-[var(--op-90)]"
          }`}
        >
          <span className="w-6 h-6 rounded-md grid place-items-center bg-[var(--op-10)]">
            <LayoutGrid size={13} />
          </span>
          Весь Codex
          <span className="ml-auto text-xs mono text-[var(--op-30)]">{countFor("all")}</span>
        </button>

        <div className="h-px bg-[var(--op-5)] my-2" />

        {CAT_ORDER.map((cat) => {
          const Icon = CAT_ICON[cat];
          const color = CAT_COLOR[cat];
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
                isActive(cat) ? "bg-accent/20 text-[var(--op-90)]" : "text-[var(--op-60)] hover:bg-[var(--op-5)] hover:text-[var(--op-90)]"
              }`}
            >
              <span className="w-6 h-6 rounded-md grid place-items-center" style={{ background: color + "29", color }}>
                <Icon size={13} />
              </span>
              {CAT_LABEL[cat]}
              <span className="ml-auto text-xs mono text-[var(--op-30)]">{countFor(cat)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
