import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollText,
  Flag,
  Swords,
  MessageSquare,
  Tag,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Copy,
  Check,
  Download,
  Coins,
  Sparkles,
  Heart,
} from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { CAT_COLOR, isQuest, type Entry } from "../../types/database";
import { compileQuestsScript } from "../../lib/questCompile";

// ---- roadmap graph (quest ↔ dialogue ↔ flag), adapted from GraphView.tsx's force layout ----

type NodeKind = "quest" | "dialogue" | "flag";

interface RoadmapNode {
  id: string;
  kind: NodeKind;
  label: string;
  color: string;
  entryId?: string; // quest -> Entry.id
  dialogueId?: string; // dialogue -> Dialogue.id
}

interface RoadmapEdge {
  from: string;
  to: string;
  note?: string;
}

interface NodePos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const WIDTH = 2000;
const HEIGHT = 1300;
const IDEAL_LEN = 170;
const REPULSION = 22000;
const MAX_SETTLE_FRAMES = 220;
const IDLE_JITTER = 0.14;
const MIN_REPULSE_DIST = 55;
const MAX_VELOCITY = 18;

const DIALOGUE_COLOR = "#7f9bd1";
const FLAG_COLOR = "#b08a5a";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function NodeIcon({ n }: { n: RoadmapNode }) {
  if (n.kind === "dialogue") return <MessageSquare size={16} />;
  if (n.kind === "flag") return <Tag size={14} />;
  return n.color === CAT_COLOR.side_quest ? <Swords size={16} /> : <Flag size={16} />;
}

