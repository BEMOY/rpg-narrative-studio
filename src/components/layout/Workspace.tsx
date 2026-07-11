import { X, Box } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { ItemEditor } from "../editors/ItemEditor";

export function Workspace() {
  const tabs = useProjectStore((s) => s.openTabs);
  const activeIndex = useProjectStore((s) => s.activeTabIndex);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const closeTab = useProjectStore((s) => s.closeTab);
  const items = useProjectStore((s) => s.project.items);

  const activeTab = tabs[activeIndex];
  const activeItem = activeTab ? items.find((i) => i.id === activeTab.id) : undefined;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-10 flex items-stretch border-b border-white/10 shrink-0 overflow-x-auto">
        {tabs.map((tab, i) => (
          <div
            key={`${tab.kind}-${tab.id}`}
            onClick={() => setActiveTab(i)}
            className={`flex items-center gap-2 px-3 text-sm cursor-pointer border-r border-white/10 shrink-0 ${
              i === activeIndex ? "bg-white/[0.06] text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <Box size={12} />
            {items.find((it) => it.id === tab.id)?.name ?? tab.id}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(i);
              }}
              className="ml-1 opacity-40 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!activeItem && <EmptyState />}
        {activeItem && <ItemEditor item={activeItem} />}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-white/30 gap-2">
      <Box size={28} />
      <div className="text-sm">Select an item from the sidebar to start editing.</div>
    </div>
  );
}
