import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, ZoomIn, ZoomOut, Maximize2, Type, Play, FileDown, FileUp, FileCode, Share2, Grid2X2, MapPin, BookMarked } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { PortalMenu } from "../common/PortalMenu";
import type { Dialogue, DialogueNode } from "../../types/database";
import { nextId } from "../../lib/mapDefaults";
import { DialogueNodeCard } from "./DialogueNodeCard";
import { ColorStylesManagerModal } from "./ColorStylesManagerModal";
import { TestPlayModal } from "./TestPlayModal";
import { GmlExportModal } from "./GmlExportModal";
import { SearchSelect } from "./SearchSelect";
import { ThemedSelect } from "../common/ThemedSelect";
import { Tour, type TourStep } from "../tour/Tour";
import { themedAlert, themedConfirm } from "../../lib/modals";

const DIALOGUES_TOUR: TourStep[] = [
  { target: '[data-tour="dialogues-new"]', title: "Новый диалог", body: "Диалоги можно раскладывать по папкам слева — удобно, если персонажей и веток много." },
  { target: '[data-tour="dialogues-addnode"]', title: "Добавить ноду", body: "Каждая нода — это один или несколько реплик подряд, плюс варианты ответа (выборы) в конце." },
  { target: '[data-tour="dialogues-test"]', title: "Тестовый прогон", body: "Проходит диалог прямо здесь, с учётом условий и флагов — без выхода из редактора." },
  {
    target: '[data-tour="dialogues-canvas"]',
    title: "Холст диалога",
    body: "Перетяните ноду за верхнюю плашку. Перетаскивание пустого фона — выделить рамкой несколько нод (Ctrl+C/V/X — копировать/вставить/вырезать, Delete — удалить). Камера: WASD или зажатое колесо мыши для перемещения, колесо — зум.",
  },
];

const CANVAS_W = 4000;
const CANVAS_H = 3000;
export const NODE_WIDTH = 340;
const DLG_GRID_SIZE = 40;

// Single source of truth for each connector "port" color, shared between the SVG edge
// lines/arrowheads/endpoint-dots drawn here and the actual DOM port handles rendered in
// DialogueNodeCard.tsx (bg-teal-400/bg-orange-400/bg-amber-400 there use these exact hexes) —
// previously the SVG side used its own slightly-different hand-picked colors (and a single
// shared purple arrowhead for every type), so a connection's start handle, line, and arrowhead
// could all look like different colors even though they were meant to be "the same" connector.
export const DLG_PORT_COLORS = {
  choice: "#2dd4bf", // teal-400
  else: "#fb923c", // orange-400
  cont: "#fbbf24", // amber-400
} as const;

// Matching radii (world-space, so they scale with zoom exactly like everything else on the
// stage) for the endpoint dot drawn where an edge actually LANDS on its target node — mirrors
// each port's own real DOM handle size 1:1 (choice is w-3 h-3 = 12px diameter, else is w-2 h-2
// = 8px, cont is w-2.5 h-2.5 = 10px) so the arriving connection reads as visually "the same
// dot" as the one it left from, not a generic small marker.
export const DLG_PORT_RADII = {
  choice: 6,
  else: 4,
  cont: 5,
} as const;
const MIN_ZOOM = 0.01; // 1% — same reasoning as the Quests roadmap graph's resetView: a large dialogue should still fully zoom-to-fit instead of clipping

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Directional ports: instead of every connection landing on one fixed dot at a node's top-left
// (which looked wrong for anything approaching from below/the right), each edge computes where
// it crosses the TARGET node's own bounding box along the straight line from its source point
// to that box's center — so a node above the parent gets entered from the top, one to the
// right from its left edge, and so on, per edge independently (a node with several incoming
// connections from different directions gets a different entry point for each one). Dropping a
// new connection anywhere on the node still works exactly as before (see onLinkDragStart's
// elementFromPoint/closest hit-test) — this only changes where the line is drawn, not where you
// can drop it.
function boxEdgePoint(from: { x: number; y: number }, box: { x: number; y: number; w: number; h: number }) {
  const dx = box.x - from.x;
  const dy = box.y - from.y;
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y };
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: box.x - dx * scale, y: box.y - dy * scale };
}

