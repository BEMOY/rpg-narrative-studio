import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  MessageSquarePlus,
  MessageSquareText,
  MoreVertical,
  ArrowDownToLine,
  Search,
  Layers,
  MapPin,
} from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { PortalMenu } from "../common/PortalMenu";
import { SearchSelect } from "./SearchSelect";
import type { DialogueFolder, Dialogue } from "../../types/database";

const VIEW_MODE_KEY = "rpg-narrative-studio:dialogues-sidebar-view";

interface TreeFolder {
  folder: DialogueFolder;
  children: TreeFolder[];
  dialogues: Dialogue[];
}

function buildTree(folders: DialogueFolder[], dialogues: Dialogue[], parentId: string | null): TreeFolder[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .map((folder) => ({
      folder,
      children: buildTree(folders, dialogues, folder.id),
      dialogues: dialogues.filter((d) => d.folderId === folder.id),
    }));
}

// Drag payload format shared by folder rows and dialogue rows.
type DragPayload = { kind: "folder" | "dialogue"; id: string };
const DND_MIME = "application/x-rns-dialogue-item";

function readDragPayload(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DND_MIME);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

function FolderRow({ node, depth }: { node: TreeFolder; depth: number }) {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const activeDialogueId = useProjectStore((s) => s.activeDialogueId);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const createDialogue = useProjectStore((s) => s.createDialogue);
  const createDialogueFolder = useProjectStore((s) => s.createDialogueFolder);
  const renameDialogueFolder = useProjectStore((s) => s.renameDialogueFolder);
  const deleteDialogueFolder = useProjectStore((s) => s.deleteDialogueFolder);
  const moveDialogueFolder = useProjectStore((s) => s.moveDialogueFolder);
  const moveDialogueToFolder = useProjectStore((s) => s.moveDialogueToFolder);

  const addSubfolder = () => {
    const name = prompt("Название папки:", "Новая папка");
    if (name) createDialogueFolder(name, node.folder.id);
    setMenuOpen(false);
  };
  const addDialogueHere = () => {
    const name = prompt("Название диалога:", "Новый диалог");
    if (name) createDialogue(name, node.folder.id);
    setMenuOpen(false);
  };
  const rename = () => {
    const name = prompt("Новое название папки:", node.folder.name);
    if (name) renameDialogueFolder(node.folder.id, name);
    setMenuOpen(false);
  };
  const remove = () => {
    if (confirm(`Удалить папку «${node.folder.name}»? Содержимое переместится на уровень выше.`)) deleteDialogueFolder(node.folder.id);
    setMenuOpen(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const payload = readDragPayload(e);
    if (!payload) return;
    if (payload.kind === "folder") {
      if (payload.id !== node.folder.id) moveDialogueFolder(payload.id, node.folder.id);
    } else {
      moveDialogueToFolder(payload.id, node.folder.id);
    }
  };

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind: "folder", id: node.folder.id } satisfies DragPayload));
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`group flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-[var(--op-5)] ${
          dragOver ? "bg-accent/15 ring-1 ring-accent/50" : ""
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button onClick={() => setOpen((v) => !v)} className="text-[var(--op-40)] shrink-0">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <Folder size={13} className="text-[var(--op-40)] shrink-0" />
        <span className="text-sm text-[var(--op-75)] truncate flex-1">{node.folder.name}</span>
        <button
          ref={btnRef}
          onClick={() => setMenuOpen((v) => !v)}
          className="opacity-0 group-hover:opacity-100 text-[var(--op-40)] hover:text-[var(--op-80)] shrink-0"
        >
          <MoreVertical size={13} />
        </button>
        <PortalMenu anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
          <div className="w-44 p-1">
            <button onClick={addSubfolder} className="w-full text-left px-2 py-1.5 rounded-md text-xs text-[var(--op-70)] hover:bg-[var(--op-7)]">
              + Папка внутри
            </button>
            <button onClick={addDialogueHere} className="w-full text-left px-2 py-1.5 rounded-md text-xs text-[var(--op-70)] hover:bg-[var(--op-7)]">
              + Диалог внутри
            </button>
            <button onClick={rename} className="w-full text-left px-2 py-1.5 rounded-md text-xs text-[var(--op-70)] hover:bg-[var(--op-7)]">
              Переименовать
            </button>
            <button onClick={remove} className="w-full text-left px-2 py-1.5 rounded-md text-xs text-red-300 hover:bg-[var(--op-7)]">
              Удалить папку
            </button>
          </div>
        </PortalMenu>
      </div>
      {open && (
        <div>
          {node.children.map((c) => (
            <FolderRow key={c.folder.id} node={c} depth={depth + 1} />
          ))}
          {node.dialogues.map((d) => (
            <DialogueRow key={d.id} dialogue={d} depth={depth + 1} active={activeDialogueId === d.id} onOpen={() => setActiveDialogue(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DialogueRow({
  dialogue,
  depth,
  active,
  onOpen,
}: {
  dialogue: Dialogue;
  depth: number;
  active: boolean;
  onOpen: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const renameDialogue = useProjectStore((s) => s.renameDialogue);
  const deleteDialogue = useProjectStore((s) => s.deleteDialogue);
  const moveDialogueToFolder = useProjectStore((s) => s.moveDialogueToFolder);
  const locationName = useProjectStore((s) =>
    dialogue.locationEntryId ? s.project.entries.find((e) => e.id === dialogue.locationEntryId)?.name : undefined
  );

  const rename = () => {
    const name = prompt("Новое название диалога:", dialogue.name);
    if (name) renameDialogue(dialogue.id, name);
    setMenuOpen(false);
  };
  const remove = () => {
    if (confirm(`Удалить диалог «${dialogue.name}»? Это необратимо.`)) deleteDialogue(dialogue.id);
    setMenuOpen(false);
  };
  const toRoot = () => {
    moveDialogueToFolder(dialogue.id, null);
    setMenuOpen(false);
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind: "dialogue", id: dialogue.id } satisfies DragPayload));
      }}
      onClick={onOpen}
      className={`group flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer ${active ? "bg-accent/20 text-[var(--op-90)]" : "hover:bg-[var(--op-5)] text-[var(--op-70)]"}`}
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <MessageSquareText size={13} className="shrink-0" style={{ color: active ? undefined : "var(--op-35)" }} />
      <span className="text-sm truncate flex-1">{dialogue.name}</span>
      {locationName && (
        <span className="flex items-center gap-0.5 text-[10px] text-[var(--op-30)] shrink-0" title={`Локация: ${locationName}`}>
          <MapPin size={9} />
          <span className="max-w-[70px] truncate">{locationName}</span>
        </span>
      )}
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className="opacity-0 group-hover:opacity-100 text-[var(--op-40)] hover:text-[var(--op-80)] shrink-0"
      >
        <MoreVertical size={13} />
      </button>
      <PortalMenu anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
        <div className="w-44 p-1">
          <button onClick={rename} className="w-full text-left px-2 py-1.5 rounded-md text-xs text-[var(--op-70)] hover:bg-[var(--op-7)]">
            Переименовать
          </button>
          <button onClick={toRoot} className="w-full flex items-center gap-1.5 text-left px-2 py-1.5 rounded-md text-xs text-[var(--op-70)] hover:bg-[var(--op-7)]">
            <ArrowDownToLine size={12} /> В корень
          </button>
          <button onClick={remove} className="w-full text-left px-2 py-1.5 rounded-md text-xs text-red-300 hover:bg-[var(--op-7)]">
            Удалить
          </button>
        </div>
      </PortalMenu>
    </div>
  );
}

// Flat, collapsible-by-chapter alternative to the folder tree — deliberately much simpler than
// the Quests window's chapter roadmap (no graph, no positions, just grouped sections), aimed at
// "where does this dialogue belong in the story" rather than "how do these dialogues depend on
// each other". Chapter is per-DIALOGUE (Dialogue.chapter), never per-node, so this reads
// straight off the dialogue list — no folder nesting is involved at all in this mode.
function ChapterGroupView({
  dialogues,
  chapters,
  activeDialogueId,
  onOpen,
}: {
  dialogues: Dialogue[];
  chapters: string[];
  activeDialogueId: string | null;
  onOpen: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const byKey = new Map<string, Dialogue[]>();
    for (const d of dialogues) {
      const key = d.chapter && chapters.includes(d.chapter) ? d.chapter : "";
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(d);
    }
    const order = chapters.filter((c) => byKey.has(c));
    if (byKey.has("")) order.push("");
    return order.map((key) => ({ key, label: key || "Без главы", items: byKey.get(key)!.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [dialogues, chapters]);

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (groups.length === 0) {
    return <div className="text-xs text-[var(--op-30)] px-2 py-4 text-center">Ничего не найдено.</div>;
  }

  return (
    <div className="space-y-0.5">
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        return (
          <div key={g.key}>
            <button
              onClick={() => toggle(g.key)}
              className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-[var(--op-5)] text-left"
            >
              {isCollapsed ? <ChevronRight size={12} className="text-[var(--op-40)] shrink-0" /> : <ChevronDown size={12} className="text-[var(--op-40)] shrink-0" />}
              <span className="text-[11px] uppercase tracking-wider text-[var(--op-45)] flex-1 truncate">{g.label}</span>
              <span className="text-[10px] text-[var(--op-25)] shrink-0">{g.items.length}</span>
            </button>
            {!isCollapsed && (
              <div>
                {g.items.map((d) => (
                  <DialogueRow key={d.id} dialogue={d} depth={1} active={activeDialogueId === d.id} onOpen={() => onOpen(d.id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DialogueSidebar() {
  const folders = useProjectStore((s) => s.project.dialogueFolders);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const entries = useProjectStore((s) => s.project.entries);
  const chapters = useProjectStore((s) => s.project.chapters);
  const activeDialogueId = useProjectStore((s) => s.activeDialogueId);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const createDialogue = useProjectStore((s) => s.createDialogue);
  const createDialogueFolder = useProjectStore((s) => s.createDialogueFolder);
  const moveDialogueFolder = useProjectStore((s) => s.moveDialogueFolder);
  const moveDialogueToFolder = useProjectStore((s) => s.moveDialogueToFolder);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<"folders" | "chapters">(() => {
    try {
      return (window.localStorage.getItem(VIEW_MODE_KEY) as "folders" | "chapters" | null) ?? "folders";
    } catch {
      return "folders";
    }
  });
  const [search, setSearch] = useState("");
  const [characterFilter, setCharacterFilter] = useState<string | undefined>(undefined);

  const setMode = (mode: "folders" | "chapters") => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // non-critical — just won't remember the choice across reloads in this environment
    }
  };

  // Only characters who actually speak SOMEWHERE get offered as a filter option — otherwise
  // this list would be as long as the full cast roster regardless of whether most of them ever
  // show up in a dialogue yet.
  const characterOptions = useMemo(() => {
    const used = new Set<string>();
    for (const d of dialogues) {
      for (const n of d.nodes) {
        for (const l of n.lines) if (l.speakerEntryId) used.add(l.speakerEntryId);
      }
    }
    return entries.filter((e) => e.category === "character" && used.has(e.id)).map((e) => ({ id: e.id, label: e.name }));
  }, [dialogues, entries]);

  const dialogueSpeakerIds = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const d of dialogues) {
      const set = new Set<string>();
      for (const n of d.nodes) for (const l of n.lines) if (l.speakerEntryId) set.add(l.speakerEntryId);
      m.set(d.id, set);
    }
    return m;
  }, [dialogues]);

  const matchesFilter = (d: Dialogue) => {
    if (search.trim() && !d.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (characterFilter && !(dialogueSpeakerIds.get(d.id)?.has(characterFilter) ?? false)) return false;
    return true;
  };

  const filteredDialogues = useMemo(() => dialogues.filter(matchesFilter), [dialogues, search, characterFilter, dialogueSpeakerIds]);

  const tree = buildTree(folders, filteredDialogues, null);
  const rootDialogues = filteredDialogues.filter((d) => d.folderId === null);
  const filterActive = search.trim().length > 0 || !!characterFilter;

  const addFolder = () => {
    const name = prompt("Название папки:", "Новая папка");
    if (name) createDialogueFolder(name, null);
  };
  const addDialogue = () => {
    const name = prompt("Название диалога:", "Новый диалог");
    if (name) createDialogue(name, null);
  };

  const onRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setRootDragOver(false);
    const payload = readDragPayload(e);
    if (!payload) return;
    if (payload.kind === "folder") moveDialogueFolder(payload.id, null);
    else moveDialogueToFolder(payload.id, null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3 border-b border-[var(--op-10)] shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)] flex-1">Диалоги</div>
          <div className="flex items-center rounded-md glass p-0.5 gap-0.5">
            <button
              onClick={() => setMode("folders")}
              title="По папкам"
              className={`w-6 h-6 grid place-items-center rounded ${viewMode === "folders" ? "bg-accent/80 text-white" : "text-[var(--op-40)] hover:text-[var(--op-70)]"}`}
            >
              <Folder size={12} />
            </button>
            <button
              onClick={() => setMode("chapters")}
              title="По главам"
              className={`w-6 h-6 grid place-items-center rounded ${viewMode === "chapters" ? "bg-accent/80 text-white" : "text-[var(--op-40)] hover:text-[var(--op-70)]"}`}
            >
              <Layers size={12} />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={addFolder}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md glass hover:bg-[var(--op-10)]"
          >
            <FolderPlus size={12} /> Папка
          </button>
          <button
            data-tour="dialogues-new"
            onClick={addDialogue}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-accent/80 hover:bg-accent"
          >
            <MessageSquarePlus size={12} /> Диалог
          </button>
        </div>
        <div className="glass rounded-md px-2 py-1.5 flex items-center gap-1.5">
          <Search size={11} className="text-[var(--op-35)] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию…"
            className="bg-transparent outline-none text-xs w-full text-[var(--op-80)] placeholder:text-[var(--op-30)]"
          />
        </div>
        <SearchSelect
          value={characterFilter}
          onChange={setCharacterFilter}
          options={characterOptions}
          placeholder="фильтр по персонажу…"
          searchPlaceholder="Поиск персонажа…"
          clearLabel="— все персонажи —"
        />
      </div>
      <div
        className={`flex-1 overflow-y-auto p-1.5 ${rootDragOver ? "bg-accent/5" : ""}`}
        onDragOver={(e) => {
          if (viewMode !== "folders") return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!rootDragOver) setRootDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setRootDragOver(false);
        }}
        onDrop={viewMode === "folders" ? onRootDrop : undefined}
      >
        {viewMode === "chapters" ? (
          <ChapterGroupView dialogues={filteredDialogues} chapters={chapters} activeDialogueId={activeDialogueId} onOpen={setActiveDialogue} />
        ) : (
          <>
            {tree.map((node) => (
              <FolderRow key={node.folder.id} node={node} depth={0} />
            ))}
            {rootDialogues.map((d) => (
              <DialogueRow key={d.id} dialogue={d} depth={0} active={activeDialogueId === d.id} onOpen={() => setActiveDialogue(d.id)} />
            ))}
            {folders.length === 0 && dialogues.length === 0 && (
              <div className="text-xs text-[var(--op-30)] px-2 py-4 text-center">Пока нет диалогов — создайте первый.</div>
            )}
            {filterActive && folders.length > 0 && filteredDialogues.length === 0 && (
              <div className="text-xs text-[var(--op-30)] px-2 py-4 text-center">Ничего не найдено.</div>
            )}
            {(folders.length > 0 || dialogues.length > 0) && !filterActive && (
              <div className="text-[10px] text-[var(--op-25)] px-2 pt-2 text-center">Перетаскивайте папки и диалоги, чтобы менять вложенность.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