function useQuestRoadmap() {
  const entries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);

  return useMemo(() => {
    const quests = entries.filter((e) => isQuest(e.category));
    const questIds = new Set(quests.map((q) => q.id));

    const nodes: RoadmapNode[] = [];
    const nodeIds = new Set<string>();
    const addNode = (n: RoadmapNode) => {
      if (nodeIds.has(n.id)) return;
      nodeIds.add(n.id);
      nodes.push(n);
    };

    for (const q of quests) {
      addNode({ id: `q:${q.id}`, kind: "quest", label: q.name, color: CAT_COLOR[q.category], entryId: q.id });
    }

    const edgeKeys = new Set<string>();
    const edges: RoadmapEdge[] = [];
    const addEdge = (e: RoadmapEdge) => {
      const key = `${e.from}|${e.to}|${e.note ?? ""}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push(e);
    };

    // quest -> flag ("устанавливает"), derived from objective.objId (matches quest_progress()
    // setting flag "obj_<objId>" once that objective reaches max)
    const flagNames = new Set<string>();
    for (const q of quests) {
      for (const o of q.objectives ?? []) {
        const raw = o.objId?.trim();
        if (!raw) continue;
        const flagName = `obj_${raw}`;
        const fid = `f:${flagName}`;
        addNode({ id: fid, kind: "flag", label: flagName, color: FLAG_COLOR });
        addEdge({ from: `q:${q.id}`, to: fid, note: "устанавливает" });
        flagNames.add(flagName);
      }
    }

    // dialogue -> quest / flag, only for dialogues that actually touch the quest system
    for (const d of dialogues) {
      const local: RoadmapEdge[] = [];
      let touches = false;
      for (const n of d.nodes) {
        for (const line of n.lines) {
          const c = line.condition;
          if (!c) continue;
          if (c.kind === "quest" && questIds.has(c.key)) {
            local.push({ from: `d:${d.id}`, to: `q:${c.key}`, note: "проверяет" });
            touches = true;
          } else if (c.kind === "flag" && flagNames.has(c.key)) {
            local.push({ from: `d:${d.id}`, to: `f:${c.key}`, note: "проверяет" });
            touches = true;
          }
        }
        for (const choice of n.choices) {
          const c = choice.condition;
          if (c) {
            if (c.kind === "quest" && questIds.has(c.key)) {
              local.push({ from: `d:${d.id}`, to: `q:${c.key}`, note: "проверяет" });
              touches = true;
            } else if (c.kind === "flag" && flagNames.has(c.key)) {
              local.push({ from: `d:${d.id}`, to: `f:${c.key}`, note: "проверяет" });
              touches = true;
            }
          }
          for (const fs of choice.flagSets ?? []) {
            if (flagNames.has(fs.key)) {
              local.push({ from: `d:${d.id}`, to: `f:${fs.key}`, note: "устанавливает" });
              touches = true;
            }
          }
          for (const qa of choice.questActions ?? []) {
            if (!qa.questId || !questIds.has(qa.questId)) continue;
            const note = qa.kind === "start" ? "начинает" : qa.kind === "complete" ? "завершает" : "продвигает";
            local.push({ from: `d:${d.id}`, to: `q:${qa.questId}`, note });
            touches = true;
          }
        }
      }
      if (touches) {
        addNode({ id: `d:${d.id}`, kind: "dialogue", label: d.name, color: DIALOGUE_COLOR, dialogueId: d.id });
        for (const e of local) addEdge(e);
      }
    }

    return { nodes, edges, quests };
  }, [entries, dialogues]);
}

function RoadmapGraph({
  nodes,
  edges,
  onOpenQuest,
  onOpenDialogue,
  hoveredId,
  setHoveredId,
}: {
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
  onOpenQuest: (id: string) => void;
  onOpenDialogue: (id: string) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}) {
  const posRef = useRef<Map<string, NodePos>>(new Map());
  const pinnedRef = useRef<Set<string>>(new Set());
  const draggingRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const panDragRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null);
  const [, bump] = useState(0);
  const [zoom, setZoom] = useState(0.65);
  const [pan, setPan] = useState({ x: 30, y: 20 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  useEffect(() => {
    const pos = posRef.current;
    for (const key of Array.from(pos.keys())) {
      if (!nodeIds.has(key)) pos.delete(key);
    }
    nodes.forEach((n, i) => {
      if (!pos.has(n.id)) {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        const r = 300 + ((i * 67) % 220);
        pos.set(n.id, { x: WIDTH / 2 + Math.cos(angle) * r, y: HEIGHT / 2 + Math.sin(angle) * r, vx: 0, vy: 0 });
      }
    });
  }, [nodes, nodeIds]);

  useEffect(() => {
    let frame = 0;
    let raf = 0;
    const ids = nodes.map((n) => n.id);

    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const isolatedByKind = new Map<string, string[]>();
    for (const n of nodes) {
      if ((degree.get(n.id) ?? 0) > 0) continue;
      if (!isolatedByKind.has(n.kind)) isolatedByKind.set(n.kind, []);
      isolatedByKind.get(n.kind)!.push(n.id);
    }

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
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_REPULSE_DIST);
          const force = REPULSION / (dist * dist);
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
      for (const [, isoIds] of isolatedByKind) {
        if (isoIds.length < 2) continue;
        let cx = 0;
        let cy = 0;
        let n = 0;
        for (const id of isoIds) {
          const p = pos.get(id);
          if (!p) continue;
          cx += p.x;
          cy += p.y;
          n++;
        }
        if (n < 2) continue;
        cx /= n;
        cy /= n;
        for (const id of isoIds) {
          const p = pos.get(id);
          if (!p) continue;
          p.vx += (cx - p.x) * 0.0025;
          p.vy += (cy - p.y) * 0.0025;
        }
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
        if (frame > MAX_SETTLE_FRAMES) {
          p.vx += (Math.random() - 0.5) * IDLE_JITTER;
          p.vy += (Math.random() - 0.5) * IDLE_JITTER;
        }
        p.vx *= 0.82;
        p.vy *= 0.82;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > MAX_VELOCITY) {
          p.vx = (p.vx / speed) * MAX_VELOCITY;
          p.vy = (p.vy / speed) * MAX_VELOCITY;
        }
        p.x = clamp(p.x + p.vx, 40, WIDTH - 40);
        p.y = clamp(p.y + p.vy, 40, HEIGHT - 40);
      }
      frame++;
      bump((n) => n + 1);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges]);

  const onNodePointerDown = (n: RoadmapNode, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const p = posRef.current.get(n.id);
    if (!p) return;
    draggingRef.current = { id: n.id, startClientX: e.clientX, startClientY: e.clientY, startX: p.x, startY: p.y };
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const dxScreen = ev.clientX - d.startClientX;
      const dyScreen = ev.clientY - d.startClientY;
      if (Math.abs(dxScreen) > 4 || Math.abs(dyScreen) > 4) moved = true;
      const pos = posRef.current.get(d.id);
      if (!pos) return;
      pos.x = d.startX + dxScreen / zoom;
      pos.y = d.startY + dyScreen / zoom;
      pos.vx = 0;
      pos.vy = 0;
      bump((v) => v + 1);
    };
    const onUp = () => {
      const d = draggingRef.current;
      if (d) {
        if (moved) pinnedRef.current.add(d.id);
        else if (n.kind === "quest" && n.entryId) onOpenQuest(n.entryId);
        else if (n.kind === "dialogue" && n.dialogueId) onOpenDialogue(n.dialogueId);
      }
      draggingRef.current = null;
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
    const rect = viewportRef.current?.getBoundingClientRect();
    const newZoom = clamp(zoom + (e.deltaY > 0 ? -0.08 : 0.08), 0.15, 2.5);
    if (!rect || newZoom === zoom) {
      setZoom(newZoom);
      return;
    }
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const ratio = newZoom / zoom;
    setPan((p) => ({ x: mouseX - (mouseX - p.x) * ratio, y: mouseY - (mouseY - p.y) * ratio }));
    setZoom(newZoom);
  };

  const resetView = () => {
    setZoom(0.65);
    setPan({ x: 30, y: 20 });
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
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] shrink-0">
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setZoom((z) => clamp(z - 0.15, 0.15, 2.5))} className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <ZoomOut size={13} />
          </button>
          <span className="text-xs mono text-[var(--op-40)] w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => clamp(z + 0.15, 0.15, 2.5))} className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <ZoomIn size={13} />
          </button>
          <button onClick={resetView} title="Сбросить вид" className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <Maximize2 size={13} />
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
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--op-30)] gap-2">
            <ScrollText size={28} />
            <div className="text-sm">Нет квестов — добавьте их в Codex, чтобы увидеть карту связей.</div>
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
                <marker id="quest-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
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
                  <g key={i} opacity={dim ? 0.1 : 0.9}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--op-30)" strokeWidth={1.4} markerEnd="url(#quest-graph-arrow)" />
                    {e.note && (
                      <g transform={`translate(${mx}, ${my})`}>
                        <rect
                          x={-Math.min(90, e.note.length * 3.6 + 8)}
                          y={-9}
                          width={Math.min(180, e.note.length * 7.2 + 16)}
                          height={18}
                          rx={5}
                          fill="var(--popover-bg)"
                          stroke="var(--popover-border)"
                          strokeWidth={1}
                        />
                        <text x={0} y={4} textAnchor="middle" fontSize={10} fill="var(--op-60)" className="mono">
                          {e.note}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {nodes.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const dim = connected && !connected.has(n.id);
              return (
                <div
                  key={n.id}
                  onMouseDown={(ev) => onNodePointerDown(n, ev)}
                  onMouseEnter={() => {
                    if (draggingRef.current) return;
                    setHoveredId(n.id);
                  }}
                  onMouseLeave={() => {
                    if (draggingRef.current) return;
                    setHoveredId(null);
                  }}
                  style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%, -50%)", opacity: dim ? 0.25 : 1 }}
                  className="flex flex-col items-center gap-1 cursor-pointer select-none group"
                  title={n.label}
                >
                  <div
                    className="w-10 h-10 rounded-full grid place-items-center border-2 shadow-lg transition-transform group-hover:scale-110 pointer-events-none"
                    style={{ background: "var(--popover-bg)", borderColor: n.color, color: n.color }}
                  >
                    <NodeIcon n={n} />
                  </div>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap max-w-[130px] truncate"
                    style={{ background: "var(--popover-bg)", color: "var(--op-80)" }}
                  >
                    {n.label}
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

// ---- quest list (left panel) ----

function questTypeLabel(e: Entry): string {
  const t = e.questType ?? (e.category === "main_quest" ? "main" : "side");
  return t === "main" ? "Основной" : t === "story" ? "Сюжетный" : "Побочный";
}

function QuestListRow({
  entry,
  onOpen,
  onHover,
}: {
  entry: Entry;
  onOpen: (id: string) => void;
  onHover: (hovering: boolean) => void;
}) {
  const objectives = entry.objectives ?? [];
  const rewards = entry.rewards;
  const hasRewards = !!(rewards && (rewards.coins || rewards.xp || rewards.affinity || rewards.items?.length));
  return (
    <button
      onClick={() => onOpen(entry.id)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--op-7)] transition-colors border border-transparent hover:border-[var(--op-10)] group"
    >
      <div className="flex items-center gap-2">
        {entry.category === "side_quest" ? (
          <Swords size={14} style={{ color: CAT_COLOR[entry.category] }} className="shrink-0" />
        ) : (
          <Flag size={14} style={{ color: CAT_COLOR[entry.category] }} className="shrink-0" />
        )}
        <span className="text-sm text-[var(--op-85)] truncate flex-1">{entry.name}</span>
        <span className="text-[10px] mono text-[var(--op-35)] shrink-0">{questTypeLabel(entry)}</span>
      </div>
      {objectives.length > 0 && (
        <div className="mt-1 pl-6 text-[11px] text-[var(--op-40)] truncate">
          {objectives.length} {objectives.length === 1 ? "цель" : "целей"}
        </div>
      )}
      {hasRewards && (
        <div className="mt-1 pl-6 flex items-center gap-2.5 text-[11px] text-[var(--op-45)]">
          {!!rewards?.coins && (
            <span className="flex items-center gap-1">
              <Coins size={11} /> {rewards.coins}
            </span>
          )}
          {!!rewards?.xp && (
            <span className="flex items-center gap-1">
              <Sparkles size={11} /> {rewards.xp}
            </span>
          )}
          {!!rewards?.affinity && (
            <span className="flex items-center gap-1">
              <Heart size={11} /> {rewards.affinity}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ---- GML export modal (compileQuestsScript) ----

function QuestsExportModal({ entries, onClose }: { entries: Entry[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => {
    try {
      return { code: compileQuestsScript(entries), error: null as string | null };
    } catch (e: any) {
      return { code: "", error: e?.message ?? String(e) };
    }
  }, [entries]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const blob = new Blob([code.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quests_init.gml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onMouseDown={onClose}>
      <div
        className="glass rounded-xl flex flex-col overflow-hidden relative"
        style={{ width: Math.min(900, window.innerWidth - 80), height: Math.min(700, window.innerHeight - 80) }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <div className="text-sm font-medium text-[var(--op-85)]">Экспорт в GML — quests_init()</div>
          <div className="flex-1" />
          {!code.error && (
            <button onClick={copy} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-accent/80 hover:bg-accent">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Скопировано" : "Копировать"}
            </button>
          )}
          {!code.error && (
            <button onClick={download} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
              <Download size={13} /> .gml
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <X size={14} />
          </button>
        </div>
        {code.error ? (
          <div className="p-4 text-xs text-red-400">{code.error}</div>
        ) : (
          <textarea
            readOnly
            value={code.code}
            className="flex-1 m-4 p-3 rounded-md bg-black/40 border border-[var(--op-10)] text-[11px] mono text-[var(--op-80)] resize-none outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </div>
    </div>
  );
}

// ---- main view ----

export function QuestsView() {
  const openEntry = useProjectStore((s) => s.openEntry);
  const showDialogues = useProjectStore((s) => s.showDialogues);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const entries = useProjectStore((s) => s.project.entries);
  const { nodes, edges, quests } = useQuestRoadmap();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const mainQuests = quests.filter((q) => q.category === "main_quest");
  const sideQuests = quests.filter((q) => q.category === "side_quest");

  const openDialogue = (id: string) => {
    showDialogues();
    setActiveDialogue(id);
  };

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-[280px] shrink-0 h-full flex flex-col border-r border-[var(--op-10)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--op-10)] shrink-0">
          <ScrollText size={18} className="text-[var(--op-70)]" />
          <span className="text-lg font-medium text-[#ece4d2]">Квесты</span>
          <span className="text-xs mono text-[var(--op-30)] bg-[var(--op-5)] border border-[var(--op-10)] rounded-full px-2 py-0.5">
            {quests.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {quests.length === 0 ? (
            <div className="p-4 text-sm text-[var(--op-35)] text-center">
              Нет квестов. Создайте запись категории «Основные квесты» или «Побочные квесты» в Галерее.
            </div>
          ) : (
            <>
              {mainQuests.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[11px] uppercase tracking-wider text-[var(--op-35)]">Основные</div>
                  <div className="space-y-0.5">
                    {mainQuests.map((q) => (
                      <QuestListRow
                        key={q.id}
                        entry={q}
                        onOpen={openEntry}
                        onHover={(h) => setHoveredId(h ? `q:${q.id}` : null)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {sideQuests.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[11px] uppercase tracking-wider text-[var(--op-35)]">Побочные</div>
                  <div className="space-y-0.5">
                    {sideQuests.map((q) => (
                      <QuestListRow
                        key={q.id}
                        entry={q}
                        onOpen={openEntry}
                        onHover={(h) => setHoveredId(h ? `q:${q.id}` : null)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="p-2 border-t border-[var(--op-10)] shrink-0">
          <button
            onClick={() => setExportOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-70)]"
          >
            <Download size={13} /> Экспорт GML (quests_init)
          </button>
        </div>
      </div>

      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--op-10)] shrink-0">
          <div className="text-sm text-[var(--op-45)]">
            Карта влияния — как квесты, диалоги и флаги связаны друг с другом. Наведите на узел, чтобы подсветить связи;
            кликните по квесту или диалогу, чтобы открыть его.
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <RoadmapGraph
            nodes={nodes}
            edges={edges}
            onOpenQuest={openEntry}
            onOpenDialogue={openDialogue}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />
        </div>
      </div>

      {exportOpen && <QuestsExportModal entries={entries} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