// Same "which axis dominates" idea for the bezier control points themselves — a horizontal
// S-curve (control points offset in x) reads naturally for a mostly-sideways connection, but
// looks bowed and wrong once the target is mostly above/below the source, where a vertical
// S-curve (control points offset in y) is what actually looks like a smooth cable.
function curvePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const mx = (from.x + to.x) / 2;
    return `M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`;
  }
  const my = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${my}, ${to.x} ${my}, ${to.x} ${to.y}`;
}

// Delete-key confirmation — one checkbox suppresses it for just this dialogue (persisted on
// the Dialogue itself), the other suppresses it everywhere (Project.uiSettings), both
// recoverable later from the Settings panel's "reset dismissed warnings" action.
function DeleteConfirmModal({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: (suppressLocal: boolean, suppressGlobal: boolean) => void;
}) {
  const [suppressLocal, setSuppressLocal] = useState(false);
  const [suppressGlobal, setSuppressGlobal] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onMouseDown={onCancel}>
      <div className="popover rounded-xl w-full max-w-sm overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--op-10)]">
          <div className="text-sm font-medium text-[var(--op-85)]">
            Удалить {count === 1 ? "эту ноду" : `эти ноды (${count})`}?
          </div>
          <div className="text-[11px] text-[var(--op-40)] mt-1">Все связи, ведущие в удаляемые ноды, тоже будут очищены. Это необратимо.</div>
        </div>
        <div className="px-4 py-3 space-y-2">
          <label className="flex items-center gap-2 text-xs text-[var(--op-60)] cursor-pointer select-none">
            <input type="checkbox" checked={suppressLocal} onChange={(e) => setSuppressLocal(e.target.checked)} className="accent-current" />
            не спрашивать больше в этом диалоге
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--op-60)] cursor-pointer select-none">
            <input type="checkbox" checked={suppressGlobal} onChange={(e) => setSuppressGlobal(e.target.checked)} className="accent-current" />
            не спрашивать больше нигде (можно вернуть в Настройках)
          </label>
        </div>
        <div className="p-3 border-t border-[var(--op-10)] flex justify-end gap-2">
          <button onClick={onCancel} className="text-sm px-4 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
            Отмена
          </button>
          <button
            onClick={() => onConfirm(suppressLocal, suppressGlobal)}
            className="text-sm px-4 py-1.5 rounded-md bg-red-500/80 hover:bg-red-500 text-white"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

type AnchorKey = string; // "in:<nodeId>" | "cont:<nodeId>" | "choice:<choiceId>" | "else:<lineId>"

export function DialogueCanvas({ dialogue }: { dialogue: Dialogue }) {
  const dialogueFlags = useProjectStore((s) => s.project.dialogueFlags);
  const entries = useProjectStore((s) => s.project.entries);
  const chapters = useProjectStore((s) => s.project.chapters);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);
  const updateDialogueNode = useProjectStore((s) => s.updateDialogueNode);
  const addDialogueNode = useProjectStore((s) => s.addDialogueNode);
  const setDialogueStartNode = useProjectStore((s) => s.setDialogueStartNode);
  const setNodeContinuation = useProjectStore((s) => s.setNodeContinuation);
  const setChoiceTarget = useProjectStore((s) => s.setChoiceTarget);
  const updateDialogueLine = useProjectStore((s) => s.updateDialogueLine);
  const renameDialogue = useProjectStore((s) => s.renameDialogue);

  const [zoom, setZoom] = useState(() => dialogue.camera?.zoom ?? 0.85);
  const [pan, setPan] = useState(() => (dialogue.camera ? { x: dialogue.camera.x, y: dialogue.camera.y } : { x: 60, y: 40 }));
  const [, bump] = useState(0);
  const cameraSaveTimerRef = useRef<number | null>(null);

  // Reopening a dialogue used to leave pan/zoom at whatever the PREVIOUSLY open dialogue had
  // (DialogueCanvas isn't remounted per-dialogue, it's the same component instance re-rendered
  // with a new `dialogue` prop) — which is what made the view look like it "randomly" jumped
  // around. Whenever the active dialogue actually changes, restore its own last-saved camera
  // (or the same 85%/(60,40) default as before, if it's never been opened/moved).
  useLayoutEffect(() => {
    const cam = dialogue.camera;
    if (cam) {
      setZoom(cam.zoom);
      setPan({ x: cam.x, y: cam.y });
    } else {
      setZoom(0.85);
      setPan({ x: 60, y: 40 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogue.id]);

  // Persist pan/zoom back onto the dialogue so the restore above has something to read next
  // time — debounced so a wheel-zoom flurry or a long pan-drag doesn't spam autosave on every
  // single frame, just once ~400ms after the camera settles.
  useEffect(() => {
    if (cameraSaveTimerRef.current) window.clearTimeout(cameraSaveTimerRef.current);
    cameraSaveTimerRef.current = window.setTimeout(() => {
      updateDialogue(dialogue.id, { camera: { x: pan.x, y: pan.y, zoom } });
    }, 400);
    return () => {
      if (cameraSaveTimerRef.current) window.clearTimeout(cameraSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan.x, pan.y, dialogue.id]);
  const [colorStylesOpen, setColorStylesOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [gmlOpen, setGmlOpen] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const anchorEls = useRef<Map<AnchorKey, HTMLElement>>(new Map());
  const [anchorPos, setAnchorPos] = useState<Map<AnchorKey, { x: number; y: number; w: number; h: number }>>(new Map());

  // Group-drag: whichever node's handle was actually grabbed, PLUS every other node that was
  // already part of the multi-selection at that moment (so dragging any one of several
  // selected nodes moves the whole group together, not just the one under the cursor).
  const groupDragRef = useRef<{ ids: string[]; startClientX: number; startClientY: number; startPositions: Map<string, { x: number; y: number }> } | null>(null);
  // Middle-mouse-button (wheel-click) drag panning — independent of the marquee/select drag,
  // which stays on the left button only.
  const panDragRef = useRef<{ startClientX: number; startClientY: number; startPan: { x: number; y: number } } | null>(null);
  // Ctrl+C/Ctrl+X copy — a deep-cloned snapshot of the selected nodes at copy time, pasted back
  // via Ctrl+V with fresh ids (see the keydown handler below). Plain ref, not state: clipboard
  // content never needs to trigger a re-render on its own.
  const clipboardRef = useRef<DialogueNode[] | null>(null);
  const addDialogueNodesRaw = useProjectStore((s) => s.addDialogueNodesRaw);
  const livePos = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [linkDrag, setLinkDrag] = useState<{ from: AnchorKey; x: number; y: number } | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);

  // Marquee/rubber-band multi-select is now the DEFAULT for a plain left-drag on empty canvas
  // (panning moved to WASD/the wheel, see below) — no modifier key needed anymore. `marquee` is
  // the box being dragged out right now, in stage-local unscaled coordinates; `selectedIds` is
  // what's actually selected once the drag finishes.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(null);
  const uiSettings = useProjectStore((s) => s.project.uiSettings);
  const updateUiSettings = useProjectStore((s) => s.updateUiSettings);
  const updateDialogue = useProjectStore((s) => s.updateDialogue);
  const deleteDialogueNodes = useProjectStore((s) => s.deleteDialogueNodes);
  const pendingDialogueNodeFocus = useProjectStore((s) => s.pendingDialogueNodeFocus);
  const clearDialogueNodeFocus = useProjectStore((s) => s.clearDialogueNodeFocus);
  const [rippleNodeId, setRippleNodeId] = useState<string | null>(null);
  // Grid on/off is deliberately a single window-wide switch (Project.uiSettings), NOT stored
  // per-Dialogue like the camera above — the writer explicitly asked for the two to behave
  // differently.
  const dialoguesGridEnabled = uiSettings?.dialoguesGridEnabled ?? false;

  const registerAnchor = (key: AnchorKey, el: HTMLElement | null) => {
    if (el) anchorEls.current.set(key, el);
    else anchorEls.current.delete(key);
  };

  const remeasure = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const next = new Map<AnchorKey, { x: number; y: number; w: number; h: number }>();
    anchorEls.current.forEach((el, key) => {
      const r = el.getBoundingClientRect();
      next.set(key, {
        x: (r.left + r.width / 2 - stageRect.left) / zoom,
        y: (r.top + r.height / 2 - stageRect.top) / zoom,
        w: r.width / zoom,
        h: r.height / zoom,
      });
    });
    setAnchorPos(next);
  };

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(remeasure);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogue, zoom]);

  // Delete key removes every currently-selected node — gated behind a confirmation modal
  // unless the writer has suppressed it (per-dialogue or globally, see deleteConfirm/uiSettings
  // below). Ignored while focus is inside a text input/textarea/select so typing "Delete" to
  // erase a character in a line's text doesn't nuke nodes.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      if (selectedIds.size === 0) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
      const ids = Array.from(selectedIds);
      if (dialogue.skipDeleteConfirm || uiSettings?.skipDeleteConfirmGlobal) {
        deleteDialogueNodes(dialogue.id, ids);
        setSelectedIds(new Set());
      } else {
        setDeleteConfirm({ ids });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, dialogue.id, dialogue.skipDeleteConfirm, uiSettings?.skipDeleteConfirmGlobal, deleteDialogueNodes]);

  // Ctrl+C / Ctrl+X / Ctrl+V for selected nodes — copy takes a deep-cloned snapshot into
  // clipboardRef (a plain ref, not project state, so copying itself never touches undo
  // history); paste regenerates fresh ids for every pasted node/line/choice and remaps any
  // internal links (continueTo/choice target/else-branch) that pointed at ANOTHER node in the
  // same copied set to the corresponding new id, while links pointing outside the copied set
  // are dropped (there's no sensible "same" target to remap them to). Cmd on Mac, Ctrl
  // elsewhere; same editable-target gate as Delete so typing into a text field isn't hijacked.
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "x" && key !== "v") return;
      if (isEditableTarget(e.target)) return;

      if (key === "c" || key === "x") {
        if (selectedIds.size === 0) return;
        e.preventDefault();
        const snapshot = dialogue.nodes.filter((n) => selectedIds.has(n.id)).map((n) => JSON.parse(JSON.stringify(n)) as DialogueNode);
        if (snapshot.length === 0) return;
        clipboardRef.current = snapshot;
        if (key === "x") {
          deleteDialogueNodes(dialogue.id, snapshot.map((n) => n.id));
          setSelectedIds(new Set());
        }
        return;
      }

      // Paste
      const clip = clipboardRef.current;
      if (!clip || clip.length === 0) return;
      e.preventDefault();
      const idMap = new Map<string, string>();
      clip.forEach((n) => idMap.set(n.id, nextId("node")));
      const PASTE_OFFSET = 48;
      const pasted: DialogueNode[] = clip.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        x: n.x + PASTE_OFFSET,
        y: n.y + PASTE_OFFSET,
        continueTo: n.continueTo && idMap.has(n.continueTo) ? idMap.get(n.continueTo) : undefined,
        choices: n.choices.map((c) => ({
          ...c,
          id: nextId("choice"),
          targetNodeId: c.targetNodeId && idMap.has(c.targetNodeId) ? idMap.get(c.targetNodeId) : undefined,
        })),
        lines: n.lines.map((l) => ({
          ...l,
          id: nextId("line"),
          elseNodeId: l.elseNodeId && idMap.has(l.elseNodeId) ? idMap.get(l.elseNodeId) : undefined,
        })),
      }));
      addDialogueNodesRaw(dialogue.id, pasted);
      setSelectedIds(new Set(pasted.map((n) => n.id)));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, dialogue, deleteDialogueNodes, addDialogueNodesRaw]);

  // WASD panning — held keys accumulate in a ref (not React state, so held-down tracking isn't
  // fighting a render cycle) and a small always-on rAF loop nudges `pan` every frame while any
  // of them are down. Same editable-target gate as the Delete handler above, so typing "wasd"
  // into a line's text or the title field doesn't drag the camera around underneath you.
  const heldMoveKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    };
    // `e.code` (the physical key, e.g. "KeyW") instead of `e.key` (the character the layout
    // produces) — on a Windows machine with a Cyrillic/other non-Latin layout active, `e.key`
    // for the W/A/S/D keys is whatever letter is printed there in THAT layout, not "w"/"a"/"s"/
    // "d", so the old check silently never matched and panning looked completely dead. `e.code`
    // always reports the physical key position regardless of active layout.
    const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!MOVE_KEYS.has(e.code)) return;
      if (isEditableTarget(e.target)) return;
      heldMoveKeysRef.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldMoveKeysRef.current.delete(e.code);
    };
    const onBlur = () => heldMoveKeysRef.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const PAN_SPEED = 640; // screen px/sec — deliberately NOT scaled by zoom, so the camera
    // always feels equally responsive regardless of how zoomed in/out the canvas currently is.
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const held = heldMoveKeysRef.current;
      if (held.size > 0) {
        let dx = 0;
        let dy = 0;
        if (held.has("KeyW")) dy += 1;
        if (held.has("KeyS")) dy -= 1;
        if (held.has("KeyA")) dx += 1;
        if (held.has("KeyD")) dx -= 1;
        if (dx !== 0 || dy !== 0) {
          const len = Math.hypot(dx, dy) || 1;
          setPan((p) => ({ x: p.x + (dx / len) * PAN_SPEED * dt, y: p.y + (dy / len) * PAN_SPEED * dt }));
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const posFor = (nodeId: string) => {
    const live = livePos.current.get(nodeId);
    if (live) return live;
    const n = dialogue.nodes.find((x) => x.id === nodeId);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  // Consumes a cross-window "go to this exact node" request — set by e.g. clicking a dialogue
  // link in the Quests roadmap card's popup (see requestDialogueNodeFocus/DialogueLinkDot in
  // QuestsView.tsx). Only reacts once this IS the dialogue that was requested (switching
  // workspaceView/activeDialogueId already happened as part of that same store action, so by
  // the time this dialogue is showing, `dialogue.id` should already match). Pans/zooms to the
  // node and pulses the same ripple effect used for quest-focus, then clears the request so it
  // doesn't refire on the next unrelated render.
  useEffect(() => {
    if (!pendingDialogueNodeFocus || pendingDialogueNodeFocus.dialogueId !== dialogue.id) return;
    const nodeId = pendingDialogueNodeFocus.nodeId;
    const n = dialogue.nodes.find((x) => x.id === nodeId);
    const viewport = stageRef.current?.parentElement;
    const rect = viewport?.getBoundingClientRect();
    if (n && rect) {
      const p = posFor(nodeId);
      const box = anchorPos.get(`box:${nodeId}`);
      const w = box?.w ?? NODE_WIDTH;
      const h = box?.h ?? 220;
      const cx = p.x + w / 2;
      const cy = p.y + h / 2;
      const targetZoom = clamp(Math.max(zoom, 0.7), MIN_ZOOM, 2);
      setZoom(targetZoom);
      setPan({ x: rect.width / 2 - cx * targetZoom, y: rect.height / 2 - cy * targetZoom });
    }
    setRippleNodeId(nodeId);
    setTimeout(() => setRippleNodeId((cur) => (cur === nodeId ? null : cur)), 1000);
    clearDialogueNodeFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDialogueNodeFocus, dialogue.id]);

  const onNodeDragStart = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault(); // otherwise the browser starts a native text-selection drag on mousedown
    if (e.shiftKey) {
      // Shift+click on a node's drag handle toggles it in/out of the marquee selection instead
      // of moving it — same modifier as the empty-canvas marquee drag, so Shift consistently
      // means "I'm selecting" throughout this canvas.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
      return;
    }
    // If the grabbed node is already part of a bigger multi-selection, drag the WHOLE group
    // together instead of collapsing the selection down to just this one node — otherwise
    // there was no way to actually move several selected nodes at once.
    let groupIds: string[];
    if (selectedIds.has(nodeId) && selectedIds.size > 1) {
      groupIds = Array.from(selectedIds);
    } else {
      groupIds = [nodeId];
      // A plain click on a node makes it the sole selection — so Delete/copy work right away
      // for a single node too, without requiring a marquee drag first.
      setSelectedIds(new Set([nodeId]));
    }
    const startPositions = new Map(groupIds.map((id) => [id, posFor(id)]));
    groupDragRef.current = { ids: groupIds, startClientX: e.clientX, startClientY: e.clientY, startPositions };
    const onMove = (ev: MouseEvent) => {
      const d = groupDragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.startClientX) / zoom;
      const dy = (ev.clientY - d.startClientY) / zoom;
      for (const id of d.ids) {
        const sp = d.startPositions.get(id);
        if (!sp) continue;
        livePos.current.set(id, { x: sp.x + dx, y: sp.y + dy });
      }
      bump((n) => n + 1);
      requestAnimationFrame(remeasure);
    };
    const onUp = () => {
      const d = groupDragRef.current;
      if (d) {
        for (const id of d.ids) {
          const final = livePos.current.get(id);
          if (final) updateDialogueNode(dialogue.id, id, { x: final.x, y: final.y });
          // Once committed to the store, stop overriding — otherwise this node would keep
          // rendering from the stale drag-time cache instead of fresh data forever after.
          livePos.current.delete(id);
        }
      }
      groupDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Which nodes fall inside a given marquee box, in stage-local unscaled coordinates —
  // shared between the live in-flight preview (so nodes light up the instant they enter the
  // box, not only once the mouse is released) and any final commit.
  const nodesInMarquee = (m: { x0: number; y0: number; x1: number; y1: number }) => {
    const minX = Math.min(m.x0, m.x1);
    const maxX = Math.max(m.x0, m.x1);
    const minY = Math.min(m.y0, m.y1);
    const maxY = Math.max(m.y0, m.y1);
    const picked = new Set<string>();
    dialogue.nodes.forEach((n) => {
      const p = posFor(n.id);
      const box = anchorPos.get(`box:${n.id}`);
      const w = box?.w ?? NODE_WIDTH;
      const h = box?.h ?? 200;
      if (p.x < maxX && p.x + w > minX && p.y < maxY && p.y + h > minY) picked.add(n.id);
    });
    return picked;
  };

  // Left-drag on empty canvas is a marquee select; middle-mouse-button (wheel-click) drag pans
  // the camera instead, independent of WASD.
  const onBgPointerDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startPan = { ...pan };
      panDragRef.current = { startClientX, startClientY, startPan };
      const onMove = (ev: MouseEvent) => {
        const d = panDragRef.current;
        if (!d) return;
        setPan({ x: d.startPan.x + (ev.clientX - d.startClientX), y: d.startPan.y + (ev.clientY - d.startClientY) });
      };
      const onUp = () => {
        panDragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }
    if (e.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    e.preventDefault(); // otherwise the browser starts a native text-selection drag on mousedown
    const rect = stage.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / zoom;
    const startY = (e.clientY - rect.top) / zoom;
    const initial = { x0: startX, y0: startY, x1: startX, y1: startY };
    setMarquee(initial);
    // Selection updates live as the box grows (not just on mouseup) — a node is selected the
    // instant it falls inside the marquee, matching how selection boxes behave everywhere else.
    setSelectedIds(nodesInMarquee(initial));
    const onMove = (ev: MouseEvent) => {
      const r = stage.getBoundingClientRect();
      const next = { ...initial, x1: (ev.clientX - r.left) / zoom, y1: (ev.clientY - r.top) / zoom };
      setMarquee((m) => (m ? { ...m, x1: next.x1, y1: next.y1 } : m));
      setSelectedIds(nodesInMarquee(next));
    };
    const onUp = () => {
      setMarquee(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Plain wheel always zooms (cursor-centered) — panning is WASD or middle-mouse-drag instead,
  // so the wheel doesn't need to double as a pan gesture anymore.
  const onWheel = (e: React.WheelEvent) => {
    const rect = stageRef.current?.parentElement?.getBoundingClientRect();
    const newZoom = clamp(zoom + (e.deltaY > 0 ? -0.08 : 0.08), MIN_ZOOM, 2);
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

  // Auto-center + zoom-to-fit over every node's actual measured box (see the `box:<nodeId>`
  // anchors registered alongside each node in the render below) — same approach as the Quests
  // roadmap graph's resetView, replacing the old fixed "just snap back to 85%/(60,40)" behavior
  // that ignored where the nodes actually were.
  const resetView = () => {
    const viewport = stageRef.current?.parentElement;
    const rect = viewport?.getBoundingClientRect();
    if (!rect || rect.width === 0 || dialogue.nodes.length === 0) {
      setZoom(0.85);
      setPan({ x: 60, y: 40 });
      return;
    }
    const pad = 140;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of dialogue.nodes) {
      const p = posFor(n.id);
      const box = anchorPos.get(`box:${n.id}`);
      const w = box?.w ?? NODE_WIDTH;
      const h = box?.h ?? 220;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + w);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + h);
    }
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
    const boxW = Math.max(1, maxX - minX);
    const boxH = Math.max(1, maxY - minY);
    const fitZoom = clamp(Math.min(rect.width / boxW, rect.height / boxH), MIN_ZOOM, 2);
    setZoom(fitZoom);
    setPan({ x: rect.width / 2 - ((minX + maxX) / 2) * fitZoom, y: rect.height / 2 - ((minY + maxY) / 2) * fitZoom });
  };

  // ---- link creation drag: from a choice dot / continuation bar to another node ----
  const onLinkDragStart = (from: AnchorKey, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault(); // otherwise the browser starts a native text/image-selection drag
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
      } else if (from.startsWith("else:")) {
        const lineId = from.slice(5);
        const owner = dialogue.nodes.find((n) => n.lines.some((l) => l.id === lineId));
        if (owner && owner.id !== targetNodeId) updateDialogueLine(dialogue.id, owner.id, lineId, { elseNodeId: targetNodeId });
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
      if (!(await themedConfirm(`Импортировать «${parsed.name ?? "диалог"}» как новый диалог в этой же папке?`))) return;
      importDialogueAction(parsed, dialogue.folderId);
    } catch (e: any) {
      themedAlert(e?.message ?? String(e));
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
        {/* Chapter + location apply to the WHOLE dialogue, not per-node — see Dialogue.chapter/
            locationEntryId. Kept right next to the title since they're "file"-level metadata,
            same spirit as the title input itself. */}
        <div className="flex items-center gap-1 text-[11px] text-[var(--op-45)]">
          <BookMarked size={12} className="shrink-0" />
          <ThemedSelect
            value={dialogue.chapter ?? ""}
            onChange={(v) => updateDialogue(dialogue.id, { chapter: v || undefined })}
            options={[{ value: "", label: "Без главы" }, ...chapters.map((c) => ({ value: c, label: c }))]}
            className="bg-transparent border-none outline-none text-[11px] text-[var(--op-60)] hover:text-[var(--op-85)] rounded px-1 py-1 hover:bg-[var(--op-5)] max-w-[130px]"
          />
        </div>
        <div className="flex items-center gap-1 min-w-[140px]">
          <MapPin size={12} className="shrink-0 text-[var(--op-45)]" />
          <SearchSelect
            value={dialogue.locationEntryId}
            onChange={(id) => updateDialogue(dialogue.id, { locationEntryId: id })}
            options={entries.filter((e) => e.category === "location").map((e) => ({ id: e.id, label: e.name }))}
            placeholder="локация…"
            searchPlaceholder="Поиск локации…"
            clearLabel="— без локации —"
          />
        </div>
        <button data-tour="dialogues-addnode" onClick={addNode} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-accent/80 hover:bg-accent">
          <Plus size={12} /> Нода
        </button>
        <button data-tour="dialogues-test" onClick={() => setTestOpen(true)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
          <Play size={12} /> Тест
        </button>
        <button onClick={() => setColorStylesOpen(true)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
          <Type size={12} /> Стили текста
        </button>
        <Tour tourId="dialogues" steps={DIALOGUES_TOUR} />
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
        <button onClick={() => setZoom((z) => clamp(z - 0.15, MIN_ZOOM, 2))} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
          <ZoomOut size={13} />
        </button>
        <span className="text-xs mono text-[var(--op-40)] w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => clamp(z + 0.15, MIN_ZOOM, 2))} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
          <ZoomIn size={13} />
        </button>
        <button onClick={resetView} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]" title="Сбросить вид (авто-центровка)">
          <Maximize2 size={13} />
        </button>
        <button
          onClick={() => updateUiSettings({ dialoguesGridEnabled: !dialoguesGridEnabled })}
          title={dialoguesGridEnabled ? "Сетка: вкл" : "Сетка: выкл"}
          className={`w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] ${dialoguesGridEnabled ? "text-accent bg-accent/10" : ""}`}
        >
          <Grid2X2 size={13} />
        </button>
      </div>

      <div
        data-tour="dialogues-canvas"
        className="flex-1 relative overflow-hidden cursor-crosshair select-none"
        onWheel={onWheel}
        onMouseDown={onBgPointerDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Grid is pinned to the VIEWPORT (this wrapper), not to the 4000x3000 world-space
            stage below — a DOM layer that size with a small tiled background can hit GPU
            texture/rasterization limits on some machines (observed on Windows), which is what
            made the grid only paint over a small patch instead of the whole window. Sized to
            just the visible viewport instead, with the pattern's own backgroundSize/Position
            driven by zoom/pan, it always covers the full window and never needs a huge layer. */}
        {dialoguesGridEnabled && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--op-8) 1px, transparent 1px), linear-gradient(to bottom, var(--op-8) 1px, transparent 1px)",
              backgroundSize: `${DLG_GRID_SIZE * zoom}px ${DLG_GRID_SIZE * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />
        )}
        <div
          ref={stageRef}
          style={{ position: "absolute", left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          <svg width={CANVAS_W} height={CANVAS_H} className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
            <defs>
              {/* One arrowhead marker per connector "port" color, matching the actual DOM dot
                  each edge starts from exactly (see the bg-teal-400/bg-orange-400/bg-amber-400
                  port handles in DialogueNodeCard.tsx) — previously every edge used the same
                  purple accent arrowhead regardless of its own line color, which is what made
                  connections look mismatched/inconsistent at the point they actually land. */}
              <marker id="dlg-arrow-cont" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L8,4 L0,8 Z" fill={DLG_PORT_COLORS.cont} />
              </marker>
              <marker id="dlg-arrow-choice" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L8,4 L0,8 Z" fill={DLG_PORT_COLORS.choice} />
              </marker>
              <marker id="dlg-arrow-else" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0,0 L8,4 L0,8 Z" fill={DLG_PORT_COLORS.else} />
              </marker>
            </defs>
            {dialogue.nodes.map((n) => {
              const lines: React.ReactNode[] = [];
              if (n.choices.length === 0 && n.continueTo) {
                const from = anchorPos.get(`cont:${n.id}`);
                const box = anchorPos.get(`box:${n.continueTo}`);
                if (from && box) {
                  const to = boxEdgePoint(from, box);
                  lines.push(
                    <g key={`cont-${n.id}`}>
                      <path d={curvePath(from, to)} fill="none" stroke={DLG_PORT_COLORS.cont} strokeWidth={1.6} markerEnd="url(#dlg-arrow-cont)" />
                      <circle cx={to.x} cy={to.y} r={DLG_PORT_RADII.cont} fill={DLG_PORT_COLORS.cont} />
                    </g>
                  );
                }
              }
              n.choices.forEach((c) => {
                if (!c.targetNodeId) return;
                const from = anchorPos.get(`choice:${c.id}`);
                const box = anchorPos.get(`box:${c.targetNodeId}`);
                if (!from || !box) return;
                const to = boxEdgePoint(from, box);
                lines.push(
                  <g key={`choice-${c.id}`}>
                    <path d={curvePath(from, to)} fill="none" stroke={DLG_PORT_COLORS.choice} strokeWidth={1.6} markerEnd="url(#dlg-arrow-choice)" />
                    <circle cx={to.x} cy={to.y} r={DLG_PORT_RADII.choice} fill={DLG_PORT_COLORS.choice} />
                  </g>
                );
              });
              n.lines.forEach((l) => {
                if (!l.condition || !l.elseNodeId) return;
                const from = anchorPos.get(`else:${l.id}`);
                const box = anchorPos.get(`box:${l.elseNodeId}`);
                if (!from || !box) return;
                const to = boxEdgePoint(from, box);
                lines.push(
                  <g key={`else-${l.id}`}>
                    <path d={curvePath(from, to)} fill="none" stroke={DLG_PORT_COLORS.else} strokeWidth={1.6} strokeDasharray="4 3" markerEnd="url(#dlg-arrow-else)" />
                    <circle cx={to.x} cy={to.y} r={DLG_PORT_RADII.else} fill={DLG_PORT_COLORS.else} />
                  </g>
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
            const selected = selectedIds.has(n.id);
            return (
              <div
                key={n.id}
                ref={(el) => registerAnchor(`box:${n.id}`, el)}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  width: NODE_WIDTH,
                  outline: selected ? "2px solid var(--accent, #8b7bff)" : "none",
                  outlineOffset: 3,
                  borderRadius: 10,
                }}
                data-dialogue-node-id={n.id}
              >
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
                {rippleNodeId === n.id && (
                  <div className="absolute -inset-1.5 pointer-events-none rounded-lg">
                    <div className="quest-focus-ripple absolute inset-0 rounded-lg border-2" style={{ borderColor: "var(--accent, #8b7bff)" }} />
                    <div className="quest-focus-ripple-2 absolute inset-0 rounded-lg border-2" style={{ borderColor: "var(--accent, #8b7bff)" }} />
                  </div>
                )}
              </div>
            );
          })}

          {marquee && (
            <div
              className="absolute border border-accent/70 bg-accent/10 pointer-events-none"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}
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

      {colorStylesOpen && <ColorStylesManagerModal onClose={() => setColorStylesOpen(false)} />}
      {testOpen && <TestPlayModal dialogue={dialogue} onClose={() => setTestOpen(false)} />}
      {gmlOpen && <GmlExportModal dialogue={dialogue} entries={entries} colorStyles={colorStyles} onClose={() => setGmlOpen(false)} />}
      {deleteConfirm && (
        <DeleteConfirmModal
          count={deleteConfirm.ids.length}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={(suppressLocal, suppressGlobal) => {
            deleteDialogueNodes(dialogue.id, deleteConfirm.ids);
            setSelectedIds(new Set());
            if (suppressLocal) updateDialogue(dialogue.id, { skipDeleteConfirm: true });
            if (suppressGlobal) updateUiSettings({ skipDeleteConfirmGlobal: true });
            setDeleteConfirm(null);
          }}
        />
      )}
    </div>
  );
}
