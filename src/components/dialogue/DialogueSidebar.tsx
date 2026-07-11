import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderPlus, MessageSquarePlus, MessageSquareText, MoreVertical, ArrowDownToLine } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { PortalMenu } from "../common/PortalMenu";
import type { DialogueFolder, Dialogue } from "../../types/database";

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

function DialogueRow({ dialogue, depth, active, onOpen }: { dialogue: Dialogue; depth: number; active: boolean; onOpen: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const renameDialogue = useProjectStore((s) => s.renameDialogue);
  const deleteDialogue = useProjectStore((s) => s.deleteDialogue);
  const moveDialogueToFolder = useProjectStore((s) => s.moveDialogueToFolder);

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

export function DialogueSidebar() {
  const folders = useProjectStore((s) => s.project.dialogueFolders);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const activeDialogueId = useProjectStore((s) => s.activeDialogueId);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const createDialogue = useProjectStore((s) => s.createDialogue);
  const createDialogueFolder = useProjectStore((s) => s.createDialogueFolder);
  const moveDialogueFolder = useProjectStore((s) => s.moveDialogueFolder);
  const moveDialogueToFolder = useProjectStore((s) => s.moveDialogueToFolder);
  const [rootDragOver, setRootDragOver] = useState(false);

  const tree = buildTree(folders, dialogues, null);
  const rootDialogues = dialogues.filter((d) => d.folderId === null);

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
      <div className="p-3 border-b border-[var(--op-10)] shrink-0">
        <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Диалоги</div>
        <div className="flex gap-1.5">
          <button
            onClick={addFolder}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md glass hover:bg-[var(--op-10)]"
          >
            <FolderPlus size={12} /> Папка
          </button>
          <button
            onClick={addDialogue}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-accent/80 hover:bg-accent"
          >
            <MessageSquarePlus size={12} /> Диалог
          </button>
        </div>
      </div>
      <div
        className={`flex-1 overflow-y-auto p-1.5 ${rootDragOver ? "bg-accent/5" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!rootDragOver) setRootDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setRootDragOver(false);
        }}
        onDrop={onRootDrop}
      >
        {tree.map((node) => (
          <FolderRow key={node.folder.id} node={node} depth={0} />
        ))}
        {rootDialogues.map((d) => (
          <DialogueRow key={d.id} dialogue={d} depth={0} active={activeDialogueId === d.id} onOpen={() => setActiveDialogue(d.id)} />
        ))}
        {folders.length === 0 && dialogues.length === 0 && (
          <div className="text-xs text-[var(--op-30)] px-2 py-4 text-center">Пока нет диалогов — создайте первый.</div>
        )}
        {(folders.length > 0 || dialogues.length > 0) && (
          <div className="text-[10px] text-[var(--op-25)] px-2 pt-2 text-center">Перетаскивайте папки и диалоги, чтобы менять вложенность.</div>
        )}
      </div>
    </div>
  );
}
