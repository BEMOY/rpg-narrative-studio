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
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Download,
  Search,
} from "lucide-react";
import type {
  Entry,
  MapData,
  MapObjectInstance,
  MapObjectLayer,
  MapTileLayer,
  MapZone,
  MapZoneLayer,
} from "../../types/database";
import { CAT_COLOR, CAT_LABEL } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { cellKey, createDefaultMap, nextId, parseCellKey, TILE_PALETTE, ZONE_TAGS } from "../../lib/mapDefaults";

type Tool = "paint" | "erase" | "zone" | "pan";
type Selection = { kind: "object"; id: string } | { kind: "zone"; id: string } | null;

const MAX_HISTORY = 50;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function cloneMap(m: MapData): MapData {
  return JSON.parse(JSON.stringify(m));
}

function tileLayers(map: MapData): MapTileLayer[] {
  return map.layers.filter((l): l is MapTileLayer => l.kind === "tile");
}
function objectLayer(map: MapData): MapObjectLayer {
  const l = map.layers.find((l): l is MapObjectLayer => l.kind === "object");
  if (!l) throw new Error("map has no object layer");
  return l;
}
function zoneLayer(map: MapData): MapZoneLayer {
  const l = map.layers.find((l): l is MapZoneLayer => l.kind === "zone");
  if (!l) throw new Error("map has no zone layer");
  return l;
}

