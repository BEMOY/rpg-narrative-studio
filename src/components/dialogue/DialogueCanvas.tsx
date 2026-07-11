import { useLayoutEffect, useRef, useState } from "react";
import { Plus, ZoomIn, ZoomOut, Maximize2, Flag, Palette, Play, FileDown, FileUp, FileCode, Share2 } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { PortalMenu } from "../common/PortalMenu";
import type { Dialogue } from "../../types/database";
import { DialogueNodeCard } from "./DialogueNodeCard";
import { FlagsManagerModal } from "./FlagsManagerModal";
import { ColorStylesManagerModal } from "./ColorStylesManagerModal";
import { TestPlayModal } from "./TestPlayModal";
import { GmlExportModal } from "./GmlExportModal";

const CANVAS_W = 4000;
const CANVAS_H = 3000;
export const NODE_WIDTH = 340;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

type AnchorKey = string; // "in:<nodeId>" | "cont:<nodeId>" | "choice:<choiceId>"

export function DialogueCanvas({ dialogue }: { dialogue: Dialogue }) {
  const dialogueFlags = useProjectStore((s) => s.project.dialogueFlags);
  const entries = useProjectStore((s) => s.project.entries);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);
  const updateDialogueNode = useProjectStore((s) => s.updateDialogueNode);
  const addDialogueNode = useProjectStore((s) => s.addDialogueNode);
  const setDialogueStartNode = useProjectStore((s) => s.setDialogueStartNode);
  const setNodeContinuation = useProjectStore((s) => s.setNodeContinuation);
  const setChoiceTarget = useProjectStore((s) => s.setChoiceTarget);
  const renameDialogue = useProjectStore((s) => s.renameDialogue);

  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const [, bump] = useState(0);
  const [flagsOpen, setFlagsOpen] = useState(false);
  const [colorStylesOpen, setColorStylesOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [gmlOpen, setGmlOpen] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const anchorEls = useRef<Map<AnchorKey, HTMLElement>>(new Map());
  const [anchorPos, setAnchorPos] = useState<Map<AnchorKey, { x: number; y: number }>>(new Map());

  const dragNodeRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const livePos = useRef<Map<string, { x: number; y: number }>>(new Map());
  const panDragRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null);
  const [linkDrag, setLinkDrag] = useState<{ from: AnchorKey; x: number; y: number } | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);

  const registerAnchor = (key: AnchorKey, el: HTMLElement | null) => {
    if (el) anchorEls.current.set(key, el);
    else anchorEls.current.delete(key);
  };

  const remeasure = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const next = new Map<AnchorKey, { x: number; y: number }>();
    anchorEls.current.forEach((el, key) => {
      const r = el.getBoundingClientRect();
      next.set(key, {
        x: (r.left + r.width / 2 - stageRect.left) / zoom,
        y: (r.top + r.height / 2 - stageRect.top) / zoom,
      });
    });
    setAnchorPos(next);
  };

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(remeasure);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogue, zoom]);

  const posFor = (nodeId: string) => {
    const live = livePos.current.get(nodeId);
    if (live) return live;
    const n = dialogue.nodes.find((x) => x.id === nodeId);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  const onNodeDragStart = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const p = posFor(nodeId);
    dragNodeRef.current = { id: nodeId, startClientX: e.clientX, startClientY: e.clientY, startX: p.x, startY: p.y };
    const onMove = (ev: MouseEvent) => {
      const d = dragNodeRef.current;
      if (!d) return;
      const nx = d.startX + (ev.clientX - d.startClientX) / zoom;
      const ny = d.startY + (ev.clientY - d.startClientY) / zoom;
      livePos.current.set(d.id, { x: nx, y: ny });
      bump((n) => n + 1);
      requestAnimationFrame(remeasure);
    };
    const onUp = () => {
      const d = dragNodeRef.current;
      if (d) {
        const final = livePos.current.get(d.id);
        if (final) updateDialogueNode(dialogue.id, d.id, { x: final.x, y: final.y });
        // Once committed to the store, stop overriding — otherwise this node would keep
        // rendering from the stale drag-time cache instead of fresh data forever after.
        livePos.current.delete(d.id);
      }
      dragNodeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onBgPointerDown = (e: React.MouseEvent) => {
    panDragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    const onMove = (ev: MouseEvent) => {
      const d = panDragRef.current;
      if (!d) return;
      setPan({ x: d.startPanX + (ev.clientX - d.startClientX), y: d.startPanY + (ev.clientY - d.startClientY) });
    };
    const onUp = () => {
      panDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = stageRef.current?.parentElement?.getBoundingClientRect();
    const newZoom = clamp(zoom + (e.deltaY > 0 ? -0.08 : 0.08), 0.2, 2);
    if (!rect) {
      setZoom(newZoom);
      return;
    }
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const ratio = newZoom / zoom;
    setPan((p) => ({ x: mouseX - (mouseX - p.x) * ratio, y: mouseY - (mouseY - p.y) * ratio }));
    setZoom(newZoom);
  };

  // ---- link creation drag: from a choice dot / continuation bar to another node ----
  const onLinkDragStart = (from: AnchorKey, e: React.MouseEvent) => {
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    const move = (ev: MouseEvent) => {
      const rect = stage.getBoundingClientRect();
      setLinkDrag({ from, x: (ev.clientX - rect.left) / zoom, y: (ev.clientY - rect.top) / zoom });
      const hovered = document.elementFromPoint(ev.clientX, ev.clientY);
      const hoveredNodeEl = hovered && (hovered as HTMLElement).closest<HTMLElement>("[data-dialogue-node-id]");
      setDragOverNodeId(hoveredNodeEl?.dataset.dialogueNodeId ?? null);
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setLinkDrag(null);
      setDragOverNodeId(null);
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const nodeEl = target && (target as HTMLElement).closest<HTMLElement>("[data-dialogue-node-id]");
      let targetNodeId = nodeEl?.dataset.dialogueNodeId;
      if (!targetNodeId) {
        // Released over empty canvas — matches common node-editor UX: auto-create a new node
        // right there and wire it up, instead of just dropping the connection silently.
        const stageRect = stage.getBoundingClientRect();
        const dropX = (ev.clientX - stageRect.left) / zoom;
        const dropY = (ev.clientY - stageRect.top) / zoom;
        if (dropX < 0 || dropY < 0 || dropX > CANVAS_W || dropY > CANVAS_H) return;
        // Offset so the new node's incoming anchor (near its top-left) lands close to the cursor.
        targetNodeId = addDialogueNode(dialogue.id, dropX - 20, dropY - 20);
      }
      if (from.startsWith("cont:")) {
        const nodeId = from.slice(5);
        if (nodeId !== targetNodeId) setNodeContinuation(dialogue.id, nodeId, targetNodeId);
      } else if (from.startsWith("choice:")) {
        const choiceId = from.slice(7);
        const owner = dialogue.nodes.find((n) => n.choices.some((c) => c.id === choiceId));
        if (owner && owner.id !== targetNodeId) setChoiceTarget(dialogue.id, owner.id, choiceId, targetNodeId);
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const addNode = () => {
    const rect = stageRef.current?.parentElement?.getBoundingClientRect();
    const cx = rect ? (rect.width / 2 - pan.x) / zoom : 200;
    const cy = rect ? (rect.height / 2 - pan.y) / zoom : 200;
    addDialogueNode(dialogue.id, cx, cy);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(dialogue, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dialogue.name.replace(/[^\w\-а-яА-Я ]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  };

  const importDialogueAction = useProjectStore((s) => s.importDialogue);
  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.nodes)) throw new Error("Не похоже на файл диалога.");
      if (!confirm(`Импортировать «${parsed.name ?? "диалог"}» как новый диалог в этой же папке?`)) return;
      importDialogueAction(parsed, dialogue.folderId);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] flex-wrap shrink-0">
        <input
          value={dialogue.name}
          onChange={(e) => renameDialogue(dialogue.id, e.target.value || dialogue.name)}
          className="bg-transparent outline-none text-sm font-medium text-[var(--op-85)] px-1.5 py-1 rounded hover:bg-[var(--op-5)] focus:bg-[var(--op-7)] min-w-[120px]"
        />
        <button onClick={addNode} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-accent/80 hover:bg-accent">
          <Plus size={12} /> Нода
        </button>
        <button onClick={() => setTestOpen(true)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
          <Play size={12} /> Тест
        </button>
        <button onClick={() => setFlagsOpen(true)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
          <Flag size={12} /> Флаги
        </button>
        <button onClick={() => setColorStylesOpen(true)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
          <Palette size={12} /> Стили
        </button>
        <div className="relative">
          <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
          <button
            ref={exportBtnRef}
            onClick={() => setExportMenuOpen((v) => !v)}
            className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]"
            title="Экспорт / импорт диалога"
          >
            <Share2 size={13} />
          </button>
          <PortalMenu anchorRef={exportBtnRef} open={exportMenuOpen} onClose={() => setExportMenuOpen(false)}>
            <div className="w-44 p-1.5">
              <button onClick={exportJson} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--op-80)] hover:bg-[var(--op-7)]">
                <FileDown size={13} /> Экспорт JSON
              </button>
              <button
                onClick={() => {
                  setExportMenuOpen(false);
                  importInputRef.current?.click();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--op-80)] hover:bg-[var(--op-7)]"
              >
                <FileUp size={13} /> Импорт JSON
              </button>
              <div className="h-px bg-[var(--op-10)] my-1" />
              <button
                onClick={() => {
                  setExportMenuOpen(false);
                  setGmlOpen(true);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--op-80)] hover:bg-[var(--op-7)]"
              >
                <FileCode size={13} /> Экспорт GML (register / lines / speakers)
              </button>
            </div>
          </PortalMenu>
        </div>
        <div className="flex-1" />
        <button onClick={() => setZoom((z) => clamp(z - 0.15, 0.2, 2))} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
          <ZoomOut size={13} />
        </button>
        <span className="text-xs mono text-[var(--op-40)] w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => clamp(z + 0.15, 0.2, 2))} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
          <ZoomIn size={13} />
        </button>
        <button
          onClick={() => {
            setZoom(0.85);
            setPan({ x: 60, y: 40 });
          }}
          className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]"
          title="Сбросить вид"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing" onWheel={onWheel} onMouseDown={onBgPointerDown}>
        <div
          ref={stageRef}
          style={{ position: "absolute", left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          <svg width={CANVAS_W} height={CANVAS_H} className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
            <defs>
              <marker id="dlg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent, #8b7bff)" />
              </marker>
            </defs>
            {dialogue.nodes.map((n) => {
              const lines: React.ReactNode[] = [];
              if (n.choices.length === 0 && n.continueTo) {
                const from = anchorPos.get(`cont:${n.id}`);
                const to = anchorPos.get(`in:${n.continueTo}`);
                if (from && to) {
                  const mx = (from.x + to.x) / 2;
                  lines.push(
                    <path
                      key={`cont-${n.id}`}
                      d={`M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`}
                      fill="none"
                      stroke="var(--op-30)"
                      strokeWidth={1.6}
                      markerEnd="url(#dlg-arrow)"
                    />
                  );
                }
              }
              n.choices.forEach((c) => {
                if (!c.targetNodeId) return;
                const from = anchorPos.get(`choice:${c.id}`);
                const to = anchorPos.get(`in:${c.targetNodeId}`);
                if (!from || !to) return;
                const mx = (from.x + to.x) / 2;
                lines.push(
                  <path
                    key={`choice-${c.id}`}
                    d={`M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`}
                    fill="none"
                    stroke="#5fc9c9"
                    strokeWidth={1.6}
                    markerEnd="url(#dlg-arrow)"
                  />
                );
              });
              return lines;
            })}
            {linkDrag && (
              <path
                d={`M ${anchorPos.get(linkDrag.from)?.x ?? linkDrag.x} ${anchorPos.get(linkDrag.from)?.y ?? linkDrag.y} L ${linkDrag.x} ${linkDrag.y}`}
                stroke="var(--accent, #8b7bff)"
                strokeWidth={1.6}
                strokeDasharray="4 3"
                fill="none"
              />
            )}
          </svg>

          {dialogue.nodes.map((n) => {
            const p = posFor(n.id);
            return (
              <div key={n.id} style={{ position: "absolute", left: p.x, top: p.y, width: NODE_WIDTH }} data-dialogue-node-id={n.id}>
                <DialogueNodeCard
                  node={n}
                  dialogue={dialogue}
                  isStart={dialogue.startNodeId === n.id}
                  isDropTarget={!!linkDrag && dragOverNodeId === n.id}
                  onMakeStart={() => setDialogueStartNode(dialogue.id, n.id)}
                  onDragHandleDown={(e) => onNodeDragStart(n.id, e)}
                  registerAnchor={registerAnchor}
                  onLinkDragStart={onLinkDragStart}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Single shared datalist backing every flag-name <input list="..."> in this dialogue's
          UI (ConditionEditor's flag key, each choice's flag_set rows) — must stay mounted
          unconditionally, not nested inside a popover that can unmount. */}
      <datalist id="dialogue-flags-list">
        {dialogueFlags.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      {flagsOpen && <FlagsManagerModal onClose={() => setFlagsOpen(false)} />}
      {colorStylesOpen && <ColorStylesManagerModal onClose={() => setColorStylesOpen(false)} />}
      {testOpen && <TestPlayModal dialogue={dialogue} onClose={() => setTestOpen(false)} />}
      {gmlOpen && <GmlExportModal dialogue={dialogue} entries={entries} colorStyles={colorStyles} onClose={() => setGmlOpen(false)} />}
    </div>
  );
}
