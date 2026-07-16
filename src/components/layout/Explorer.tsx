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
import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Folder, LayoutGrid, MessagesSquare, ListTree, Clapperboard } from "lucide-react";
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
  const explorerMode = useProjectStore((s) => s.project.uiSettings?.explorerMode ?? "categories");
  const updateUiSettings = useProjectStore((s) => s.updateUiSettings);
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

  const renderEntryRow = (e: Entry, indent = 30) => {
    const Icon = CAT_ICON[e.category];
    return (
      <button key={e.id} onClick={() => openEntry(e.id)} className={rowClass(isEntryOpen(e.id))} style={{ paddingLeft: indent }}>
        <Icon size={12} style={{ color: CAT_COLOR[e.category] }} className="shrink-0" />
        <span className="truncate">{e.name}</span>
      </button>
    );
  };

  const renderDialogueRow = (d: Dialogue, indent = 30) => (
    <button key={d.id} onClick={() => openDialogue(d.id)} className={rowClass(isDialogueOpen(d.id))} style={{ paddingLeft: indent }}>
      <MessagesSquare size={12} className="shrink-0 text-[var(--op-50)]" />
      <span className="truncate">{d.name}</span>
    </button>
  );

  // ---- v77 "По сюжету" mode: Глава → Сцена → всё, что сцена реально задействует ----
  // Computed straight from existing data (sceneMapId + sceneFlow refs + the referenced
  // dialogues' own speaker links) — no new fields, purely a different way of walking the
  // project. Shared Assets собирает всё, что ни одна сцена не использует.
  const story = useMemo(() => {
    const scenes = entries.filter((e) => e.category === "scene");
    const usedIds = new Set<string>();
    const usedDialogueIds = new Set<string>();
    const perScene = new Map<string, { location?: Entry; steps: ({ kind: "entry"; e: Entry } | { kind: "dialogue"; d: Dialogue })[]; speakers: Entry[] }>();
    for (const scene of scenes) {
      const steps: ({ kind: "entry"; e: Entry } | { kind: "dialogue"; d: Dialogue })[] = [];
      const speakerIds = new Set<string>();
      const location = scene.sceneMapId ? entries.find((e) => e.id === scene.sceneMapId) : undefined;
      if (location) usedIds.add(location.id);
      for (const step of scene.sceneFlow ?? []) {
        if (!step.refId) continue;
        if (step.kind === "dialogue") {
          const d = dialogues.find((x) => x.id === step.refId);
          if (d) {
            steps.push({ kind: "dialogue", d });
            usedDialogueIds.add(d.id);
            for (const n of d.nodes) for (const l of n.lines) if (l.speakerEntryId) speakerIds.add(l.speakerEntryId);
          }
        } else if (step.kind === "cutscene" || step.kind === "battle") {
          const e = entries.find((x) => x.id === step.refId);
          if (e) {
            steps.push({ kind: "entry", e });
            usedIds.add(e.id);
            // a cutscene's cast is part of what the scene puts on screen
            for (const c of e.cutsceneCast ?? []) speakerIds.add(c.entryId);
          }
        }
      }
      const speakers = [...speakerIds].map((id) => entries.find((e) => e.id === id)).filter((e): e is Entry => !!e);
      for (const s of speakers) usedIds.add(s.id);
      perScene.set(scene.id, { location, steps, speakers });
    }
    const byChapter = groupByChapter(scenes);
    const sharedEntries = entries.filter((e) => e.category !== "scene" && !usedIds.has(e.id));
    const sharedDialogues = dialogues.filter((d) => !usedDialogueIds.has(d.id));
    return { scenes, perScene, byChapter, sharedEntries, sharedDialogues };
  }, [entries, dialogues]);

  return (
    <div className="w-full h-full glass flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 flex items-center gap-2 shrink-0">
        <span className="text-xs uppercase tracking-wider text-[var(--op-35)]">Explorer</span>
        <div className="ml-auto flex rounded-md overflow-hidden border border-[var(--op-10)] text-[10px]">
          <button
            onClick={() => updateUiSettings({ explorerMode: "categories" })}
            title="Дерево по категориям (персонажи, локации, квесты…)"
            className={`px-2 py-1 flex items-center gap-1 ${explorerMode === "categories" ? "bg-[var(--op-10)] text-[var(--op-90)]" : "text-[var(--op-40)] hover:text-[var(--op-70)]"}`}
          >
            <LayoutGrid size={10} /> Категории
          </button>
          <button
            onClick={() => updateUiSettings({ explorerMode: "story" })}
            title="Дерево по сюжету: Глава → Сцена → всё, что в ней задействовано"
            className={`px-2 py-1 flex items-center gap-1 ${explorerMode === "story" ? "bg-[var(--op-10)] text-[var(--op-90)]" : "text-[var(--op-40)] hover:text-[var(--op-70)]"}`}
          >
            <ListTree size={10} /> Сюжет
          </button>
        </div>
      </div>
      {explorerMode === "story" ? (
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {(() => {
            const chapterKeys = [...story.byChapter.keys()].filter((k) => k !== NO_CHAPTER).sort();
            const loose = story.byChapter.get(NO_CHAPTER) ?? [];
            const renderScene = (scene: Entry) => {
              const info = story.perScene.get(scene.id);
              const key = `scene:${scene.id}`;
              const open = expandedFolders.has(key);
              return (
                <div key={scene.id}>
                  <div className={rowClass(isEntryOpen(scene.id))} style={{ paddingLeft: 14, cursor: "pointer" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolder(key);
                      }}
                      className="p-0.5 shrink-0 opacity-60 hover:opacity-100"
                    >
                      {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                    <button onClick={() => openEntry(scene.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <Clapperboard size={12} style={{ color: CAT_COLOR.scene }} className="shrink-0" />
                      <span className="truncate">{scene.name}</span>
                    </button>
                  </div>
                  {open && info && (
                    <div className="space-y-0.5">
                      {info.location && renderEntryRow(info.location, 42)}
                      {info.steps.map((s, i) =>
                        s.kind === "dialogue" ? (
                          <span key={`${s.d.id}-${i}`}>{renderDialogueRow(s.d, 42)}</span>
                        ) : (
                          <span key={`${s.e.id}-${i}`}>{renderEntryRow(s.e, 42)}</span>
                        )
                      )}
                      {info.speakers.length > 0 && (
                        <div className="text-[9px] uppercase tracking-wider text-[var(--op-25)] pl-[42px] pt-1">Участники</div>
                      )}
                      {info.speakers.map((sp) => renderEntryRow(sp, 42))}
                      {!info.location && info.steps.length === 0 && info.speakers.length === 0 && (
                        <div className="text-[10px] text-[var(--op-30)] pl-[42px] py-1">Сцена пока пустая.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            };
            return (
              <>
                {chapterKeys.map((chapterName) => {
                  const fkey = `storych:${chapterName}`;
                  const open = expandedFolders.has(fkey);
                  const list = story.byChapter.get(chapterName)!;
                  return (
                    <div key={fkey}>
                      <button onClick={() => toggleFolder(fkey)} className={rowClass(false)} style={{ paddingLeft: 4 }}>
                        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        <Folder size={12} className="shrink-0 text-[var(--op-40)]" />
                        <span className="truncate">{chapterName}</span>
                        <span className="ml-auto text-xs mono text-[var(--op-30)] pr-1">{list.length}</span>
                      </button>
                      {open && list.map(renderScene)}
                    </div>
                  );
                })}
                {loose.length > 0 && (
                  <>
                    {chapterKeys.length > 0 && <div className="text-[9px] uppercase tracking-wider text-[var(--op-25)] px-2 pt-2">Без главы</div>}
                    {loose.map(renderScene)}
                  </>
                )}
                {story.scenes.length === 0 && (
                  <div className="text-[11px] text-[var(--op-30)] px-2 py-2 leading-relaxed">
                    Сцен пока нет — создайте «Сцену» в галерее, привяжите к ней локацию и шаги (катсцены, диалоги, битвы), и
                    дерево соберётся здесь само.
                  </div>
                )}
                <div className="h-px bg-[var(--op-5)] my-2" />
                {(() => {
                  const fkey = "storych:__shared__";
                  const open = expandedFolders.has(fkey);
                  const count = story.sharedEntries.length + story.sharedDialogues.length;
                  return (
                    <div>
                      <button onClick={() => toggleFolder(fkey)} className={rowClass(false)} style={{ paddingLeft: 4 }}>
                        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        <Folder size={12} className="shrink-0 text-[var(--op-40)]" />
                        <span className="truncate">Shared Assets</span>
                        <span className="ml-auto text-xs mono text-[var(--op-30)] pr-1">{count}</span>
                      </button>
                      {open && (
                        <div className="space-y-0.5">
                          {story.sharedEntries.map((e) => renderEntryRow(e, 30))}
                          {story.sharedDialogues.map((d) => renderDialogueRow(d, 30))}
                          {count === 0 && <div className="text-[10px] text-[var(--op-30)] pl-[30px] py-1">Всё задействовано в сценах.</div>}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            );
          })()}
        </div>
      ) : (
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
                        {folderOpen && byChapter.get(chapterName)!.map((e) => renderEntryRow(e))}
                      </div>
                    );
                  })}
                  {loose.map((e) => renderEntryRow(e))}
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
                        {folderOpen && byChapter.get(chapterName)!.map((d) => renderDialogueRow(d))}
                      </div>
                    );
                  })}
                  {loose.map((d) => renderDialogueRow(d))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
      )}
    </div>
  );
}
