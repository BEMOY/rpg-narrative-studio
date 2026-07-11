import { Box, Sparkles, ChevronRight } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { useState } from "react";

export function Sidebar() {
  const items = useProjectStore((s) => s.project.items);
  const rarities = useProjectStore((s) => s.project.rarities);
  const openItem = useProjectStore((s) => s.openItem);
  const selectedId = useProjectStore((s) => s.selectedId);
  const [itemsOpen, setItemsOpen] = useState(true);

  const rarityName = (id: string) => rarities.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="w-[280px] glass shrink-0 flex flex-col overflow-hidden">
      <div className="px-3 py-3 text-xs uppercase tracking-wider text-white/35">Database</div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <button
          onClick={() => setItemsOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-white/5 text-sm text-white/80"
        >
          <ChevronRight size={14} className={`transition-transform ${itemsOpen ? "rotate-90" : ""}`} />
          <Box size={14} />
          Items
          <span className="ml-auto text-xs text-white/30">{items.length}</span>
        </button>

        {itemsOpen && (
          <div className="ml-5 border-l border-white/10 pl-2 mt-0.5">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => openItem(item.id)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                  selectedId === item.id ? "bg-accent/20 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                <Sparkles size={12} className="shrink-0 opacity-60" />
                <span className="truncate">{item.name}</span>
                <span className="ml-auto text-[10px] mono text-white/30">{rarityName(item.rarityId)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
