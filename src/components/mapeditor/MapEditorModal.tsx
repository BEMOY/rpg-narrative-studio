import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Paintbrush,
  Eraser,
  Square,
  Hand,
  PaintBucket,
  MousePointer2,
  Pencil,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Share2,
  FileDown,
  FileUp,
  Search,
  Image as ImageIcon,
  ChevronUp,
  ChevronDown,
  Grid3x3,
  Settings2,
} from "lucide-react";
import type {
  Category,
  Entry,
  MapData,
  MapFreehandLayer,
  MapImageInstance,
  MapImageLayer,
  MapLayer,
  MapObjectInstance,
  MapObjectLayer,
  MapTileLayer,
  MapZone,
  MapZoneLayer,
} from "../../types/database";
import { CAT_COLOR, CAT_LABEL, CAT_ORDER } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { resizeImageFile } from "../../lib/image";
import { usePasteImage } from "../../lib/usePasteImage";
import { ResizablePanel } from "../common/ResizablePanel";
import { PortalMenu } from "../common/PortalMenu";
import {
  cellKey,
  createDefaultMap,
  createFreehandLayer,
  createImageLayer,
  nextId,
  normalizeMap,
  parseCellKey,
  ZONE_TAGS,
} from "../../lib/mapDefaults";

type Tool = "paint" | "erase" | "fill" | "zone" | "select" | "draw" | "pan";
type Selection = { kind: "object"; id: string } | { kind: "zone"; id: string } | { kind: "image"; id: string } | null;
type Rect = { x: number; y: number; w: number; h: number };

const MAX_HISTORY = 50;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function cloneMap(m: MapData): MapData {
  return JSON.parse(JSON.stringify(m));
}
function isTile(l: MapLayer): l is MapTileLayer {
  return l.kind === "tile";
}
function isObject(l: MapLayer): l is MapObjectLayer {
  return l.kind === "object";
}
function isZone(l: MapLayer): l is MapZoneLayer {
  return l.kind === "zone";
}
function isFreehand(l: MapLayer): l is MapFreehandLayer {
  return l.kind === "freehand";
}
function isImageLayer(l: MapLayer): l is MapImageLayer {
  return l.kind === "image";
}

const LAYER_KIND_LABEL: Record<MapLayer["kind"], string> = {
  tile: "Тайлы",
  object: "Объекты",
  zone: "Зоны",
  freehand: "Рисование",
  image: "Картинки",
};

