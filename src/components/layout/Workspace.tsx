import { X, LayoutGrid } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { EntryPanel } from "../editors/EntryPanel";
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
      <div className="h-10 flex items-stretch border-b border-[var(--op-10)] shrink-0 overflow-x-auto">
        <div
          onClick={showGallery}
          className={`flex items-center gap-2 px-3 text-sm cursor-pointer border-r border-[var(--op-10)] shrink-0 ${
            activeIndex === -1 ? "bg-[var(--op-6)] text-[var(--op-90)]" : "text-[var(--op-40)] hover:text-[var(--op-70)]"
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
              className={`flex items-center gap-2 px-3 text-sm cursor-pointer border-r border-[var(--op-10)] shrink-0 ${
                i === activeIndex ? "bg-[var(--op-6)] text-[var(--op-90)]" : "text-[var(--op-40)] hover:text-[var(--op-70)]"
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

      <div className="flex-1 overflow-y-auto">{activeEntry ? <EntryPanel entry={activeEntry} /> : <Gallery />}</div>
    </div>
  );
}