export function MapEditorModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const entries = useProjectStore((s) => s.project.entries);
  const updateEntry = useProjectStore((s) => s.updateEntry);

  const [map, setMapState] = useState<MapData>(() => (entry.map ? cloneMap(entry.map) : createDefaultMap()));
  const pastRef = useRef<MapData[]>([]);
  const futureRef = useRef<MapData[]>([]);
  const [, forceRender] = useState(0);
  const firstSync = useRef(true);

  const [tool, setTool] = useState<Tool>("paint");
  const [activeTileLayerId, setActiveTileLayerId] = useState<string>(() => tileLayers(map)[0]?.id ?? "");
  const [paintColor, setPaintColor] = useState(TILE_PALETTE[0].color);
  const [paintLabel, setPaintLabel] = useState(TILE_PALETTE[0].label);
  const [zoneTag, setZoneTag] = useState(ZONE_TAGS[0]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [selection, setSelection] = useState<Selection>(null);
  const [search, setSearch] = useState("");

  const stageRef = useRef<HTMLDivElement>(null);
  const paintingRef = useRef(false);
  const paintModeRef = useRef<"paint" | "erase">("paint");
  const panDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const zoneDrawRef = useRef<{ x: number; y: number } | null>(null);
  const [draftZoneRect, setDraftZoneRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const objectDragRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(
    null
  );
  const zoneDragRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(
    null
  );

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

  const getCell = (e: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const localX = (e.clientX - rect.left) / zoom;
    const localY = (e.clientY - rect.top) / zoom;
    return { x: Math.floor(localX / map.gridSize), y: Math.floor(localY / map.gridSize) };
  };

  const paintCell = (x: number, y: number, mode: "paint" | "erase") => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    setMap((prev) => {
      const next = cloneMap(prev);
      const layer = tileLayers(next).find((l) => l.id === activeTileLayerId) ?? tileLayers(next)[0];
      if (!layer) return prev;
      const key = cellKey(x, y);
      if (mode === "erase") delete layer.cells[key];
      else layer.cells[key] = { color: paintColor, label: paintLabel };
      return next;
    }, false);
  };

  // ---- Stage pointer handling ----
  const onStageMouseDown = (e: React.MouseEvent) => {
    if (tool === "pan") {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    const cell = getCell(e);
    if (tool === "paint" || tool === "erase") {
      pastRef.current.push(cloneMap(map));
      futureRef.current = [];
      pastRef.current.length > MAX_HISTORY && pastRef.current.shift();
      paintingRef.current = true;
      paintModeRef.current = tool;
      paintCell(cell.x, cell.y, tool);
    } else if (tool === "zone") {
      zoneDrawRef.current = cell;
      setDraftZoneRect({ x: cell.x, y: cell.y, w: 1, h: 1 });
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
      if (objectDragRef.current) {
        const d = objectDragRef.current;
        const dx = Math.round((e.clientX - d.startClientX) / (map.gridSize * zoom));
        const dy = Math.round((e.clientY - d.startClientY) / (map.gridSize * zoom));
        const nx = clamp(d.startX + dx, 0, map.width - 1);
        const ny = clamp(d.startY + dy, 0, map.height - 1);
        setMap((prev) => {
          const next = cloneMap(prev);
          const obj = objectLayer(next).objects.find((o) => o.id === d.id);
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
          const z = zoneLayer(next).zones.find((z) => z.id === d.id);
          if (z) {
            z.x = clamp(d.startX + dx, 0, next.width - z.w);
            z.y = clamp(d.startY + dy, 0, next.height - z.h);
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
      if (zoneDrawRef.current && draftZoneRect) {
        const tag = zoneTag;
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
        pastRef.current.push(cloneMap(map));
        futureRef.current = [];
        setMapState((prev) => {
          const next = cloneMap(prev);
          zoneLayer(next).zones.push(newZone);
          return next;
        });
        setSelection({ kind: "zone", id: newZone.id });
      }
      zoneDrawRef.current = null;
      setDraftZoneRect(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, zoom, pan, draftZoneRect, zoneTag]);

  const onStageDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("text/entry-id")) e.preventDefault();
  };
  const onStageDrop = (e: React.DragEvent) => {
    const entryId = e.dataTransfer.getData("text/entry-id");
    if (!entryId) return;
    e.preventDefault();
    const cell = getCell(e);
    pastRef.current.push(cloneMap(map));
    futureRef.current = [];
    const inst: MapObjectInstance = { id: nextId("obj"), entryId, x: cell.x, y: cell.y, properties: [] };
    setMapState((prev) => {
      const next = cloneMap(prev);
      objectLayer(next).objects.push(inst);
      return next;
    });
    setSelection({ kind: "object", id: inst.id });
  };

  const deleteSelection = () => {
    if (!selection) return;
    setMap((prev) => {
      const next = cloneMap(prev);
      if (selection.kind === "object") {
        const l = objectLayer(next);
        l.objects = l.objects.filter((o) => o.id !== selection.id);
      } else {
        const l = zoneLayer(next);
        l.zones = l.zones.filter((z) => z.id !== selection.id);
      }
      return next;
    });
    setSelection(null);
  };

  const addTileLayer = () => {
    setMap((prev) => {
      const next = cloneMap(prev);
      const newLayer: MapTileLayer = {
        id: nextId("layer"),
        kind: "tile",
        name: `Слой ${tileLayers(next).length + 1}`,
        visible: true,
        locked: false,
        opacity: 1,
        cells: {},
      };
      const objIdx = next.layers.findIndex((l) => l.kind === "object");
      next.layers.splice(objIdx === -1 ? next.layers.length : objIdx, 0, newLayer);
      setActiveTileLayerId(newLayer.id);
      return next;
    });
  };

  const removeTileLayer = (id: string) => {
    if (tileLayers(map).length <= 1) return;
    setMap((prev) => {
      const next = cloneMap(prev);
      next.layers = next.layers.filter((l) => l.id !== id);
      return next;
    });
    if (activeTileLayerId === id) setActiveTileLayerId(tileLayers(map)[0]?.id ?? "");
  };

  const updateLayer = (id: string, patch: Partial<MapTileLayer | MapObjectLayer | MapZoneLayer>) => {
    setMap((prev) => {
      const next = cloneMap(prev);
      const layer = next.layers.find((l) => l.id === id);
      if (layer) Object.assign(layer, patch);
      return next;
    }, false);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entry.id}_map.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const objLayer = objectLayer(map);
  const znLayer = zoneLayer(map);
  const selectedObject = selection?.kind === "object" ? objLayer.objects.find((o) => o.id === selection.id) : undefined;
  const selectedZone = selection?.kind === "zone" ? znLayer.zones.find((z) => z.id === selection.id) : undefined;

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)) : entries;
    return list.slice(0, 60);
  }, [entries, search]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
      <div className="glass rounded-lg w-full h-full max-w-[1400px] flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] shrink-0">
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
            onClick={() => setZoom((z) => clamp(z - 0.15, 0.4, 2.5))}
            className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)]"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs mono text-[var(--op-40)] w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => clamp(z + 0.15, 0.4, 2.5))}
            className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)]"
          >
            <ZoomIn size={14} />
          </button>
          <div className="w-px h-5 bg-[var(--op-10)] mx-1" />
          <button
            onClick={exportJson}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)]"
          >
            <Download size={12} /> Экспорт JSON
          </button>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] ml-1">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left rail: tools + layers + palette */}
          <div className="w-[240px] border-r border-[var(--op-10)] flex flex-col overflow-y-auto shrink-0">
            <div className="p-3 border-b border-[var(--op-10)]">
              <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Инструмент</div>
              <div className="grid grid-cols-4 gap-1.5">
                <ToolBtn icon={Paintbrush} active={tool === "paint"} onClick={() => setTool("paint")} title="Кисть" />
                <ToolBtn icon={Eraser} active={tool === "erase"} onClick={() => setTool("erase")} title="Ластик" />
                <ToolBtn icon={Square} active={tool === "zone"} onClick={() => setTool("zone")} title="Зона" />
                <ToolBtn icon={Hand} active={tool === "pan"} onClick={() => setTool("pan")} title="Панорама" />
              </div>

              {(tool === "paint" || tool === "erase") && (
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {TILE_PALETTE.map((t) => (
                    <button
                      key={t.color}
                      title={t.label}
                      onClick={() => {
                        setPaintColor(t.color);
                        setPaintLabel(t.label);
                        setTool("paint");
                      }}
                      className="w-full aspect-square rounded-md border-2"
                      style={{ background: t.color, borderColor: paintColor === t.color ? "var(--op-90)" : "transparent" }}
                    />
                  ))}
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
            </div>

            <div className="p-3 border-b border-[var(--op-10)]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Слои</div>
                <button onClick={addTileLayer} title="Добавить слой тайлов" className="opacity-50 hover:opacity-100">
                  <Plus size={13} />
                </button>
              </div>
              <div className="space-y-1">
                {tileLayers(map).map((l) => (
                  <div
                    key={l.id}
                    onClick={() => setActiveTileLayerId(l.id)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs ${
                      activeTileLayerId === l.id ? "bg-[var(--op-10)] text-[var(--op-90)]" : "text-[var(--op-50)] hover:bg-[var(--op-7)]"
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLayer(l.id, { visible: !l.visible });
                      }}
                      className="opacity-70 hover:opacity-100 shrink-0"
                    >
                      {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLayer(l.id, { locked: !l.locked });
                      }}
                      className="opacity-70 hover:opacity-100 shrink-0"
                    >
                      {l.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                    <span className="flex-1 truncate">{l.name}</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.1}
                      value={l.opacity}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateLayer(l.id, { opacity: Number(e.target.value) })}
                      className="w-10 shrink-0"
                    />
                    {tileLayers(map).length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTileLayer(l.id);
                        }}
                        className="opacity-40 hover:opacity-100 hover:text-red-300 shrink-0"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--op-40)]">
                  <Eye size={12} className="opacity-70" /> Объекты
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--op-40)]">
                  <Eye size={12} className="opacity-70" /> Зоны
                </div>
              </div>
            </div>

            <div className="p-3 flex-1 flex flex-col min-h-0">
              <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Объекты проекта</div>
              <div className="glass rounded-md px-2 py-1.5 flex items-center gap-1.5 text-xs mb-2">
                <Search size={12} className="text-[var(--op-40)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск…"
                  className="bg-transparent outline-none text-[var(--op-80)] placeholder:text-[var(--op-30)] w-full"
                />
              </div>
              <div className="flex-1 overflow-y-auto space-y-0.5">
                {filteredEntries.map((e) => (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData("text/entry-id", e.id)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--op-70)] hover:bg-[var(--op-7)] cursor-grab active:cursor-grabbing"
                    title="Перетащите на карту"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CAT_COLOR[e.category] }} />
                    <span className="truncate">{e.name}</span>
                  </div>
                ))}
                {filteredEntries.length === 0 && <div className="text-xs text-[var(--op-30)] px-2">Ничего не найдено.</div>}
              </div>
            </div>
          </div>

          {/* Canvas viewport */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{ background: "var(--op-5)", cursor: tool === "pan" ? "grab" : "crosshair" }}
            onWheel={(e) => setZoom((z) => clamp(z + (e.deltaY > 0 ? -0.1 : 0.1), 0.4, 2.5))}
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
                backgroundImage:
                  "linear-gradient(to right, var(--op-10) 1px, transparent 1px), linear-gradient(to bottom, var(--op-10) 1px, transparent 1px)",
                backgroundSize: `${map.gridSize}px ${map.gridSize}px`,
                backgroundColor: "var(--op-6)",
                outline: "1px solid var(--op-15)",
              }}
            >
              {tileLayers(map).map(
                (layer) =>
                  layer.visible && (
                    <div key={layer.id} style={{ position: "absolute", inset: 0, opacity: layer.opacity }}>
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
                              pointerEvents: "none",
                            }}
                            title={val.label}
                          />
                        );
                      })}
                    </div>
                  )
              )}

              {znLayer.visible &&
                znLayer.zones.map((z) => (
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
                      opacity: znLayer.opacity,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelection({ kind: "zone", id: z.id });
                        zoneDragRef.current = { id: z.id, startClientX: e.clientX, startClientY: e.clientY, startX: z.x, startY: z.y };
                        pastRef.current.push(cloneMap(map));
                        futureRef.current = [];
                      }}
                      style={{
                        pointerEvents: "auto",
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

              {objLayer.visible &&
                objLayer.objects.map((o) => {
                  const linked = entries.find((e) => e.id === o.entryId);
                  const color = linked ? CAT_COLOR[linked.category] : "#888";
                  return (
                    <div
                      key={o.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelection({ kind: "object", id: o.id });
                        objectDragRef.current = { id: o.id, startClientX: e.clientX, startClientY: e.clientY, startX: o.x, startY: o.y };
                        pastRef.current.push(cloneMap(map));
                        futureRef.current = [];
                      }}
                      style={{
                        position: "absolute",
                        left: o.x * map.gridSize + map.gridSize * 0.1,
                        top: o.y * map.gridSize + map.gridSize * 0.1,
                        width: map.gridSize * 0.8,
                        height: map.gridSize * 0.8,
                        borderRadius: 6,
                        background: color,
                        border: selection?.kind === "object" && selection.id === o.id ? "2px solid white" : "2px solid rgba(0,0,0,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        color: "#fff",
                        textAlign: "center",
                        overflow: "hidden",
                        cursor: "grab",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                      }}
                      title={linked?.name ?? o.entryId}
                    >
                      {linked?.name?.slice(0, 3) ?? "?"}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Right rail: properties */}
          <div className="w-[260px] border-l border-[var(--op-10)] overflow-y-auto shrink-0 p-3">
            {!selection && (
              <div className="text-xs text-[var(--op-30)] leading-relaxed">
                Кликните объект или зону на карте, чтобы отредактировать свойства. Перетащите запись слева, чтобы разместить её как
                объект. Зажмите и тяните ярлык зоны, чтобы передвинуть её.
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
                    const o = objectLayer(next).objects.find((x) => x.id === selectedObject.id);
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
                    const z = zoneLayer(next).zones.find((x) => x.id === selectedZone.id);
                    if (z) Object.assign(z, patch);
                    return next;
                  }, false)
                }
                onDelete={deleteSelection}
              />
            )}
          </div>
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
          <span className="w-2 h-2 rounded-full" style={{ background: linked ? CAT_COLOR[linked.category] : "#888" }} />
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
