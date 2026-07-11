import { useEffect, useMemo, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  CheckSquare,
  Square,
  User,
  MapPin,
  Flag,
  Swords,
  Shirt,
  Package,
  Box,
  BookOpen,
  Waypoints,
} from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { PortalMenu } from "../common/PortalMenu";
import { CAT_COLOR, CAT_LABEL, CAT_ORDER, type Category } from "../../types/database";

const CAT_ICON: Record<Category, React.ComponentType<any>> = {
  character: User,
  location: MapPin,
  main_quest: Flag,
  side_quest: Swords,
  equipment: Shirt,
  item: Package,
  object: Box,
  lore: BookOpen,
};

interface NodePos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Edge {
  from: string;
  to: string;
  note?: string;
}

const WIDTH = 2600;
const HEIGHT = 1700;
const IDEAL_LEN = 190;
const REPULSION = 26000;
const MAX_SETTLE_FRAMES = 260;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function GraphView() {
  const entries = useProjectStore((s) => s.project.entries);
  const openEntry = useProjectStore((s) => s.openEntry);
  const hiddenCategories = useProjectStore((s) => s.hiddenCategories);
  const toggleCategoryVisibility = useProjectStore((s) => s.toggleCategoryVisibility);

  const visibleEntries = useMemo(
    () => entries.filter((e) => !hiddenCategories.includes(e.category)),
    [entries, hiddenCategories]
  );
  const visibleIds = useMemo(() => new Set(visibleEntries.map((e) => e.id)), [visibleEntries]);

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = [];
    for (const e of visibleEntries) {
      for (const refId of e.references ?? []) {
        if (!visibleIds.has(refId) || refId === e.id) continue;
        list.push({ from: e.id, to: refId, note: e.referenceNotes?.[refId] });
      }
    }
    return list;
  }, [visibleEntries, visibleIds]);

  const posRef = useRef<Map<string, NodePos>>(new Map());
  const pinnedRef = useRef<Set<string>>(new Set());
  const draggingRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const panDragRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null);
  const [, bump] = useState(0);

  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Seed / prune node positions when the visible entry set changes.
  useEffect(() => {
    const pos = posRef.current;
    for (const key of Array.from(pos.keys())) {
      if (!visibleIds.has(key)) pos.delete(key);
    }
    visibleEntries.forEach((e, i) => {
      if (!pos.has(e.id)) {
        const angle = (i / Math.max(1, visibleEntries.length)) * Math.PI * 2;
        const r = 350 + ((i * 71) % 260);
        pos.set(e.id, {
          x: WIDTH / 2 + Math.cos(angle) * r,
          y: HEIGHT / 2 + Math.sin(angle) * r,
          vx: 0,
          vy: 0,
        });
      }
    });
  }, [visibleEntries, visibleIds]);

  // Lightweight force simulation (repulsion + spring edges + centering), settles after
  // a fixed number of frames rather than running forever. Dragged/pinned nodes are frozen.
  useEffect(() => {
    let frame = 0;
    let raf = 0;
    const ids = visibleEntries.map((e) => e.id);

    function tick() {
      const pos = posRef.current;
      for (let i = 0; i < ids.length; i++) {
        const a = pos.get(ids[i]);
        if (!a) continue;
        let fx = 0;
        let fy = 0;
        for (let j = 0; j < ids.length; j++) {
          if (i === j) continue;
          const b = pos.get(ids[j]);
          if (!b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy || 0.01;
          const dist = Math.sqrt(distSq);
          const force = REPULSION / distSq;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
        a.vx += fx * 0.02;
        a.vy += fy * 0.02;
      }
      for (const e of edges) {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (dist - IDEAL_LEN) * 0.02;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      for (const id of ids) {
        const p = pos.get(id);
        if (!p) continue;
        if (pinnedRef.current.has(id) || draggingRef.current?.id === id) {
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        p.vx += (WIDTH / 2 - p.x) * 0.0006;
        p.vy += (HEIGHT / 2 - p.y) * 0.0006;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x = clamp(p.x + p.vx, 40, WIDTH - 40);
        p.y = clamp(p.y + p.vy, 40, HEIGHT - 40);
      }
      frame++;
      bump((n) => n + 1);
      if (frame < MAX_SETTLE_FRAMES) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visibleEntries, edges]);

  // ---- node drag ----
  const onNodePointerDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const p = posRef.current.get(id);
    if (!p) return;
    draggingRef.current = { id, startClientX: e.clientX, startClientY: e.clientY, startX: p.x, startY: p.y };
    const onMove = (ev: MouseEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const pos = posRef.current.get(d.id);
      if (!pos) return;
      pos.x = d.startX + (ev.clientX - d.startClientX) / zoom;
      pos.y = d.startY + (ev.clientY - d.startClientY) / zoom;
      pos.vx = 0;
      pos.vy = 0;
      bump((n) => n + 1);
    };
    const onUp = () => {
      if (draggingRef.current) pinnedRef.current.add(draggingRef.current.id);
      draggingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ---- background pan ----
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
    setZoom((z) => clamp(z + (e.deltaY > 0 ? -0.08 : 0.08), 0.15, 2.5));
  };

  const resetView = () => {
    setZoom(0.55);
    setPan({ x: 40, y: 20 });
  };

  const connected = useMemo(() => {
    if (!hoveredId) return null;
    const s = new Set<string>([hoveredId]);
    for (const e of edges) {
      if (e.from === hoveredId) s.add(e.to);
      if (e.to === hoveredId) s.add(e.from);
    }
    return s;
  }, [hoveredId, edges]);

  const pos = posRef.current;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--op-10)] flex-wrap">
        <div className="flex items-center gap-2 text-lg font-medium text-[#ece4d2]">
          <Waypoints size={18} />
          Граф связей
          <span className="text-xs mono text-[var(--op-30)] bg-[var(--op-5)] border border-[var(--op-10)] rounded-full px-2 py-0.5">
            {visibleEntries.length}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            ref={filterBtnRef}
            onClick={() => setFilterOpen((v) => !v)}
            title="Фильтр категорий"
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
              hiddenCategories.length ? "bg-accent/25 text-[var(--op-90)]" : "glass hover:bg-[var(--op-10)]"
            }`}
          >
            <Filter size={14} />
            {hiddenCategories.length > 0 && (
              <span className="text-xs mono">
                {CAT_ORDER.length - hiddenCategories.length}/{CAT_ORDER.length}
              </span>
            )}
          </button>
          <PortalMenu anchorRef={filterBtnRef} open={filterOpen} onClose={() => setFilterOpen(false)}>
            <div className="w-56 p-2">
              <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-[var(--op-10)]">
                <span className="text-xs uppercase tracking-wider text-[var(--op-35)]">Категории</span>
                <button
                  onClick={() => CAT_ORDER.forEach((c) => hiddenCategories.includes(c) && toggleCategoryVisibility(c))}
                  className="text-[10px] text-accent hover:underline"
                >
                  показать все
                </button>
              </div>
              {CAT_ORDER.map((c) => {
                const Icon = CAT_ICON[c];
                const visible = !hiddenCategories.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCategoryVisibility(c)}
                    className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-[var(--op-7)] text-left text-sm"
                  >
                    {visible ? (
                      <CheckSquare size={14} className="text-accent shrink-0" />
                    ) : (
                      <Square size={14} className="text-[var(--op-30)] shrink-0" />
                    )}
                    <Icon size={13} style={{ color: CAT_COLOR[c] }} className="shrink-0" />
                    <span className={visible ? "text-[var(--op-80)]" : "text-[var(--op-35)]"}>{CAT_LABEL[c]}</span>
                  </button>
                );
              })}
            </div>
          </PortalMenu>
          <div className="w-px h-5 bg-[var(--op-10)] mx-0.5" />
          <button onClick={() => setZoom((z) => clamp(z - 0.15, 0.15, 2.5))} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs mono text-[var(--op-40)] w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => clamp(z + 0.15, 0.15, 2.5))} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <ZoomIn size={14} />
          </button>
          <button onClick={resetView} title="Сбросить вид" className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ background: "radial-gradient(circle at center, var(--op-5), transparent 70%)" }}
        onWheel={onWheel}
        onMouseDown={onBgPointerDown}
      >
        {visibleEntries.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--op-30)] gap-2">
            <Waypoints size={28} />
            <div className="text-sm">Нет записей для отображения — измените фильтр категорий.</div>
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: WIDTH,
              height: HEIGHT,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg width={WIDTH} height={HEIGHT} className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
              <defs>
                <marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--op-30)" />
                </marker>
              </defs>
              {edges.map((e, i) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                const dim = connected && !(connected.has(e.from) && connected.has(e.to));
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const nx = dx / dist;
                const ny = dy / dist;
                const r = 26;
                const x1 = a.x + nx * r;
                const y1 = a.y + ny * r;
                const x2 = b.x - nx * (r + 8);
                const y2 = b.y - ny * (r + 8);
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                return (
                  <g key={i} opacity={dim ? 0.12 : 0.9}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--op-30)" strokeWidth={1.4} markerEnd="url(#graph-arrow)" />
                    {e.note && (
                      <g transform={`translate(${mx}, ${my})`}>
                        <rect
                          x={-Math.min(90, e.note.length * 3.4 + 8)}
                          y={-9}
                          width={Math.min(180, e.note.length * 6.8 + 16)}
                          height={18}
                          rx={5}
                          fill="var(--popover-bg)"
                          stroke="var(--popover-border)"
                          strokeWidth={1}
                        />
                        <text x={0} y={4} textAnchor="middle" fontSize={10} fill="var(--op-60)" className="mono">
                          {e.note.length > 26 ? e.note.slice(0, 24) + "…" : e.note}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {visibleEntries.map((e) => {
              const p = pos.get(e.id);
              if (!p) return null;
              const Icon = CAT_ICON[e.category];
              const color = CAT_COLOR[e.category];
              const dim = connected && !connected.has(e.id);
              return (
                <div
                  key={e.id}
                  onMouseDown={(ev) => onNodePointerDown(e.id, ev)}
                  onMouseEnter={() => setHoveredId(e.id)}
                  onMouseLeave={() => setHoveredId((cur) => (cur === e.id ? null : cur))}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openEntry(e.id);
                  }}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    transform: "translate(-50%, -50%)",
                    opacity: dim ? 0.25 : 1,
                  }}
                  className="flex flex-col items-center gap-1 cursor-pointer select-none group"
                  title={e.description || e.name}
                >
                  <div
                    className="w-11 h-11 rounded-full grid place-items-center border-2 shadow-lg transition-transform group-hover:scale-110"
                    style={{ background: "var(--popover-bg)", borderColor: color, color }}
                  >
                    {e.image ? (
                      <img src={e.image} alt="" className="w-full h-full rounded-full object-cover" style={{ imageRendering: "pixelated" }} />
                    ) : (
                      <Icon size={18} />
                    )}
                  </div>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap max-w-[120px] truncate"
                    style={{ background: "var(--popover-bg)", color: "var(--op-80)" }}
                  >
                    {e.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
