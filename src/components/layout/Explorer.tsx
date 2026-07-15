// The IDE shell's left-hand project tree ("Explorer" in the Dynarain vision). Replaces the old
// flat category-filter Sidebar with a real expandable tree: one top-level group per entity
// type (matching CAT_ORDER, plus a Dialogues group that isn't Entry-based), each subdivided
// into chapter folders using the existing Entry.chapter / Dialogue.chapter field — no new data
// model needed, this is purely a new way of browsing data that was already there. Items with no
// chapter tag show directly under the group instead of inside a folder.
//
// Clicking a group's own label preserves the old Sidebar behavior (filter the Gallery view to
// that category) since that's still a fast way to browse visually; clicking the disclosure
// chevron only expands/collapses without changing the Gallery filter; clicking an individual
// entry or dialogue row opens it directly as its own tab, which is the new capability this
// component adds.
import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, LayoutGrid, MessagesSquare } from "lucide-react";
import { CAT_ICON } from "../../lib/categoryIcons";
import { useProjectStore } from "../../store/useProjectStore";
import { CAT_COLOR, CAT_LABEL, CAT_ORDER, type Category, type Entry, type Dialogue } from "../../types/database";

const NO_CHAPTER = "__no_chapter__";

function groupByChapter<T extends { chapter?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.chapter && item.chapter.trim() ? item.chapter : NO_CHAPTER;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

export function Explorer() {
  const entries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const activeCategory = useProjectStore((s) => s.activeCategory);
  const activeTabIndex = useProjectStore((s) => s.activeTabIndex);
  const openTabs = useProjectStore((s) => s.openTabs);
  const activeDialogueId = useProjectStore((s) => s.activeDialogueId);
  const workspaceView = useProjectStore((s) => s.workspaceView);
  const setCategory = useProjectStore((s) => s.setCategory);
  const openEntry = useProjectStore((s) => s.openEntry);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const showDialogues = useProjectStore((s) => s.showDialogues);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleFolder = (key: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const countFor = (c: Category | "all") => (c === "all" ? entries.length : entries.filter((e) => e.category === c).length);
  const isGalleryActive = (c: Category | "all") => activeTabIndex === -1 && workspaceView === "gallery" && activeCategory === c;
  const isEntryOpen = (id: string) => activeTabIndex >= 0 && openTabs[activeTabIndex]?.id === id;
  const isDialogueOpen = (id: string) => activeTabIndex === -1 && workspaceView === "dialogues" && activeDialogueId === id;

  const openDialogue = (id: string) => {
    setActiveDialogue(id);
    showDialogues();
  };

  const rowClass = (active: boolean) =>
    `w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
      active ? "bg-accent/20 text-[var(--op-90)]" : "text-[var(--op-60)] hover:bg-[var(--op-5)] hover:text-[var(--op-90)]"
    }`;

  const renderEntryRow = (e: Entry) => {
    const Icon = CAT_ICON[e.category];
    return (
      <button key={e.id} onClick={() => openEntry(e.id)} className={rowClass(isEntryOpen(e.id))} style={{ paddingLeft: 30 }}>
        <Icon size={12} style={{ color: CAT_COLOR[e.category] }} className="shrink-0" />
        <span className="truncate">{e.name}</span>
      </button>
    );
  };

  const renderDialogueRow = (d: Dialogue) => (
    <button key={d.id} onClick={() => openDialogue(d.id)} className={rowClass(isDialogueOpen(d.id))} style={{ paddingLeft: 30 }}>
      <MessagesSquare size={12} className="shrink-0 text-[var(--op-50)]" />
      <span className="truncate">{d.name}</span>
    </button>
  );

  return (
    <div className="w-full h-full glass flex flex-col overflow-hidden">
      <div className="px-3 py-3 text-xs uppercase tracking-wider text-[var(--op-35)] shrink-0">Explorer</div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        <button
          onClick={() => setCategory("all")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
            isGalleryActive("all") ? "bg-accent/20 text-[var(--op-90)]" : "text-[var(--op-60)] hover:bg-[var(--op-5)] hover:text-[var(--op-90)]"
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
          const catEntries = entries.filter((e) => e.category === cat);
          const expanded = expandedGroups.has(cat);
          const byChapter = groupByChapter(catEntries);
          const chapterKeys = [...byChapter.keys()].filter((k) => k !== NO_CHAPTER).sort();
          const loose = byChapter.get(NO_CHAPTER) ?? [];
          return (
            <div key={cat}>
              <div
                className={`w-full flex items-center gap-1.5 px-1 py-1 rounded-md text-sm transition-colors ${
                  isGalleryActive(cat) ? "bg-accent/20 text-[var(--op-90)]" : "text-[var(--op-60)] hover:bg-[var(--op-5)] hover:text-[var(--op-90)]"
                }`}
              >
                <button onClick={() => toggleGroup(cat)} className="p-0.5 shrink-0 opacity-60 hover:opacity-100">
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <button onClick={() => setCategory(cat)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <span className="w-6 h-6 rounded-md grid place-items-center shrink-0" style={{ background: color + "29", color }}>
                    <Icon size={13} />
                  </span>
                  <span className="truncate">{CAT_LABEL[cat]}</span>
                  <span className="ml-auto text-xs mono text-[var(--op-30)] pr-1">{countFor(cat)}</span>
                </button>
              </div>
              {expanded && (
                <div className="space-y-0.5 mt-0.5">
                  {chapterKeys.map((chapterName) => {
                    const folderKey = `${cat}:${chapterName}`;
                    const folderOpen = expandedFolders.has(folderKey);
                    return (
                      <div key={folderKey}>
                        <button onClick={() => toggleFolder(folderKey)} className={rowClass(false)} style={{ paddingLeft: 14 }}>
                          {folderOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          <Folder size={12} className="shrink-0 text-[var(--op-40)]" />
                          <span className="truncate">{chapterName}</span>
                          <span className="ml-auto text-xs mono text-[var(--op-30)] pr-1">{byChapter.get(chapterName)!.length}</span>
                        </button>
                        {folderOpen && byChapter.get(chapterName)!.map(renderEntryRow)}
                      </div>
                    );
                  })}
                  {loose.map(renderEntryRow)}
                </div>
              )}
            </div>
          );
        })}

        <div className="h-px bg-[var(--op-5)] my-2" />

        {(() => {
          const expanded = expandedGroups.has("dialogues");
          const byChapter = groupByChapter(dialogues);
          const chapterKeys = [...byChapter.keys()].filter((k) => k !== NO_CHAPTER).sort();
          const loose = byChapter.get(NO_CHAPTER) ?? [];
          return (
            <div>
              <div className="w-full flex items-center gap-1.5 px-1 py-1 rounded-md text-sm text-[var(--op-60)] hover:bg-[var(--op-5)] hover:text-[var(--op-90)] transition-colors">
                <button onClick={() => toggleGroup("dialogues")} className="p-0.5 shrink-0 opacity-60 hover:opacity-100">
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <button onClick={showDialogues} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <span className="w-6 h-6 rounded-md grid place-items-center shrink-0 bg-[var(--op-10)] text-[var(--op-60)]">
                    <MessagesSquare size={13} />
                  </span>
                  <span className="truncate">Диалоги</span>
                  <span className="ml-auto text-xs mono text-[var(--op-30)] pr-1">{dialogues.length}</span>
                </button>
              </div>
              {expanded && (
                <div className="space-y-0.5 mt-0.5">
                  {chapterKeys.map((chapterName) => {
                    const folderKey = `dialogues:${chapterName}`;
                    const folderOpen = expandedFolders.has(folderKey);
                    return (
                      <div key={folderKey}>
                        <button onClick={() => toggleFolder(folderKey)} className={rowClass(false)} style={{ paddingLeft: 14 }}>
                          {folderOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          <Folder size={12} className="shrink-0 text-[var(--op-40)]" />
                          <span className="truncate">{chapterName}</span>
                          <span className="ml-auto text-xs mono text-[var(--op-30)] pr-1">{byChapter.get(chapterName)!.length}</span>
                        </button>
                        {folderOpen && byChapter.get(chapterName)!.map(renderDialogueRow)}
                      </div>
                    );
                  })}
                  {loose.map(renderDialogueRow)}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