export function MapEditorModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const entries = useProjectStore((s) => s.project.entries);
  const updateEntry = useProjectStore((s) => s.updateEntry);

  const [map, setMapState] = useState<MapData>(() => (entry.map ? normalizeMap(cloneMap(entry.map)) : createDefaultMap()));
  const pastRef = useRef<MapData[]>([]);
  const futureRef = useRef<MapData[]>([]);
  const [, forceRender] = useState(0);
  const firstSync = useRef(true);

  const [tool, setTool] = useState<Tool>("paint");
  const [activeLayerId, setActiveLayerId] = useState<string>(() => map.layers.find(isTile)?.id ?? map.layers[0]?.id ?? "");
  const [paintColor, setPaintColor] = useState(map.palette[0]?.color ?? "#6b7280");
  const [paintLabel, setPaintLabel] = useState(map.palette[0]?.label ?? "Тайл");
  const [zoneTag, setZoneTag] = useState(ZONE_TAGS[0]);
  const [brushSize, setBrushSize] = useState(6);
  const [brushColor, setBrushColor] = useState("#e8e9ee");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [selection, setSelection] = useState<Selection>(null);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [moveOffset, setMoveOffset] = useState({ dx: 0, dy: 0 });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [gridVisible, setGridVisible] = useState(true);
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Free-typing drafts for the canvas-size/grid-size inputs — clamping on every
  // keystroke made it impossible to type e.g. "20" when the minimum is 8, since
  // typing "2" alone would immediately get clamped up to 8 before "0" could follow.
  // Clamping only happens once the value is committed (blur / Enter).
  const [widthDraft, setWidthDraft] = useState(String(map.width));
  const [heightDraft, setHeightDraft] = useState(String(map.height));
  const [gridSizeDraft, setGridSizeDraft] = useState(String(map.gridSize));
  const [addColorDraft, setAddColorDraft] = useState({ color: "#888888", label: "" });
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [addLayerMenuOpen, setAddLayerMenuOpen] = useState(false);
  const addLayerBtnRef = useRef<HTMLButtonElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const imageDragRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const imageResizeRef = useRef<{ id: string; startClientX: number; startClientY: number; startW: number; startH: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const freehandCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingStrokeRef = useRef(false);

  const paintingRef = useRef(false);
  const paintModeRef = useRef<"paint" | "erase">("paint");
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const zoneDrawRef = useRef<{ x: number; y: number } | null>(null);
  const [draftZoneRect, setDraftZoneRect] = useState<Rect | null>(null);
  const selectDrawRef = useRef<{ mode: "new" | "move"; startCell: { x: number; y: number }; origRect?: Rect } | null>(null);
  const objectDragRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(
    null
  );
  const zoneDragRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(
    null
  );

  // Re-sync the size drafts from the real map state whenever the settings panel is
  // (re)opened, so stale typed-but-not-committed text doesn't linger between opens.
  useEffect(() => {
    if (settingsOpen) {
      setWidthDraft(String(map.width));
      setHeightDraft(String(map.height));
      setGridSizeDraft(String(map.gridSize));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  // Autosave into the project — same "no Save button" convention as everywhere else in the Studio.
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    updateEntry(entry.id, { map });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  const setMap = (updater: (prev: MapData) => MapData, snapshot = true) => {
    setMapState((prev) => {
      if (snapshot) {
        pastRef.current.push(cloneMap(prev));
        if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
        futureRef.current = [];
      }
      return updater(prev);
    });
  };
  const snapshot = () => {
    pastRef.current.push(cloneMap(map));
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
  };

  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    setMapState((cur) => {
      futureRef.current.push(cloneMap(cur));
      return prev;
    });
    forceRender((n) => n + 1);
  };
  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    setMapState((cur) => {
      pastRef.current.push(cloneMap(cur));
      return next;
    });
    forceRender((n) => n + 1);
  };

  // ---- layer helpers ----
  const findLayer = (id: string) => map.layers.find((l) => l.id === id);
  const effectiveTileLayer = (): MapTileLayer | undefined => {
    const active = findLayer(activeLayerId);
    if (active && isTile(active)) return active;
    return map.layers.find(isTile);
  };
  const effectiveObjectLayer = (): MapObjectLayer | undefined => {
    const active = findLayer(activeLayerId);
    if (active && isObject(active)) return active;
    return map.layers.find(isObject);
  };
  const effectiveZoneLayer = (): MapZoneLayer | undefined => {
    const active = findLayer(activeLayerId);
    if (active && isZone(active)) return active;
    return map.layers.find(isZone);
  };
  const effectiveFreehandLayer = (): MapFreehandLayer | undefined => {
    const active = findLayer(activeLayerId);
    if (active && isFreehand(active)) return active;
    return map.layers.find(isFreehand);
  };
  const effectiveImageLayer = (): MapImageLayer | undefined => {
    const active = findLayer(activeLayerId);
    if (active && isImageLayer(active)) return active;
    return map.layers.find(isImageLayer);
  };

  const addLayer = (kind: MapLayer["kind"]) => {
    setMap((prev) => {
      const next = cloneMap(prev);
      const count = next.layers.filter((l) => l.kind === kind).length + 1;
      let layer: MapLayer;
      if (kind === "tile") layer = { id: nextId("layer"), kind: "tile", name: `Тайлы ${count}`, visible: true, locked: false, opacity: 1, cells: {} };
      else if (kind === "object")
        layer = { id: nextId("layer"), kind: "object", name: `Объекты ${count}`, visible: true, locked: false, opacity: 1, objects: [] };
      else if (kind === "zone")
        layer = { id: nextId("layer"), kind: "zone", name: `Зоны ${count}`, visible: true, locked: false, opacity: 0.5, zones: [] };
      else if (kind === "freehand") layer = { ...createFreehandLayer(), name: `Рисование ${count}` };
      else layer = { ...createImageLayer(), name: `Картинки ${count}` };
      next.layers.push(layer);
      setActiveLayerId(layer.id);
      return next;
    });
  };

  const removeLayer = (id: string) => {
    setMap((prev) => {
      const next = cloneMap(prev);
      next.layers = next.layers.filter((l) => l.id !== id);
      return next;
    });
    if (activeLayerId === id) setActiveLayerId(map.layers.find((l) => l.id !== id)?.id ?? "");
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    setMap((prev) => {
      const next = cloneMap(prev);
      const idx = next.layers.findIndex((l) => l.id === id);
      const swapWith = idx + dir;
      if (idx < 0 || swapWith < 0 || swapWith >= next.layers.length) return prev;
      const [item] = next.layers.splice(idx, 1);
      next.layers.splice(swapWith, 0, item);
      return next;
    });
  };

  const updateLayer = (id: string, patch: Record<string, unknown>) => {
    setMap((prev) => {
      const next = cloneMap(prev);
      const layer = next.layers.find((l) => l.id === id);
      if (layer) Object.assign(layer, patch);
      return next;
    }, false);
  };

  const commitRename = () => {
    if (renamingLayerId) updateLayer(renamingLayerId, { name: renameDraft.trim() || "Слой" });
    setRenamingLayerId(null);
  };

  // ---- palette ----
  const addPaletteColor = () => {
    if (!addColorDraft.label.trim()) return;
    setMap((prev) => {
      const next = cloneMap(prev);
      next.palette.push({ color: addColorDraft.color, label: addColorDraft.label.trim() });
      return next;
    }, false);
    setAddColorDraft({ color: "#888888", label: "" });
  };
  const removePaletteColor = (color: string) => {
    setMap((prev) => {
      const next = cloneMap(prev);
      next.palette = next.palette.filter((p) => p.color !== color);
      return next;
    }, false);
  };

  // ---- canvas settings ----
  const resizeCanvas = (patch: Partial<Pick<MapData, "width" | "height" | "gridSize">>) => {
    setMap((prev) => ({ ...cloneMap(prev), ...patch }), false);
  };

  const commitWidth = () => {
    const n = clamp(parseInt(widthDraft, 10) || 1, 1, 200);
    resizeCanvas({ width: n });
    setWidthDraft(String(n));
  };
  const commitHeight = () => {
    const n = clamp(parseInt(heightDraft, 10) || 1, 1, 200);
    resizeCanvas({ height: n });
    setHeightDraft(String(n));
  };
  const commitGridSize = () => {
    const n = clamp(parseInt(gridSizeDraft, 10) || 8, 8, 128);
    resizeCanvas({ gridSize: n });
    setGridSizeDraft(String(n));
  };

  // ---- image layer ----
  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    const layer = effectiveImageLayer();
    if (!layer || layer.locked) return;
    setImageUploadBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      const w = Math.min(6, map.width / 2);
      const h = w;
      const inst: MapImageInstance = {
        id: nextId("img"),
        src: dataUrl,
        x: Math.max(0, map.width / 2 - w / 2),
        y: Math.max(0, map.height / 2 - h / 2),
        w,
        h,
      };
      snapshot();
      setMapState((prev) => {
        const next = cloneMap(prev);
        const l = next.layers.find((x) => x.id === layer.id);
        if (l && isImageLayer(l)) l.images.push(inst);
        return next;
      });
      setSelection({ kind: "image", id: inst.id });
    } catch {
      alert("Не удалось загрузить картинку — попробуйте другой файл.");
    } finally {
      setImageUploadBusy(false);
    }
  };

  // Paste-from-clipboard while the map is open, regardless of which layer is active —
  // creates a "Картинки" layer on the fly if the map doesn't have one yet, so the user
  // can just Ctrl/Cmd+V without first adding a layer manually.
  const pasteImageIntoMap = async (file: File | undefined) => {
    if (!file) return;
    setImageUploadBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      const existing = effectiveImageLayer();
      const w = Math.min(6, map.width / 2);
      const h = w;
      const inst: MapImageInstance = {
        id: nextId("img"),
        src: dataUrl,
        x: Math.max(0, map.width / 2 - w / 2),
        y: Math.max(0, map.height / 2 - h / 2),
        w,
        h,
      };
      let targetLayerId: string;
      if (existing && !existing.locked) {
        targetLayerId = existing.id;
        snapshot();
        setMapState((prev) => {
          const next = cloneMap(prev);
          const l = next.layers.find((x) => x.id === targetLayerId);
          if (l && isImageLayer(l)) l.images.push(inst);
          return next;
        });
      } else {
        const count = map.layers.filter((l) => l.kind === "image").length + 1;
        const newLayer: MapImageLayer = { ...createImageLayer(), name: `Картинки ${count}`, images: [inst] };
        targetLayerId = newLayer.id;
        snapshot();
        setMapState((prev) => {
          const next = cloneMap(prev);
          next.layers.push(newLayer);
          return next;
        });
      }
      setActiveLayerId(targetLayerId);
      setSelection({ kind: "image", id: inst.id });
    } catch {
      alert("Не удалось вставить картинку из буфера обмена.");
    } finally {
      setImageUploadBusy(false);
    }
  };

  usePasteImage((file) => pasteImageIntoMap(file));

  // ---- geometry ----
  const getCell = (e: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const localX = (e.clientX - rect.left) / zoom;
    const localY = (e.clientY - rect.top) / zoom;
    return { x: Math.floor(localX / map.gridSize), y: Math.floor(localY / map.gridSize) };
  };
  const getRawPoint = (e: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  const paintCell = (x: number, y: number, mode: "paint" | "erase") => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    const layer = effectiveTileLayer();
    if (!layer || layer.locked) return;
    setMap((prev) => {
      const next = cloneMap(prev);
      const l = next.layers.find((l) => l.id === layer.id);
      if (!l || !isTile(l)) return prev;
      const key = cellKey(x, y);
      if (mode === "erase") delete l.cells[key];
      else l.cells[key] = { color: paintColor, label: paintLabel };
      return next;
    }, false);
  };

  const floodFill = (startX: number, startY: number) => {
    const layer = effectiveTileLayer();
    if (!layer || layer.locked) return;
    snapshot();
    setMapState((prev) => {
      const next = cloneMap(prev);
      const l = next.layers.find((x) => x.id === layer.id);
      if (!l || !isTile(l)) return prev;
      const startKey = cellKey(startX, startY);
      const startVal = l.cells[startKey];
      if (startVal?.color === paintColor) return next;
      const matches = (v: typeof startVal) =>
        (v === undefined && startVal === undefined) || (v !== undefined && startVal !== undefined && v.color === startVal.color);
      const visited = new Set<string>();
      const stack: [number, number][] = [[startX, startY]];
      let guard = 0;
      while (stack.length && guard < next.width * next.height * 4) {
        guard++;
        const [x, y] = stack.pop()!;
        if (x < 0 || y < 0 || x >= next.width || y >= next.height) continue;
        const k = cellKey(x, y);
        if (visited.has(k)) continue;
        visited.add(k);
        if (!matches(l.cells[k])) continue;
        l.cells[k] = { color: paintColor, label: paintLabel };
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return next;
    });
  };

  // ---- freehand drawing ----
  useEffect(() => {
    const layer = effectiveFreehandLayer();
    const canvas = freehandCanvasRef.current;
    if (!canvas || !layer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (layer.bitmap) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = layer.bitmap;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayerId, tool]);

  const commitFreehandStroke = () => {
    const canvas = freehandCanvasRef.current;
    const layer = effectiveFreehandLayer();
    if (!canvas || !layer) return;
    const dataUrl = canvas.toDataURL("image/png");
    setMap((prev) => {
      const next = cloneMap(prev);
      const l = next.layers.find((x) => x.id === layer.id);
      if (l && isFreehand(l)) l.bitmap = dataUrl;
      return next;
    }, false);
  };

  const onFreehandPointerDown = (e: React.MouseEvent) => {
    const layer = effectiveFreehandLayer();
    const canvas = freehandCanvasRef.current;
    if (!layer || !canvas || layer.locked) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    snapshot();
    drawingStrokeRef.current = true;
    const pt = getRawPoint(e);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    if (tool === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushColor;
    }
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x + 0.01, pt.y + 0.01);
    ctx.stroke();
  };
  const onFreehandPointerMove = (e: React.MouseEvent) => {
    if (!drawingStrokeRef.current) return;
    const canvas = freehandCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pt = getRawPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };
  const onFreehandPointerUp = () => {
    if (!drawingStrokeRef.current) return;
    drawingStrokeRef.current = false;
    commitFreehandStroke();
  };

  // ---- stage pointer handling ----
  const onStageMouseDown = (e: React.MouseEvent) => {
    // Middle-mouse-button drag pans the canvas no matter which tool is active — matches the
    // convention in most other creative apps (Photoshop, Figma, Blender…) — without forcing
    // the user to switch away from whatever tool (paint/select/zone/etc.) they're using.
    if (e.button === 1) {
      e.preventDefault();
      panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    if (tool === "pan") {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    const cell = getCell(e);

    if (tool === "paint" || (tool === "erase" && effectiveTileLayer())) {
      const active = findLayer(activeLayerId);
      if (active && isFreehand(active)) return; // freehand handled by its own canvas
      snapshot();
      paintingRef.current = true;
      paintModeRef.current = tool === "erase" ? "erase" : "paint";
      paintCell(cell.x, cell.y, paintModeRef.current);
    } else if (tool === "fill") {
      floodFill(cell.x, cell.y);
    } else if (tool === "zone") {
      zoneDrawRef.current = cell;
      setDraftZoneRect({ x: cell.x, y: cell.y, w: 1, h: 1 });
    } else if (tool === "select") {
      if (selectionRect && cell.x >= selectionRect.x && cell.x < selectionRect.x + selectionRect.w && cell.y >= selectionRect.y && cell.y < selectionRect.y + selectionRect.h) {
        selectDrawRef.current = { mode: "move", startCell: cell, origRect: selectionRect };
      } else {
        selectDrawRef.current = { mode: "new", startCell: cell };
        setSelectionRect({ x: cell.x, y: cell.y, w: 1, h: 1 });
      }
    }
    setSelection(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (panDragRef.current) {
        const d = panDragRef.current;
        setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) });
        return;
      }
      if (paintingRef.current) {
        const cell = getCell(e);
        paintCell(cell.x, cell.y, paintModeRef.current);
        return;
      }
      if (zoneDrawRef.current) {
        const start = zoneDrawRef.current;
        const cur = getCell(e);
        setDraftZoneRect({
          x: Math.min(start.x, cur.x),
          y: Math.min(start.y, cur.y),
          w: Math.abs(cur.x - start.x) + 1,
          h: Math.abs(cur.y - start.y) + 1,
        });
        return;
      }
      if (selectDrawRef.current) {
        const d = selectDrawRef.current;
        const cur = getCell(e);
        if (d.mode === "new") {
          setSelectionRect({
            x: Math.min(d.startCell.x, cur.x),
            y: Math.min(d.startCell.y, cur.y),
            w: Math.abs(cur.x - d.startCell.x) + 1,
            h: Math.abs(cur.y - d.startCell.y) + 1,
          });
        } else if (d.origRect) {
          setMoveOffset({ dx: cur.x - d.startCell.x, dy: cur.y - d.startCell.y });
        }
        return;
      }
      if (objectDragRef.current) {
        const d = objectDragRef.current;
        const dx = Math.round((e.clientX - d.startClientX) / (map.gridSize * zoom));
        const dy = Math.round((e.clientY - d.startClientY) / (map.gridSize * zoom));
        const nx = clamp(d.startX + dx, 0, map.width - 1);
        const ny = clamp(d.startY + dy, 0, map.height - 1);
        setMap((prev) => {
          const next = cloneMap(prev);
          const l = next.layers.find((x) => x.id === effectiveObjectLayer()?.id);
          const obj = l && isObject(l) ? l.objects.find((o) => o.id === d.id) : undefined;
          if (obj) {
            obj.x = nx;
            obj.y = ny;
          }
          return next;
        }, false);
        return;
      }
      if (zoneDragRef.current) {
        const d = zoneDragRef.current;
        const dx = Math.round((e.clientX - d.startClientX) / (map.gridSize * zoom));
        const dy = Math.round((e.clientY - d.startClientY) / (map.gridSize * zoom));
        setMap((prev) => {
          const next = cloneMap(prev);
          const l = next.layers.find((x) => x.id === effectiveZoneLayer()?.id);
          const z = l && isZone(l) ? l.zones.find((z) => z.id === d.id) : undefined;
          if (z) {
            z.x = clamp(d.startX + dx, 0, next.width - z.w);
            z.y = clamp(d.startY + dy, 0, next.height - z.h);
          }
          return next;
        }, false);
        return;
      }
      if (imageDragRef.current) {
        const d = imageDragRef.current;
        const dx = (e.clientX - d.startClientX) / (map.gridSize * zoom);
        const dy = (e.clientY - d.startClientY) / (map.gridSize * zoom);
        setMap((prev) => {
          const next = cloneMap(prev);
          const l = next.layers.find((x) => x.id === effectiveImageLayer()?.id);
          const img = l && isImageLayer(l) ? l.images.find((im) => im.id === d.id) : undefined;
          if (img) {
            img.x = d.startX + dx;
            img.y = d.startY + dy;
          }
          return next;
        }, false);
        return;
      }
      if (imageResizeRef.current) {
        const d = imageResizeRef.current;
        const dw = (e.clientX - d.startClientX) / (map.gridSize * zoom);
        const dh = (e.clientY - d.startClientY) / (map.gridSize * zoom);
        setMap((prev) => {
          const next = cloneMap(prev);
          const l = next.layers.find((x) => x.id === effectiveImageLayer()?.id);
          const img = l && isImageLayer(l) ? l.images.find((im) => im.id === d.id) : undefined;
          if (img) {
            img.w = Math.max(0.3, d.startW + dw);
            img.h = Math.max(0.3, d.startH + dh);
          }
          return next;
        }, false);
      }
    };
    const onUp = () => {
      panDragRef.current = null;
      paintingRef.current = false;
      objectDragRef.current = null;
      zoneDragRef.current = null;
      imageDragRef.current = null;
      imageResizeRef.current = null;

      if (zoneDrawRef.current && draftZoneRect) {
        const tag = zoneTag;
        const layer = effectiveZoneLayer();
        if (layer && !layer.locked) {
          const newZone: MapZone = {
            id: nextId("zone"),
            label: tag.label,
            tag: tag.tag,
            color: tag.color,
            x: draftZoneRect.x,
            y: draftZoneRect.y,
            w: draftZoneRect.w,
            h: draftZoneRect.h,
          };
          snapshot();
          setMapState((prev) => {
            const next = cloneMap(prev);
            const l = next.layers.find((x) => x.id === layer.id);
            if (l && isZone(l)) l.zones.push(newZone);
            return next;
          });
          setSelection({ kind: "zone", id: newZone.id });
        }
      }
      zoneDrawRef.current = null;
      setDraftZoneRect(null);

      if (selectDrawRef.current?.mode === "move" && selectDrawRef.current.origRect && (moveOffset.dx !== 0 || moveOffset.dy !== 0)) {
        const orig = selectDrawRef.current.origRect;
        const layer = effectiveTileLayer();
        if (layer && !layer.locked) {
          snapshot();
          setMapState((prev) => {
            const next = cloneMap(prev);
            const l = next.layers.find((x) => x.id === layer.id);
            if (!l || !isTile(l)) return prev;
            const moved: Record<string, { color: string; label?: string }> = {};
            for (let yy = orig.y; yy < orig.y + orig.h; yy++) {
              for (let xx = orig.x; xx < orig.x + orig.w; xx++) {
                const k = cellKey(xx, yy);
                if (l.cells[k]) {
                  moved[cellKey(xx + moveOffset.dx, yy + moveOffset.dy)] = l.cells[k];
                  delete l.cells[k];
                }
              }
            }
            Object.assign(l.cells, moved);
            return next;
          });
          setSelectionRect({ x: orig.x + moveOffset.dx, y: orig.y + moveOffset.dy, w: orig.w, h: orig.h });
        }
      }
      selectDrawRef.current = null;
      setMoveOffset({ dx: 0, dy: 0 });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, zoom, pan, draftZoneRect, zoneTag, moveOffset, selectionRect]);

  // Delete/backspace clears current selection (cells, object or zone)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      if (selectionRect) {
        const layer = effectiveTileLayer();
        if (layer && !layer.locked) {
          snapshot();
          setMapState((prev) => {
            const next = cloneMap(prev);
            const l = next.layers.find((x) => x.id === layer.id);
            if (!l || !isTile(l)) return prev;
            for (let yy = selectionRect.y; yy < selectionRect.y + selectionRect.h; yy++) {
              for (let xx = selectionRect.x; xx < selectionRect.x + selectionRect.w; xx++) delete l.cells[cellKey(xx, yy)];
            }
            return next;
          });
        }
      } else if (selection) {
        deleteSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, selectionRect, map]);

  useEffect(() => {
    if (tool !== "select") setSelectionRect(null);
  }, [tool]);

  const onStageDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("text/entry-id")) e.preventDefault();
  };
  const onStageDrop = (e: React.DragEvent) => {
    const entryId = e.dataTransfer.getData("text/entry-id");
    if (!entryId) return;
    e.preventDefault();
    const layer = effectiveObjectLayer();
    if (!layer || layer.locked) return;
    const cell = getCell(e);
    snapshot();
    const inst: MapObjectInstance = { id: nextId("obj"), entryId, x: cell.x, y: cell.y, properties: [] };
    setMapState((prev) => {
      const next = cloneMap(prev);
      const l = next.layers.find((x) => x.id === layer.id);
      if (l && isObject(l)) l.objects.push(inst);
      return next;
    });
    setSelection({ kind: "object", id: inst.id });
  };

  const deleteSelection = () => {
    if (!selection) return;
    setMap((prev) => {
      const next = cloneMap(prev);
      if (selection.kind === "object") {
        const l = next.layers.find(isObject);
        if (l) l.objects = l.objects.filter((o) => o.id !== selection.id);
      } else if (selection.kind === "zone") {
        const l = next.layers.find(isZone);
        if (l) l.zones = l.zones.filter((z) => z.id !== selection.id);
      } else if (selection.kind === "image") {
        const l = next.layers.find(isImageLayer);
        if (l) l.images = l.images.filter((im) => im.id !== selection.id);
      }
      return next;
    });
    setSelection(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entry.id}_map.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    setExportMenuOpen(false);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.layers) || typeof parsed.width !== "number" || typeof parsed.height !== "number") {
        throw new Error("shape");
      }
      if (!confirm("Импорт заменит текущую карту этим файлом. Продолжить? (можно будет отменить через Undo)")) return;
      const imported = normalizeMap(parsed as MapData);
      snapshot();
      setMapState(imported);
      setActiveLayerId(imported.layers[0]?.id ?? "");
      setSelection(null);
      setSelectionRect(null);
    } catch {
      alert("Не удалось прочитать файл — это должен быть JSON, экспортированный из этого редактора карт.");
    }
  };

  const objLayerForRender = map.layers.find(isObject);
  const selectedObject = selection?.kind === "object" ? objLayerForRender?.objects.find((o) => o.id === selection.id) : undefined;
  const znLayerForSel = map.layers.find(isZone);
  const selectedZone = selection?.kind === "zone" ? znLayerForSel?.zones.find((z) => z.id === selection.id) : undefined;
  const imgLayerForSel = map.layers.find(isImageLayer);
  const selectedImage = selection?.kind === "image" ? imgLayerForSel?.images.find((im) => im.id === selection.id) : undefined;

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = categoryFilter === "all" ? entries : entries.filter((e) => e.category === categoryFilter);
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    return list.slice(0, 80);
  }, [entries, search, categoryFilter]);

  const activeLayer = findLayer(activeLayerId);
  const activeIsFreehand = activeLayer && isFreehand(activeLayer);
  const canvasCursor = tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
      <div className="glass rounded-lg w-full h-full max-w-[1500px] flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] shrink-0 flex-wrap">
          <div className="text-sm font-medium px-1">Редактор карты — {entry.name}</div>
          <div className="flex-1" />
          <button onClick={undo} title="Отменить" className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)]">
            <Undo2 size={15} />
          </button>
          <button onClick={redo} title="Повторить" className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)]">
            <Redo2 size={15} />
          </button>
          <div className="w-px h-5 bg-[var(--op-10)] mx-1" />
          <button
            onClick={() => setGridVisible((v) => !v)}
            title="Показывать сетку"
            className={`w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] ${gridVisible ? "text-accent" : "text-[var(--op-40)]"}`}
          >
            <Grid3x3 size={14} />
          </button>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            title="Настройки карты"
            className={`w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] ${settingsOpen ? "text-accent" : "text-[var(--op-40)]"}`}
          >
            <Settings2 size={14} />
          </button>
          <div className="w-px h-5 bg-[var(--op-10)] mx-1" />
          <button
            onClick={() => setZoom((z) => clamp(z - 0.15, 0.3, 3))}
            className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)]"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs mono text-[var(--op-40)] w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => clamp(z + 0.15, 0.3, 3))}
            className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)]"
          >
            <ZoomIn size={14} />
          </button>
          <div className="w-px h-5 bg-[var(--op-10)] mx-1" />
          <div className="relative">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => importJson(e.target.files?.[0])}
            />
            <button
              ref={exportBtnRef}
              onClick={() => setExportMenuOpen((v) => !v)}
              title="Экспорт / импорт карты"
              className={`w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] ${exportMenuOpen ? "text-accent" : "text-[var(--op-50)]"}`}
            >
              <Share2 size={15} />
            </button>
            <PortalMenu anchorRef={exportBtnRef} open={exportMenuOpen} onClose={() => setExportMenuOpen(false)}>
              <div className="w-48 p-1.5 space-y-0.5">
                <button
                  onClick={exportJson}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-[var(--op-80)] hover:bg-[var(--op-7)]"
                >
                  <FileDown size={14} /> Экспорт JSON
                </button>
                <button
                  onClick={() => {
                    setExportMenuOpen(false);
                    importInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-[var(--op-80)] hover:bg-[var(--op-7)]"
                >
                  <FileUp size={14} /> Импорт JSON
                </button>
              </div>
            </PortalMenu>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] ml-1">
            <X size={16} />
          </button>
        </div>

        {settingsOpen && (
          <div className="flex items-center gap-4 px-3 py-2 border-b border-[var(--op-10)] flex-wrap text-xs bg-[var(--op-5)]">
            <label className="flex items-center gap-1.5">
              Ширина
              <input
                type="number"
                min={1}
                max={200}
                className="input w-16 py-1"
                value={widthDraft}
                onChange={(e) => setWidthDraft(e.target.value)}
                onBlur={commitWidth}
                onKeyDown={(e) => e.key === "Enter" && (commitWidth(), (e.target as HTMLInputElement).blur())}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Высота
              <input
                type="number"
                min={1}
                max={200}
                className="input w-16 py-1"
                value={heightDraft}
                onChange={(e) => setHeightDraft(e.target.value)}
                onBlur={commitHeight}
                onKeyDown={(e) => e.key === "Enter" && (commitHeight(), (e.target as HTMLInputElement).blur())}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Размер клетки, px
              <input
                type="number"
                min={8}
                max={128}
                className="input w-16 py-1"
                value={gridSizeDraft}
                onChange={(e) => setGridSizeDraft(e.target.value)}
                onBlur={commitGridSize}
                onKeyDown={(e) => e.key === "Enter" && (commitGridSize(), (e.target as HTMLInputElement).blur())}
              />
            </label>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Left rail: tools + layers + palette */}
          <ResizablePanel panelKey="map-editor-left" side="left" defaultWidth={250} min={180} max={420}>
          <div className="border-r border-[var(--op-10)] flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b border-[var(--op-10)] shrink-0 overflow-y-auto max-h-[46vh]">
              <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Инструмент</div>
              <div className="grid grid-cols-4 gap-1.5">
                <ToolBtn icon={Paintbrush} active={tool === "paint"} onClick={() => setTool("paint")} title="Кисть" />
                <ToolBtn icon={Eraser} active={tool === "erase"} onClick={() => setTool("erase")} title="Ластик" />
                <ToolBtn icon={PaintBucket} active={tool === "fill"} onClick={() => setTool("fill")} title="Заливка" />
                <ToolBtn icon={Square} active={tool === "zone"} onClick={() => setTool("zone")} title="Зона" />
                <ToolBtn icon={MousePointer2} active={tool === "select"} onClick={() => setTool("select")} title="Выделение" />
                <ToolBtn icon={Pencil} active={tool === "draw"} onClick={() => setTool("draw")} title="Перо (пиксели)" />
                <ToolBtn icon={Hand} active={tool === "pan"} onClick={() => setTool("pan")} title="Панорама" />
              </div>

              {(tool === "paint" || tool === "erase") && !activeIsFreehand && (
                <div className="mt-3">
                  <div className="grid grid-cols-4 gap-1.5">
                    {map.palette.map((t) => (
                      <button
                        key={t.color}
                        title={t.label}
                        onClick={() => {
                          setPaintColor(t.color);
                          setPaintLabel(t.label);
                          setTool("paint");
                        }}
                        className="relative group w-full aspect-square rounded-md border-2"
                        style={{ background: t.color, borderColor: paintColor === t.color ? "var(--op-90)" : "transparent" }}
                      >
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            removePaletteColor(t.color);
                          }}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-black/70 text-white text-[8px] hidden group-hover:grid place-items-center"
                        >
                          ×
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <input
                      type="color"
                      value={addColorDraft.color}
                      onChange={(e) => setAddColorDraft((d) => ({ ...d, color: e.target.value }))}
                      className="w-7 h-7 rounded-md border border-[var(--op-15)] bg-transparent cursor-pointer shrink-0"
                    />
                    <input
                      value={addColorDraft.label}
                      onChange={(e) => setAddColorDraft((d) => ({ ...d, label: e.target.value }))}
                      placeholder="название"
                      className="input text-xs py-1"
                    />
                    <button onClick={addPaletteColor} className="w-7 h-7 shrink-0 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              )}

              {(tool === "draw" || (tool === "erase" && activeIsFreehand)) && (
                <div className="mt-3 space-y-2">
                  <label className="flex items-center justify-between text-xs text-[var(--op-50)]">
                    Толщина
                    <input
                      type="range"
                      min={1}
                      max={40}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-24"
                    />
                  </label>
                  {tool === "draw" && (
                    <label className="flex items-center justify-between text-xs text-[var(--op-50)]">
                      Цвет пера
                      <input
                        type="color"
                        value={brushColor}
                        onChange={(e) => setBrushColor(e.target.value)}
                        className="w-8 h-6 rounded-md border border-[var(--op-15)] bg-transparent cursor-pointer"
                      />
                    </label>
                  )}
                  {!activeIsFreehand && (
                    <div className="text-[10px] text-[var(--op-30)]">Выберите или создайте слой «Рисование» ниже.</div>
                  )}
                </div>
              )}

              {tool === "zone" && (
                <div className="mt-3 space-y-1">
                  {ZONE_TAGS.map((t) => (
                    <button
                      key={t.tag}
                      onClick={() => setZoneTag(t)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${
                        zoneTag.tag === t.tag ? "bg-[var(--op-10)] text-[var(--op-90)]" : "text-[var(--op-50)] hover:bg-[var(--op-7)]"
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.color }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {tool === "select" && (
                <div className="mt-3 text-[10px] text-[var(--op-35)] leading-relaxed">
                  Потяните по холсту, чтобы выделить область. Потяните изнутри выделения, чтобы передвинуть содержимое. Delete —
                  очистить.
                </div>
              )}

              {activeLayer && isImageLayer(activeLayer) && (
                <div className="mt-3 space-y-2">
                  <input
                    ref={imageUploadRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => uploadImage(e.target.files?.[0])}
                  />
                  <button
                    onClick={() => imageUploadRef.current?.click()}
                    disabled={imageUploadBusy}
                    className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)] disabled:opacity-50"
                  >
                    <ImageIcon size={12} /> {imageUploadBusy ? "Загрузка…" : "Добавить картинку"}
                  </button>
                  <div className="text-[10px] text-[var(--op-30)] leading-relaxed">
                    Картинка не привязана к сетке — тяните за неё, чтобы двигать, и за уголок, чтобы менять размер.
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-b border-[var(--op-10)] shrink-0">
              <div className="flex items-center justify-between mb-2 relative">
                <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Слои</div>
                <button
                  ref={addLayerBtnRef}
                  onClick={() => setAddLayerMenuOpen((v) => !v)}
                  className="opacity-60 hover:opacity-100 text-[var(--op-60)]"
                  title="Добавить слой"
                >
                  <Plus size={13} />
                </button>
                <PortalMenu anchorRef={addLayerBtnRef} open={addLayerMenuOpen} onClose={() => setAddLayerMenuOpen(false)}>
                  <div className="w-40 p-1 space-y-0.5">
                    {(
                      [
                        ["tile", "Слой тайлов"],
                        ["object", "Слой объектов"],
                        ["zone", "Слой зон"],
                        ["freehand", "Слой рисования"],
                        ["image", "Слой картинок"],
                      ] as [MapLayer["kind"], string][]
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        onClick={() => {
                          addLayer(kind);
                          setAddLayerMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-md text-xs text-[var(--op-70)] hover:bg-[var(--op-7)]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </PortalMenu>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {[...map.layers].reverse().map((l, revIdx) => {
                  const idx = map.layers.length - 1 - revIdx;
                  return (
                    <div
                      key={l.id}
                      onClick={() => setActiveLayerId(l.id)}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-xs ${
                        activeLayerId === l.id ? "bg-[var(--op-10)] text-[var(--op-90)]" : "text-[var(--op-50)] hover:bg-[var(--op-7)]"
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayer(l.id, { visible: !l.visible });
                        }}
                        className="opacity-70 hover:opacity-100 shrink-0"
                      >
                        {l.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateLayer(l.id, { locked: !l.locked });
                        }}
                        className="opacity-70 hover:opacity-100 shrink-0"
                      >
                        {l.locked ? <Lock size={11} /> : <Unlock size={11} />}
                      </button>

                      {renamingLayerId === l.id ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => e.key === "Enter" && commitRename()}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-transparent border-b border-[var(--op-30)] outline-none min-w-0"
                        />
                      ) : (
                        <span
                          className="flex-1 truncate"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setRenamingLayerId(l.id);
                            setRenameDraft(l.name);
                          }}
                          title={`${LAYER_KIND_LABEL[l.kind]} · двойной клик — переименовать`}
                        >
                          {l.name}
                        </span>
                      )}

                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.1}
                        value={l.opacity}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateLayer(l.id, { opacity: Number(e.target.value) })}
                        className="w-8 shrink-0"
                        title="Прозрачность"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayer(l.id, 1);
                        }}
                        disabled={idx === map.layers.length - 1}
                        className="opacity-50 hover:opacity-100 disabled:opacity-15 shrink-0"
                        title="Выше"
                      >
                        <ChevronUp size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayer(l.id, -1);
                        }}
                        disabled={idx === 0}
                        className="opacity-50 hover:opacity-100 disabled:opacity-15 shrink-0"
                        title="Ниже"
                      >
                        <ChevronDown size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLayer(l.id);
                        }}
                        className="opacity-40 hover:opacity-100 hover:text-red-300 shrink-0"
                        title="Удалить слой"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
                {map.layers.length === 0 && <div className="text-[10px] text-[var(--op-30)] px-2">Нет слоёв — добавьте выше.</div>}
              </div>
            </div>

            <div className="p-3 flex-1 flex flex-col min-h-0">
              <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Объекты проекта</div>
              <div className="flex flex-wrap gap-1 mb-2">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={`text-[10px] px-2 py-1 rounded-full ${categoryFilter === "all" ? "bg-accent/30 text-[var(--op-90)]" : "bg-[var(--op-6)] text-[var(--op-45)]"}`}
                >
                  Все
                </button>
                {CAT_ORDER.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1"
                    style={{
                      background: categoryFilter === c ? CAT_COLOR[c] + "33" : "var(--op-6)",
                      color: categoryFilter === c ? CAT_COLOR[c] : "var(--op-45)",
                    }}
                  >
                    {CAT_LABEL[c]}
                  </button>
                ))}
              </div>
              <div className="glass rounded-md px-2 py-1.5 flex items-center gap-1.5 text-xs mb-2">
                <Search size={12} className="text-[var(--op-40)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск…"
                  className="bg-transparent outline-none text-[var(--op-80)] placeholder:text-[var(--op-30)] w-full"
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
                {filteredEntries.map((e) => (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData("text/entry-id", e.id)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--op-70)] hover:bg-[var(--op-7)] cursor-grab active:cursor-grabbing"
                    title="Перетащите на карту"
                  >
                    {e.image ? (
                      <img src={e.image} className="w-5 h-5 rounded object-cover shrink-0" alt="" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CAT_COLOR[e.category] }} />
                    )}
                    <span className="truncate">{e.name}</span>
                  </div>
                ))}
                {filteredEntries.length === 0 && <div className="text-xs text-[var(--op-30)] px-2">Ничего не найдено.</div>}
              </div>
            </div>
          </div>
          </ResizablePanel>

          {/* Canvas viewport */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{ background: "var(--op-5)", cursor: canvasCursor }}
            onWheel={(e) => setZoom((z) => clamp(z + (e.deltaY > 0 ? -0.1 : 0.1), 0.3, 3))}
          >
            <div
              ref={stageRef}
              onMouseDown={onStageMouseDown}
              onDragOver={onStageDragOver}
              onDrop={onStageDrop}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: map.width * map.gridSize,
                height: map.height * map.gridSize,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                backgroundColor: "var(--op-6)",
                outline: "1px solid var(--op-15)",
              }}
            >
              {map.layers.map((layer) => {
                if (!layer.visible) return null;

                if (isTile(layer)) {
                  return (
                    <div key={layer.id} style={{ position: "absolute", inset: 0, opacity: layer.opacity, pointerEvents: "none" }}>
                      {Object.entries(layer.cells).map(([key, val]) => {
                        const { x, y } = parseCellKey(key);
                        return (
                          <div
                            key={key}
                            style={{
                              position: "absolute",
                              left: x * map.gridSize,
                              top: y * map.gridSize,
                              width: map.gridSize,
                              height: map.gridSize,
                              background: val.color,
                            }}
                            title={val.label}
                          />
                        );
                      })}
                    </div>
                  );
                }

                if (isZone(layer)) {
                  return (
                    <div key={layer.id} style={{ position: "absolute", inset: 0, opacity: layer.opacity, pointerEvents: "none" }}>
                      {layer.zones.map((z) => (
                        <div
                          key={z.id}
                          style={{
                            position: "absolute",
                            left: z.x * map.gridSize,
                            top: z.y * map.gridSize,
                            width: z.w * map.gridSize,
                            height: z.h * map.gridSize,
                            background: z.color + "26",
                            border: `2px dashed ${z.color}`,
                            pointerEvents: "none",
                          }}
                        >
                          <div
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              setActiveLayerId(layer.id);
                              setSelection({ kind: "zone", id: z.id });
                              zoneDragRef.current = { id: z.id, startClientX: e.clientX, startClientY: e.clientY, startX: z.x, startY: z.y };
                              snapshot();
                            }}
                            style={{
                              pointerEvents: layer.locked ? "none" : "auto",
                              position: "absolute",
                              top: -1,
                              left: -1,
                              background: z.color,
                              color: "#fff",
                              fontSize: 10,
                              padding: "1px 5px",
                              borderRadius: "0 0 4px 0",
                              cursor: "move",
                              outline: selection?.kind === "zone" && selection.id === z.id ? "2px solid white" : "none",
                            }}
                          >
                            {z.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                if (isObject(layer)) {
                  return (
                    <div key={layer.id} style={{ position: "absolute", inset: 0, opacity: layer.opacity, pointerEvents: "none" }}>
                      {layer.objects.map((o) => {
                        const linked = entries.find((e) => e.id === o.entryId);
                        const color = linked ? CAT_COLOR[linked.category] : "#888";
                        return (
                          <div
                            key={o.id}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              if (layer.locked) return;
                              setActiveLayerId(layer.id);
                              setSelection({ kind: "object", id: o.id });
                              objectDragRef.current = { id: o.id, startClientX: e.clientX, startClientY: e.clientY, startX: o.x, startY: o.y };
                              snapshot();
                            }}
                            style={{
                              position: "absolute",
                              left: o.x * map.gridSize + map.gridSize * 0.1,
                              top: o.y * map.gridSize + map.gridSize * 0.1,
                              width: map.gridSize * 0.8,
                              height: map.gridSize * 0.8,
                              borderRadius: 6,
                              background: linked?.image ? undefined : color,
                              backgroundImage: linked?.image ? `url(${linked.image})` : undefined,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                              border: selection?.kind === "object" && selection.id === o.id ? "2px solid white" : "2px solid rgba(0,0,0,0.3)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              color: "#fff",
                              textAlign: "center",
                              overflow: "hidden",
                              cursor: layer.locked ? "default" : "grab",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                              pointerEvents: layer.locked ? "none" : "auto",
                            }}
                            title={linked?.name ?? o.entryId}
                          >
                            {!linked?.image && (linked?.name?.slice(0, 3) ?? "?")}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                if (isFreehand(layer)) {
                  const isActiveDrawTarget = layer.id === effectiveFreehandLayer()?.id && (tool === "draw" || tool === "erase");
                  if (isActiveDrawTarget) {
                    return (
                      <canvas
                        key={layer.id}
                        ref={freehandCanvasRef}
                        width={map.width * map.gridSize}
                        height={map.height * map.gridSize}
                        onMouseDown={onFreehandPointerDown}
                        onMouseMove={onFreehandPointerMove}
                        onMouseUp={onFreehandPointerUp}
                        style={{ position: "absolute", inset: 0, opacity: layer.opacity, cursor: layer.locked ? "default" : "crosshair" }}
                      />
                    );
                  }
                  return layer.bitmap ? (
                    <img
                      key={layer.id}
                      src={layer.bitmap}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: layer.opacity, pointerEvents: "none" }}
                      alt=""
                    />
                  ) : null;
                }

                if (isImageLayer(layer)) {
                  return (
                    <div key={layer.id} style={{ position: "absolute", inset: 0, opacity: layer.opacity, pointerEvents: "none" }}>
                      {layer.images.map((img) => (
                        <div
                          key={img.id}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            if (layer.locked) return;
                            setActiveLayerId(layer.id);
                            setSelection({ kind: "image", id: img.id });
                            imageDragRef.current = { id: img.id, startClientX: e.clientX, startClientY: e.clientY, startX: img.x, startY: img.y };
                            snapshot();
                          }}
                          style={{
                            position: "absolute",
                            left: img.x * map.gridSize,
                            top: img.y * map.gridSize,
                            width: img.w * map.gridSize,
                            height: img.h * map.gridSize,
                            border: selection?.kind === "image" && selection.id === img.id ? "2px solid white" : "1px solid rgba(0,0,0,0.25)",
                            cursor: layer.locked ? "default" : "grab",
                            boxShadow: "0 1px 6px rgba(0,0,0,0.35)",
                            pointerEvents: layer.locked ? "none" : "auto",
                          }}
                        >
                          <img src={img.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                          {!layer.locked && (
                            <div
                              onMouseDown={(e) => {
                                if (e.button !== 0) return;
                                e.stopPropagation();
                                setActiveLayerId(layer.id);
                                setSelection({ kind: "image", id: img.id });
                                imageResizeRef.current = { id: img.id, startClientX: e.clientX, startClientY: e.clientY, startW: img.w, startH: img.h };
                                snapshot();
                              }}
                              style={{
                                position: "absolute",
                                right: -4,
                                bottom: -4,
                                width: 10,
                                height: 10,
                                borderRadius: 3,
                                background: "white",
                                border: "1px solid rgba(0,0,0,0.4)",
                                cursor: "nwse-resize",
                                pointerEvents: "auto",
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })}

              {draftZoneRect && (
                <div
                  style={{
                    position: "absolute",
                    left: draftZoneRect.x * map.gridSize,
                    top: draftZoneRect.y * map.gridSize,
                    width: draftZoneRect.w * map.gridSize,
                    height: draftZoneRect.h * map.gridSize,
                    background: zoneTag.color + "33",
                    border: `2px dashed ${zoneTag.color}`,
                    pointerEvents: "none",
                  }}
                />
              )}

              {selectionRect && (
                <div
                  style={{
                    position: "absolute",
                    left: (selectionRect.x + moveOffset.dx) * map.gridSize,
                    top: (selectionRect.y + moveOffset.dy) * map.gridSize,
                    width: selectionRect.w * map.gridSize,
                    height: selectionRect.h * map.gridSize,
                    border: "2px dashed white",
                    background: "rgba(255,255,255,0.08)",
                    pointerEvents: "none",
                  }}
                />
              )}

              {gridVisible && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                      "linear-gradient(to right, var(--op-15) 1px, transparent 1px), linear-gradient(to bottom, var(--op-15) 1px, transparent 1px)",
                    backgroundSize: `${map.gridSize}px ${map.gridSize}px`,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>

          {/* Right rail: properties */}
          <ResizablePanel panelKey="map-editor-right" side="right" defaultWidth={260} min={200} max={440}>
          <div className="border-l border-[var(--op-10)] overflow-y-auto h-full p-3">
            {!selection && !selectionRect && (
              <div className="text-xs text-[var(--op-30)] leading-relaxed">
                Кликните объект или зону на карте, чтобы отредактировать свойства. Перетащите запись слева, чтобы разместить её как
                объект. Клик по слою слева делает его активным для рисования/заливки.
              </div>
            )}

            {selectionRect && tool === "select" && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Выделение</div>
                <div className="text-xs text-[var(--op-50)]">
                  {selectionRect.w}×{selectionRect.h} клеток
                </div>
                <button
                  onClick={() => setSelectionRect(null)}
                  className="w-full text-xs px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)]"
                >
                  Снять выделение
                </button>
              </div>
            )}

            {selectedObject && (
              <ObjectProperties
                key={selectedObject.id}
                obj={selectedObject}
                entries={entries}
                onChange={(patch) =>
                  setMap((prev) => {
                    const next = cloneMap(prev);
                    const l = next.layers.find(isObject);
                    const o = l?.objects.find((x) => x.id === selectedObject.id);
                    if (o) Object.assign(o, patch);
                    return next;
                  }, false)
                }
                onDelete={deleteSelection}
              />
            )}

            {selectedZone && (
              <ZoneProperties
                key={selectedZone.id}
                zone={selectedZone}
                onChange={(patch) =>
                  setMap((prev) => {
                    const next = cloneMap(prev);
                    const l = next.layers.find(isZone);
                    const z = l?.zones.find((x) => x.id === selectedZone.id);
                    if (z) Object.assign(z, patch);
                    return next;
                  }, false)
                }
                onDelete={deleteSelection}
              />
            )}

            {selectedImage && (
              <ImageProperties
                key={selectedImage.id}
                image={selectedImage}
                onChange={(patch) =>
                  setMap((prev) => {
                    const next = cloneMap(prev);
                    const l = next.layers.find(isImageLayer);
                    const im = l?.images.find((x) => x.id === selectedImage.id);
                    if (im) Object.assign(im, patch);
                    return next;
                  }, false)
                }
                onDelete={deleteSelection}
              />
            )}
          </div>
          </ResizablePanel>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  icon: Icon,
  active,
  onClick,
  title,
}: {
  icon: React.ComponentType<any>;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`aspect-square rounded-md grid place-items-center transition-colors ${
        active ? "bg-accent/80 text-white" : "bg-[var(--op-6)] text-[var(--op-50)] hover:bg-[var(--op-10)]"
      }`}
    >
      <Icon size={15} />
    </button>
  );
}

function ObjectProperties({
  obj,
  entries,
  onChange,
  onDelete,
}: {
  obj: MapObjectInstance;
  entries: Entry[];
  onChange: (patch: Partial<MapObjectInstance>) => void;
  onDelete: () => void;
}) {
  const linked = entries.find((e) => e.id === obj.entryId);
  const props = obj.properties;
  const setProps = (next: [string, string][]) => onChange({ properties: next });

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-1">Объект</div>
        <div className="flex items-center gap-2 text-sm">
          {linked?.image ? (
            <img src={linked.image} className="w-6 h-6 rounded object-cover" alt="" />
          ) : (
            <span className="w-2 h-2 rounded-full" style={{ background: linked ? CAT_COLOR[linked.category] : "#888" }} />
          )}
          <span className="text-[var(--op-90)]">{linked?.name ?? "(запись удалена)"}</span>
        </div>
        {linked && <div className="text-xs text-[var(--op-35)] mt-0.5">{CAT_LABEL[linked.category]}</div>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[var(--op-40)]">
          X
          <input
            type="number"
            className="input mt-1"
            value={obj.x}
            onChange={(e) => onChange({ x: Number(e.target.value) })}
          />
        </label>
        <label className="text-xs text-[var(--op-40)]">
          Y
          <input
            type="number"
            className="input mt-1"
            value={obj.y}
            onChange={(e) => onChange({ y: Number(e.target.value) })}
          />
        </label>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-1.5">Свойства на карте</div>
        <div className="space-y-1.5">
          {props.map(([k, v], i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                className="input text-xs"
                value={k}
                placeholder="ключ"
                onChange={(e) => {
                  const next = props.slice() as [string, string][];
                  next[i] = [e.target.value, v];
                  setProps(next);
                }}
              />
              <input
                className="input text-xs"
                value={v}
                placeholder="значение"
                onChange={(e) => {
                  const next = props.slice() as [string, string][];
                  next[i] = [k, e.target.value];
                  setProps(next);
                }}
              />
              <button onClick={() => setProps(props.filter((_, j) => j !== i))} className="opacity-40 hover:opacity-100 shrink-0">
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setProps([...props, ["", ""]])}
            className="flex items-center gap-1 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]"
          >
            <Plus size={11} /> Добавить свойство
          </button>
        </div>
      </div>

      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"
      >
        <Trash2 size={12} /> Удалить с карты
      </button>
    </div>
  );
}

function ZoneProperties({
  zone,
  onChange,
  onDelete,
}: {
  zone: MapZone;
  onChange: (patch: Partial<MapZone>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Зона</div>
      <label className="text-xs text-[var(--op-40)] block">
        Название
        <input className="input mt-1" value={zone.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label className="text-xs text-[var(--op-40)] block">
        Тег
        <select className="input mt-1" value={zone.tag} onChange={(e) => onChange({ tag: e.target.value })}>
          {ZONE_TAGS.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-[var(--op-40)] flex items-center justify-between">
        Цвет
        <input
          type="color"
          value={zone.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-9 h-7 rounded-md border border-[var(--op-15)] bg-transparent cursor-pointer"
        />
      </label>
      <div className="text-xs text-[var(--op-35)]">
        Позиция: {zone.x},{zone.y} — {zone.w}×{zone.h} клеток
      </div>
      <label className="text-xs text-[var(--op-40)] block">
        Заметки
        <textarea
          className="input mt-1 min-h-[70px]"
          value={zone.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="например: телепорт ведёт в old_library"
        />
      </label>
      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"
      >
        <Trash2 size={12} /> Удалить зону
      </button>
    </div>
  );
}

function ImageProperties({
  image,
  onChange,
  onDelete,
}: {
  image: MapImageInstance;
  onChange: (patch: Partial<MapImageInstance>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Картинка</div>
      <div className="rounded-md overflow-hidden border border-[var(--op-10)] bg-[var(--op-5)]">
        <img src={image.src} alt="" className="w-full max-h-32 object-contain" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[var(--op-40)]">
          X
          <input
            type="number"
            step={0.1}
            className="input mt-1"
            value={Math.round(image.x * 100) / 100}
            onChange={(e) => onChange({ x: Number(e.target.value) })}
          />
        </label>
        <label className="text-xs text-[var(--op-40)]">
          Y
          <input
            type="number"
            step={0.1}
            className="input mt-1"
            value={Math.round(image.y * 100) / 100}
            onChange={(e) => onChange({ y: Number(e.target.value) })}
          />
        </label>
        <label className="text-xs text-[var(--op-40)]">
          Ширина
          <input
            type="number"
            step={0.1}
            min={0.3}
            className="input mt-1"
            value={Math.round(image.w * 100) / 100}
            onChange={(e) => onChange({ w: Math.max(0.3, Number(e.target.value)) })}
          />
        </label>
        <label className="text-xs text-[var(--op-40)]">
          Высота
          <input
            type="number"
            step={0.1}
            min={0.3}
            className="input mt-1"
            value={Math.round(image.h * 100) / 100}
            onChange={(e) => onChange({ h: Math.max(0.3, Number(e.target.value)) })}
          />
        </label>
      </div>
      <div className="text-[10px] text-[var(--op-30)]">Не привязано к сетке — можно тянуть и менять размер прямо на холсте.</div>
      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"
      >
        <Trash2 size={12} /> Удалить картинку
      </button>
    </div>
  );
}
