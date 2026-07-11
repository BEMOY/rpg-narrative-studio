import { X, LayoutGrid } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { EntryEditor } from "../editors/EntryEditor";
import { Gallery } from "../gallery/Gallery";
import { CAT_COLOR } from "../../types/database";

export function Workspace() {
  const tabs = useProjectStore((s) => s.openTabs);
  const activeIndex = useProjectStore((s) => s.activeTabIndex);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const showGallery = useProjectStore((s) => s.showGallery);
  const closeTab = useProjectStore((s) => s.closeTab);
  const entries = useProjectStore((s) => s.project.entries);

  const activeTab = activeIndex >= 0 ? tabs[activeIndex] : undefined;
  const activeEntry = activeTab ? entries.find((e) => e.id === activeTab.id) : undefined;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-10 flex items-stretch border-b border-white/10 shrink-0 overflow-x-auto">
        <div
          onClick={showGallery}
          className={`flex items-center gap-2 px-3 text-sm cursor-pointer border-r border-white/10 shrink-0 ${
            activeIndex === -1 ? "bg-white/[0.06] text-white" : "text-white/40 hover:text-white/70"
          }`}
        >
          <LayoutGrid size={12} />
          Галерея
        </div>
        {tabs.map((tab, i) => {
          const entry = entries.find((e) => e.id === tab.id);
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-2 px-3 text-sm cursor-pointer border-r border-white/10 shrink-0 ${
                i === activeIndex ? "bg-white/[0.06] text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: entry ? CAT_COLOR[entry.category] : "#888" }} />
              {entry?.name ?? tab.id}
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
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">{activeEntry ? <EntryEditor entry={activeEntry} /> : <Gallery />}</div>
    </div>
  );
}
